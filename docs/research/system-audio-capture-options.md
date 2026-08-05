# Research: Better alternatives to BlackHole for macOS system audio capture

## Question

[ADR 0001](../adr/0001-system-audio-capture.md) captures speaker/system audio
by asking the user to install [BlackHole](https://github.com/ExistentialAudio/BlackHole),
a third-party virtual loopback driver, and route it through a macOS
Multi-Output Device — a real one-time setup burden documented in the README.
Since that ADR was written, Apple has shipped two OS-level ways to capture
system audio without any virtual driver: **ScreenCaptureKit** (macOS 13+) and
the newer **Core Audio process-tap API** (macOS 14.2+). This doc surveys both
against primary sources, checks how BlackHole itself works and where it's
limited, and — because Scribe is an Electron app — checks whether Electron
already exposes either OS API without requiring a native Swift/Obj-C helper.

## 1. BlackHole (current approach): how it works and its real costs

BlackHole is a "modern macOS virtual audio loopback driver that allows
applications to pass audio to other applications with zero additional
latency," installed as a signed driver package (Homebrew or a `.pkg`
installer), licensed GPL-3.0 (commercial use requires contacting Existential
Audio directly for a separate license). Source:
[github.com/ExistentialAudio/BlackHole](https://github.com/ExistentialAudio/BlackHole).

Costs this ADR already accepted, confirmed from the README:
- **Install friction**: a separate installer/package, closing running audio
  apps first, and in some cases a restart — plus, per ADR 0001, manually
  building a Multi-Output Device in Audio MIDI Setup so audio still plays
  through speakers while being captured.
- **Compatibility caveats**: several apps (Apple Podcasts, Messages,
  HDHomeRun per the README) don't work correctly with Multi-Output
  configurations; AirPods at reduced sample rates shouldn't be the primary
  device in an aggregate; drift correction has to be enabled to avoid
  glitching on long sessions (this is exactly the drift problem ADR 0005 and
  [mic-speaker-bleed-dedup.md](mic-speaker-bleed-dedup.md) already had to
  build correction for, on Scribe's side).
- Operates at 32-bit float only (lossless for ≤24-bit sources, per the
  README) — not itself a problem, just a format detail to be aware of if
  ever comparing against native-API output formats.

## 2. ScreenCaptureKit audio capture (macOS 13+)

`SCStream`/`SCStreamConfiguration` gained a `capturesAudio` boolean; setting
it to `true` (with `sampleRate = 48_000` and `channelCount = 2`) captures the
system's audio mix alongside (or independent of) video, and
`excludesCurrentProcessAudio` can exclude the calling app's own output. This
was introduced in the WWDC22 session **"Meet ScreenCaptureKit"**
([developer.apple.com/videos/play/wwdc2022/10156](https://developer.apple.com/videos/play/wwdc2022/10156))
and the framework reference at
[developer.apple.com/documentation/screencapturekit](https://developer.apple.com/documentation/screencapturekit).

Key facts, corroborated across the WWDC22 session and the ScreenCaptureKit
docs:
- **Minimum OS**: macOS 13.0 for `capturesAudio`/`excludesCurrentProcessAudio`
  themselves. Source:
  [`SCStreamConfiguration.capturesAudio`](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/capturesaudio),
  [`excludesCurrentProcessAudio`](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/excludescurrentprocessaudio).
  Apple's own current sample project ("Capturing screen content in macOS")
  targets macOS 15/Xcode 16 and additionally confirms that **after the user
  grants Screen Recording permission, the app must be restarted** before
  capture starts working — the grant isn't picked up live. Source:
  [Capturing screen content in macOS](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos).
- **Permission model**: audio capture rides on the same **Screen Recording**
  TCC grant as video — WWDC22 states plainly the framework "will require
  consent before capturing video and audio content, and the choice will be
  stored in the Screen Recording privacy setting in system preferences."
  There's no audio-only prompt at this API layer.
- **Sample rate/format constraints**: `sampleRate` only accepts **8000,
  16000, 24000, or 48000 Hz**; anything else silently falls back to the
  48 kHz default. Source:
  [`SCStreamConfiguration.sampleRate`](https://developer.apple.com/documentation/screencapturekit/scstreamconfiguration/samplerate).
- **Scope**: it captures the **system-wide audio mix**, not an arbitrary
  single app's stream in isolation (per-app exclusion via
  `SCContentFilter`/`excludesCurrentProcessAudio` is possible, but the
  primitive is "screen + audio," not "one process's audio tap"). WWDC22 is
  explicit about the granularity limit: **"audio capture can only be
  filtered at an application level"** — whole apps can be included/excluded,
  individual windows cannot. Source:
  [Meet ScreenCaptureKit — WWDC22, session 10156](https://developer.apple.com/videos/play/wwdc2022/10156/).
- **DRM-protected audio**: could not verify from a primary source whether
  protected audio specifically (as opposed to video frames, which Apple's
  docs elsewhere describe being blacked out for protected content) is
  silenced by ScreenCaptureKit. Flagged as unverified rather than asserted.

For an app whose only interest is "audio," requiring the user to grant
**Screen Recording** permission (a broader, more alarming-looking permission
than an audio-specific one) is a real UX cost relative to what's actually
needed.

**Real-world precedent — OBS Studio.** OBS Studio added ScreenCaptureKit-based
audio capture in the PR "Add audio capture support for ScreenCaptureKit on
macOS 13," which shipped as a dedicated "macOS Audio Capture Source." Source:
[obsproject/obs-studio PR #6600](https://github.com/obsproject/obs-studio/pull/6600).
OBS's own knowledge base confirms the resulting split: native audio capture
(no third-party software) on **macOS 13+**, with a fallback to driver-based
tools — **BlackHole, Loopback, VB-CABLE, or Sound Siphon** — below macOS 13,
explicitly noting that of those, "VB-CABLE... does not support
per-application audio capture," i.e. the native path was adopted specifically
because it's more capable, not just more convenient. Source:
[macOS Desktop Audio Capture Guide — obsproject.com](https://obsproject.com/kb/macos-desktop-audio-capture-guide).

## 3. Core Audio process taps (macOS 14.2+): the more targeted native API

Apple's Core Audio framework gained a purpose-built system/process audio tap
API, documented at
[developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps](https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps)
and the entry point
[`AudioHardwareCreateProcessTap(_:_:)`](https://developer.apple.com/documentation/coreaudio/audiohardwarecreateprocesstap(_:_:)).
Two independent open-source reference implementations corroborate the same
mechanics:

- **[insidegui/AudioCap](https://github.com/insidegui/AudioCap)** ("Sample
  code for recording system audio on macOS 14.4+") — the canonical Apple-
  adjacent example. Flow: create a `CATapDescription` (for a specific
  process, translated from PID via `kAudioHardwarePropertyTranslatePIDToProcessObject`,
  or for a system-wide/stereo mixdown), call `AudioHardwareCreateProcessTap`
  to get the tap's own `AudioObjectID`, then build a **private aggregate
  device** (`kAudioAggregateDeviceTapListKey`,
  `kAudioAggregateDeviceIsPrivateKey = true` via
  `AudioHardwareCreateAggregateDevice`) so the tap can be read like a normal
  Core Audio input device via an IOProc/`AVAudioPCMBuffer` callback — no
  driver install needed. Permission is requested via the standard
  `NSAudioCaptureUsageDescription` Info.plist string; there is **no public
  API to programmatically check or pre-request** the permission — the OS
  prompts the user automatically the first time the app starts an aggregate
  device containing a tap.
- **[makeusabrew/audiotee](https://github.com/makeusabrew/audiotee)** — a
  standalone Swift CLI built on the same API, confirming a **macOS 14.2**
  floor (vs. AudioCap's 14.4 deployment target — 14.2 is when the underlying
  API shipped; 14.4 is where the sample project happens to target). Notes the
  API is still explicitly marked **unstable and subject to change**, and that
  (as of when audiotee was written) only the **default output device** is
  supported for the system-wide tap case.

Compared to ScreenCaptureKit, this is the more precisely-scoped tool for
"just give me system audio": no Screen Recording permission, a dedicated
`NSAudioCaptureUsageDescription`-labeled TCC prompt instead, and (per
CATapDescription's design) the option to tap a *specific* process rather
than only the whole-system mix. `CATapDescription` offers both shapes as
distinct initializers — `init(processes:deviceUID:stream:)` /
`init(stereoMixdownOfProcesses:)` for one or more specific processes, and
`init(stereoGlobalTapButExcludeProcesses:)` / `init(excludingProcesses:...)`
for a system-wide tap with an exclusion list — plus a `muteBehavior`
property controlling whether tapping a process also silences it to speakers.
Source: [`CATapDescription`](https://developer.apple.com/documentation/coreaudio/catapdescription).
`AudioHardwareCreateProcessTap(_:_:)` itself requires **macOS 14.2+**. Source:
[`AudioHardwareCreateProcessTap(_:_:)`](https://developer.apple.com/documentation/coreaudio/audiohardwarecreateprocesstap(_:_:)).

**Important nuance on the permission, from real-world usage**: although this
is a distinct, narrower-scoped TCC prompt than Screen Recording, it is not
fully independent of it in System Settings. An OBS Studio bug report
describes it precisely: "macOS 14.4 introduced granular permissions for
screen recording, including a new 'System Audio Recording Only'
sub-permission" — i.e. it is surfaced as a sub-permission *nested under* the
Screen Recording category, not a wholly separate settings page. The same
report notes that as of OBS 30.1.0, OBS itself did not yet recognize this
granular grant and still gated its (ScreenCaptureKit-based) audio capture on
full Screen Recording access — a reminder that an app has to explicitly
support the narrower permission to benefit from it. Source:
[obsproject/obs-studio issue #10401](https://github.com/obsproject/obs-studio/issues/10401).
No primary source was found confirming a major shipping app has adopted the
Core Audio Process Tap API itself (as opposed to ScreenCaptureKit) — only
Apple's own sample and the community samples below were found; flagged as
unverified rather than assumed absent.

## 3a. Other named virtual-driver alternatives, for comparison only

- **Loopback (Rogue Amoeba)** — same category of tool as BlackHole (a virtual
  audio-routing driver with a GUI mixer), commercial rather than
  GPL/open-source. Rogue Amoeba's own product page states the current release
  (2.4.10) requires **macOS 14.5 through 26**, is a paid one-time purchase
  with a free trial, and legacy versions exist for older macOS. Source:
  [rogueamoeba.com/loopback](https://rogueamoeba.com/loopback/). Not a
  native-API alternative — it's a nicer-UX version of the same driver-install
  approach BlackHole already uses, so it doesn't remove the install-friction
  cost ADR 0001 accepted, just makes the setup UI nicer.
- **Soundflower** — explicitly **deprecated**; its own README states
  "DEPRECATED Silicon Macs are not supported." Not viable on current
  Apple Silicon Macs. Source:
  [mattingalls/Soundflower](https://github.com/mattingalls/Soundflower).

## 4. The Electron angle: does this need a native helper binary at all?

Both APIs above are Swift/Objective-C only, which would normally mean Scribe
would need a compiled native helper process to use either directly from an
Electron app. But this exact problem — Electron's `desktopCapturer` never
provided real loopback audio on macOS ("Chromium creates an audio track but
the underlying buffer contains only silence" on the legacy path, unless the
device has a signed kernel extension like BlackHole) — has just been fixed
upstream in Chromium/Electron itself:

- **[electron/electron#47490](https://github.com/electron/electron/issues/47490)**
  is the tracking issue ("`desktopCapturer`: Use `ScreenCaptureKit` API to
  enable capturing loopback audio on macOS"), which shipped as
  [electron/electron#47493](https://github.com/electron/electron/pull/47493)
  (doc update accompanying the feature).
- Electron's own `desktopCapturer` docs
  ([electronjs.org/docs/latest/api/desktop-capturer](https://www.electronjs.org/docs/latest/api/desktop-capturer))
  now state that as of **Electron v39.0.0-beta.4**, Chromium made Apple's
  **Core Audio Tap API the default** for desktop audio capture on macOS
  14.2+ (requiring the same `NSAudioCaptureUsageDescription` Info.plist key
  as the native API above), with **ScreenCaptureKit** used as the path for
  macOS 13–14.1. The call shape is the existing
  `desktopCapturer.getSources()` / `getUserMedia({audio: 'loopback', ...})`
  API — no custom native module.
- For Electron versions **before** 39 (Electron 31–38), the community
  package **[alectrocute/electron-audio-loopback](https://github.com/alectrocute/electron-audio-loopback)**
  patches Chromium's behavior to expose the same `getLoopbackAudioMediaStream()`
  API on **macOS 12.3+**, without any third-party driver or native helper
  binary — it becomes an unnecessary no-op shim once an app is on Electron
  39+.

**Scribe currently pins `electron: "^33.0.0"`** (`electron/package.json`),
which is inside the range `electron-audio-loopback` targets — meaning
driver-free loopback capture is reachable today via that package, without
first upgrading Electron to 39.

## 5. Does any of this work in plain-browser mode, not just the Electron app?

Per the [README](../../README.md#running-browser), Scribe has two run modes:
a plain Vite dev server opened in a regular browser tab talking to the
FastAPI backend ("Running (browser)"), and the Electron shell ("Running
(macOS app)"). `desktopCapturer` and `electron-audio-loopback` (§4) are
**Electron-only** — `desktopCapturer` is an Electron main-process module with
no equivalent exposed to a plain web page, so neither helps browser mode.

The plain-browser equivalent is the standard
[`getDisplayMedia()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
Web API with its `audio` option, and its cross-browser/cross-OS support is
uneven:

- **Chrome/Edge on Windows and ChromeOS**: system-audio capture via
  `getDisplayMedia({audio: true})` when sharing the entire screen has worked
  since **Chrome 74**, per the Chromium feature-tracking issue
  [Support system audio capture in getDisplayMedia — issues.chromium.org/40606364](https://issues.chromium.org/issues/40606364).
- **Chrome/Edge on macOS**: system-audio capture via `getDisplayMedia` is
  **very recent** — Chromium landed it as **Chrome 141** (per Chrome's own
  community support thread confirming "Chrome 137: `getDisplayMedia({audio:
  true})` captures meeting audio during full screen sharing" moving to
  general availability by 141:
  [support.google.com/chrome/thread/349572226](https://support.google.com/chrome/thread/349572226/chrome-137-getdisplaymedia-audio-true-captures-meeting-audio-during-full-screen-sharing)),
  built on the same **macOS 14.2+ Core Audio Tap / ScreenCaptureKit**
  primitives as §§2–3 (per Chromium code-review threads
  ["Initial ScreenCaptureKit AudioInputStream implementation"](https://groups.google.com/a/chromium.org/g/chromium-reviews/c/pQWbx2kMkhE)
  and ["Adjust audio service sandbox for ScreenCaptureKit"](https://groups.google.com/a/chromium.org/g/chromium-reviews/c/-EchcF6zQq8)).
  Chrome's own release-notes page for the API surface
  ([developer.chrome.com/release-notes/141](https://developer.chrome.com/release-notes/141))
  documents the `windowAudio` and `restrictOwnAudio` `getDisplayMedia`
  options but doesn't itself state the macOS-version gate — that detail is
  only corroborated by the secondary sources above, so it's flagged as
  **less firmly sourced** than the Electron findings in §4.
- **Safari**: implements `getDisplayMedia()` but **silently ignores the
  `audio` option entirely** — no error, just no audio track. No Apple/WebKit
  primary source confirming this was found in this pass (flagged
  unverified-by-primary-source); multiple independent secondary sources
  agree, e.g.
  [addpipe.com's getDisplayMedia writeup](https://addpipe.com/getdisplaymedia-demo/).
  Safari is the macOS default browser, so this matters for browser-mode
  users who haven't switched to Chrome.
- **Firefox**: same as Safari per the same secondary sources — implements
  the API but ignores `audio`.

**Implication for Scribe specifically**: if Scribe adopted `getDisplayMedia`
system-audio capture for browser mode, it would only work for users on
**Chrome/Edge ≥141 on macOS ≥14.2** — Safari and Firefox users in browser
mode would have no system-audio path at all via this API, unlike today's
BlackHole approach, which works identically regardless of which browser
tab the user has open (BlackHole is an OS-level device, not a browser
feature — the browser/Electron distinction doesn't affect it, since either
mode ultimately reads speaker audio from whatever CoreAudio input device the
user picks in Scribe's own device dropdown, the same way in both modes).

## Comparison

| Option | Driver install? | Permission | Min macOS | Electron integration |
|---|---|---|---|---|
| BlackHole (current) | Yes — separate installer + Multi-Output Device setup | None (looks like a normal input device) | 10.10+ | None needed — read via `sounddevice`/CoreAudio like any input |
| ScreenCaptureKit | No | Screen Recording (broad) | 13 | Native Swift/Obj-C only, until Electron adopted it (see below) |
| Core Audio process tap | No | Dedicated `NSAudioCaptureUsageDescription` prompt | 14.2 | Native Swift/Obj-C only (no Electron wrapper found) |
| Electron `desktopCapturer` (`audio: 'loopback'`) | No | Screen Recording (13–14.1 path) or `NSAudioCaptureUsageDescription` (14.2+ path), handled by Chromium | 12.3+ via `electron-audio-loopback`; native in Electron 39+ | Direct — existing JS API, no native helper |

## Recommendation

**Driver-free capture is now reachable without writing a native helper**,
via `electron-audio-loopback` (Scribe's current Electron 33 is within its
supported range) or by upgrading to Electron 39+ for the native
`desktopCapturer` loopback path. Either removes the single biggest cost ADR
0001 accepted: requiring users to install BlackHole and hand-build a
Multi-Output Device before the app can record calls at all.

**But this only covers Electron (macOS-app) mode.** Because Scribe also has
to work in plain-browser mode (§5), and `desktopCapturer` has no browser
equivalent, switching only the Electron path would leave browser mode either
(a) still dependent on BlackHole, or (b) needing its own separate
`getDisplayMedia`-based implementation that, per §5, only works on
Chrome/Edge ≥141 on macOS ≥14.2 — Safari and Firefox users would lose
speaker-audio capture entirely in browser mode under that option. **BlackHole
is the only option surveyed here that works identically in both modes** and
across every browser, because it's an OS-level input device, not something
gated by which browser tab or app is running.

Tradeoffs to weigh before switching, tied to the sources above:
- **Permission UX**: on macOS 13–14.1, Electron's loopback path is backed by
  ScreenCaptureKit and rides the **Screen Recording** grant (§2) — a
  broader-looking, more alarming permission dialog than BlackHole's silent
  "just another input device" approach today. On macOS 14.2+ it's the
  narrower `NSAudioCaptureUsageDescription` prompt (§3) instead. Either way,
  this is a *new* permission prompt Scribe doesn't currently show.
  Recommend user-testing the actual dialog copy before committing.
  End-user OS floor: if the app wants to guarantee the narrower Core Audio
  Tap permission (not Screen Recording) for every user, that means requiring
  macOS 14.2+, which may drop support for users on 13.x.
- **What's captured**: `desktopCapturer`'s loopback mode captures the whole
  system-audio mix (§2/§3), the same "everything the Mac plays" behavior
  BlackHole already provides and that ADR 0001 explicitly wanted (no need to
  special-case Teams' own virtual device). No behavior change expected here.
- **Migration cost**: swapping the *capture* mechanism doesn't remove the
  dual-stream mic+speaker architecture from ADR 0001/0005 — Scribe would
  still need to route the loopback `MediaStream` into the same per-track
  pipeline it uses today, likely by writing it to a file/buffer the existing
  backend (`sounddevice`-based `Recorder`) can consume, or by moving that
  capture step into the Electron main/renderer process instead of Python.
  That's a real, non-trivial architectural change — this doc's job is to
  confirm a driver-free path *exists*, not to size the rewrite.
- **API stability**: audiotee's README (§3) flags the underlying Core Audio
  tap API as explicitly unstable/subject to change as of when it was
  written; Electron's own adoption (§4) is very recent (v39 beta line as of
  this research). Worth confirming current Electron stable-channel behavior
  before committing to a release.

Given the dual-mode requirement, **BlackHole should stay as the baseline for
now** — it's the only surveyed option with equal, driver-consistent behavior
in both browser and Electron mode. A defensible middle ground, if the
BlackHole setup friction is worth addressing sooner: keep BlackHole as the
default/fallback path for browser mode and any pre-14.2 macOS, but let
Electron mode opportunistically use `electron-audio-loopback` (or, later,
native Electron 39+ `desktopCapturer`) when available, so at least macOS-app
users skip the manual driver install — at the cost of maintaining two
capture code paths instead of one. Re-evaluate collapsing to a single
native-API path in a follow-up ADR once (a) Chrome's macOS `getDisplayMedia`
audio support (§5) has matured past its very recent Chrome 141 rollout, and
(b) Safari/Firefox either add support or are confirmed acceptable to leave
degraded in browser mode.
