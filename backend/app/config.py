import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
DATA_DIR = Path(os.environ.get("TRANSCRIBE_DATA_DIR", BACKEND_DIR / "data")).resolve()
RECORDINGS_DIR = DATA_DIR / "recordings"
TRANSCRIPTS_DIR = DATA_DIR / "transcripts"

RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

SAMPLE_RATE = 16000
CHANNELS = 1

# How often to re-estimate mic/speaker clock drift during a recording, for
# aligning per-track transcript timestamps before merging (ADR 0005).
DRIFT_RESYNC_WINDOW_SECONDS = 60

# faster-whisper model size. large-v3 chosen for accuracy; int8 compute type keeps
# peak RAM well under the 10GB budget on CPU. This stage runs on CTranslate2,
# which has no MPS backend on macOS, so it always runs on CPU (ADR 0002).
WHISPER_MODEL = os.environ.get("TRANSCRIBE_WHISPER_MODEL", "large-v3")
WHISPER_COMPUTE_TYPE = os.environ.get("TRANSCRIBE_WHISPER_COMPUTE", "int8")
WHISPER_DEVICE = os.environ.get("TRANSCRIBE_WHISPER_DEVICE", "cpu")


def _default_aux_device() -> str:
    import torch

    return "mps" if torch.backends.mps.is_available() else "cpu"


# Device for word alignment (wav2vec2) and speaker diarization (pyannote.audio),
# which run on plain PyTorch and support MPS, unlike the whisper stage above
# (ADR 0007). Defaults to MPS when available, else CPU; override to force a
# specific device (e.g. "cpu" to work around an MPS op gap).
AUX_DEVICE = os.environ.get("TRANSCRIBE_AUX_DEVICE") or _default_aux_device()

# Required for pyannote speaker-diarization-3.1 (gated model on Hugging Face).
HF_TOKEN = os.environ.get("HF_TOKEN")
