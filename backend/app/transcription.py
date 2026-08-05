import bisect
import gc
import threading
from difflib import SequenceMatcher

from app.config import (
    AUX_DEVICE,
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


def start_transcription(
    recording_id: str,
    audio_path: str,
    mic_audio_path: str | None = None,
    speaker_audio_path: str | None = None,
    drift_offsets: list[tuple[float, float]] | None = None,
    bleed_detected: bool = False,
) -> TranscriptJob:
    existing = get_job(recording_id)
    if existing.status in (TranscriptionStatus.QUEUED, TranscriptionStatus.RUNNING):
        return existing

    job = TranscriptJob(
        recording_id=recording_id, status=TranscriptionStatus.QUEUED, progress="queued"
    )
    _set_job(job)

    thread = threading.Thread(
        target=_run_pipeline,
        args=(
            recording_id,
            audio_path,
            mic_audio_path,
            speaker_audio_path,
            drift_offsets,
            bleed_detected,
        ),
        daemon=True,
    )
    thread.start()
    return job


def _run_pipeline(
    recording_id: str,
    audio_path: str,
    mic_audio_path: str | None,
    speaker_audio_path: str | None,
    drift_offsets: list[tuple[float, float]] | None,
    bleed_detected: bool,
) -> None:
    try:
        if mic_audio_path and speaker_audio_path:
            segments, language = _run_dual_track_pipeline(
                recording_id,
                mic_audio_path,
                speaker_audio_path,
                drift_offsets or [],
                bleed_detected,
            )
        else:
            segments, language = _run_single_track_pipeline(
                recording_id, audio_path, track=None
            )

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


def _run_dual_track_pipeline(
    recording_id: str,
    mic_audio_path: str,
    speaker_audio_path: str,
    drift_offsets: list[tuple[float, float]],
    bleed_detected: bool,
) -> tuple[list[TranscriptSegment], str | None]:
    mic_segments, language = _run_single_track_pipeline(
        recording_id, mic_audio_path, track="mic"
    )
    speaker_segments, _ = _run_single_track_pipeline(
        recording_id, speaker_audio_path, track="speaker"
    )
    speaker_segments = _apply_drift_correction(speaker_segments, drift_offsets)
    mic_segments, speaker_segments = _dedup_bleed_segments(
        mic_segments, speaker_segments, bleed_detected
    )
    merged = sorted(mic_segments + speaker_segments, key=lambda seg: seg.start)
    return merged, language


def _run_single_track_pipeline(
    recording_id: str, audio_path: str, track: str | None
) -> tuple[list[TranscriptSegment], str | None]:
    import whisperx
    import whisperx.diarize

    progress_prefix = f"{track} track: " if track else ""

    _set_job(
        TranscriptJob(
            recording_id=recording_id,
            status=TranscriptionStatus.RUNNING,
            progress=f"{progress_prefix}loading audio",
        )
    )
    audio = whisperx.load_audio(audio_path)

    _set_job(
        TranscriptJob(
            recording_id=recording_id,
            status=TranscriptionStatus.RUNNING,
            progress=f"{progress_prefix}transcribing",
        )
    )
    model = _get_whisper_model()
    result = model.transcribe(audio, batch_size=8, language="en")
    language = result.get("language")

    _set_job(
        TranscriptJob(
            recording_id=recording_id,
            status=TranscriptionStatus.RUNNING,
            progress=f"{progress_prefix}aligning",
        )
    )
    align_model, align_metadata = whisperx.load_align_model(
        language_code=language, device=AUX_DEVICE
    )
    result = whisperx.align(
        result["segments"],
        align_model,
        align_metadata,
        audio,
        AUX_DEVICE,
        return_char_alignments=False,
    )
    del align_model
    gc.collect()

    _set_job(
        TranscriptJob(
            recording_id=recording_id,
            status=TranscriptionStatus.RUNNING,
            progress=f"{progress_prefix}identifying speakers",
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
        device=AUX_DEVICE,
    )
    diarize_segments = diarize_model(audio)
    result = whisperx.assign_word_speakers(diarize_segments, result)
    del diarize_model
    gc.collect()

    segments = [
        TranscriptSegment(
            start=seg["start"],
            end=seg["end"],
            speaker=_namespace_speaker(seg.get("speaker"), track),
            text=seg["text"].strip(),
            avg_logprob=seg.get("avg_logprob"),
        )
        for seg in result["segments"]
    ]
    return segments, language


def _namespace_speaker(speaker: str | None, track: str | None) -> str | None:
    if speaker is None or track is None:
        return speaker
    return f"{track}:{speaker}"


def _apply_drift_correction(
    segments: list[TranscriptSegment], drift_offsets: list[tuple[float, float]]
) -> list[TranscriptSegment]:
    """Shift speaker-track segment timestamps onto the mic track's timeline
    using the piecewise lag table `Recorder._estimate_drift` produced at
    recording time (ADR 0005). Segments before the first known offset, or in
    gaps where no confident lag was measured, use the nearest known offset.

    `_estimate_drift` defines `lag` via `correlate(mic_window, speaker_window)`,
    which satisfies `mic[n] == speaker[n - lag]` at the correlation peak — i.e.
    content at speaker-track index `m` matches mic-track index `m + lag`. So a
    speaker-track timestamp's mic-equivalent time is `speaker_time + lag`.
    """
    if not drift_offsets:
        return segments

    window_starts = [offset[0] for offset in drift_offsets]

    def lag_at(t: float) -> float:
        i = bisect.bisect_right(window_starts, t) - 1
        i = max(0, min(i, len(drift_offsets) - 1))
        return drift_offsets[i][1]

    corrected = []
    for seg in segments:
        lag = lag_at(seg.start)
        corrected.append(
            TranscriptSegment(
                start=max(0.0, seg.start + lag),
                end=max(0.0, seg.end + lag),
                speaker=seg.speaker,
                text=seg.text,
                avg_logprob=seg.avg_logprob,
            )
        )
    return corrected


BLEED_DEDUP_TIME_TOLERANCE_SECONDS = 0.5
BLEED_DEDUP_SIMILARITY_THRESHOLD = 0.6


def _dedup_bleed_segments(
    mic_segments: list[TranscriptSegment],
    speaker_segments: list[TranscriptSegment],
    bleed_detected: bool,
) -> tuple[list[TranscriptSegment], list[TranscriptSegment]]:
    """Drop the weaker copy of a segment transcribed on both tracks because
    speaker audio acoustically leaked into the mic (ADR 0006). Only runs when
    `bleed_detected` is true, to avoid suppressing genuine same-text
    same-time utterances on clean dual-track recordings.
    """
    if not bleed_detected:
        return mic_segments, speaker_segments

    def overlaps(a: TranscriptSegment, b: TranscriptSegment) -> bool:
        tol = BLEED_DEDUP_TIME_TOLERANCE_SECONDS
        return not (a.end + tol < b.start or b.end + tol < a.start)

    def similarity(a: TranscriptSegment, b: TranscriptSegment) -> float:
        return SequenceMatcher(None, a.text.lower(), b.text.lower()).ratio()

    drop_mic: set[int] = set()
    drop_speaker: set[int] = set()
    consumed_speaker: set[int] = set()

    for i, mic_seg in enumerate(mic_segments):
        best_j = None
        best_score = 0.0
        for j, speaker_seg in enumerate(speaker_segments):
            if j in consumed_speaker or not overlaps(mic_seg, speaker_seg):
                continue
            score = similarity(mic_seg, speaker_seg)
            if score > best_score:
                best_score = score
                best_j = j

        if best_j is None or best_score <= BLEED_DEDUP_SIMILARITY_THRESHOLD:
            continue

        speaker_seg = speaker_segments[best_j]
        consumed_speaker.add(best_j)

        if mic_seg.avg_logprob is not None and speaker_seg.avg_logprob is not None:
            if mic_seg.avg_logprob >= speaker_seg.avg_logprob:
                drop_speaker.add(best_j)
            else:
                drop_mic.add(i)
        else:
            drop_mic.add(i)

    filtered_mic = [seg for i, seg in enumerate(mic_segments) if i not in drop_mic]
    filtered_speaker = [
        seg for j, seg in enumerate(speaker_segments) if j not in drop_speaker
    ]
    return filtered_mic, filtered_speaker
