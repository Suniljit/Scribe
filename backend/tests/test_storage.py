from app import storage, transcription
from app.models import (
    RecordingMeta,
    RecordingStatus,
    TranscriptionStatus,
    TranscriptJob,
)


def _make_meta(recording_id: str) -> RecordingMeta:
    return RecordingMeta(
        id=recording_id,
        name="Test recording",
        created_at="2026-08-05T00:00:00+00:00",
        status=RecordingStatus.STOPPED,
        mic_device_index=0,
    )


def test_delete_recording_removes_meta_and_audio_files(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "RECORDINGS_DIR", tmp_path)

    recording_id = "abc123"
    storage.save_meta(_make_meta(recording_id))
    (tmp_path / f"{recording_id}.wav").write_bytes(b"")
    (tmp_path / f"{recording_id}.mic.wav").write_bytes(b"")
    (tmp_path / f"{recording_id}.speaker.wav").write_bytes(b"")

    storage.delete_recording(recording_id)

    assert list(tmp_path.iterdir()) == []


def test_delete_job_removes_transcript_file_and_job_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(transcription, "TRANSCRIPTS_DIR", tmp_path)

    recording_id = "abc123"
    (tmp_path / f"{recording_id}.json").write_text("{}")
    transcription._set_job(
        TranscriptJob(recording_id=recording_id, status=TranscriptionStatus.DONE)
    )

    transcription.delete_job(recording_id)

    assert list(tmp_path.iterdir()) == []
    assert recording_id not in transcription._jobs
