from app import transcription
from app.models import TranscriptResult, TranscriptSegment


def _write_transcript(recording_id: str) -> None:
    result = TranscriptResult(
        recording_id=recording_id,
        language="en",
        segments=[
            TranscriptSegment(start=0.0, end=1.0, speaker="SPEAKER_00", text="hi"),
            TranscriptSegment(start=1.0, end=2.0, speaker="SPEAKER_01", text="hello"),
            TranscriptSegment(start=2.0, end=3.0, speaker="SPEAKER_00", text="bye"),
        ],
    )
    transcription._transcript_path(recording_id).write_text(result.model_dump_json(indent=2))


def test_rename_speaker_updates_matching_segments(tmp_path, monkeypatch):
    monkeypatch.setattr(transcription, "TRANSCRIPTS_DIR", tmp_path)
    _write_transcript("rec1")

    result = transcription.rename_speaker("rec1", "SPEAKER_00", "Alice")

    assert result is not None
    assert [seg.speaker for seg in result.segments] == ["Alice", "SPEAKER_01", "Alice"]

    persisted = transcription.get_result("rec1")
    assert persisted is not None
    assert [seg.speaker for seg in persisted.segments] == ["Alice", "SPEAKER_01", "Alice"]


def test_rename_speaker_returns_none_when_transcript_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(transcription, "TRANSCRIPTS_DIR", tmp_path)

    assert transcription.rename_speaker("missing", "SPEAKER_00", "Alice") is None
