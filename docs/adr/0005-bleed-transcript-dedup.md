# ADR 0005: Post-hoc transcript-level dedup for mic/speaker bleed

## Status
Accepted

## Context
[ADR 0004](0004-per-track-transcription.md) transcribes the `mic` and
`speaker` tracks independently and merges them by timestamp. `Recorder`
already runs a cross-correlation bleed *detector* (`_detect_bleed` in
`backend/app/recorder.py`, reused as a periodic drift estimator by
`_estimate_drift`) that sets `RecordingMeta.bleed_detected` when the speaker
signal is acoustically leaking into the mic (no headphones, physical
speakers). Until now nothing acted on that signal at the transcript level:
when bleed occurs, the same utterance gets transcribed independently on both
tracks and the merge step (`_run_dual_track_pipeline`) simply concatenates
and sorts by start time, producing near-duplicate adjacent lines, e.g.:

```
mic:SPEAKER_00       0:03  "to wrap around her waist."
speaker:SPEAKER_00   0:03  "wrap around her waist."
```

Two classes of fix were considered:

1. **Real-time acoustic echo cancellation (AEC)** at the audio layer, using
   the speaker track as a reference signal to subtract the echo out of the
   mic capture before transcription (as WebRTC AEC3, SpeexDSP, and Apple's
   voice-processing I/O all do). All of these require the reference and
   near-end signals to share a tightly-synchronized clock (delay stable to a
   few ms). Scribe's `mic_device_index` and `speaker_device_index` are two
   independent `sd.InputStream`s on independent hardware clocks — the same
   reason ADR 0004 needed piecewise drift correction — so a real AEC
   implementation would require re-architecting capture around a shared
   clock domain, for a live-audio guarantee this offline, post-record
   pipeline doesn't otherwise need.
2. **Post-hoc transcript-level deduplication**, comparing the already
   fully-transcribed mic and speaker segments by time overlap and text
   similarity, and suppressing the weaker duplicate. This is the same shape
   of fix shipping products (e.g. Descript's "duplicate transcription" /
   mic-bleed fix) use for the identical symptom.

Neither pyannote's overlapped-speech detection nor faster-whisper offer a
built-in escape hatch for this: pyannote's overlap detection is a
single-track (same-signal) feature with no concept of a second track
capturing the same audio, and faster-whisper has no cross-track awareness at
all — this has to be built regardless of which layer is chosen.

## Decision
Implement **post-hoc, transcript-level dedup**, not AEC:

- A new `_dedup_bleed_segments` pass runs in `_run_dual_track_pipeline`
  between the existing drift correction and the sorted merge.
- Every mic/speaker segment pair whose (already drift-corrected) time
  windows overlap within a small tolerance (0.5s, chosen to absorb the
  residual few-hundred-ms offset drift correction doesn't fully remove) is
  scored for text similarity — via stdlib `difflib.SequenceMatcher`, no new
  dependency — as a **containment ratio**: how much of the shorter segment's
  text is found (as matching blocks) within the longer segment's text,
  rather than a plain whole-string ratio. A pair matches when that score
  exceeds `0.6`. The threshold was originally validated against a 1:1
  duplicate pair ("to wrap around her waist." vs. "wrap around her waist."
  → ratio 0.936); the containment framing was added after a real recording
  showed whisper collapsing several sentences (spanning two actual speakers)
  into one run-on segment on one track while the other track split them
  normally — a plain length-sensitive ratio scored each short duplicate far
  below threshold against the long segment, so none of them matched.
- Matches are grouped (via union-find over the mic/speaker overlap graph),
  since one long, coarsely-segmented run can contain several segments from
  the other track. Within each group, the side with *fewer* segments is
  dropped and the side with more is kept — collapsing several segments into
  one loses information (like per-speaker turn boundaries) that an
  avg_logprob comparison can't recover. A genuine 1:1 match (the common
  case) still falls back to comparing faster-whisper's per-segment
  `avg_logprob` (already produced by the pipeline, now also persisted on
  `TranscriptSegment`) when both segments have it; otherwise the mic-side
  copy is dropped and the speaker-side copy is kept, since bleed by
  definition means the speaker's clean output leaked into the mic, making
  the mic copy the presumptively degraded acoustic-leak capture.

This supersedes ADR 0004's "Overlapping (cross-talk) segments are not
specially annotated" statement, but only when a mic/speaker pair actually
matches on time + text. Genuine cross-talk between two different real
speakers — where the two tracks' text doesn't match — is untouched; those
segments still appear as-is, unannotated, in the merged timeline.

**Not gated on `Recorder`'s acoustic `_detect_bleed` signal.** The original
version of this dedup pass ran only when `RecordingMeta.bleed_detected` was
`true` (a raw-PCM cross-correlation over the whole recording, `±50ms` lag
window, `0.6` correlation threshold — see `_detect_bleed` in
`backend/app/recorder.py`), on the theory that gating avoided suppressing
genuinely identical same-time utterances on clean recordings. In practice
this made the entire dedup feature a near-total no-op: recomputing
`_detect_bleed` directly against a real recording with confirmed,
transcript-visible mic/speaker duplication showed a **global correlation of
0.057** and a **windowed (3s) peak of at most ~0.3** — both well under the
0.6 threshold, despite obvious duplicate text on both tracks. Raw waveform
correlation is diluted by silence, non-overlapping speech, and the
mic-vs-speaker signal-path differences (room reverb, different frequency
response/AGC) that real bleed actually has, so this detector was tuned
against an idealized near-zero-delay echo that doesn't represent typical
capture conditions. `bleed_detected` is still computed and persisted on
`RecordingMeta` for the UI's "consider using headphones" advisory
(`frontend/src/App.tsx`), but `_dedup_bleed_segments` no longer takes it as
a parameter — the containment-ratio + time-overlap match test (see above) is
now the sole signal, and is trusted to be conservative enough on its own:
a false match requires both a ≤0.5s time overlap *and* >60% of one
segment's text found in the other, which is a high bar for two genuinely
independent utterances to clear by coincidence.

## Consequences
- `TranscriptSegment` gains an `avg_logprob: float | None` field, populated
  from data whisperx already produces per segment; this is additive JSON, no
  frontend change required.
- All dual-track recordings now get deduped, not just ones the acoustic
  detector happened to flag; the exact drop choice depends on ASR confidence
  (or group size for many-to-one matches) rather than a hardcoded
  "always prefer speaker" rule.
- This is a heuristic (time overlap + text similarity), not a guarantee: a
  genuinely distinct utterance that happens to closely resemble another
  track's text within the time-overlap tolerance would be incorrectly
  suppressed, on any dual-track recording, not just ones with detected
  bleed. Considered an acceptable tradeoff given how unreliable the acoustic
  gate proved to be at catching real bleed.
- No changes to `Recorder`'s detection or drift-estimation logic —
  `_detect_bleed`/`_estimate_drift` still run and still populate
  `RecordingMeta`, just no longer feed the dedup pass.
