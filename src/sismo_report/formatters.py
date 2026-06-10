from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime


def parse_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", ".")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    return float(match.group(0))


def format_decimal(value: float | None, decimals: int) -> str:
    if value is None:
        return "N/D"
    return f"{value:.{decimals}f}".replace(".", ",")


def format_mm_s(value: float | None) -> str:
    return format_decimal(value, 3)


def format_pspl(value: float | None) -> str:
    return format_decimal(value, 1)


def format_distance(value: float | None) -> str:
    return format_decimal(value, 1)


def format_charge(value: float | None) -> str:
    return format_decimal(value, 1)


def format_frequency(value: float | str | None, decimals: int = 1) -> str:
    if value is None:
        return "N/D"
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return "N/D"
        if text.startswith(">") or text.upper() == "N/D":
            return text.replace(".", ",")
        parsed = parse_float(text)
        if parsed is None:
            return text
        value = parsed
    if float(value).is_integer():
        return str(int(value))
    return format_decimal(float(value), decimals)


def format_microphone_frequency(value: float | str | None) -> str:
    return format_frequency(value, decimals=1)


def format_channel_frequency(value: float | str | None) -> str:
    return format_frequency(value, decimals=1)


def format_date_br(value: date | datetime | None) -> str:
    if value is None:
        return "N/D"
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%d/%m/%Y")


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_text).strip("_")
    return slug.lower() or "saida"


def wrap_label(text: str, limit: int = 16) -> str:
    words = text.split()
    if not words:
        return text
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        if len(current) + 1 + len(word) <= limit:
            current = f"{current} {word}"
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return "\n".join(lines[:3])
