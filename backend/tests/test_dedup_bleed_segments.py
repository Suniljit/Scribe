from app.models import TranscriptSegment
from app.transcription import _dedup_bleed_segments


def test_dedup_is_noop_when_bleed_not_detected():
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

    filtered_mic, filtered_speaker = _dedup_bleed_segments(
        mic, speaker, bleed_detected=False
    )

    assert filtered_mic == mic
    assert filtered_speaker == speaker


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

    filtered_mic, filtered_speaker = _dedup_bleed_segments(
        mic, speaker, bleed_detected=True
    )

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

    filtered_mic, filtered_speaker = _dedup_bleed_segments(
        mic, speaker, bleed_detected=True
    )

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

    filtered_mic, filtered_speaker = _dedup_bleed_segments(
        mic, speaker, bleed_detected=True
    )

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

    filtered_mic, filtered_speaker = _dedup_bleed_segments(
        mic, speaker, bleed_detected=True
    )

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

    filtered_mic, filtered_speaker = _dedup_bleed_segments(
        mic, speaker, bleed_detected=True
    )

    assert filtered_mic == mic
    assert filtered_speaker == speaker


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

    filtered_mic, filtered_speaker = _dedup_bleed_segments(
        mic, speaker, bleed_detected=True
    )

    assert filtered_mic == [mic[1]]
    assert filtered_speaker == speaker
