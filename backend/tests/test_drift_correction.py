from app.models import TranscriptSegment
from app.transcription import _apply_drift_correction, _namespace_speaker


def test_apply_drift_correction_shifts_segment_times_by_matching_window_lag():
    segments = [
        TranscriptSegment(start=10.0, end=12.0, speaker="SPEAKER_00", text="hi")
    ]
    drift_offsets = [(0.0, 0.5)]

    corrected = _apply_drift_correction(segments, drift_offsets)

    assert corrected[0].start == 10.5
    assert corrected[0].end == 12.5


def test_apply_drift_correction_uses_nearest_preceding_window():
    segments = [TranscriptSegment(start=125.0, end=126.0, speaker=None, text="hi")]
    drift_offsets = [(0.0, 0.1), (60.0, 0.2), (120.0, 0.3)]

    corrected = _apply_drift_correction(segments, drift_offsets)

    assert corrected[0].start == 125.3
    assert corrected[0].end == 126.3


def test_apply_drift_correction_clamps_at_zero_instead_of_going_negative():
    segments = [TranscriptSegment(start=0.2, end=0.4, speaker=None, text="hi")]
    drift_offsets = [(0.0, -1.0)]

    corrected = _apply_drift_correction(segments, drift_offsets)

    assert corrected[0].start == 0.0
    assert corrected[0].end == 0.0


def test_apply_drift_correction_is_noop_with_no_offsets():
    segments = [TranscriptSegment(start=1.0, end=2.0, speaker="SPEAKER_00", text="hi")]

    corrected = _apply_drift_correction(segments, [])

    assert corrected == segments


def test_namespace_speaker_prefixes_with_track():
    assert _namespace_speaker("SPEAKER_00", "mic") == "mic:SPEAKER_00"
    assert _namespace_speaker("SPEAKER_01", "speaker") == "speaker:SPEAKER_01"


def test_namespace_speaker_passes_through_when_track_is_none():
    assert _namespace_speaker("SPEAKER_00", None) == "SPEAKER_00"


def test_namespace_speaker_passes_through_none_speaker():
    assert _namespace_speaker(None, "mic") is None
