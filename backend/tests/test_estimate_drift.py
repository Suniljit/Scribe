import numpy as np

from app.models import TranscriptSegment
from app.recorder import _estimate_drift
from app.transcription import _apply_drift_correction


def _correlated_tracks(lag_samples: int, n: int = 6000, seed: int = 42):
    rng = np.random.default_rng(seed)
    signal = rng.standard_normal(n).astype(np.float32)
    mic_track = signal.copy()
    speaker_track = np.roll(signal, lag_samples)
    return mic_track, speaker_track


def test_estimate_drift_detects_known_lag_between_correlated_tracks():
    sample_rate = 100  # 6000 samples == one 60s resync window
    mic_track, speaker_track = _correlated_tracks(lag_samples=5, n=6000)

    offsets = _estimate_drift(mic_track, speaker_track, sample_rate)

    assert len(offsets) == 1
    window_start, lag_seconds = offsets[0]
    assert window_start == 0.0
    assert lag_seconds == -0.05


def test_estimate_drift_finds_no_offset_for_uncorrelated_tracks():
    sample_rate = 100
    rng = np.random.default_rng(42)
    mic_track = rng.standard_normal(6000).astype(np.float32)
    speaker_track = rng.standard_normal(6000).astype(np.float32)

    offsets = _estimate_drift(mic_track, speaker_track, sample_rate)

    assert offsets == []


def test_estimate_drift_output_correctly_realigns_a_transcript_segment():
    sample_rate = 100
    mic_track, speaker_track = _correlated_tracks(lag_samples=5, n=6000)
    offsets = _estimate_drift(mic_track, speaker_track, sample_rate)

    # A word transcribed from the speaker track at t=1.25s should map back
    # onto the mic track's timeline at t=1.20s given the known 5-sample lag.
    segment = [TranscriptSegment(start=1.25, end=1.30, speaker=None, text="hi")]

    corrected = _apply_drift_correction(segment, offsets)

    assert corrected[0].start == 1.2
    assert round(corrected[0].end, 2) == 1.25
