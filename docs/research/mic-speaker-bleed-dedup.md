# Research: Deduplicating acoustic mic/speaker bleed in the merged transcript

## Question

[ADR 0005](../adr/0005-per-track-transcription.md) transcribes the `mic` and
`speaker` tracks independently and merges them by timestamp. `Recorder`
already runs a cross-correlation bleed *detector* (`_detect_bleed` in
`backend/app/recorder.py:195`, reused as a periodic drift estimator at
`_estimate_drift`, line ~226) that sets `bleed_detected` when the speaker
signal is acoustically leaking into the mic (no headphones, physical
speakers). Nothing currently acts on that signal at the transcript level: a
real recording shows the mic and speaker tracks transcribing near-identical
text a few hundred milliseconds apart, e.g.

```
mic:SPEAKER_00       0:03  "to wrap around her waist."
speaker:SPEAKER_00   0:03  "wrap around her waist."
```

This doc surveys, from primary sources, how this class of problem
(acoustic echo causing duplicate ASR output across a loopback + mic pair) is
normally handled, at the audio layer and at the transcript layer, and
recommends a fix for this app.

## 1. Prevention at the audio layer: Acoustic Echo Cancellation (AEC)

AEC removes the echo of a known "far-end"/reference signal from a "near-end"
capture signal in real time, before any transcription happens. All three
mainstream implementations surveyed share the same shape: a **reference
signal + a near-end signal + tight time alignment between them**, subtracted
via an adaptive filter.

