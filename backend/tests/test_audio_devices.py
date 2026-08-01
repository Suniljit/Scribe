from app.audio_devices import _is_likely_loopback


def test_teams_audio_is_excluded_even_with_output_channels():
    assert _is_likely_loopback("Microsoft Teams Audio", max_output_channels=2) is False


def test_blackhole_name_hint_still_flagged():
    assert _is_likely_loopback("BlackHole 2ch", max_output_channels=0) is True


def test_plain_microphone_is_not_flagged():
    assert _is_likely_loopback("MacBook Pro Microphone", max_output_channels=0) is False


def test_device_with_output_channels_is_flagged_regardless_of_name():
    assert _is_likely_loopback("Aggregate Device", max_output_channels=2) is True
