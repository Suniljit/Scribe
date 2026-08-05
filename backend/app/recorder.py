import threading
import time
from pathlib import Path

import numpy as np
import sounddevice as sd
import soundfile as sf
from scipy.signal import correlate, resample

from app.config import DRIFT_RESYNC_WINDOW_SECONDS, RECORDINGS_DIR, SAMPLE_RATE

# Bleed-detection tuning: a cross-correlation peak within this lag window and
# above this threshold indicates the speaker track is likely leaking into the
# mic acoustically (e.g. physical speakers instead of headphones).
_BLEED_MAX_LAG_SECONDS = 0.05
_BLEED_CORRELATION_THRESHOLD = 0.6

# Drift-estimation tuning (ADR 0005): per-window cross-correlation used to
# track mic/speaker clock drift over a long recording. The lag window is much
# wider than bleed detection's, since accumulated drift (not just acoustic
# propagation delay) can push the true lag well beyond a few tens of ms.
_DRIFT_MAX_LAG_SECONDS = 1.0
_DRIFT_MIN_CORRELATION = 0.15

# Sample rate for capture_source="browser-push" tracks, matching the
# AudioContext rate frontend/src/lib/capture.ts captures at (validated
# gap-free at real-time pace during the native-capture spike).
BROWSER_PUSH_SAMPLE_RATE = 48_000


class RecorderError(RuntimeError):
    pass


