from app.models import TranscriptSegment
from app.transcription import _dedup_bleed_segments


def test_dedup_drops_lower_confidence_mic_copy():
    mic = [
        TranscriptSegment(
            start=0.0,
            end=1.0,
            speaker="mic:SPEAKER_00",
            text="to wrap around her waist.",
            avg_logprob=-0.9,
        )
    ]
    speaker = [
        TranscriptSegment(
            start=0.05,
            end=1.05,
            speaker="speaker:SPEAKER_00",
            text="wrap around her waist.",
            avg_logprob=-0.1,
        )
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == []
    assert filtered_speaker == speaker


def test_dedup_drops_lower_confidence_speaker_copy():
    mic = [
        TranscriptSegment(
            start=0.0,
            end=1.0,
            speaker="mic:SPEAKER_00",
            text="to wrap around her waist.",
            avg_logprob=-0.1,
        )
    ]
    speaker = [
        TranscriptSegment(
            start=0.05,
            end=1.05,
            speaker="speaker:SPEAKER_00",
            text="wrap around her waist.",
            avg_logprob=-0.9,
        )
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == mic
    assert filtered_speaker == []


def test_dedup_falls_back_to_preferring_speaker_track_when_confidence_missing():
    mic = [
        TranscriptSegment(
            start=0.0,
            end=1.0,
            speaker="mic:SPEAKER_00",
            text="to wrap around her waist.",
        )
    ]
    speaker = [
        TranscriptSegment(
            start=0.05,
            end=1.05,
            speaker="speaker:SPEAKER_00",
            text="wrap around her waist.",
        )
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == []
    assert filtered_speaker == speaker


def test_dedup_keeps_both_when_similarity_below_threshold():
    mic = [
        TranscriptSegment(
            start=0.0,
            end=1.0,
            speaker="mic:SPEAKER_00",
            text="what time is the meeting",
        )
    ]
    speaker = [
        TranscriptSegment(
            start=0.05,
            end=1.05,
            speaker="speaker:SPEAKER_00",
            text="completely unrelated sentence here",
        )
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == mic
    assert filtered_speaker == speaker


def test_dedup_keeps_both_when_no_time_overlap():
    mic = [
        TranscriptSegment(
            start=0.0,
            end=1.0,
            speaker="mic:SPEAKER_00",
            text="to wrap around her waist.",
        )
    ]
    speaker = [
        TranscriptSegment(
            start=30.0,
            end=31.0,
            speaker="speaker:SPEAKER_00",
            text="wrap around her waist.",
        )
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == mic
    assert filtered_speaker == speaker


def test_dedup_drops_run_on_speaker_segment_covering_many_mic_segments():
    # Reproduces a real failure mode: whisper segmented the speaker track as
    # one long run-on segment spanning several sentences (and two actual
    # speakers), while the mic track split the same audio into per-sentence,
    # correctly-diarized segments. A plain whole-string similarity ratio
    # would score each short mic segment far too low against the long
    # speaker segment to ever match, leaving every sentence duplicated.
    mic = [
        TranscriptSegment(
            start=10.0,
            end=12.0,
            speaker="mic:SPEAKER_00",
            text="I do care about the prices.",
            avg_logprob=-0.2,
        ),
        TranscriptSegment(
            start=12.0,
            end=15.0,
            speaker="mic:SPEAKER_00",
            text="I've been filming them for three years.",
            avg_logprob=-0.2,
        ),
        TranscriptSegment(
            start=17.0,
            end=18.0,
            speaker="mic:SPEAKER_01",
            text="Okay, great.",
            avg_logprob=-0.2,
        ),
    ]
    speaker = [
        TranscriptSegment(
            start=8.0,
            end=18.5,
            speaker="speaker:SPEAKER_01",
            text=(
                "i do care about the prices i've been filming them for "
                "three years okay great"
            ),
            avg_logprob=-0.1,
        ),
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == mic
    assert filtered_speaker == []


def test_dedup_does_not_double_match_one_speaker_segment():
    mic = [
        TranscriptSegment(
            start=0.0,
            end=1.0,
            speaker="mic:SPEAKER_00",
            text="wrap around her waist.",
            avg_logprob=-0.9,
        ),
        TranscriptSegment(
            start=0.1,
            end=1.1,
            speaker="mic:SPEAKER_00",
            text="something totally different",
            avg_logprob=-0.9,
        ),
    ]
    speaker = [
        TranscriptSegment(
            start=0.05,
            end=1.05,
            speaker="speaker:SPEAKER_00",
            text="wrap around her waist.",
            avg_logprob=-0.1,
        ),
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == [mic[1]]
    assert filtered_speaker == speaker


def test_dedup_matches_across_asr_transcription_error_within_similarity_threshold():
    # Real bleed audio picked up by the mic is acoustically degraded, so
    # whisper can mishear a word on one track ("prices" -> "presents") even
    # though it's the same underlying speech as the clean speaker-track
    # copy. As long as the resulting text stays above the similarity
    # threshold, this should still be recognized as a duplicate.
    mic = [
        TranscriptSegment(
            start=8.0,
            end=9.0,
            speaker="mic:SPEAKER_00",
            text="Yeah, presents and diapers.",
            avg_logprob=-0.6,
        )
    ]
    speaker = [
        TranscriptSegment(
            start=8.0,
            end=9.0,
            speaker="speaker:SPEAKER_01",
            text="Yeah, prices of diapers.",
            avg_logprob=-0.1,
        )
    ]

    filtered_mic, filtered_speaker = _dedup_bleed_segments(mic, speaker)

    assert filtered_mic == []
    assert filtered_speaker == speaker
