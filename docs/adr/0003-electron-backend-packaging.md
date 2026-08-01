# ADR 0003: Electron shells out to a uv-managed Python backend

## Status
Accepted

## Context
The macOS app needs the same Python backend (FastAPI + whisperx + torch +
pyannote) as the browser version. Bundling a full Python + PyTorch + CUDA/MPS
runtime inside an Electron app (e.g. via PyInstaller) is possible but adds
significant packaging complexity and multi-GB app size, and duplicates what
`uv` already does well.

## Decision
The Electron main process (`electron/src/backend.js`) spawns the backend as
a subprocess via `uv run uvicorn app.main:app --port 8000`, polls
`/api/health` until it responds, then loads the frontend. This requires `uv`
to be installed on the host machine — the same requirement as running the
backend directly for local development.

## Consequences
- Simpler build: the Electron app packages the frontend build output and the
  backend source tree (see `electron/package.json` `extraResources`), not a
  frozen Python interpreter.
- The end user (or installer) must have `uv` on `PATH`. This is acceptable
  for a local-first developer/power-user tool; revisit with a bundled Python
  runtime (e.g. PyInstaller or `python-build-standalone`) if wider
  non-technical distribution is needed later.
- Electron and the browser frontend hit the exact same local API, so there is
  no behavioral drift between the two frontends.