class Recorder:
    """Captures mic and (optionally) a speaker loopback device as separate
    streams, then mixes them down to a single mono WAV on stop.

    Streams are written incrementally to temp files so memory use stays flat
    regardless of recording length. Two capture sources are supported: the
    original `sd.InputStream`-based CoreAudio devices, or chunks pushed from
    a browser/Electron-side capture (see `write_chunk`), for the native
    loopback capture path that replaces BlackHole (ADR 0007).
    """

    def __init__(
        self,
        recording_id: str,
        mic_device_index: int | None,
        speaker_device_index: int | None = None,
        capture_source: str = "coreaudio",
    ):
        self.recording_id = recording_id
        self.mic_device_index = mic_device_index
        self.speaker_device_index = speaker_device_index
        self.capture_source = capture_source

        self._mic_path = RECORDINGS_DIR / f"{recording_id}.mic.tmp.wav"
        self._speaker_path = RECORDINGS_DIR / f"{recording_id}.speaker.tmp.wav"
        self._final_path = RECORDINGS_DIR / f"{recording_id}.wav"
        self._mic_track_path = RECORDINGS_DIR / f"{recording_id}.mic.wav"
        self._speaker_track_path = RECORDINGS_DIR / f"{recording_id}.speaker.wav"

        self._mic_stream: sd.InputStream | None = None
        self._speaker_stream: sd.InputStream | None = None
        self._mic_file: sf.SoundFile | None = None
        self._speaker_file: sf.SoundFile | None = None
        self._lock = threading.Lock()
        self._start_time: float | None = None
        self.bleed_detected = False
        self.mic_audio_path: Path | None = None
        self.speaker_audio_path: Path | None = None
        self.drift_offsets: list[tuple[float, float]] = []

    def start(self) -> None:
        if self.capture_source == "browser-push":
            self._start_browser_push()
        else:
            self._start_coreaudio()
        self._start_time = time.monotonic()

    def _start_coreaudio(self) -> None:
        mic_info = sd.query_devices(self.mic_device_index)
        mic_rate = int(mic_info["default_samplerate"])
        self._mic_file = sf.SoundFile(
            str(self._mic_path),
            mode="w",
            samplerate=mic_rate,
            channels=1,
            subtype="FLOAT",
        )

        def mic_callback(indata, frames, time_info, status):
            self.write_chunk("mic", indata[:, :1])

        self._mic_stream = sd.InputStream(
            device=self.mic_device_index,
            channels=1,
            samplerate=mic_rate,
            dtype="float32",
            callback=mic_callback,
        )
        self._mic_stream.start()

        if self.speaker_device_index is not None:
            speaker_info = sd.query_devices(self.speaker_device_index)
            speaker_rate = int(speaker_info["default_samplerate"])
            speaker_channels = min(2, int(speaker_info["max_input_channels"]))
            self._speaker_file = sf.SoundFile(
                str(self._speaker_path),
                mode="w",
                samplerate=speaker_rate,
                channels=speaker_channels,
                subtype="FLOAT",
            )

            def speaker_callback(indata, frames, time_info, status):
                self.write_chunk("speaker", indata)

            self._speaker_stream = sd.InputStream(
                device=self.speaker_device_index,
                channels=speaker_channels,
                samplerate=speaker_rate,
                dtype="float32",
                callback=speaker_callback,
            )
            self._speaker_stream.start()

    def _start_browser_push(self) -> None:
        self._mic_file = sf.SoundFile(
            str(self._mic_path),
            mode="w",
            samplerate=BROWSER_PUSH_SAMPLE_RATE,
            channels=1,
            subtype="FLOAT",
        )
        # The speaker file is opened lazily in write_chunk, on its first
        # "speaker" chunk: whether a speaker track exists at all isn't known
        # until the renderer successfully starts one (system audio capture
        # can fail/be declined independently of the mandatory mic capture -
        # see frontend/src/lib/capture.ts).

    def write_chunk(self, track: str, samples) -> None:
        """Append a chunk of mono float32 PCM samples to the given track's
        temp file. Used both by the CoreAudio `sd.InputStream` callbacks
        above and by the browser-push WebSocket ingestion route."""
        with self._lock:
            if track == "mic":
                if self._mic_file is not None:
                    self._mic_file.write(samples)
            elif track == "speaker":
                if self._speaker_file is None:
                    self._speaker_file = sf.SoundFile(
                        str(self._speaker_path),
                        mode="w",
                        samplerate=BROWSER_PUSH_SAMPLE_RATE,
                        channels=1,
                        subtype="FLOAT",
                    )
                self._speaker_file.write(samples)

    def stop(self) -> tuple[Path, float]:
        duration = time.monotonic() - (self._start_time or time.monotonic())

        if self._mic_stream is not None:
            self._mic_stream.stop()
            self._mic_stream.close()
        if self._speaker_stream is not None:
            self._speaker_stream.stop()
            self._speaker_stream.close()

        with self._lock:
            if self._mic_file is not None:
                self._mic_file.close()
            if self._speaker_file is not None:
                self._speaker_file.close()

        mic_track, speaker_track = self._read_tracks()
        if mic_track is not None and speaker_track is not None:
            self.bleed_detected = _detect_bleed(mic_track, speaker_track, SAMPLE_RATE)
            self.drift_offsets = _estimate_drift(mic_track, speaker_track, SAMPLE_RATE)

        mixed = self._mixdown(mic_track, speaker_track)
        sf.write(str(self._final_path), mixed, SAMPLE_RATE, subtype="PCM_16")

        if mic_track is not None:
            sf.write(
                str(self._mic_track_path), mic_track, SAMPLE_RATE, subtype="PCM_16"
            )
            self.mic_audio_path = self._mic_track_path
        if speaker_track is not None:
            sf.write(
                str(self._speaker_track_path),
                speaker_track,
                SAMPLE_RATE,
                subtype="PCM_16",
            )
            self.speaker_audio_path = self._speaker_track_path

        self._mic_path.unlink(missing_ok=True)
        self._speaker_path.unlink(missing_ok=True)

        return self._final_path, duration

    def _read_tracks(self) -> tuple[np.ndarray | None, np.ndarray | None]:
        mic_audio, mic_rate = sf.read(str(self._mic_path), dtype="float32")
        mic_track = _resample_to(mic_audio, mic_rate, SAMPLE_RATE)

        speaker_track = None
        if self._speaker_path.exists():
            speaker_audio, speaker_rate = sf.read(
                str(self._speaker_path), dtype="float32"
            )
            if speaker_audio.ndim > 1:
                speaker_audio = speaker_audio.mean(axis=1)
            speaker_track = _resample_to(speaker_audio, speaker_rate, SAMPLE_RATE)

        return mic_track, speaker_track

    def _mixdown(
        self, mic_track: np.ndarray | None, speaker_track: np.ndarray | None
    ) -> np.ndarray:
        tracks = [t for t in (mic_track, speaker_track) if t is not None]
        max_len = max(len(t) for t in tracks)
        padded = [np.pad(t, (0, max_len - len(t))) for t in tracks]
        mixed = np.sum(padded, axis=0) / len(padded)
        return np.clip(mixed, -1.0, 1.0)


