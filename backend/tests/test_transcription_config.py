import importlib

import torch

from app import config


def _reload_config():
    return importlib.reload(config)


def test_aux_device_defaults_to_mps_when_available(monkeypatch):
    monkeypatch.delenv("TRANSCRIBE_AUX_DEVICE", raising=False)
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: True)
    reloaded = _reload_config()
    assert reloaded.AUX_DEVICE == "mps"


def test_aux_device_defaults_to_cpu_when_mps_unavailable(monkeypatch):
    monkeypatch.delenv("TRANSCRIBE_AUX_DEVICE", raising=False)
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: False)
    reloaded = _reload_config()
    assert reloaded.AUX_DEVICE == "cpu"


def test_aux_device_env_override_wins_over_autodetection(monkeypatch):
    monkeypatch.setenv("TRANSCRIBE_AUX_DEVICE", "cpu")
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: True)
    reloaded = _reload_config()
    assert reloaded.AUX_DEVICE == "cpu"
