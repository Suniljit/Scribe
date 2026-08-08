---
indexed_commit: 9dfac8a07d31ccb130a8f2b7ccf32d0117210dc7
last_updated: 2026-08-08
---

# INDEX.md

High-level map of this repo — what each top-level folder and root file covers. Read this first when navigating; update it when a change adds, removes, or repurposes a folder or file.

## Folders

- `.claude/` — Claude Code project config; `launch.json` defines the `frontend` dev-server preview target.
- `backend/` — Python/FastAPI service: recording, transcription (whisperx), diarization, and the HTTP/WS API.
  - `app/` — application code: `main.py` (FastAPI app), `recorder.py` (audio capture/mixdown), `transcription.py` (whisperx pipeline), `audio_devices.py`, `storage.py`, `vtt.py`, `models.py`, `config.py`.
    - `routers/` — API route modules: `devices.py`, `recordings.py`, `transcripts.py`.
  - `tests/` — pytest suite covering drift correction, bleed dedup, VTT export, storage, and the routers.
  - `data/` — local runtime data (recordings/transcripts output).
- `docs/` — project documentation: PRD, ADRs, and research notes (see sections below).
- `electron/` — Electron shell (`src/main.js`, `preload.js`, `backend.js`) that spawns the Python backend and loads the frontend build as a macOS app.
- `frontend/` — Vite + React + TypeScript UI (shadcn/ui + Tailwind). App shell: sidebar (projects/unassigned/settings nav) + topbar + screen router in `App.tsx`, glassmorphic theme tokens in `index.css`.
  - `src/components/` — `AudioPlayer`, `DeviceSelector`, `NewRecordingModal`, `ProjectDialog`, `ChatPanel`, `common.tsx` (Spinner/StatusChip/EmptyState), plus `ui/` (shadcn primitives) and:
    - `layout/` — `AppSidebar`, `AppTopbar`, `RecordingBanner`.
    - `screens/` — `HomeScreen`, `MeetingListScreen` (project detail/unassigned), `MeetingScreen`, `SettingsScreen`.
  - `src/lib/` — `api.ts` (backend client), `capture.ts` (browser audio capture), `utils.ts`, `theme.tsx` (light/dark), `projects.ts`/`notes.ts`/`settings.ts`/`chat.ts` (localStorage-backed, frontend-only until FR-03/05/06 land server-side — see `meetingStatus.ts` for derived meeting state).

## Root files

| File | Description |
|---|---|
| `README.md` | Setup and usage: prerequisites, model downloads, running backend/frontend/Electron app. |
| `pyproject.toml` / `uv.lock` | Root Python project/lockfile (uv-managed). |
| `.pre-commit-config.yaml` | Pre-commit hook configuration. |

## Design

<!-- docs/design/ — rows written by /tech-docs -->

| Document | Status | Depends on | Description |
|---|---|---|---|
| [PRD](docs/design/prd.md) | draft | — | Problem, persona, scope, user stories, success metrics for Scribe |
| [App Flow](docs/design/app-flow.md) | draft | PRD | Onboarding, core loops, screen map, edge logic for Scribe |

## ADRs

<!-- docs/adr/ — records written by /domain-modeling -->

| ADR | Status | Description |
|---|---|---|
| [ADR-0001](docs/adr/0001-system-audio-capture.md) | superseded by 0007 | System audio capture via loopback device (BlackHole) |
| [ADR-0002](docs/adr/0002-transcription-stack.md) | accepted | Transcription stack — whisperx (faster-whisper large-v3 + pyannote) |
| [ADR-0003](docs/adr/0003-electron-backend-packaging.md) | accepted | Electron shells out to a uv-managed Python backend |
| [ADR-0004](docs/adr/0004-per-track-transcription.md) | accepted | Per-track transcription with independent diarization |
| [ADR-0005](docs/adr/0005-bleed-transcript-dedup.md) | accepted | Post-hoc transcript-level dedup for mic/speaker bleed |
| [ADR-0006](docs/adr/0006-mps-alignment-diarization.md) | accepted | Use MPS for word alignment and speaker diarization |
| [ADR-0007](docs/adr/0007-native-audio-capture.md) | accepted | Native OS audio capture, replacing BlackHole (supersedes ADR-0001) |

## Research

| Document | Description |
|---|---|
| [System audio capture options](docs/research/system-audio-capture-options.md) | Alternatives to BlackHole for macOS system audio capture, feeding ADR-0007 |
| [Mic/speaker bleed dedup](docs/research/mic-speaker-bleed-dedup.md) | Deduplicating acoustic mic/speaker bleed in the merged transcript, feeding ADR-0005 |
