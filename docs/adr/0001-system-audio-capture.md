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
stops. To capture speaker/system audio (including Teams calls), that second
device must be a loopback device such as
[BlackHole](https://github.com/ExistentialAudio/BlackHole), routed via a
macOS Multi-Output Device so audio still plays through speakers normally
while also being captured. Any general-purpose loopback route captures
whatever the Mac plays, Teams included, so there's no need to rely on
Teams' own virtual audio device — it only captures Teams call audio
specifically, so it's actively excluded from the speaker picker as
redundant.

The `/api/devices` endpoint flags a device as a likely loopback/speaker
source if it reports real output channels (`max_output_channels > 0` — a
capability plain microphones don't have, but virtual devices like BlackHole
or an Aggregate/Multi-Output Device do), or failing that, if its name
matches a common loopback tool name (`blackhole`, `soundflower`,
`aggregate`, `multi-output`) — except for devices matching `teams audio`,
which are excluded even if they report output channels. The frontend uses
this flag to only offer likely loopback devices in the speaker picker, but
the user always makes the final selection.

## Consequences
- Capturing Teams call audio requires one-time setup outside the app
  (installing BlackHole and creating a Multi-Output Device), documented in
  the README.
- No speaker-audio permission prompts or private APIs are needed — the app
  only ever reads from standard CoreAudio input devices.
- If no speaker-audio device is selected, the app still works as a plain
  microphone recorder.
