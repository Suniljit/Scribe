# ADR 0007: Use MPS for word alignment and speaker diarization

## Status
Accepted

## Context
[ADR 0002](0002-transcription-stack.md) established that whisper
transcription runs on CPU because CTranslate2 (used by `faster-whisper`) has
no Apple GPU/MPS backend. That constraint still holds: `ctranslate2` has not
added MPS support, so the whisper stage stays on CPU regardless of hardware.

The rest of the pipeline in `backend/app/transcription.py` is not bound by
that constraint, though. Word alignment (`whisperx.load_align_model` /
`whisperx.align`, a wav2vec2 model) and speaker diarization
(`whisperx.diarize.DiarizationPipeline`, a `pyannote.audio` pipeline) both
run on plain PyTorch, which does support MPS on Apple Silicon. Previously all
three stages shared one `WHISPER_DEVICE` config value pinned to `"cpu"`, so
alignment and diarization never used the GPU even though nothing prevented
it.

## Decision
Split the device configuration:
- `WHISPER_DEVICE` (`TRANSCRIBE_WHISPER_DEVICE`, default `"cpu"`) continues
  to control only the whisper/CTranslate2 model.
- A new `AUX_DEVICE` (`TRANSCRIBE_AUX_DEVICE`) controls the alignment and
  diarization models. When unset, it auto-detects via
  `torch.backends.mps.is_available()`, defaulting to `"mps"` when available
  and `"cpu"` otherwise. An explicit env var value always overrides
  auto-detection, so it can be forced back to `"cpu"` if an MPS op gap
  causes a `NotImplementedError` for a given torch/pyannote combination.

## Consequences
- Alignment and diarization — two of the three pipeline stages — run faster
  on Apple Silicon hardware that supports MPS, with no change to whisper's
  CPU-bound behavior or accuracy.
- Whisper transcription remains the slowest stage and the overall pipeline's
  bottleneck; this change does not affect the CPU-bound, slower-than-real-time
  tradeoff described in ADR 0002.
- If a specific torch op used by the align or diarize model isn't
  implemented for MPS, the pipeline fails with a `NotImplementedError`
  naming the op rather than silently falling back to CPU mid-run. The
  `TRANSCRIBE_AUX_DEVICE=cpu` override is the escape hatch.
