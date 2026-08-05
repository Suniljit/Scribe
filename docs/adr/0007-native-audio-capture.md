# ADR 0007: Native OS audio capture, replacing BlackHole

## Status
Accepted — supersedes [ADR 0001](0001-system-audio-capture.md)

## Context
[ADR 0001](0001-system-audio-capture.md) required installing
[BlackHole](https://github.com/ExistentialAudio/BlackHole) and manually
building a macOS Multi-Output Device before Scribe could capture
speaker/system audio — a real one-time setup burden, documented at length in
the README.

[`docs/research/system-audio-capture-options.md`](../research/system-audio-capture-options.md)
surveyed the OS-level alternatives Apple has since shipped
(ScreenCaptureKit, the Core Audio process-tap API) and their exposure through
Electron and the browser. That research initially recommended keeping
BlackHole, on the grounds that it was the only option that behaved
identically in both of Scribe's run modes (plain browser and the Electron
app). Revisiting that constraint: Scribe doesn't actually need one mechanism
across both modes — it needs each mode to work as well as it reasonably can.
Relaxing that requirement opens up driver-free capture for the Electron app
today, and for Chrome/Edge browser users, at the cost of the two modes now
using different mechanisms.

A Phase 0 spike (prototyped under a throwaway `electron/prototype-loopback/`
and `backend/prototype_pcm_stream/`, since removed) validated the two open
technical questions before this was implemented:
- `electron-audio-loopback` works on Scribe's pinned Electron 33 with no
  upgrade required — confirmed via a real permission grant and non-silent
  captured audio.
- Streaming raw PCM from a renderer-side `AudioWorklet` over a WebSocket into
  the same incremental-WAV-write pattern `Recorder` already uses is
  gapless at real-time pace (validated over a 5-minute synthetic run, 0
  gaps, exact sample counts).

## Decision
Replace BlackHole with per-mode native capture:

- **Electron mode**: [`electron-audio-loopback`](https://www.npmjs.com/package/electron-audio-loopback)
  (`electron/src/main.js` calls `initMain()`; `electron/src/preload.js`
  bridges `enableLoopbackAudio`/`disableLoopbackAudio` via `contextBridge`,
  keeping `contextIsolation: true` / `nodeIntegration: false`). Driver-free,
  no Electron upgrade needed.
- **Browser mode**: `getDisplayMedia({ audio: true })`, gated by a runtime
  feature/track check rather than a browser allowlist — Chrome/Edge on a
  recent enough macOS return a live audio track; Safari, Firefox, and older
  Chrome/macOS return none. When no audio track comes back, or the user
  declines the share/permission prompt, recording proceeds **mic-only**
  rather than failing — this degraded mode was already a first-class case
  under ADR 0001 (`speaker_device_index: null`).
- Microphone capture continues to use `getUserMedia({ audio: true })` in
  both native modes — only the speaker/system-audio leg changes.
- The manual CoreAudio device picker (BlackHole or otherwise) is **kept**,
  not removed: `frontend/src/lib/capture.ts`'s `detectCaptureMode()` only
  falls back to it if neither native mechanism is available, so existing
  BlackHole users aren't broken.

**Data path.** Native capture yields a browser-side `MediaStream`, not a
CoreAudio device index `sounddevice` can read. `backend/app/recorder.py`'s
`Recorder` gained a second capture source, `capture_source="browser-push"`,
alongside the original CoreAudio `sd.InputStream` path:
- The frontend chunks each `MediaStream` via an `AudioWorklet`
  (`frontend/public/worklet-processor.js`, ~4096-sample chunks at 48 kHz) and
  streams raw float32 PCM over a new
  `WS /api/recordings/{id}/stream?track=mic|speaker` endpoint
  (`backend/app/routers/recordings.py`).
- `Recorder.write_chunk()` is shared between this ingestion route and the
  original `sd.InputStream` callbacks, writing into the same per-track temp
  WAV files either way. The speaker file opens lazily on its first chunk,
  since whether a speaker track exists at all isn't known until the renderer
  successfully starts one.
- `stop()`, `_read_tracks`, `_mixdown`, `_detect_bleed`, and `_estimate_drift`
  are all unchanged — they only ever operated on the resulting WAV files, not
  on how samples got written into them.
- Both `mic` and `speaker` browser-push tracks are written **mono**. This
  matches what `_read_tracks` already reduces CoreAudio speaker tracks to
  (`.mean(axis=1)` before resampling), so no per-track fidelity is lost.

**Independent clock domains still apply.** [ADR 0005](0005-bleed-transcript-dedup.md)
rejected real-time AEC because the mic and speaker legs are captured on
independent, unsynchronized clocks. Native capture still delivers mic and
speaker as two separate streams (`getUserMedia` and
`getDisplayMedia`/loopback are captured independently, each with their own
buffering), so this constraint is **unchanged** — `_estimate_drift`'s
piecewise drift correction stays in place. The Phase 0 spike did not carry
enough duration/real-content data to test whether same-process browser
capture meaningfully reduces drift versus the CoreAudio path; that remains
untested, not assumed.

A discovered bug, fixed as part of this change: `_resample_to` divided by
zero when a track had zero samples (e.g. the user denies the mic permission
prompt immediately after starting a browser-push recording, so `stop()` runs
against an empty track). This is now handled by returning the empty array
unresampled.

## Consequences
- Electron-app users no longer need to install BlackHole or build a
  Multi-Output Device; first-run friction drops to an OS permission prompt
  (Screen Recording on macOS 13–14.1, a narrower Core Audio Tap prompt on
  14.2+, both handled by Chromium).
- Browser-mode users on Chrome/Edge get the same driver-free experience;
  Safari/Firefox users, or anyone on an unsupported macOS version, fall back
  to mic-only recording with an inline UI note — a real capability
  regression for those users relative to BlackHole (which worked
  identically regardless of browser), accepted in exchange for removing the
  setup burden for everyone else. The manual CoreAudio/BlackHole path
  remains available as a fallback for anyone who needs it.
- Two independent capture code paths now exist in `Recorder`
  (`_start_coreaudio` / `_start_browser_push`), rather than one — a
  maintenance cost accepted for the UX win, mitigated by both paths
  converging on the same `write_chunk`/temp-WAV representation before
  `stop()`.
- ADR 0005's drift-correction machinery is retained unchanged; this ADR does
  not claim it could be simplified or removed.
