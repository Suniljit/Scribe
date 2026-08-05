from app.models import TranscriptResult


def _format_timestamp(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    hours, total_ms = divmod(total_ms, 3_600_000)
    minutes, total_ms = divmod(total_ms, 60_000)
    secs, ms = divmod(total_ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def to_vtt(result: TranscriptResult) -> str:
    lines = ["WEBVTT", ""]
    for seg in result.segments:
        lines.append(f"{_format_timestamp(seg.start)} --> {_format_timestamp(seg.end)}")
        text = f"{seg.speaker}: {seg.text}" if seg.speaker else seg.text
        lines.append(text)
        lines.append("")
    return "\n".join(lines)
