from __future__ import annotations

import json
import re
import shutil
import time
from datetime import datetime
from pathlib import Path

import fitz

from .parser import collect_sismograms
from .report import export_pdf_pages_as_png, generate_report
from .whatsapp import build_whatsapp_message


def generate_outputs(
    input_dir: str | Path,
    output_dir: str | Path,
    logo_path: str | Path | None,
    png_scale: float = 6.0,
    report_max_records: int = 3,
    png_page_number: int = 0,
    vibration_alert_threshold_mm_s: float = 0.8,
) -> dict[str, str]:
    inputs_path = Path(input_dir)
    outputs_path = Path(output_dir)
    outputs_path.mkdir(parents=True, exist_ok=True)
    _organize_existing_archives(outputs_path)

    records = collect_sismograms(inputs_path)
    if not records:
        raise FileNotFoundError(f"Nenhum PDF encontrado em {inputs_path}")

    generated_at = datetime.now()
    event_slug = _build_event_folder_slug(records, generated_at)
    archive_dir = outputs_path / event_slug
    archive_dir.mkdir(parents=True, exist_ok=True)
    _cleanup_legacy_root_outputs(outputs_path, archive_dir)

    archived_pdf = archive_dir / f"ENAEX_NSR-{event_slug}.pdf"
    archived_png = archive_dir / f"ENAEX_NSR-{event_slug}.png"
    archived_txt = archive_dir / f"NOTA_RAPIDA_WHATSAPP_{event_slug}.txt"
    archived_json = archive_dir / f"DADOS_EXTRAIDOS_{event_slug}.json"

    generate_report(
        records,
        archived_pdf,
        logo_path,
        generated_at,
        max_records=report_max_records,
        vibration_alert_threshold_mm_s=vibration_alert_threshold_mm_s,
    )

    with fitz.open(str(archived_pdf)) as document:
        if document.page_count == 0:
            raise ValueError(f"PDF sem paginas para exportar: {archived_pdf}")
        if png_page_number < 0 or png_page_number >= document.page_count:
            raise IndexError(f"png_page_number fora do intervalo: {png_page_number}")
        page_numbers = (png_page_number, *[index for index in range(document.page_count) if index != png_page_number])

    png_outputs = export_pdf_pages_as_png(archived_pdf, archived_png, page_numbers=page_numbers, scale=png_scale)

    message = build_whatsapp_message(records, vibration_alert_threshold_mm_s=vibration_alert_threshold_mm_s)
    archived_txt.write_text(message, encoding="utf-8")

    payload = {
        "generated_at": generated_at.isoformat(timespec="seconds"),
        "input_dir": str(inputs_path.resolve()),
        "files": [record.to_dict() for record in records],
    }
    archived_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "archive_dir": str(archive_dir.resolve()),
        "pdf": str(archived_pdf.resolve()),
        **{key: str(path.resolve()) for key, path in png_outputs.items()},
        "txt": str(archived_txt.resolve()),
        "json": str(archived_json.resolve()),
    }


def watch_inputs(
    input_dir: str | Path,
    output_dir: str | Path,
    logo_path: str | Path | None,
    interval_seconds: int = 5,
    png_scale: float = 6.0,
    report_max_records: int = 3,
    png_page_number: int = 0,
    vibration_alert_threshold_mm_s: float = 0.8,
) -> None:
    inputs_path = Path(input_dir)
    last_signature: tuple[tuple[str, int, int], ...] | None = None
    print(f"Monitorando {inputs_path.resolve()} a cada {interval_seconds}s...")
    while True:
        signature = _folder_signature(inputs_path)
        if signature != last_signature and signature:
            try:
                outputs = generate_outputs(
                    inputs_path,
                    output_dir,
                    logo_path,
                    png_scale=png_scale,
                    report_max_records=report_max_records,
                    png_page_number=png_page_number,
                    vibration_alert_threshold_mm_s=vibration_alert_threshold_mm_s,
                )
                print(f"[{datetime.now():%H:%M:%S}] Relatório atualizado: {outputs['pdf']}")
            except Exception as exc:
                print(f"[{datetime.now():%H:%M:%S}] Falha ao gerar relatório: {exc}")
            last_signature = signature
        time.sleep(interval_seconds)


def _folder_signature(directory: Path) -> tuple[tuple[str, int, int], ...]:
    pdfs = sorted(directory.glob("*.pdf"), key=lambda item: item.name.lower())
    return tuple((pdf.name, pdf.stat().st_size, pdf.stat().st_mtime_ns) for pdf in pdfs)


def _build_event_folder_slug(records, generated_at: datetime) -> str:
    known_dates = sorted({record.event_date for record in records if record.event_date is not None})
    if not known_dates:
        return generated_at.strftime("%Y%m%d")
    if len(known_dates) == 1:
        return known_dates[0].strftime("%Y%m%d")
    return f"{known_dates[0]:%Y%m%d}_a_{known_dates[-1]:%Y%m%d}"


def _cleanup_legacy_root_outputs(outputs_path: Path, archive_dir: Path) -> None:
    legacy_patterns = (
        "RELATORIO_SISMOGRAFICO_ATUAL.pdf",
        "NOTA_RAPIDA_WHATSAPP_ATUAL.txt",
        "DADOS_EXTRAIDOS_ATUAL.json",
        "PPV_PREVIEW.png",
    )
    for pattern in legacy_patterns:
        legacy_file = outputs_path / pattern
        if not legacy_file.exists():
            continue
        destination = archive_dir / legacy_file.name
        if destination.exists():
            legacy_file.unlink()
            continue
        shutil.move(str(legacy_file), str(destination))


def _organize_existing_archives(outputs_path: Path) -> None:
    for item in outputs_path.iterdir():
        if not item.is_file() or "_ATUAL." in item.name:
            continue
        folder_slug = _extract_event_folder_slug(item.name)
        if folder_slug is None:
            continue
        destination_dir = outputs_path / folder_slug
        destination_dir.mkdir(parents=True, exist_ok=True)
        destination = destination_dir / item.name
        if destination != item:
            shutil.move(str(item), str(destination))


def _extract_event_folder_slug(filename: str) -> str | None:
    match = re.search(r"_(\d{8}(?:_a_\d{8})?)_", filename)
    if match is not None:
        return match.group(1)
    match = re.search(r"-(\d{8})\.", filename)
    if match is None:
        return None
    return match.group(1)