- **WebRTC AEC3** (`modules/audio_processing/aec3` in the WebRTC source
  tree). Its module layout shows the reference-signal dependency directly:
  `render_delay_buffer`/`render_delay_controller` hold and align the
  far-end ("render") signal, `matched_filter.cc` and
  `echo_path_delay_estimator.cc` locate the delay between render and capture
  by cross-correlating the two signals, and `adaptive_fir_filter.cc` models
  and subtracts the echo path, with `suppression_gain.cc` /
  `residual_echo_estimator.cc` cleaning up what the linear filter misses.
  Source: [webrtc.googlesource.com/src, modules/audio_processing/aec3](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/aec3/).
  Delay estimation is continuous, not one-shot: AEC3's render delay
  controller "continuously estimates delay by cross-correlating the
  reference and capture signals," and the true delay is not fixed — it
  includes the playback buffer, DAC, speaker-to-mic air path, ADC, and
  capture buffer, and can range roughly 20–200ms depending on device
  (source: WebRTC design discussion collated at
  [deepwiki.com/ewan-xu/AEC3](https://deepwiki.com/ewan-xu/AEC3), corroborated
  by the module names above).

- **SpeexDSP echo canceller** (`libspeexdsp`, MDF algorithm). The public API
  (`speex_echo_cancellation(state, input_frame, echo_frame, output_frame)`)
  takes the mic capture (`input_frame`) and the signal sent to the speaker
  (`echo_frame`) and returns echo-removed output; a multi-mic/multi-speaker
  variant (`speex_echo_state_init_mc`) exists for more than one channel of
  each. Source:
  [speex.org echo canceller API reference](https://www.speex.org/docs/api/speex-api-reference/group__SpeexEchoState.html)
  and [speexdsp/include/speex/speex_echo.h](https://github.com/xiph/speexdsp/blob/master/include/speex/speex_echo.h).
  Critically, the manual is explicit that **synchronization is a hard
  precondition, not a nice-to-have**: "It is important that, at any time,
  any echo that is present in the input has already been sent to the echo
  canceller as echo_frame," "the delay between the record and playback
  signals must be minimal," and "if the delay is such that it is longer
  than the filter length, no echo can be cancelled." It also states plainly
  that using different, independently-clocked sound devices for capture and
  playback "will *not* work" unless their sample clocks are synchronized.
  Source: [Programming with Speex, §7 (echo canceller)](https://www.speex.org/docs/manual/speex-manual/node7.html).

- **Apple/CoreAudio built-in voice processing** —
  `AVAudioEngine`/`AVAudioIONode.setVoiceProcessingEnabled(_:)`. Enabling
  voice processing applies AEC/AGC/noise suppression to the input node and
  "takes out any audio coming from the device" (i.e. it needs the device's
  own output as its reference). Apple's docs require voice processing to be
  enabled on **both** the input and output I/O nodes of the same engine
  together, and the engine must be stopped to toggle it — it cannot be
  turned on/off while running. Source:
  [`AVAudioIONode.setVoiceProcessingEnabled(_:)` — Apple Developer Documentation](https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:)).

**Why this is hard to integrate here.** All three require the reference
("what's being played") and the near-end ("what the mic captured") to come
from the *same clock domain* and be aligned to a few milliseconds. Scribe's
architecture is the opposite of that by construction:

- `Recorder.start()` (`backend/app/recorder.py:65`) opens `mic_device_index`
  and `speaker_device_index` as **two independent `sd.InputStream`s**, each
  with its own `default_samplerate` pulled from `sd.query_devices` — i.e.
  two independent hardware/driver clocks.
- ADR 0005 already had to add drift correction (`_estimate_drift`) precisely
  *because* those two clocks disagree over time — the ADR calls this out
  as a real, previously-masked risk of running mic and speaker on
  independent hardware clocks.
- Apple's voice-processing path assumes the mic and the "device output"
  being echoed are the same CoreAudio engine's input/output pair; here the
  "speaker" track is captured from a virtual loopback device (BlackHole),
  a separate driver from the physical mic, per
  [docs/research/system-audio-capture-separation.md](system-audio-capture-separation.md)
  (referenced by ADR 0005) and the existing ADR
  [0001-system-audio-capture.md](../adr/0001-system-audio-capture.md).

Speex's own manual states the failure mode directly: independently-clocked
capture/playback devices are exactly the "will not work" case. Real-time AEC
in this app would mean either (a) forcing mic and BlackHole onto one
synchronized clock domain (not something `sounddevice`/`PortAudio` gives you
for two arbitrary devices), or (b) resampling/re-aligning both streams to a
shared clock in real time inside the audio callback — a materially bigger
change than the current per-file post-processing model, for a real-time
correctness guarantee (few-ms alignment) the app doesn't otherwise need.

## 2. Post-hoc correction at the transcript layer

Because both tracks are already fully captured and transcribed independently
before any merge happens, the alternative is to detect and suppress
duplicate *text* after ASR, using the timing/similarity between segments
rather than raw-sample cancellation.

- **Descript**, a shipping meeting/podcast transcription product, implements
  exactly this as a named feature: "mic bleed" is detected, the user is
  shown a "duplicate transcription" message, and a **Fix** action removes
  the duplicated text from the script — i.e. the correction happens on the
  transcript, not the audio. Source:
  [Descript Help — "Fix duplicate transcripts or mic bleed"](https://help.descript.com/hc/en-us/articles/10612185384717-Fix-duplicate-transcripts-or-mic-bleed).
- The general mechanism such fixes rely on — comparing two hypothesis
  transcripts of correlated audio via edit distance — is the same
  primitive used to score ASR quality itself: WER/CER/MER are all computed
  from "the minimum-edit distance between one or more reference and
  hypothesis sentences," as implemented in the standard `jiwer` library
  (also used by Hugging Face's ASR evaluation tooling). Source:
  [jiwer documentation](https://jitsi.github.io/jiwer/) /
  [jitsi/jiwer on GitHub](https://github.com/jitsi/jiwer). The same
  min-edit-distance primitive that scores "is hypothesis A close to
  reference B" is what should score "are these two overlapping segments
  close enough to be the same utterance."
- pyannote's own overlapped speech detection (see §4) is a *diarization*
  tool for same-track overlapping talkers, not a cross-track dedup tool —
  it does not itself solve "two different tracks transcribed the same
  utterance." It's mentioned here only to rule it out as an existing
  built-in fix (see §4).

**Concretely, for this app**, the natural post-hoc approach is:

1. Use the lag already computed by `_detect_bleed`/`_estimate_drift`
   (`backend/app/recorder.py:195` and `:226`) to shift each speaker-track
   segment's timestamp onto the mic track's timeline — this machinery
   already exists for drift correction per ADR 0005 and needs no new
   signal-processing code, just reuse of its output.
2. After alignment, for each mic segment, find speaker-track segments whose
   (lag-corrected) time window overlaps it.
3. Score text similarity between the overlapping segment pair — edit-distance
   ratio (Levenshtein/`difflib.SequenceMatcher`, or WER via `jiwer` as above)
   — and treat pairs above a threshold as the same underlying utterance
   picked up twice.
4. Suppress the weaker copy. "Weaker" should be decided by whichever signal
   the app already has available post-ASR: faster-whisper's per-segment
   average log-probability / no-speech probability (already produced by the
   whisperx pipeline per
   [ADR 0002](../adr/0002-transcription-stack.md)), or simply preferring the
   mic-track copy when `bleed_detected` is true (bleed by definition means
   speaker output leaking into the mic, so the *speaker* track carries the
   clean original and the *mic* copy is the acoustic leak — although the
   reverse can also happen if the mic segment is clearer; confidence score
   is the more robust tiebreaker than a fixed "always drop mic" rule).

## 3. Should the existing cross-correlation lag be used for reference-cancellation on raw audio, or only for post-hoc text alignment?

The lag `_detect_bleed`/`_estimate_drift` compute is exactly the delay
quantity real AEC systems need (WebRTC AEC3's delay estimator and Speex's
synchronization requirement, both above, exist to answer the same question:
"how many samples late does the far-end signal reappear in the near-end
capture?"). In principle that lag plus an amplitude/gain ratio could drive a
subtractive canceller (`mic_clean = mic - gain * shift(speaker, lag)`) on the
raw waveform before ASR — a crude, offline single-tap version of what AEC3's
adaptive FIR filter does adaptively and continuously.

This is not, however, standard practice for *this* class of pipeline, for
reasons visible directly in the primary sources above:

- Real AEC systems (AEC3, Speex) treat the delay as **time-varying** and
  re-estimate it continuously/adaptively — AEC3's controller runs the
  cross-correlation on an ongoing basis, and Speex's own docs stress the
  delay must stay smaller than the filter length throughout. Scribe's
  `_estimate_drift` already produces a **piecewise, not single-value**, lag
  table for exactly this reason (`DRIFT_RESYNC_WINDOW_SECONDS` windows, ADR
  0005) — a single global lag/gain single-tap subtraction would systematically
  under- or over-cancel outside whichever window the lag was fit to, unlike
  an adaptive filter that re-converges continuously.
- A single-tap subtraction has no way to model reverberation/room echo
  spread (multiple reflections at slightly different delays), which is
  exactly why AEC3 dedicates a `reverb_model_estimator` and an adaptive FIR
  filter (many taps) rather than one fixed delay-and-gain, and why Speex
  uses a full multidelay block-frequency adaptive filter (MDF) rather than a
  single subtraction.
- Because the correction would run on already-recorded files rather than in
  the live callback, there is no real-time constraint forcing an audio-layer
  fix — text-layer dedup after two independent, already-correct
  transcriptions is strictly simpler to get right and to reason about than
  reconstructing a partial AEC offline.

So: the lag is doing useful, standard-practice work here already, just as
the **delay-estimation half** of what full AEC would need — it is being
reused correctly for its actual purpose (aligning two independently-clocked
timelines) rather than for waveform subtraction, which is the harder, less
robust half that dedicated, continuously-adaptive AEC libraries exist to do
properly.

## 4. Do pyannote / faster-whisper already solve this?

- **pyannote overlapped speech detection** is real and shipped —
  pyannote.audio's own repository describes "speech activity detection,
  speaker change detection, **overlapped speech detection**, speaker
  embedding" as core building blocks
  (source: [github.com/pyannote/pyannote-audio](https://github.com/pyannote/pyannote-audio)),
  with a dedicated pretrained pipeline at
  [pyannote/overlapped-speech-detection on Hugging Face](https://huggingface.co/pyannote/overlapped-speech-detection).
  pyannoteAI's hosted feature docs describe the same capability as
  detecting "when multiple speakers talk over each other and attribute
  overlapping speech to the correct speakers"
  (source: [docs.pyannote.ai/features](https://docs.pyannote.ai/features)).
- This is **same-track, single-signal** overlap detection — it labels
  regions of one mono input where its model believes ≥2 speakers are
  active simultaneously. It has no concept of "this is a second copy of a
  waveform that was also captured by a different microphone." Per ADR
  0005 (citing the earlier
  [system-audio-capture-separation.md](system-audio-capture-separation.md)
  research), pyannote silently downmixes any multi-channel input to mono
  rather than treating channel identity as a diarization signal — so it
  cannot be pointed at "mic + speaker as two channels" to get cross-track
  deduplication for free.
- **faster-whisper** likewise has no cross-track or reference-signal
  awareness; it transcribes whatever mono signal it is given, which is why
  ADR 0005 already had to run it independently per track.

Conclusion for §4: neither library has a built-in feature for this exact
problem. Overlapped speech detection solves a related but different
problem (same-track cross-talk), not cross-track duplicate detection.

## Recommendation

**Use post-hoc transcript-level deduplication, reusing the existing lag
machinery; do not attempt real-time AEC.**

Reasoning, tied back to §§1–4:

- Real-time AEC (§1) needs the near-end and far-end signals on a common,
  tightly-synchronized clock. Scribe's mic and speaker tracks are
  deliberately independent `sd.InputStream`s on independent devices
  (physical mic vs. BlackHole loopback), which is *why* ADR 0005 needed
  drift correction in the first place — the same independent-clock
  situation that Speex's own docs call out as the case where echo
  cancellation "will not work." Retrofitting AEC would mean re-architecting
  capture around a shared clock domain, for a live-audio guarantee this
  offline, post-record pipeline doesn't need.
- The lag `_detect_bleed`/`_estimate_drift` already compute (§3) is the
  useful, reusable half of the AEC problem (delay estimation), and it's
  already being used correctly for its purpose — aligning timestamps
  across two clocks, not waveform subtraction.
- A shipping competitor (Descript) solves the identical "mic bleed →
  duplicate transcript" symptom exactly this way: detect, then fix at the
  transcript level (§2).
- Neither pyannote nor faster-whisper offer a built-in escape hatch (§4),
  so this has to be built regardless of which layer it targets — and the
  transcript layer is the smaller, lower-risk build.

### Concrete changes implied

- `backend/app/recorder.py`: no changes to the detection logic itself.
  `_detect_bleed`'s boolean and `_estimate_drift`'s piecewise lag table
  already carry everything the merge step needs; they just need to be
  exposed to (or already are exposed to, via `RecordingMeta` per ADR 0005)
  the merge step alongside `bleed_detected`.
- Merge step (wherever mic/speaker segments are interleaved and namespaced
  today per ADR 0005 — the "merge by timestamp" logic that consumes
  `drift_offsets`): after applying the existing lag-based timestamp
  correction, add a pass that, for each mic segment, looks for a
  speaker-track segment whose corrected time window overlaps it and whose
  text similarity (Levenshtein ratio / WER, e.g. via `jiwer` or
  `difflib.SequenceMatcher`, §2) exceeds a threshold; when found, drop the
  lower-confidence segment (using faster-whisper's existing per-segment
  confidence/avg-logprob) rather than emitting both.
- This pass should probably only run when `bleed_detected` is true, to
  avoid any false-positive suppression on clean dual-track recordings
  (e.g. two people each on their own headset mic, where genuinely
  identical short phrases said by different people are rare but possible).
