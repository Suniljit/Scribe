import uuid
from datetime import UTC, datetime

import numpy as np
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from app import storage
from app.models import (
    RecordingMeta,
    RecordingStatus,
    RenameRecordingRequest,
    StartRecordingRequest,
    TrackOffsetRequest,
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
    recorder = Recorder(
        recording_id,
        req.mic_device_index,
        req.speaker_device_index,
        capture_source=req.capture_source,
    )
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
        capture_source=req.capture_source,
    )
    storage.save_meta(meta)
    return meta


@router.post("/{recording_id}/track-offset", response_model=RecordingMeta)
def set_track_start_offset(
    recording_id: str, req: TrackOffsetRequest
) -> RecordingMeta:
    """Records how much later (ms) the speaker track's browser-push capture
    pipeline became ready relative to the mic track's, so `Recorder.stop()`
    can pad the lagging track with leading silence and align both tracks'
    timelines (see frontend/src/lib/capture.ts, ADR 0007)."""
    recorder = _active_recorders.get(recording_id)
    if recorder is None:
        raise HTTPException(status_code=404, detail="No active recording with that id")
    recorder.speaker_start_offset_ms = req.offset_ms

    meta = storage.load_meta(recording_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Recording metadata not found")
    return meta


@router.websocket("/{recording_id}/stream")
async def stream_audio(websocket: WebSocket, recording_id: str, track: str) -> None:
    """Ingests raw mono float32 PCM chunks pushed from a browser/Electron-side
    capture (see frontend/src/lib/capture.ts), for recordings started with
    capture_source="browser-push". Replaces reading a CoreAudio loopback
    device for the speaker leg (ADR 0007)."""
    recorder = _active_recorders.get(recording_id)
    if (
        recorder is None
        or recorder.capture_source != "browser-push"
        or track not in ("mic", "speaker")
    ):
        await websocket.close(code=4404)
        return

    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_bytes()
            samples = np.frombuffer(data, dtype=np.float32)
            recorder.write_chunk(track, samples)
    except WebSocketDisconnect:
        pass


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
