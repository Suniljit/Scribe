from enum import Enum

from pydantic import BaseModel


class AudioDevice(BaseModel):
    index: int
    name: str
    max_input_channels: int
    default_samplerate: float
    is_likely_loopback: bool


class StartRecordingRequest(BaseModel):
    mic_device_index: int
    speaker_device_index: int | None = None
    name: str | None = None


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


class TranscriptJob(BaseModel):
    recording_id: str
    status: TranscriptionStatus
    progress: str = ""
    error: str | None = None


class TranscriptResult(BaseModel):
    recording_id: str
    language: str | None = None
    segments: list[TranscriptSegment]
