from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

import fitz

from .formatters import parse_float
from .models import CHANNEL_ORDER, ChannelReading, SismogramRecord


def vibration_reference_limit(freq_value: float | str | None) -> float | None:
    if freq_value is None:
        return None
    if isinstance(freq_value, str):
        text = freq_value.strip()
        if text.startswith(">"):
            return 50.0
        freq = parse_float(text)
    else:
        freq = float(freq_value)
    if freq is None:
        return None
    if freq <= 4.0:
        return 15.0
    if freq <= 15.0:
        return 15.0 + ((freq - 4.0) * (5.0 / 11.0))
    if freq <= 40.0:
        return 20.0 + ((freq - 15.0) * (30.0 / 25.0))
    return 50.0


def _read_pdf_text(pdf_path: Path) -> str:
    with fitz.open(str(pdf_path)) as doc:
        return "\n".join(page.get_text() for page in doc)


def _extract_lines(text: str) -> list[str]:
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if line:
            lines.append(line)
    return lines


def _find_line(lines: list[str], target: str) -> int | None:
    for index, line in enumerate(lines):
        if line == target:
            return index
    return None


def _search_group(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, flags=re.MULTILINE)
    if not match:
        return None
    return match.group(1).strip()


def _parse_frequency_token(token: str | None) -> float | str | None:
    if token is None:
        return None
    cleaned = token.replace("Hz", "").strip()
    if not cleaned:
        return None
    if cleaned.startswith(">"):
        return cleaned
    return parse_float(cleaned)


def _parse_scaled_distance(raw_value: str | None) -> tuple[float | None, float | None, float | None]:
    if not raw_value:
        return None, None, None
    match = re.search(r"([0-9.]+)\s*\(([0-9.]+)\s*m,\s*([0-9.]+)\s*kg\)", raw_value)
    if not match:
        return parse_float(raw_value), None, None
    return parse_float(match.group(1)), parse_float(match.group(2)), parse_float(match.group(3))


def _parse_event_date(text: str) -> datetime | None:
    for pattern in (
        r"(?:Manual|Automatic)\s+at\s+[0-9:]+\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})",
        r"Peak Vector Sum\s*([0-9.]+)\s*mm/s on\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+at",
        r"([0-9.]+)\s*dB\(L\).*?on\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+at",
    ):
        match = re.search(pattern, text, flags=re.DOTALL)
        if not match:
            continue
        date_str = match.group(1)
        return datetime.strptime(date_str, "%B %d, %Y")
    return None


def _parse_channel(lines: list[str], axis: str) -> ChannelReading:
    index = _find_line(lines, axis)
    if index is None:
        return ChannelReading(axis=axis)
    block = lines[index + 1 : index + 8]
    ppv = parse_float(block[0]) if len(block) > 0 else None
    freq = _parse_frequency_token(block[1]) if len(block) > 1 else None
    event_time = block[3] if len(block) > 3 else None
    sensor_frequency = parse_float(block[5]) if len(block) > 5 else None
    overswing_ratio = parse_float(block[6]) if len(block) > 6 else None
    limit = vibration_reference_limit(freq)
    compliant = None if ppv is None or limit is None else ppv <= limit
    return ChannelReading(
        axis=axis,
        ppv_mm_s=ppv,
        zc_freq_hz=freq,
        event_time=event_time,
        sensor_frequency_hz=sensor_frequency,
        overswing_ratio=overswing_ratio,
        reference_limit_mm_s=limit,
        compliant=compliant,
    )


def parse_sismogram(pdf_path: str | Path) -> SismogramRecord:
    path = Path(pdf_path)
    text = _read_pdf_text(path)
    lines = _extract_lines(text)

    serial_index = _find_line(lines, "Serial Number")
    serial_number = lines[serial_index + 5] if serial_index is not None and len(lines) > serial_index + 5 else None
    battery_level = lines[serial_index + 6] if serial_index is not None and len(lines) > serial_index + 6 else None
    unit_calibration = lines[serial_index + 7] if serial_index is not None and len(lines) > serial_index + 7 else None
    file_name = lines[serial_index + 8] if serial_index is not None and len(lines) > serial_index + 8 else None
    raw_scaled_distance = lines[serial_index + 9] if serial_index is not None and len(lines) > serial_index + 9 else None

    mic_index = _find_line(lines, "Linear Weighting")
    pspl_line = lines[mic_index + 1] if mic_index is not None and len(lines) > mic_index + 1 else None
    mic_freq_line = lines[mic_index + 2] if mic_index is not None and len(lines) > mic_index + 2 else None

    pspl_db_l = parse_float(pspl_line)
    microphone_zc_freq_hz = _parse_frequency_token(mic_freq_line)

    peak_match = re.search(
        r"Peak Vector Sum\s*([0-9.]+)\s*mm/s\s+at\s+[0-9.]+\s*sec",
        text,
        flags=re.DOTALL,
    )
    peak_vector_sum_mm_s = parse_float(peak_match.group(1)) if peak_match else None
    event_date = _parse_event_date(text)

    scaled_distance, distance_m, charge_kg = _parse_scaled_distance(raw_scaled_distance)
    channels = {axis: _parse_channel(lines, axis) for axis in CHANNEL_ORDER}

    return SismogramRecord(
        source_pdf=str(path.resolve()),
        location=_search_group(r"Location:\s*(.+)", text) or path.stem,
        client=_search_group(r"Client:\s*(.+)", text),
        user_name=_search_group(r"User Name:\s*(.+)", text),
        serial_number=serial_number,
        battery_level=battery_level,
        unit_calibration=unit_calibration,
        file_name=file_name,
        scaled_distance=scaled_distance,
        distance_m=distance_m,
        charge_kg=charge_kg,
        raw_scaled_distance=raw_scaled_distance,
        event_date=event_date.date() if event_date else None,
        pspl_db_l=pspl_db_l,
        microphone_zc_freq_hz=microphone_zc_freq_hz,
        peak_vector_sum_mm_s=peak_vector_sum_mm_s,
        channels=channels,
        pspl_compliant=None if pspl_db_l is None else pspl_db_l <= 134.0,
    )


def collect_sismograms(input_dir: str | Path) -> list[SismogramRecord]:
    directory = Path(input_dir)
    pdf_paths = sorted(directory.glob("*.pdf"), key=lambda item: item.name.lower())
    return [parse_sismogram(path) for path in pdf_paths]
