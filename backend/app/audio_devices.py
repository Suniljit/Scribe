import sounddevice as sd

from app.models import AudioDevice

# Common virtual loopback devices used to capture macOS speaker audio since
# macOS has no built-in API to record output audio directly.
_LOOPBACK_NAME_HINTS = (
    "blackhole",
    "loopback",
    "soundflower",
    "aggregate",
    "multi-output",
)

# Excluded even though it reports output channels like a real loopback
# device: it only captures Teams' own call audio, which a general-purpose
# loopback route (e.g. BlackHole via a Multi-Output Device) already covers,
# so surfacing it as a separate speaker option is redundant.
_EXCLUDED_NAME_HINTS = ("teams audio",)


def _is_likely_loopback(name: str, max_output_channels: int) -> bool:
    lowered = name.lower()
    if any(hint in lowered for hint in _EXCLUDED_NAME_HINTS):
        return False
    # A device that also reports output channels can actually produce audio
    # (e.g. BlackHole, an Aggregate/Multi-Output Device) rather than just
    # capture it like a plain microphone, so it's a real speaker candidate.
    if max_output_channels > 0:
        return True
    return any(hint in lowered for hint in _LOOPBACK_NAME_HINTS)


def list_input_devices() -> list[AudioDevice]:
    devices = sd.query_devices()
    result = []
    for index, device in enumerate(devices):
        if device["max_input_channels"] <= 0:
            continue
        result.append(
            AudioDevice(
                index=index,
                name=device["name"],
                max_input_channels=device["max_input_channels"],
                max_output_channels=device["max_output_channels"],
                default_samplerate=device["default_samplerate"],
                is_likely_loopback=_is_likely_loopback(
                    device["name"], device["max_output_channels"]
                ),
            )
        )
    return result


def default_input_device_index() -> int | None:
    try:
        default = sd.default.device[0]
        return int(default) if default is not None and default >= 0 else None
    except Exception:  # noqa: BLE001
        return None
