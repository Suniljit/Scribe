# ADR 0002: Transcription stack — whisperx (faster-whisper large-v3 + pyannote)

## Status
Accepted

## Context
Requirements: fully local transcription, accuracy prioritized over speed,
speaker diarization, and a peak RAM budget of ~10GB. CTranslate2 (used by
faster-whisper) has no Apple GPU (MPS) backend, so inference runs on CPU.

## Decision
Use [whisperx](https://github.com/m-bain/whisperX), which bundles:
- `faster-whisper` running the Whisper **large-v3** model for transcription
  accuracy,
- forced word-level alignment,
- a `pyannote.audio` speaker-diarization pipeline, wired together via
  `whisperx.assign_word_speakers` to produce per-segment speaker labels.

`WHISPER_COMPUTE_TYPE=int8` (backend/app/config.py) keeps large-v3's peak RAM
around 3-4GB on CPU, well within the 10GB budget, while keeping accuracy
close to float32.

Diarization requires a Hugging Face access token (`HF_TOKEN` env var) with
access to the gated `pyannote/speaker-diarization-3.1` model — the model
weights are still downloaded once and run entirely locally afterward; no
audio ever leaves the machine.

## Consequences
- First transcription run downloads the whisper and pyannote model weights
  (several GB) and requires an `HF_TOKEN`; documented in the README.
- Transcription is CPU-bound and slower than real-time, which is an accepted
  tradeoff given the stated preference for accuracy over speed.
- Swapping to a smaller Whisper model later only requires changing the
  `TRANSCRIBE_WHISPER_MODEL`/`TRANSCRIBE_WHISPER_COMPUTE` env vars. The
  whisper stage itself stays on CPU as long as it runs on CTranslate2 — see
  [ADR 0007](0007-mps-alignment-diarization.md) for the alignment/diarization
  stages, which are plain-PyTorch and do use MPS.
