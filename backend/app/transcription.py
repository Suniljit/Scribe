import gc
import threading

from app.config import (
    HF_TOKEN,
    TRANSCRIPTS_DIR,
    WHISPER_COMPUTE_TYPE,
    WHISPER_DEVICE,
    WHISPER_MODEL,
)
from app.models import (
    TranscriptionStatus,
    TranscriptJob,
    TranscriptResult,
    TranscriptSegment,
)

_jobs: dict[str, TranscriptJob] = {}
_jobs_lock = threading.Lock()
_whisper_model = None
_model_lock = threading.Lock()


def _transcript_path(recording_id: str):
    return TRANSCRIPTS_DIR / f"{recording_id}.json"


def get_job(recording_id: str) -> TranscriptJob:
    with _jobs_lock:
        job = _jobs.get(recording_id)
    if job is not None:
        return job
    if _transcript_path(recording_id).exists():
        return TranscriptJob(recording_id=recording_id, status=TranscriptionStatus.DONE)
    return TranscriptJob(
        recording_id=recording_id, status=TranscriptionStatus.NOT_STARTED
    )


def get_result(recording_id: str) -> TranscriptResult | None:
    path = _transcript_path(recording_id)
    if not path.exists():
        return None
    return TranscriptResult.model_validate_json(path.read_text())


def _set_job(job: TranscriptJob) -> None:
    with _jobs_lock:
        _jobs[job.recording_id] = job


def _get_whisper_model():
    global _whisper_model
    with _model_lock:
        if _whisper_model is None:
            import whisperx

            _whisper_model = whisperx.load_model(
                WHISPER_MODEL, WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE
            )
        return _whisper_model


def start_transcription(recording_id: str, audio_path: str) -> TranscriptJob:
    existing = get_job(recording_id)
    if existing.status in (TranscriptionStatus.QUEUED, TranscriptionStatus.RUNNING):
        return existing

    job = TranscriptJob(
        recording_id=recording_id, status=TranscriptionStatus.QUEUED, progress="queued"
    )
    _set_job(job)

    thread = threading.Thread(
        target=_run_pipeline, args=(recording_id, audio_path), daemon=True
    )
    thread.start()
    return job


def _run_pipeline(recording_id: str, audio_path: str) -> None:
    import whisperx
    import whisperx.diarize

    try:
        _set_job(
            TranscriptJob(
                recording_id=recording_id,
                status=TranscriptionStatus.RUNNING,
                progress="loading audio",
            )
        )
        audio = whisperx.load_audio(audio_path)

        _set_job(
            TranscriptJob(
                recording_id=recording_id,
                status=TranscriptionStatus.RUNNING,
                progress="transcribing",
            )
        )
        model = _get_whisper_model()
        result = model.transcribe(audio, batch_size=8, language="en")
        language = result.get("language")

        _set_job(
            TranscriptJob(
                recording_id=recording_id,
                status=TranscriptionStatus.RUNNING,
                progress="aligning",
            )
        )
        align_model, align_metadata = whisperx.load_align_model(
            language_code=language, device=WHISPER_DEVICE
        )
        result = whisperx.align(
            result["segments"],
            align_model,
            align_metadata,
            audio,
            WHISPER_DEVICE,
            return_char_alignments=False,
        )
        del align_model
        gc.collect()

        _set_job(
            TranscriptJob(
                recording_id=recording_id,
                status=TranscriptionStatus.RUNNING,
                progress="identifying speakers",
            )
        )
        if not HF_TOKEN:
            raise RuntimeError(
                "HF_TOKEN environment variable is not set. Speaker diarization requires a Hugging Face "
                "access token with access to pyannote/speaker-diarization-3.1 (accept the model terms on "
                "huggingface.co, then create a token at huggingface.co/settings/tokens)."
            )
        diarize_model = whisperx.diarize.DiarizationPipeline(
            model_name="pyannote/speaker-diarization-3.1",
            token=HF_TOKEN,
            device=WHISPER_DEVICE,
        )
        diarize_segments = diarize_model(audio)
        result = whisperx.assign_word_speakers(diarize_segments, result)
        del diarize_model
        gc.collect()

        segments = [
            TranscriptSegment(
                start=seg["start"],
                end=seg["end"],
                speaker=seg.get("speaker"),
                text=seg["text"].strip(),
            )
            for seg in result["segments"]
        ]
        transcript = TranscriptResult(
            recording_id=recording_id, language=language, segments=segments
        )
        _transcript_path(recording_id).write_text(transcript.model_dump_json(indent=2))

        _set_job(
            TranscriptJob(
                recording_id=recording_id,
                status=TranscriptionStatus.DONE,
                progress="done",
            )
        )
    except Exception as exc:  # noqa: BLE001
        _set_job(
            TranscriptJob(
                recording_id=recording_id,
                status=TranscriptionStatus.FAILED,
                error=str(exc),
            )
        )
