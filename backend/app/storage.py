from pathlib import Path

from app.config import RECORDINGS_DIR
from app.models import RecordingMeta


def _meta_path(recording_id: str) -> Path:
    return RECORDINGS_DIR / f"{recording_id}.meta.json"


def save_meta(meta: RecordingMeta) -> None:
    _meta_path(meta.id).write_text(meta.model_dump_json(indent=2))


def load_meta(recording_id: str) -> RecordingMeta | None:
    path = _meta_path(recording_id)
    if not path.exists():
        return None
    return RecordingMeta.model_validate_json(path.read_text())


def list_meta() -> list[RecordingMeta]:
    metas = [
        RecordingMeta.model_validate_json(p.read_text())
        for p in RECORDINGS_DIR.glob("*.meta.json")
    ]
    return sorted(metas, key=lambda m: m.created_at, reverse=True)


def delete_recording(recording_id: str) -> None:
    _meta_path(recording_id).unlink(missing_ok=True)
    (RECORDINGS_DIR / f"{recording_id}.wav").unlink(missing_ok=True)
    (RECORDINGS_DIR / f"{recording_id}.mic.wav").unlink(missing_ok=True)
    (RECORDINGS_DIR / f"{recording_id}.speaker.wav").unlink(missing_ok=True)
