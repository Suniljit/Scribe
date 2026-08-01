from fastapi import APIRouter

from app.audio_devices import default_input_device_index, list_input_devices
from app.models import AudioDevice

router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("", response_model=list[AudioDevice])
def get_devices() -> list[AudioDevice]:
    return list_input_devices()


@router.get("/default")
def get_default_device() -> dict:
    return {"index": default_input_device_index()}
