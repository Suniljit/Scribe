from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app import storage
from app.models import SpeakerRenameRequest, TranscriptJob, TranscriptResult
from app.transcription import (
    get_job,
    get_result,
    rename_speaker,
    start_transcription,
)
from app.vtt import to_vtt

router = APIRouter(
    prefix="/api/recordings/{recording_id}/transcript", tags=["transcripts"]
)


@router.post("", response_model=TranscriptJob)
def transcribe(recording_id: str) -> TranscriptJob:
    meta = storage.load_meta(recording_id)
    if meta is None or not meta.audio_path:
        raise HTTPException(status_code=404, detail="Recording audio not found")
    return start_transcription(
        recording_id,
        meta.audio_path,
        mic_audio_path=meta.mic_audio_path,
        speaker_audio_path=meta.speaker_audio_path,
        drift_offsets=meta.drift_offsets,
    )


@router.get("/status", response_model=TranscriptJob)
def transcript_status(recording_id: str) -> TranscriptJob:
    return get_job(recording_id)


@router.get("", response_model=TranscriptResult)
def get_transcript(recording_id: str) -> TranscriptResult:
    result = get_result(recording_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return result


@router.get("/vtt")
def get_transcript_vtt(recording_id: str) -> Response:
    result = get_result(recording_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return Response(
        content=to_vtt(result),
        media_type="text/vtt",
        headers={
            "Content-Disposition": f'attachment; filename="{recording_id}.vtt"'
        },
    )


@router.patch("/speakers", response_model=TranscriptResult)
def rename_transcript_speaker(
    recording_id: str, body: SpeakerRenameRequest
) -> TranscriptResult:
    result = rename_speaker(recording_id, body.old_label, body.new_name)
    if result is None:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return result