def _resample_to(audio: np.ndarray, orig_rate: int, target_rate: int) -> np.ndarray:
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if orig_rate == target_rate or len(audio) == 0:
        return audio
    target_len = round(len(audio) * target_rate / orig_rate)
    return resample(audio, target_len).astype(np.float32)


def _detect_bleed(
    mic_track: np.ndarray, speaker_track: np.ndarray, sample_rate: int
) -> bool:
    """Flag likely acoustic bleed (speaker output picked up by the mic) via
    cross-correlation. A strong correlation peak at a small, consistent lag
    between the mic and speaker tracks is diagnostic of echo/bleed — the same
    signal AEC systems use to estimate echo-path delay, used here only as a
    cheap post-hoc detector rather than a canceller.
    """
    max_len = min(len(mic_track), len(speaker_track))
    if max_len == 0:
        return False

    mic = mic_track[:max_len]
    speaker = speaker_track[:max_len]

    mic_norm = np.linalg.norm(mic)
    speaker_norm = np.linalg.norm(speaker)
    if mic_norm == 0 or speaker_norm == 0:
        return False

    correlation = correlate(mic, speaker, mode="full")
    correlation /= mic_norm * speaker_norm

    max_lag = int(_BLEED_MAX_LAG_SECONDS * sample_rate)
    center = len(correlation) // 2
    window = correlation[max(0, center - max_lag) : center + max_lag + 1]

    return bool(np.max(np.abs(window)) >= _BLEED_CORRELATION_THRESHOLD)


def _estimate_drift(
    mic_track: np.ndarray, speaker_track: np.ndarray, sample_rate: int
) -> list[tuple[float, float]]:
    """Estimate mic/speaker clock drift across the recording (ADR 0005).

    Re-uses the same cross-correlation technique as `_detect_bleed`, but
    windowed across the whole recording rather than checked once, to build a
    piecewise lag table for aligning per-track transcript timestamps. This
    only works in windows where the two tracks carry correlated signal
    (typically acoustic bleed) to lock onto — windows without a confident
    peak are omitted, and the caller should hold the nearest known offset for
    timestamps that fall in a gap.
    """
    window_len = int(DRIFT_RESYNC_WINDOW_SECONDS * sample_rate)
    max_lag = int(_DRIFT_MAX_LAG_SECONDS * sample_rate)
    n = min(len(mic_track), len(speaker_track))

    offsets: list[tuple[float, float]] = []
    for start in range(0, n, window_len):
        end = min(start + window_len, n)
        mic_window = mic_track[start:end]
        speaker_window = speaker_track[start:end]

        mic_norm = np.linalg.norm(mic_window)
        speaker_norm = np.linalg.norm(speaker_window)
        if mic_norm == 0 or speaker_norm == 0:
            continue

        correlation = correlate(mic_window, speaker_window, mode="full")
        correlation /= mic_norm * speaker_norm

        center = len(correlation) // 2
        lo = max(0, center - max_lag)
        hi = min(len(correlation), center + max_lag + 1)
        lag_window = correlation[lo:hi]
        if lag_window.size == 0:
            continue

        peak_offset = int(np.argmax(np.abs(lag_window)))
        if abs(lag_window[peak_offset]) < _DRIFT_MIN_CORRELATION:
            continue

        lag_samples = (lo + peak_offset) - center
        offsets.append((start / sample_rate, lag_samples / sample_rate))

    return offsets
