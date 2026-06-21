from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any

CHANNEL_ORDER = ("Tran", "Vert", "Long")
CHANNEL_LABELS = {
    "Tran": "Transversal",
    "Vert": "Vertical",
    "Long": "Longitudinal",
}


@dataclass(slots=True)
class ChannelReading:
    axis: str
    ppv_mm_s: float | None = None
    zc_freq_hz: float | str | None = None
    event_time: str | None = None
    sensor_frequency_hz: float | None = None
    overswing_ratio: float | None = None
    reference_limit_mm_s: float | None = None
    compliant: bool | None = None


@dataclass(slots=True)
class SismogramRecord:
    source_pdf: str
    location: str = "N/D"
    client: str | None = None
    user_name: str | None = None
    serial_number: str | None = None
    battery_level: str | None = None
    unit_calibration: str | None = None
    file_name: str | None = None
    scaled_distance: float | None = None
    distance_m: float | None = None
    charge_kg: float | None = None
    raw_scaled_distance: str | None = None
    event_date: date | None = None
    pspl_db_l: float | None = None
    microphone_zc_freq_hz: float | str | None = None
    peak_vector_sum_mm_s: float | None = None
    channels: dict[str, ChannelReading] = field(default_factory=dict)
    pspl_compliant: bool | None = None

    def get_channel(self, axis: str) -> ChannelReading:
        return self.channels.get(axis, ChannelReading(axis=axis))

    def max_channel(self) -> ChannelReading:
        readings = [self.get_channel(axis) for axis in CHANNEL_ORDER]
        best = ChannelReading(axis="Tran")
        best_value = float("-inf")
        for reading in readings:
            value = reading.ppv_mm_s
            if value is None:
                continue
            if value > best_value:
                best = reading
                best_value = value
        return best

    def vibration_measurements_mm_s(self) -> list[float]:
        readings = [self.peak_vector_sum_mm_s]
        readings.extend(self.get_channel(axis).ppv_mm_s for axis in CHANNEL_ORDER)
        return [value for value in readings if value is not None]

    def has_vibration_alert(self, threshold_mm_s: float) -> bool:
        return any(value > threshold_mm_s for value in self.vibration_measurements_mm_s())

    def all_channels_compliant(self) -> bool | None:
        states = [self.get_channel(axis).compliant for axis in CHANNEL_ORDER]
        known_states = [state for state in states if state is not None]
        if not known_states:
            return None
        return all(known_states)

    def overall_compliant(self) -> bool | None:
        states = [self.pspl_compliant, self.all_channels_compliant()]
        known_states = [state for state in states if state is not None]
        if not known_states:
            return None
        return all(known_states)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        if self.event_date is not None:
            payload["event_date"] = self.event_date.isoformat()
        return payload

def normalize_client_name(name: str) -> str:
    normalized = " ".join(name.strip().split())
    uppercased = normalized.upper()
    if "MINERACAO VALE" in uppercased or "MINERA AO VALE" in uppercased:
        return "US MINERAÇÃO VALE-VERDE"
    return normalized

def get_primary_client(records: list[SismogramRecord]) -> str:
    for record in records:
        if record.user_name:
            return normalize_client_name(record.user_name)
        if record.client:
            return normalize_client_name(record.client)
    return "OPENBLAST"


def any_record_has_vibration_alert(records: list[SismogramRecord], threshold_mm_s: float) -> bool:
    return any(record.has_vibration_alert(threshold_mm_s) for record in records)


def vibration_alert_locations(records: list[SismogramRecord], threshold_mm_s: float) -> list[str]:
    return [record.location for record in records if record.has_vibration_alert(threshold_mm_s)]
