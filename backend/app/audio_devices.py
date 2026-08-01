import sounddevice as sd

from app.models import AudioDevice

# Common virtual loopback devices used to capture macOS speaker audio (e.g. Teams
# call output) since macOS has no built-in API to record output audio directly.
_LOOPBACK_NAME_HINTS = (
    "blackhole",
    "loopback",
    "soundflower",
    "aggregate",
    "multi-output",
    "teams audio",
)


def _is_likely_loopback(name: str) -> bool:
    lowered = name.lower()
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
                default_samplerate=device["default_samplerate"],
                is_likely_loopback=_is_likely_loopback(device["name"]),
            )
        )
    return result


def default_input_device_index() -> int | None:
    try:
        default = sd.default.device[0]
        return int(default) if default is not None and default >= 0 else None
    except Exception:  # noqa: BLE001
        return None
