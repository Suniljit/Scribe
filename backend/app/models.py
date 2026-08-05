from enum import Enum

from pydantic import BaseModel, Field, field_validator


class AudioDevice(BaseModel):
    index: int
    name: str
    max_input_channels: int
    max_output_channels: int
    default_samplerate: float
    is_likely_loopback: bool


class StartRecordingRequest(BaseModel):
    mic_device_index: int
    speaker_device_index: int | None = None
    name: str | None = None


class RenameRecordingRequest(BaseModel):
    name: str = Field(min_length=1)

    @field_validator("name")
    @classmethod
    def _strip_and_validate(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("name must not be blank")
        return v


class RecordingStatus(str, Enum):
    RECORDING = "recording"
    STOPPED = "stopped"


class RecordingMeta(BaseModel):
    id: str
    name: str
    created_at: str
    status: RecordingStatus
    duration_seconds: float | None = None
    mic_device_index: int
    speaker_device_index: int | None = None
    audio_path: str | None = None
    mic_audio_path: str | None = None
    speaker_audio_path: str | None = None
    drift_offsets: list[tuple[float, float]] | None = None
    bleed_detected: bool = False


class TranscriptionStatus(str, Enum):
    NOT_STARTED = "not_started"
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class TranscriptSegment(BaseModel):
    start: float
    end: float
    speaker: str | None = None
    text: str
    avg_logprob: float | None = None


class TranscriptJob(BaseModel):
    recording_id: str
    status: TranscriptionStatus
    progress: str = ""
    error: str | None = None


class TranscriptResult(BaseModel):
    recording_id: str
    language: str | None = None
    segments: list[TranscriptSegment]
