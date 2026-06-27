from __future__ import annotations

from .formatters import (
    format_channel_frequency,
    format_charge,
    format_date_br,
    format_decimal,
    format_distance,
    format_microphone_frequency,
    format_mm_s,
    format_pspl,
)
from .models import CHANNEL_LABELS, SismogramRecord, any_record_has_vibration_alert, get_primary_client, vibration_alert_locations


def _scaled_distance_text(record: SismogramRecord) -> str:
    if record.scaled_distance is None and record.distance_m is None and record.charge_kg is None:
        return "N/D"
    return (
        f"{format_distance(record.scaled_distance)} "
        f"({format_distance(record.distance_m)} m; {format_charge(record.charge_kg)} kg)"
    )


def _pick_max_record(records: list[SismogramRecord], selector) -> SismogramRecord | None:
    best_record: SismogramRecord | None = None
    best_value = float("-inf")
    for record in records:
        value = selector(record)
        if value is None:
            continue
        if best_record is None or value > best_value:
            best_record = record
            best_value = value
    return best_record


def build_whatsapp_message(
    records: list[SismogramRecord],
    vibration_alert_threshold_mm_s: float = 0.8,
) -> str:
    client = get_primary_client(records)
    header_date = format_date_br(records[0].event_date if records else None)
    status_text = _vibration_status_text(records, vibration_alert_threshold_mm_s)
    
    lines: list[str] = [
        "📊 *MONITORAMENTO SISMOGRÁFICO - OPENBLAST*",
        "---",
        f"🏢 *Cliente:* {client}",
        f"📅 *Data:* {header_date}",
        "",
        "Prezados,",
        "Seguem os níveis de vibração e pressão acústica do evento. Detalhes técnicos no relatório anexo.",
    ]

    if status_text is not None:
        lines.append(status_text)
        lines.append("")
    else:
        lines.append("")

    for index, record in enumerate(records, start=1):
        status = "🟢" if record.overall_compliant() else "🔴"
        lines.append(f"{status} *{record.location}*")
        lines.append(f"   • PVS: {format_mm_s(record.peak_vector_sum_mm_s)} mm/s")
        lines.append(f"   • PSPL: {format_pspl(record.pspl_db_l)} dB(L)")
        lines.append("")

    all_compliant = all(r.overall_compliant() for r in records if r.overall_compliant() is not None)
    
    lines.extend([
        "---",
        "✅ *STATUS:* parâmetros em conformidade com a *NBR 9653:2018*." if all_compliant else "⚠️ *STATUS:* níveis acima do limite normativo. Verifique o relatório detalhado.",
        "",
        "Atenciosamente,",
        "*OpenBlast*"
    ])

    return "\n".join(lines)


def _vibration_status_text(records: list[SismogramRecord], threshold_mm_s: float) -> str | None:
    if not records:
        return None
    if any_record_has_vibration_alert(records, threshold_mm_s):
        locations = ", ".join(vibration_alert_locations(records, threshold_mm_s))
        return f"⚠️ Índices de vibração: acima de {format_decimal(threshold_mm_s, 1)} mm/s. Pontos: {locations}."
    return f"✅ Índices de vibração: abaixo de {format_decimal(threshold_mm_s, 1)} mm/s."
