# Research: macOS-native system audio capture and mic/speaker track separation

**Date:** 2026-08-01
**Status:** Research only — no code changes. Establishes `docs/research/` as a new
convention (distinct from `docs/adr/`, which records only accepted decisions).

## Context

This app currently records Microsoft Teams calls per
[`docs/adr/0001-system-audio-capture.md`](../adr/0001-system-audio-capture.md) by
requiring the user to install [BlackHole](https://github.com/ExistentialAudio/BlackHole)
and configure a macOS Multi-Output Device, because — as the ADR states — "macOS has
no public API to record arbitrary system output audio directly." Two independent
`sd.InputStream`s (mic + system device) are opened in `backend/app/recorder.py`,
then averaged into a single mono WAV in `_mixdown()` before being handed to
`backend/app/transcription.py` (faster-whisper + pyannote, per
[`docs/adr/0002-transcription-stack.md`](../adr/0002-transcription-stack.md)).

This document investigates whether that constraint still holds, whether mic/speaker
tracks could survive as separate channels through diarization, how to detect
acoustic bleed, and whether BlackHole could be dropped entirely.

---

## 1. macOS-native system-audio capture without an auxiliary loopback driver

### Core Audio Process Taps (`AudioHardwareCreateProcessTap`, `CATapDescription`)

Apple added a public Core Audio "process tap" API starting in **macOS 14.2**, with
the commonly-cited stable entry point at **macOS 14.4**
([Apple Developer Documentation: Capturing system audio with Core Audio
taps](https://developer.apple.com/documentation/CoreAudio/capturing-system-audio-with-core-audio-taps);
[`AudioHardwareCreateProcessTap(_:_:)` reference](https://developer.apple.com/documentation/coreaudio/audiohardwarecreateprocesstap(_:_:))).
Apple's own docs page is only lightly populated (Apple ships example code rather
than prose here), so the operational detail below is corroborated by
[insidegui/AudioCap](https://github.com/insidegui/AudioCap), a widely-referenced
open-source sample app built specifically to document this API, and by
[Recall.ai's engineering post "CoreAudioTaps: A deep-dive into the latest
version"](https://www.recall.ai/blog/core-audio-taps) (Recall.ai builds meeting-bot
recording infrastructure commercially, so this is a first-party technical account
of production usage, not a secondary blog summary).

**What it does, mechanically** (per AudioCap's implementation and Recall.ai's
deep-dive):
1. Resolve a target's PID to an `AudioObjectID` via
   `kAudioHardwarePropertyTranslatePIDToProcessObject` — taps are scoped to a
   specific **process**, not a device.
2. Build a `CATapDescription` (with a UUID) naming the process(es) to tap.
3. Call `AudioHardwareCreateProcessTap` to create the tap, which yields its own
   `AudioObjectID`.
4. Wrap the tap in a **HAL aggregate device** (`AudioHardwareCreateAggregateDevice`,
   `kAudioAggregateDeviceTapListKey`) — this is what makes the tapped audio appear
   to the app as an ordinary input stream, readable the same way a microphone is.
5. Read the tap's `AudioStreamBasicDescription` via `kAudioTapPropertyFormat` and
   pull buffers via an IO callback (`AudioDeviceCreateIOProcIDWithBlock` +
   `AudioDeviceStart`).

**Process-level isolation**: because the tap targets a PID, in principle Teams'
specific audio could be isolated rather than all system audio — but Recall.ai's
write-up flags a real complication for browser/Electron-hosted apps: audio may
originate from a renderer or helper subprocess rather than the main process PID,
so naively tapping "Microsoft Teams.app" by top-level PID may miss audio emitted
by a child process. A "tap everything" (system-wide) global tap is also supported
and sidesteps this.

**Permissions / entitlements**: This does **not** reuse the microphone entitlement
(`com.apple.security.device.audio-input`). It is a separate TCC (TCC) category.
Apple requires an `NSAudioCaptureUsageDescription` string in `Info.plist`
(confirmed in AudioCap's project settings and in web search results referencing
Apple's own documentation for this key). The system presents a permission prompt
labeled **"System Audio Recording Only"** the first time an app starts an
aggregate device containing a Core Audio tap — a narrower, separate prompt from
the "Screen & System Audio Recording" prompt ScreenCaptureKit triggers. There is
no public API to proactively request this permission or query its current
status — the OS prompts on first use, matching the general TCC pattern for
screen-recording-adjacent permissions
(source: search results citing Apple's Core Audio Taps documentation and
corroborated in the AudioCap repo's
[`AudioRecordingPermission.swift`](https://github.com/insidegui/AudioCap/blob/main/AudioCap/ProcessTap/AudioRecordingPermission.swift),
which implements permission-status checks against a **private** TCC API — i.e.
even the reference sample has to reach outside public API surface to check
current grant status, only the aggregate-device-start path itself is public).

**Sandboxing / non-sandboxed apps**: Nothing in Apple's docs or the AudioCap
sample restricts this to sandboxed, Mac App Store-distributed apps — it is a HAL
(Core Audio) API, not an App Sandbox-mediated resource, and works from ordinary
signed (non-sandboxed, notarized) apps, which matches how Electron apps
distributed outside the Mac App Store are typically shipped. This is corroborated
indirectly by Chromium/Electron itself adopting the tap API for `desktopCapturer`
(see below) — Electron apps are not App-Sandboxed by default, so Chromium's use
of this API is direct evidence it works outside the sandbox.

**OS floor implied**: macOS 14.2–14.4+. This is materially newer than whatever
floor the app implicitly supports today (BlackHole + Multi-Output Device works
back to very old macOS versions), so adopting process taps would raise the
minimum supported OS.

### ScreenCaptureKit audio capture (`SCStream`, `SCStreamConfiguration.capturesAudio`)

Introduced at **macOS 12.3** for screen capture; **audio capture specifically
(`capturesAudio`) became available at macOS 13.0 (Ventura)**
(Apple's [WWDC22 "Meet ScreenCaptureKit"](https://developer.apple.com/videos/play/wwdc2022/10156/)
session introduced the audio capabilities; corroborated by
[Recall.ai's "Exploring macOS screen capture APIs and recording
approaches"](https://www.recall.ai/blog/macos-screencapture-api), which states
ScreenCaptureKit is "the preferred API for newer versions of macOS (12.3+)" with
audio added in the 13.x cycle).

**Capabilities and constraints** (per Recall.ai's write-up, which is explicitly
about production tradeoffs rather than a tutorial):
- ScreenCaptureKit's audio pipeline is tied to a **screen-capture stream** — even
  audio-only use still requires configuring a capture target (display, window, or
  app) as part of the pipeline; it is not a pure audio API the way Core Audio taps
  are.
- Audio is delivered as part of a **media capture stream** (`CMSampleBuffer`s),
  not through an audio-focused pipeline like `AVAudioEngine`, so the app must
  manage stream state and buffer/format conversion itself.
- **Per-app isolation exists but is coarse**: `SCStreamConfiguration` offers
  `excludesCurrentProcessAudio` (excludes the capturing app's own output) and, in
  later OS versions, more granular per-app content-filter-based inclusion when the
  capture target is scoped to a specific app's windows. Absent explicit exclusion,
  ScreenCaptureKit's system-audio capture mixes in unrelated system sounds —
  Recall.ai specifically warns that "if notifications, music, or other media
  happen to play during the capture session, they will be part of the recording,
  which creates polluted audio" — i.e. default behavior is system-wide, not
  Teams-only, and isolating one app cleanly requires narrowing the capture
  filter to that app's windows/processes, which is possible but adds complexity
  Core Audio taps don't have (taps target a PID directly).
- **Microphone capture** was not originally part of ScreenCaptureKit; support for
  capturing the microphone through the same `SCStream` pipeline was added later
  (search results place this at **macOS 15+**), which is a separate concern from
  system-audio capture but relevant if one wanted a single unified capture API.

**Permission model**: ScreenCaptureKit audio capture rides on the **Screen
Recording** TCC permission (the same System Settings → Privacy & Security →
Screen Recording toggle used for screen capture), not a microphone-specific
prompt. This is a broader-scoped, more alarming-looking permission to end users
than the Core Audio tap's dedicated "System Audio Recording Only" prompt — the
Electron PR discussion below independently confirms this distinction (ScreenCaptureKit
triggers "Screen & System Audio Recording"; Core Audio Taps triggers "System Audio
Recording Only", and Apple's guidance as of "macOS 26" per that PR discussion
prefers the narrower tap-based prompt going forward).

### How comparable commercial products solve this (what's publicly verifiable)

- **Recall.ai** (a company that sells meeting-recording infrastructure to other
  SaaS products) has published first-party engineering posts explicitly comparing
  Core Audio taps, ScreenCaptureKit, and AVAudioEngine for exactly this recording
  problem: [How to get access to system audio on
  macOS](https://www.recall.ai/blog/how-to-get-access-to-system-audio),
  [Exploring macOS screen capture APIs and recording
  approaches](https://www.recall.ai/blog/macos-screencapture-api), and
  [CoreAudioTaps: A deep-dive into the latest
  version](https://www.recall.ai/blog/core-audio-taps). These are the most
  credible first-party sources found — they describe production experience
  building exactly this capability, including the OS-version fragmentation and
  isolation caveats cited above.
- **Krisp**: search results (not a fetched first-party doc) describe Krisp as
  integrating "at the audio-driver level" on macOS — i.e., historically Krisp's
  own approach resembles a virtual-driver / low-level audio-injection model
  similar in spirit to BlackHole, not a confirmed statement that Krisp uses
  process taps or ScreenCaptureKit. This is **not verified against a first-party
  Krisp technical doc** — flagging as unconfirmed.
- **Granola, Otter.ai, Rewind.ai, Zoom local recording**: no first-party
  engineering blog post or technical documentation describing their macOS system
  audio capture implementation was found via search. Marketing/comparison pages
  (e.g. third-party "best meeting assistant" roundups) mention that these
  products capture system audio without a driver install, consistent with them
  using ScreenCaptureKit and/or Core Audio taps, but this is inference from
  product behavior, not a verified technical source. Be skeptical of treating
  this as confirmed.
- **Electron/Chromium itself has adopted both APIs** for `desktopCapturer`
  loopback audio, which is strong, verifiable, first-party evidence these APIs
  work in production outside the App Sandbox — detailed next.

### Feasibility of calling these APIs from Python vs. moving capture into Electron

**From Python**: `AudioHardwareCreateProcessTap`, `CATapDescription`, and
`SCStream` are C/Objective-C/Swift APIs with no official Python bindings. Reaching
them from the FastAPI/Python backend would require either (a) a small compiled
Swift/Objective-C helper process that does the tap/stream setup and pipes raw
PCM back to Python over a pipe/socket, or (b) a PyObjC bridge
(`pyobjc-framework-*`) calling the Core Audio / ScreenCaptureKit Objective-C
selectors directly from Python. Neither is a drop-in `pip install`; PyObjC can
call CoreAudio's C-based HAL functions awkwardly at best (much of the process-tap
API is plain C, not Objective-C, so PyObjC's ObjC-bridging benefits are limited
here — a native helper binary is the more realistic path). This is inference from
the shape of the APIs (confirmed via AudioCap's implementation being pure
Swift/C, not Python), not a directly-cited "don't use PyObjC" source.

**From Electron/Node**: This is materially more mature. `desktopCapturer` combined
with `navigator.mediaDevices.getDisplayMedia({ audio: true })` is the Chromium-side
API. Key findings:
- **Plain `getDisplayMedia` audio does not work for loopback on macOS** in
  standard Chromium: "On macOS, getDisplayMedia never provides loopback audio.
  Chromium creates an audio track, but the underlying buffer contains only
  silence" (per [electron-audio-loopback's
  README](https://github.com/alectrocute/electron-audio-loopback) and
  corroborating blog/Medium sources) — this is a platform limitation, not an
  Electron bug, historically.
- Electron exposes `session.defaultSession.setDisplayMediaRequestHandler` with an
  `audio: 'loopback'` option, and third-party packages like
  [`electron-audio-loopback`](https://www.npmjs.com/package/electron-audio-loopback)
  wire this up on macOS 12.3+ without a virtual driver.
- **As of Electron v39 (2026), Chromium made Apple's Core Audio Tap API the
  default mechanism for desktop audio capture** on supported macOS
  versions, per [electron/electron PR
  #47493](https://github.com/electron/electron/pull/47493) ("docs: improve
  desktop-capturer loopback docs") and [electron/electron issue
  #47490](https://github.com/electron/electron/issues/47490). That PR (open,
  work-in-progress as of the search date) documents version-gated behavior:
  - macOS 12.3–13.2: possible via ScreenCaptureKit but "considered too buggy"
    before 13.2.
  - macOS 13.2–15.0: works via ScreenCaptureKit by default.
  - macOS 15.0+: ScreenCaptureKit loopback disabled by default, requires an
    explicit Chromium feature flag (`MacSckSystemAudioLoopbackOverride`); Core
    Audio Taps can be enabled via `MacCatapSystemAudioLoopbackCapture` and
    trigger the narrower "System Audio Recording Only" prompt that Apple now
    prefers.

**Implication**: if system audio capture is going to be modernized, doing it on
the **Electron/Node side** via `desktopCapturer`/`getDisplayMedia` (possibly with
the `electron-audio-loopback` package, or waiting for Electron's native Core Audio
Tap support to stabilize past its current WIP state) is significantly less
engineering effort than writing and shipping a native Swift helper binary to be
driven from the Python backend. The tradeoff is that captured audio would then
need to be shipped from the Electron main/renderer process to the Python backend
(e.g. over the existing IPC/HTTP channel) instead of being read directly by
`sounddevice` — a real architecture change to `backend/app/recorder.py`, which
today assumes it owns capture via `sd.InputStream`.

---

## 2. Keeping mic and speaker audio as distinct tracks through diarization

### faster-whisper / Whisper: mono only

Whisper (and by extension faster-whisper, a CTranslate2 reimplementation of the
same model) expects a single-channel (mono), 16kHz PCM input — this is a property
of the underlying model's log-mel spectrogram feature extraction, not a
configurable option. An open GitHub issue on the faster-whisper repository,
[SYSTRAN/faster-whisper#631 "Is it possible to have multi channel
transcription?"](https://github.com/SYSTRAN/faster-whisper/issues/631), confirms
there is **no native multi-channel support** — the standard workaround is to
downmix to mono, or split channels and run whisper **once per channel** as fully
independent transcription jobs.

### pyannote.audio: mono only, with automatic downmixing

pyannote.audio's documented behavior (per the
[`pyannote/speaker-diarization-3.1` model card on Hugging
Face](https://huggingface.co/pyannote/speaker-diarization-3.1)) is that it
"ingests mono audio sampled at 16kHz," and **"stereo or multi-channel audio files
are automatically downmixed to mono by averaging the channels"** — i.e. even if
you feed pyannote a stereo file today, it silently collapses it back to mono
internally before diarizing, discarding the channel separation. There is an open
community request for stereo-aware diarization,
[pyannote/pyannote-audio#915 "Stereo-aware speaker
diarization"](https://github.com/pyannote/pyannote-audio-issues/915), confirming
this is a known, unaddressed limitation as of the current released pipelines
(3.0/3.1) — channel information is not currently usable as a diarization signal.

### Established pattern: per-track transcription + merge-by-timestamp (not diarization on separated tracks)

Because neither Whisper/faster-whisper nor pyannote can consume multi-channel
audio meaningfully, the established pattern in the wild for "already-separated"
sources (e.g. your own mic vs. a remote participant's already-separate feed) is
**not** to feed pyannote a multi-channel file — it's to **skip diarization
entirely for pre-separated tracks** and instead:
1. Run Whisper/whisperX independently on each track (mic-only WAV, system-audio-only
   WAV).
2. Since each track is known a priori to be a single speaker-source (in this
   app's case: "the user" vs. "everyone else in the call, mixed"), no diarization
   model is needed for that track — the label is already known before
   transcription starts.
3. Merge the two transcripts into one timeline by sorting segments by their
   (start, end) timestamps.

This exact pattern is described independently in a personal engineering write-up
found via search ("Why I ditched Granola and built my own meeting transcriber
with Whisper," Medium) — "if you record your microphone and guest's audio
separately, you already know who's speaking, and all that's left is
transcribing and merging by timestamps," running whisperX on both tracks in
parallel and merging by timestamp. This is a single blog post, not an
authoritative spec, but it matches the two library constraints above (mono-only
Whisper, mono-only pyannote) as the only architecturally coherent option — it is
the logical consequence of, not an alternative to, the two upstream mono
constraints.

**Important nuance for this app**: the "system audio" track today is itself a
**mix of every other call participant**, not a single speaker. So even if the
mic/system split were preserved end-to-end, pyannote diarization would still be
needed **on the system-audio track alone** (to separate remote participants from
each other) — only the mic track could skip diarization outright (it's the local
user only, modulo bleed — see §3). This halves the diarization problem's
difficulty rather than eliminating it: pyannote only ever needs to run on one
mono track (the system-audio track) instead of the full mixed recording, and the
mic track's speaker label is known for free.

### Tradeoffs

**Accuracy upside**: source separation before transcription is a well-established
way to improve ASR accuracy in overlapping-speech conditions — mixing two
speakers into one mono track and then relying on diarization to retroactively
attribute words is strictly harder than transcribing each source independently,
because overlapping speech in the mixed track degrades both the ASR word error
rate and diarization boundary accuracy for the region of overlap. Running the mic
track alone (near-field, high SNR, single speaker) through Whisper should improve
accuracy for the local user's utterances specifically, independent of anything
happening on the system-audio side.

**Complexity added**:
- Two full Whisper inference passes per recording instead of one (same total
  audio duration processed, so wall-clock cost is comparable in aggregate, but
  pipeline orchestration, temp-file management, and error handling roughly
  double).
- A merge step must sort and interleave two independent segment lists by
  timestamp, handling ties and near-simultaneous speech (cross-talk) sensibly.
- **Clock drift / alignment risk is real and unaddressed today.** The two
  `sd.InputStream`s in `backend/app/recorder.py` are opened independently, each
  against its own device's hardware clock and `default_samplerate` (see lines
  42–80 of `recorder.py` — mic and system streams can have different sample
  rates, e.g. 44100 vs 48000, and are each resampled to `SAMPLE_RATE`
  independently in `_resample_to`). PortAudio/`sounddevice`'s own documentation
  notes that each stream's `time` property is monotonic **within that stream**
  and is intended for synchronizing events to *that* stream, not for
  cross-stream synchronization between two independently-clocked hardware
  devices (per [python-sounddevice's Streams API
  docs](https://python-sounddevice.readthedocs.io/en/latest/api/streams.html)).
  Two consumer audio interfaces (built-in mic vs. a virtual/aggregate output
  device) are not guaranteed to share a hardware clock, so independent streams
  will drift relative to each other over a long call (typical consumer-grade
  clock drift is on the order of tens of parts-per-million, which is on the
  order of tens of milliseconds per 10 minutes — small per-utterance but
  accumulating over a long meeting). Today this is masked because `_mixdown()`
  just sums the two tracks sample-for-sample after independent resampling with
  no drift correction — any drift already silently smears the mix slightly. If
  tracks were kept separate for per-track transcription + timestamp merge, that
  same drift would show up as increasing timeline misalignment between the two
  transcripts as the recording gets longer, which is a **new, more visible**
  failure mode than today's silent mono mixing. A drift-correction or periodic
  resync step would likely be needed for long calls, adding real complexity.

---

## 3. Detecting/preventing acoustic bleed

Acoustic bleed here means: physical speaker output picked back up by the mic,
because the user has a Multi-Output Device sending audio to real speakers instead
of headphones.

**Established signal-processing techniques** (drawn from general AEC literature,
not audio-specific to this app — cited sources are patent/technical literature
found via search, treated as representative of established technique rather than
implementation-ready):
- **Acoustic Echo Cancellation (AEC)**: uses the known "reference" signal (here:
  the system-audio track, which is exactly the far-end audio being played out of
  the speakers) to build an adaptive filter estimating the acoustic path from
  speaker to mic, then subtracts the estimated echo from the mic signal. This is
  the textbook full solution and is what conferencing apps (Teams, Zoom, macOS's
  own built-in AEC for CoreAudio voice-processing I/O) already do live, in
  real-time, for exactly this problem — see e.g. Vocal.com's summary of
  [cross-correlation-based echo canceller
  controllers](https://vocal.com/echo-cancellation/cross-correlations/), and echo
  cancellation patents describing filter architectures
  (e.g. [Cross-correlation based echo canceller
  controllers](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8014519)). Implementing
  a correct adaptive AEC filter from scratch is a substantial DSP undertaking —
  not something to build bespoke for this app's scale.
- **Cross-correlation as a *detector*, not a full canceller**: because this app
  already has both signals fully captured (mic track + system-audio track, which
  is precisely the AEC "reference" signal), a much cheaper technique than full AEC
  is available: compute the cross-correlation between the mic track and the
  system-audio track over sliding windows. A strong correlation peak at a small,
  consistent lag (the acoustic propagation + processing delay from speaker to
  mic, typically single-digit to a few tens of milliseconds) is diagnostic of
  bleed — it's literally the same math AEC systems use internally to estimate
  echo-path delay before cancellation (per the same cross-correlation echo
  literature above — "the delay estimate is typically obtained as the time-lag
  that maximizes the cross-correlation function between filtered versions of two
  received signals"). Since this app records post-hoc (not live), it can afford
  to do this as a **batch analysis step after recording stops**, rather than
  real-time — much simpler than live AEC.
- **Practical framing for this app's scale**: implementing full real-time AEC
  is disproportionate — the app doesn't need to *remove* the bleed, it can get
  most of the value by just **detecting and warning** the user after the fact
  ("we noticed your speaker audio may be leaking into your microphone — consider
  using headphones next time"), using a cross-correlation check on the two
  already-captured tracks as a cheap, one-time-per-recording heuristic. This
  matches the ADR's existing philosophy of "flag and let the user decide"
  (see how `_is_likely_loopback()` already flags devices heuristically rather
  than trying to be authoritative). A pragmatic threshold-based cross-correlation
  check (e.g. windowed normalized cross-correlation exceeding some threshold at a
  plausible lag range) is realistic to add without new dependencies (numpy/scipy,
  already in use per `recorder.py`'s imports, are sufficient — no new AEC library
  needed for detection-only).
- **UX-level guidance alone** (a one-time setup-flow warning: "for best results,
  use headphones with your Multi-Output Device") is the cheapest option and
  should probably ship regardless of whether detection is added — it's a
  documentation/UI change, not a DSP feature.

**Recommendation for this app's scale**: cross-correlation-based *detection* +
warning is realistic and cheap; real-time or offline full AEC (actually removing
the bleed from the mic track) is overkill for a local single-user recording tool
and should not be pursued unless bleed proves to be a frequent, serious problem
in practice.

---

## 4. Would process taps or ScreenCaptureKit let the app drop BlackHole entirely?

**Yes, on OS versions new enough to support them — this is a real, credible
architectural win**, corroborated by:
- Electron/Chromium's own adoption of both Core Audio Taps and ScreenCaptureKit
  as the mechanism behind `desktopCapturer` loopback audio, specifically to avoid
  requiring users to install virtual audio drivers (electron/electron#47490,
  electron/electron#47493) — this is the same problem this app has, solved by a
  major, actively-maintained project using exactly these APIs, without a driver.
- Recall.ai's engineering posts frame Core Audio taps and ScreenCaptureKit as
  the two native alternatives specifically *replacing* the older
  BlackHole/Soundflower/kernel-extension pattern — "Before ScreenCaptureKit,
  recording system audio on macOS required third-party audio drivers like
  Soundflower or BlackHole or kernel extensions" (recall.ai/blog/core-audio-taps
  search excerpt).

**But it comes with real costs, which is why this is "flag prominently, don't
treat as free":**

1. **OS version floor increase.** Core Audio Taps: macOS 14.2+ (practically
   14.4+ given documentation/stability). ScreenCaptureKit audio: macOS 13.0+.
   Either choice raises the minimum supported macOS version above whatever the
   app implicitly supports today via plain CoreAudio input streams (which work
   on essentially any modern macOS). This is a real UX tradeoff for any user on
   an older OS — they'd either be unsupported or the app would need to keep the
   BlackHole path as a fallback for old-OS users, which means **not** actually
   dropping the BlackHole code path, just making it optional/secondary.
2. **New permission prompts.** Either approach introduces a **new system
   permission dialog** that does not exist today (today's plain CoreAudio input
   stream approach needs zero special permission dialog beyond ordinary
   microphone access, per the existing ADR's own stated consequence: "No system
   audio permission prompts or private APIs are needed"). Core Audio Taps show a
   narrower "System Audio Recording Only" prompt; ScreenCaptureKit shows the
   broader, more alarming "Screen & System Audio Recording" prompt (which,
   unlike the tap-specific prompt, sounds like it's requesting screen-video
   access even when only audio is wanted — likely to cause user hesitation/support
   questions). Apple's own current guidance (per the Electron PR discussion,
   attributed to "macOS 26" behavior) is to prefer the narrower Core Audio Tap
   permission going forward, which reinforces process taps as the better
   long-term target of the two, despite the slightly older-OS ScreenCaptureKit
   alternative being available on marginally older systems (13.0 vs 14.2+).
3. **Isolating just Teams' audio is imperfect either way.** Process taps can
   target a PID but browser/Electron-hosted apps' audio may come from a helper
   process rather than the top-level PID (Recall.ai's caveat above) — Teams'
   native macOS app is presumably a more conventional single-process app, so
   this risk is likely lower for Teams specifically than for, say, a
   browser-tab-based conferencing app, but should be verified empirically before
   relying on it. ScreenCaptureKit's system-wide default capture mode picks up
   notification sounds, music, etc. unless carefully scoped to Teams' windows.
   A pragmatic middle ground — global system-audio tap plus accepting some
   background-sound bleed — may be simpler and good enough, similar in spirit to
   today's Multi-Output Device approach, which also captures all system audio,
   not just Teams'.
4. **Implementation cost.** As discussed in §1, calling either API from Python
   directly is impractical; this would require either a native Swift/ObjC helper
   process (new build/signing/notarization surface) or moving capture into the
   Electron/Node layer and piping audio to the Python backend (an architecture
   change to how `backend/app/recorder.py` acquires audio — no longer just
   "open two `sd.InputStream`s locally"). Neither is a small patch to
   `audio_devices.py`/`recorder.py`; it is a scoped feature project with real
   design decisions (native helper vs. Electron capture; how audio crosses the
   process boundary into Python; new permission-prompt UX/onboarding copy; a
   BlackHole fallback story for pre-14.2 macOS users).

**Net read**: this is the single highest-leverage change surfaced by this
research — it removes a real onboarding friction point (installing a third-party
kernel-adjacent driver and manually wiring a Multi-Output Device) — but it is not
a drop-in replacement; it's a scoped follow-on project with a real OS-floor
decision and a real "who owns audio capture, Electron or Python" architecture
decision to make first.

---

## Recommendation

1. **Prioritize dropping BlackHole via Core Audio Process Taps, driven from the
   Electron/Node side**, not from Python. Electron/Chromium already ships this
   capability (even if still stabilizing per the WIP PR), it avoids building and
   signing a bespoke native Swift helper, and it aligns with where Apple's own
   permission-UX guidance is heading (the narrower "System Audio Recording Only"
   prompt). This does mean audio capture ownership would partially move out of
   `backend/app/recorder.py` and into the Electron main process, with captured
   audio shipped to the Python backend over IPC — a real architectural change,
   not a small patch.
2. **Set a deliberate minimum macOS version** (14.2+ recommended, matching Core
   Audio Taps) as part of that change, and decide explicitly whether to keep the
   existing BlackHole path as a fallback for pre-14.2 users or drop OS support
   below that floor. Do not let this be an implicit side effect.
3. **Do not attempt to preserve mic/speaker as separate channels through
   pyannote** — pyannote silently downmixes multi-channel input to mono today,
   so multi-channel input isn't currently a lever for accuracy. If per-track
   accuracy is wanted, the correct pattern (confirmed against both libraries'
   mono-only constraints) is: transcribe mic and system-audio tracks
   independently with Whisper, skip diarization on the mic track (speaker is
   known), run pyannote diarization only on the system-audio track (to separate
   remote participants), and merge by timestamp. This is worth doing only if
   transcription accuracy on the local user's speech is currently a known pain
   point — it roughly doubles pipeline complexity and reintroduces a
   clock-drift/alignment problem that today's simple mono mixdown currently
   masks.
4. **Add cross-correlation-based bleed *detection* (not cancellation)** as a
   cheap batch post-processing check using the already-captured mic and
   system-audio tracks, surfaced as a warning to the user ("consider headphones
   next time"), rather than attempting real-time or offline AEC, which is
   disproportionate engineering effort for this app's scale.

---

## Should ADR 0001 be revisited?

**Yes — leaning toward superseding it, but not immediately, and not without first
resolving the "who owns audio capture" architecture question.**

Reasoning: ADR 0001's stated premise — "macOS has no public API to record
arbitrary system output audio directly" — is **no longer accurate** as of macOS
13 (ScreenCaptureKit) and macOS 14.2+ (Core Audio Process Taps). The ADR's own
"Consequences" section explicitly cites "no system audio permission prompts or
private APIs are needed" as a benefit of the current approach; that framing would
need to be revisited in light of process taps being public (not private) APIs
that do require a new permission prompt, which is a different tradeoff, not
strictly worse, but different enough that keeping ADR 0001 marked "Accepted"
as-is risks it becoming inaccurate legacy documentation.

However, superseding it **now**, before a concrete implementation decision is
made (native Swift helper vs. Electron-side capture; which API; what OS floor;
BlackHole-fallback-or-not), would produce a new ADR that's aspirational rather
than a record of an actual decision, which doesn't match this repo's ADR
convention of documenting decisions that were made, not options being
considered. The recommended path is: keep ADR 0001 as-is for now (it remains an
accurate record of *why the original decision was made at the time*), and write
a new superseding ADR once the "Electron vs. native helper" and "minimum macOS
version" decisions above are actually made — likely as the first step of an
implementation project, not as a follow-up to this research document.
