# Transcribe

A fully local meeting recorder and transcriber: record your microphone plus
speaker audio (e.g. Microsoft Teams calls), then transcribe with a local
Whisper model and speaker diarization — nothing leaves your machine. See
[INDEX.md](INDEX.md) for the full docs map.

- Backend: Python / FastAPI, `sounddevice` for recording, `whisperx`
  (faster-whisper large-v3 + pyannote diarization) for transcription
- Frontend: Vite + React + TypeScript + shadcn/ui + Tailwind
- macOS app: Electron shell that spawns the same backend and loads the same
  frontend

## Prerequisites

- [`uv`](https://docs.astral.sh/uv/) (Python package/venv manager)
- Node.js 20+
- A Hugging Face account with access accepted for
  [`pyannote/speaker-diarization-3.1`](https://huggingface.co/pyannote/speaker-diarization-3.1)
  and [`pyannote/segmentation-3.0`](https://huggingface.co/pyannote/segmentation-3.0),
  plus an access token from <https://huggingface.co/settings/tokens>

  | Model | Gated? | Parameters | Disk size |
  |---|---|---|---|
  | [`Systran/faster-whisper-large-v3`](https://huggingface.co/Systran/faster-whisper-large-v3) | No | ~1.55B | ~3.1 GB |
  | [`pyannote/speaker-diarization-3.1`](https://huggingface.co/pyannote/speaker-diarization-3.1) | **Yes** | pipeline config (wraps the two models below) | negligible |
  | [`pyannote/segmentation-3.0`](https://huggingface.co/pyannote/segmentation-3.0) | **Yes** | ~1.5M | ~6 MB |
  | [`pyannote/wespeaker-voxceleb-resnet34-LM`](https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM) (speaker embedding, used internally by the diarization pipeline) | No | ~6.6M | ~27 MB |

  "Gated" models require accepting the model's terms on Hugging Face (while
  logged in) before your token can download it — visit each gated model's
  page above and click "Agree and access repository".
- To capture **speaker audio** (e.g. Teams call audio), install
  [BlackHole 2ch](https://github.com/ExistentialAudio/BlackHole) and create a
  macOS **Multi-Output Device** (Audio MIDI Setup app) combining your
  speakers + BlackHole, and set that as your system output during calls. See
  [ADR 0001](docs/adr/0001-system-audio-capture.md) for why this is
  necessary. (macOS Teams also exposes its own "Microsoft Teams Audio"
  input device, but the app doesn't offer it as a speaker option since it
  only captures Teams call audio — BlackHole via a Multi-Output Device
  captures everything and works for any app.)

## Configuration

```bash
cd backend
cp .env.example .env
# edit .env and set HF_TOKEN=hf_xxx (required for speaker diarization)
```

The backend loads `backend/.env` automatically on startup (via
`python-dotenv`), so this only needs to be done once — no `export` needed in
each terminal session.

## Running (browser)

```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

## Running (macOS app)

```bash
cd frontend && npm run build
cd ../electron && npm install
npm run start
```

`npm run dev` (in `electron/`) instead points the window at the Vite dev
server for hot-reload during development.

## Development setup

This repo uses [pre-commit](https://pre-commit.com) for lint hooks on commit
and type-check/test hooks on push (see [ADR 0004](docs/adr/0004-pre-commit-hooks.md)).
`pre-commit` itself is pinned as a uv dev dependency at the repo root:

```bash
uv sync
uv run pre-commit install --hook-type pre-commit --hook-type pre-push
```

## Notes

- First transcription run downloads the Whisper large-v3 and pyannote model
  weights (several GB) — this can take a while depending on your connection.
- Transcription is CPU-only (no MPS support in the underlying CTranslate2
  runtime) and runs slower than real time by design — accuracy was
  prioritized over speed. See [ADR 0002](docs/adr/0002-transcription-stack.md).
- Recordings and transcripts are stored under `backend/data/` and are never
  committed to git.
