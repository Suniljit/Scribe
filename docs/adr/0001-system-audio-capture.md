# ADR 0001: System audio capture via loopback device

## Status
Accepted

## Context
Recording Microsoft Teams calls requires capturing audio the Mac is *playing*
(the other participants), not just the microphone. macOS has no public API to
record arbitrary speaker/output audio directly — sandboxed apps can only read
from input devices.

## Decision
The backend records two independent input streams — the microphone and a
second, user-selected input device — and mixes them down after the recording
stops. To capture speaker/Teams audio, that second device must be a loopback
device such as [BlackHole](https://github.com/ExistentialAudio/BlackHole),
routed via a macOS Multi-Output Device so audio still plays through speakers
normally while also being captured. Microsoft Teams also exposes its own
"Microsoft Teams Audio" input device on macOS, which the device picker
recognizes automatically as a likely loopback source.

The `/api/devices` endpoint flags devices whose name matches common loopback
tool names (`blackhole`, `soundflower`, `aggregate`, `teams audio`, etc.) so
the frontend can suggest the right one, but the user always makes the final
selection.

## Consequences
- Capturing Teams call audio requires one-time setup outside the app
  (installing BlackHole and creating a Multi-Output Device), documented in
  the README.
- No speaker-audio permission prompts or private APIs are needed — the app
  only ever reads from standard CoreAudio input devices.
- If no speaker-audio device is selected, the app still works as a plain
  microphone recorder.
