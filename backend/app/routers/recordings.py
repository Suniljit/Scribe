import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import storage
from app.models import (
    RecordingMeta,
    RecordingStatus,
    RenameRecordingRequest,
    StartRecordingRequest,
)
from app.recorder import Recorder
from app.transcription import delete_job

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

_active_recorders: dict[str, Recorder] = {}


@router.get("", response_model=list[RecordingMeta])
def list_recordings() -> list[RecordingMeta]:
    return storage.list_meta()


@router.post("/start", response_model=RecordingMeta)
def start_recording(req: StartRecordingRequest) -> RecordingMeta:
    recording_id = uuid.uuid4().hex[:12]
    recorder = Recorder(recording_id, req.mic_device_index, req.speaker_device_index)
    try:
        recorder.start()
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Failed to start recording: {exc}"
        ) from exc

    _active_recorders[recording_id] = recorder
    now = datetime.now(UTC)
    meta = RecordingMeta(
        id=recording_id,
        name=req.name or now.strftime("Recording %Y-%m-%d %H:%M:%S"),
        created_at=now.isoformat(),
        status=RecordingStatus.RECORDING,
        mic_device_index=req.mic_device_index,
        speaker_device_index=req.speaker_device_index,
    )
    storage.save_meta(meta)
    return meta


@router.post("/{recording_id}/stop", response_model=RecordingMeta)
def stop_recording(recording_id: str) -> RecordingMeta:
    recorder = _active_recorders.pop(recording_id, None)
    if recorder is None:
        raise HTTPException(status_code=404, detail="No active recording with that id")

    meta = storage.load_meta(recording_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Recording metadata not found")

    audio_path, duration = recorder.stop()
    meta.status = RecordingStatus.STOPPED
    meta.duration_seconds = duration
    meta.audio_path = str(audio_path)
    meta.mic_audio_path = (
        str(recorder.mic_audio_path) if recorder.mic_audio_path else None
    )
    meta.speaker_audio_path = (
        str(recorder.speaker_audio_path) if recorder.speaker_audio_path else None
    )
    meta.drift_offsets = recorder.drift_offsets or None
    meta.bleed_detected = recorder.bleed_detected
    storage.save_meta(meta)
    return meta


@router.get("/{recording_id}", response_model=RecordingMeta)
def get_recording(recording_id: str) -> RecordingMeta:
    meta = storage.load_meta(recording_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    return meta


@router.get("/{recording_id}/audio")
def get_recording_audio(recording_id: str) -> FileResponse:
    meta = storage.load_meta(recording_id)
    if meta is None or not meta.audio_path:
        raise HTTPException(status_code=404, detail="Recording audio not found")
    return FileResponse(meta.audio_path, media_type="audio/wav")


@router.patch("/{recording_id}", response_model=RecordingMeta)
def rename_recording(recording_id: str, req: RenameRecordingRequest) -> RecordingMeta:
    meta = storage.load_meta(recording_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Recording not found")
    meta.name = req.name
    storage.save_meta(meta)
    return meta


@router.delete("/{recording_id}")
def delete_recording(recording_id: str) -> dict:
    if recording_id in _active_recorders:
        raise HTTPException(
            status_code=400, detail="Cannot delete a recording in progress"
        )
    storage.delete_recording(recording_id)
    delete_job(recording_id)
    return {"deleted": recording_id}
