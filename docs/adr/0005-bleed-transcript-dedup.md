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
Implement **post-hoc, transcript-level dedup**, not AEC, gated strictly on
`bleed_detected`:

- `bleed_detected` is threaded from `RecordingMeta` through
  `start_transcription` → `_run_pipeline` → `_run_dual_track_pipeline`
  (previously computed but never consumed past the warning banner).
- A new `_dedup_bleed_segments` pass runs in `_run_dual_track_pipeline`
  between the existing drift correction and the sorted merge. It is a no-op
  unless `bleed_detected` is true, to avoid suppressing genuinely identical
  same-time utterances on clean dual-track recordings (e.g. two people each
  on their own headset mic).
- For each mic segment, it looks for a speaker-track segment whose
  (already drift-corrected) time window overlaps within a small tolerance
  (0.5s, chosen to absorb the residual few-hundred-ms offset drift
  correction doesn't fully remove) and whose text similarity — via stdlib
  `difflib.SequenceMatcher` ratio, no new dependency — exceeds `0.6`. That
  threshold was validated against the real observed duplicate pair above
  ("to wrap around her waist." vs. "wrap around her waist." → ratio 0.936),
  comfortably above threshold while conservative enough not to falsely merge
  unrelated short utterances.
- When a match is found, the weaker copy is dropped: faster-whisper's
  per-segment `avg_logprob` (already produced by the pipeline, now also
  persisted on `TranscriptSegment`) is compared when both segments have it;
  otherwise the mic-side copy is dropped and the speaker-side copy is kept,
  since bleed by definition means the speaker's clean output leaked into the
  mic, making the mic copy the presumptively degraded acoustic-leak capture.
- One speaker segment can only be consumed by one mic segment (first
  best-match wins), to avoid one speaker line silently absorbing multiple
  distinct mic lines.

This supersedes ADR 0004's "Overlapping (cross-talk) segments are not
specially annotated" statement, but only for the bleed case. Genuine
cross-talk between two different real speakers on separate tracks (no
`bleed_detected`) is untouched — those segments still appear as-is,
unannotated, in the merged timeline.

## Consequences
- `TranscriptSegment` gains an `avg_logprob: float | None` field, populated
  from data whisperx already produces per segment; this is additive JSON, no
  frontend change required.
- Dual-track recordings where bleed is detected will show fewer, cleaner
  merged lines around leaked speech; the exact drop choice depends on ASR
  confidence rather than a hardcoded "always prefer speaker" rule, though
  that remains the fallback when confidence is unavailable.
- This is a heuristic (time overlap + text similarity), not a guarantee: a
  genuinely distinct utterance that happens to closely resemble bled text
  within the time-overlap tolerance would be incorrectly suppressed. Given
  it only fires when `bleed_detected` is true, this risk is scoped to
  recordings already known to have acoustic leakage.
- No changes to `Recorder`'s detection or drift-estimation logic — this ADR
  only adds a consumer of the signal that already existed.
