from app.models import TranscriptResult, TranscriptSegment
from app.vtt import to_vtt


def test_to_vtt_formats_timestamps_and_speaker_labels():
    result = TranscriptResult(
        recording_id="abc123",
        language="en",
        segments=[
            TranscriptSegment(start=0.0, end=1.5, speaker="mic:SPEAKER_00", text="Hello there"),
            TranscriptSegment(start=3661.25, end=3662.0, speaker=None, text="No speaker"),
        ],
    )

    vtt = to_vtt(result)

    assert vtt == (
        "WEBVTT\n"
        "\n"
        "00:00:00.000 --> 00:00:01.500\n"
        "mic:SPEAKER_00: Hello there\n"
        "\n"
        "01:01:01.250 --> 01:01:02.000\n"
        "No speaker\n"
    )
