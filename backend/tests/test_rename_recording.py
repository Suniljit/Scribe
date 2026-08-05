from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import storage
from app.models import RecordingMeta, RecordingStatus
from app.routers import recordings


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "RECORDINGS_DIR", tmp_path)
    app = FastAPI()
    app.include_router(recordings.router)
    return TestClient(app)


def _make_meta(recording_id: str, name: str) -> RecordingMeta:
    return RecordingMeta(
        id=recording_id,
        name=name,
        created_at=datetime.now(UTC).isoformat(),
        status=RecordingStatus.STOPPED,
        mic_device_index=0,
    )


def test_rename_updates_and_persists_name(client):
    meta = _make_meta("abc123", "Old Name")
    storage.save_meta(meta)

    res = client.patch("/api/recordings/abc123", json={"name": "New Name"})

    assert res.status_code == 200
    assert res.json()["name"] == "New Name"
    assert storage.load_meta("abc123").name == "New Name"


def test_rename_nonexistent_recording_returns_404(client):
    res = client.patch("/api/recordings/does-not-exist", json={"name": "New Name"})

    assert res.status_code == 404


def test_rename_with_blank_name_is_rejected(client):
    meta = _make_meta("abc123", "Old Name")
    storage.save_meta(meta)

    res = client.patch("/api/recordings/abc123", json={"name": "   "})

    assert res.status_code == 422
    assert storage.load_meta("abc123").name == "Old Name"
