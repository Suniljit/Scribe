from fastapi import APIRouter, HTTPException

from app import storage
from app.models import TranscriptJob, TranscriptResult
from app.transcription import get_job, get_result, start_transcription

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
        bleed_detected=meta.bleed_detected,
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
