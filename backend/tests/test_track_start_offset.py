import numpy as np
import soundfile as sf

from app import recorder as recorder_module
from app.recorder import BROWSER_PUSH_SAMPLE_RATE, Recorder, _pad_track_start_offset


def test_pad_track_start_offset_pads_speaker_when_positive():
    mic_track = np.ones(10, dtype=np.float32)
    speaker_track = np.ones(10, dtype=np.float32)

    mic_out, speaker_out = _pad_track_start_offset(
        mic_track, speaker_track, speaker_start_offset_ms=500, sample_rate=100
    )

    assert len(mic_out) == 10
    assert len(speaker_out) == 60
    assert np.all(speaker_out[:50] == 0)
    assert np.all(speaker_out[50:] == 1)


def test_pad_track_start_offset_pads_mic_when_negative():
    mic_track = np.ones(10, dtype=np.float32)
    speaker_track = np.ones(10, dtype=np.float32)

    mic_out, speaker_out = _pad_track_start_offset(
        mic_track, speaker_track, speaker_start_offset_ms=-500, sample_rate=100
    )

    assert len(speaker_out) == 10
    assert len(mic_out) == 60
    assert np.all(mic_out[:50] == 0)
    assert np.all(mic_out[50:] == 1)


def test_pad_track_start_offset_is_noop_when_zero():
    mic_track = np.ones(10, dtype=np.float32)
    speaker_track = np.ones(10, dtype=np.float32)

    mic_out, speaker_out = _pad_track_start_offset(
        mic_track, speaker_track, speaker_start_offset_ms=0, sample_rate=100
    )

    assert mic_out is mic_track
    assert speaker_out is speaker_track


def _tone(seconds: float, freq: float = 440.0, rate: int = BROWSER_PUSH_SAMPLE_RATE):
    t = np.arange(int(seconds * rate)) / rate
    return (0.2 * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def test_recorder_stop_aligns_speaker_track_using_start_offset(tmp_path, monkeypatch):
    from app.config import SAMPLE_RATE

    monkeypatch.setattr(recorder_module, "RECORDINGS_DIR", tmp_path)

    rec = Recorder("rec-offset", mic_device_index=None, capture_source="browser-push")
    rec.start()
    rec.speaker_start_offset_ms = 1000.0  # speaker capture became ready 1s late

    mic_tone = _tone(2.0)
    speaker_tone = _tone(2.0, freq=220.0)
    for offset in range(0, len(mic_tone), 4096):
        rec.write_chunk("mic", mic_tone[offset : offset + 4096])
        rec.write_chunk("speaker", speaker_tone[offset : offset + 4096])

    rec.stop()

    speaker_audio, _ = sf.read(str(rec.speaker_audio_path), dtype="float32")
    lead_silence_samples = round(1.0 * SAMPLE_RATE)
    assert np.max(np.abs(speaker_audio[: lead_silence_samples - 5])) == 0

    mic_audio, _ = sf.read(str(rec.mic_audio_path), dtype="float32")
    assert np.max(np.abs(mic_audio[:100])) > 0
