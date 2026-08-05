# ADR 0004: Per-track transcription with independent diarization

## Status
Accepted

## Context
[ADR 0002](0002-transcription-stack.md) established the whisperx pipeline
(faster-whisper large-v3 + pyannote diarization) running on a single mono
mixdown of the mic and speaker tracks, produced by `Recorder._mixdown()` in
`backend/app/recorder.py`. Mixing two speech sources into one mono track
before transcription makes overlapping speech (cross-talk) harder for both
Whisper's ASR and pyannote's diarization to resolve correctly, because the
region of overlap degrades word error rate and speaker-boundary accuracy at
once.

This was investigated in
[`docs/research/system-audio-capture-separation.md`](../research/system-audio-capture-separation.md#2-keeping-mic-and-speaker-audio-as-distinct-tracks-through-diarization),
which confirmed both faster-whisper and pyannote require mono input (pyannote
silently downmixes multi-channel input rather than using channel information
as a diarization signal), so the two tracks cannot simply be fed through as a
stereo file — each track must be transcribed independently and the results
merged by timestamp.

That research doc assumed the mic track is always a single known speaker (so
diarization could be skipped on it entirely). That assumption does not hold
for this app: a recording can be an in-person/physical meeting captured via
the laptop's built-in mic with multiple people in the room, not just the
user speaking through headphones. Diarization must therefore run on **both**
tracks.

The research also flagged clock drift as a real, previously-masked risk: the
mic and speaker `sd.InputStream`s in `recorder.py` run on independent
hardware clocks, so a fixed timestamp merge would show increasing
misalignment between the two transcripts as a recording gets longer.

## Decision
- **Keep both tracks** captured separately through to transcription instead
  of transcribing only the mono mixdown. `Recorder` persists
  `{id}.mic.wav` and `{id}.speaker.wav` (16kHz mono, resampled) alongside the
  existing mixed `{id}.wav` (the mixed file is retained only for audio
  playback via `/api/recordings/{id}/audio`; it is not used for
  transcription when a speaker track exists).
- **Diarize both tracks independently** — no shortcut that assumes the mic
  track is single-speaker. Each track gets its own faster-whisper
  transcription + alignment + pyannote diarization pass.
- **Namespace speaker labels per track** (e.g. `mic:SPEAKER_00`,
  `speaker:SPEAKER_01`) since two independent pyannote runs produce
  independent, colliding label spaces (`SPEAKER_00` in one run has no
  relationship to `SPEAKER_00` in the other).
- **Correct for clock drift before merging**, by re-using the existing
  cross-correlation bleed-detection machinery (`_detect_bleed` in
  `recorder.py`) as a periodic estimator instead of a single one-shot check:
  compute the mic/speaker lag every ~60 seconds across the full recording,
  and use that piecewise lag table to shift speaker-track segment
  timestamps onto the mic track's timeline before merging.
  - This only works where there is some correlated signal between the two
    tracks (typically acoustic bleed) to lock onto. Where a window has no
    detectable correlation peak (e.g. clean headphone audio with no bleed),
    that window's lag is left uncorrected (falls back to the last known
    good estimate, or zero before any is found) — acceptable because
    consumer-grade clock drift without correction is on the order of tens
    of milliseconds per ten minutes, small relative to a spoken segment.
- **Merge by timestamp, interleaved**: mic and speaker segments are
  concatenated and sorted by start time. Overlapping (cross-talk) segments
  are not specially annotated — they simply appear as adjacent/overlapping
  lines in the merged timeline, consistent with how the transcript view
  already renders arbitrary per-segment speaker labels.
- **Mic-only recordings** (no speaker device selected) keep today's single
  pass — there is only one track, so none of the above applies.

This supersedes ADR 0002's pipeline shape (single mixdown → one
transcribe+diarize pass) but not its model/library choices (faster-whisper
large-v3, pyannote/speaker-diarization-3.1, whisperx as the glue) or its
CPU/RAM tradeoffs, which still apply per-track.

## Consequences
- Two full transcribe+diarize passes run per recording with a speaker
  track (previously one), roughly doubling wall-clock transcription time
  and pyannote model invocations for such recordings. Mic-only recordings
  are unaffected.
- The merge step depends on drift correction being reasonably accurate;
  drift correction quality is bounded by how much correlated signal exists
  between the two tracks (see above) — this is a heuristic, not a hardware
  timestamp sync, and should be revisited if merged-transcript
  misalignment shows up in practice on long recordings.
- `RecordingMeta` grows two new fields (`mic_audio_path`,
  `speaker_audio_path`) and a `drift_offsets` table; `storage.delete_recording`
  must clean up the two new per-track WAV files in addition to the mixed one.
- Speaker labels for dual-track recordings are namespaced strings
  (`mic:SPEAKER_00`) rather than bare pyannote labels; no frontend change is
  required since the transcript view already colors by hashing an arbitrary
  speaker string.
