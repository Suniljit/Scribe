import numpy as np
import soundfile as sf

from app import recorder as recorder_module
from app.recorder import BROWSER_PUSH_SAMPLE_RATE, Recorder


def _tone(seconds: float, freq: float = 440.0, rate: int = BROWSER_PUSH_SAMPLE_RATE):
    t = np.arange(int(seconds * rate)) / rate
    return (0.2 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def test_browser_push_mic_only_writes_gapless_track(tmp_path, monkeypatch):
    monkeypatch.setattr(recorder_module, "RECORDINGS_DIR", tmp_path)

    rec = Recorder("rec1", mic_device_index=None, capture_source="browser-push")
    rec.start()

    tone = _tone(2.0)
    for offset in range(0, len(tone), 4096):
        rec.write_chunk("mic", tone[offset : offset + 4096])

    final_path, _ = rec.stop()

    assert final_path.exists()
    assert rec.speaker_audio_path is None
    assert rec.mic_audio_path is not None

    mixed, _ = sf.read(str(final_path), dtype="float32")
    # Resampled from BROWSER_PUSH_SAMPLE_RATE down to config.SAMPLE_RATE;
    # length should match within a couple of samples of rounding.
    from app.config import SAMPLE_RATE

    expected_len = round(len(tone) * SAMPLE_RATE / BROWSER_PUSH_SAMPLE_RATE)
    assert abs(len(mixed) - expected_len) <= 2


def test_browser_push_stop_with_zero_chunks_does_not_crash(tmp_path, monkeypatch):
    # Reproduces a real failure mode: the user denies the mic permission
    # prompt right after /start, so stop() runs against a track with zero
    # samples ever written (was a ZeroDivisionError in _resample_to).
    monkeypatch.setattr(recorder_module, "RECORDINGS_DIR", tmp_path)

    rec = Recorder("rec0", mic_device_index=None, capture_source="browser-push")
    rec.start()

    final_path, _ = rec.stop()

    assert final_path.exists()
    mixed, _ = sf.read(str(final_path), dtype="float32")
    assert len(mixed) == 0


def test_browser_push_speaker_file_opens_lazily_on_first_chunk(tmp_path, monkeypatch):
    monkeypatch.setattr(recorder_module, "RECORDINGS_DIR", tmp_path)

    rec = Recorder("rec2", mic_device_index=None, capture_source="browser-push")
    rec.start()

    assert rec._speaker_file is None  # no speaker track pushed yet

    mic_tone = _tone(1.0)
    speaker_tone = _tone(1.0, freq=220.0)
    for offset in range(0, len(mic_tone), 4096):
        rec.write_chunk("mic", mic_tone[offset : offset + 4096])
        rec.write_chunk("speaker", speaker_tone[offset : offset + 4096])

    assert rec._speaker_file is not None

    final_path, _ = rec.stop()

    assert final_path.exists()
    assert rec.mic_audio_path is not None
    assert rec.speaker_audio_path is not None
