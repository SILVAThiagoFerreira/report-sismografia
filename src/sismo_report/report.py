from __future__ import annotations

import io
import math
from datetime import datetime
from pathlib import Path

import fitz
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import FuncFormatter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfgen import canvas

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
from .models import SismogramRecord, any_record_has_vibration_alert, get_primary_client, vibration_alert_locations

PAGE_SIZE = A4
PAGE_WIDTH, PAGE_HEIGHT = PAGE_SIZE

ENAEX_RED = colors.HexColor("#E5231B")
ENAEX_DARK = colors.HexColor("#434C5B")
ENAEX_GREEN = colors.HexColor("#7BC51C")
ENAEX_LIGHT = colors.HexColor("#F1F1F1")
ENAEX_NAVY = colors.HexColor("#1C2240")
ENAEX_WHITE = colors.white
ENAEX_TEXT = colors.HexColor("#18202A")

ENAEX_RED_HEX = "#E5231B"
ENAEX_DARK_HEX = "#434C5B"
ENAEX_GREEN_HEX = "#7BC51C"

MARGIN_X = 10 * mm
CONTENT_WIDTH = PAGE_WIDTH - (2 * MARGIN_X)
CHART_GAP = 6 * mm
CHART_WIDTH = (CONTENT_WIDTH - CHART_GAP) / 2
PPV_Y_FLOOR = 0.05
PPV_Y_BREAK = 0.1
PPV_Y_LOW_BAND = 0.5
PPV_Y_OFFSET = PPV_Y_LOW_BAND - PPV_Y_BREAK
PPV_Y_TICKS = [PPV_Y_FLOOR, PPV_Y_BREAK, *range(1, 51)]
PPV_Y_LABELS = {1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50}


def generate_report(
    records: list[SismogramRecord],
    output_path: str | Path,
    logo_path: str | Path | None,
    generated_at: datetime,
    max_records: int = 3,
    vibration_alert_threshold_mm_s: float = 0.8,
) -> None:
    pdf_path = Path(output_path)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(pdf_path), pagesize=PAGE_SIZE)
    pdf.setTitle("Relatório OnePage de Monitoramento Sismográfico - Enaex")
    logo = _load_logo(logo_path)
    status_text = _vibration_status_text(records, vibration_alert_threshold_mm_s)
    summary_records = records[:max_records]
    _draw_onepage_report(pdf, records, summary_records, generated_at, logo, status_text)
    remaining_records = records[len(summary_records):]
    if remaining_records:
        _draw_additional_record_pages(pdf, remaining_records, generated_at, logo, len(records))
    pdf.save()


def export_pdf_page_as_png(
    pdf_path: str | Path,
    output_path: str | Path,
    page_number: int = 0,
    scale: float = 2.0,
) -> None:
    export_pdf_pages_as_png(pdf_path, output_path, page_numbers=(page_number,), scale=scale)


def export_pdf_pages_as_png(
    pdf_path: str | Path,
    output_path: str | Path,
    page_numbers: tuple[int, ...] | list[int] | None = None,
    scale: float = 2.0,
) -> dict[str, Path]:
    source = Path(pdf_path)
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    exported_paths: dict[str, Path] = {}
    with fitz.open(str(source)) as document:
        if document.page_count == 0:
            raise ValueError(f"PDF sem paginas para exportar: {source}")

        selected_page_numbers = tuple(range(document.page_count)) if page_numbers is None else tuple(page_numbers)
        for index, page_number in enumerate(selected_page_numbers):
            if page_number < 0 or page_number >= document.page_count:
                raise IndexError(f"Pagina fora do intervalo: {page_number}")

            page_target = target if index == 0 else target.with_name(f"{target.stem}_p{page_number + 1}{target.suffix}")
            page = document.load_page(page_number)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            pixmap.save(str(page_target))

            key = "png" if index == 0 else f"png_p{page_number + 1}"
            exported_paths[key] = page_target

    return exported_paths


def _load_logo(logo_path: str | Path | None) -> ImageReader | None:
    if logo_path is None:
        return None
    path = Path(logo_path)
    if not path.exists():
        return None
    return ImageReader(str(path))


def _draw_onepage_report(
    pdf: canvas.Canvas,
    all_records: list[SismogramRecord],
    summary_records: list[SismogramRecord],
    generated_at: datetime,
    logo: ImageReader | None,
    status_text: str | None,
) -> None:
    _draw_base_background(pdf, logo)
    _draw_title_card(pdf, all_records, generated_at)

    pdf.setFillColor(colors.black)
    pdf.setFont("Helvetica", 15.5)
    pdf.drawString(MARGIN_X, PAGE_HEIGHT - 67 * mm, "Resumo Executivo")

    _draw_box(
        pdf,
        MARGIN_X,
        204 * mm,
        CONTENT_WIDTH,
        23 * mm,
        "Escopo da Campanha",
        _overview_lines(all_records, generated_at, status_text),
        accent_color=ENAEX_GREEN,
    )
    _draw_table_box(
        pdf,
        MARGIN_X,
        176 * mm,
        CONTENT_WIDTH,
        24 * mm,
        "Conclusão Técnica",
        _build_conclusion_table(all_records, CONTENT_WIDTH - 8 * mm, 24 * mm - 9.8 * mm),
        accent_color=ENAEX_GREEN if _overall_batch_compliance(all_records) else ENAEX_RED,
    )

    _draw_chart_panel(
        pdf,
        MARGIN_X,
        112 * mm,
        CHART_WIDTH,
        62 * mm,
        "Pressão Sonora x Distância",
        _build_pspl_chart(all_records),
    )
    _draw_chart_panel(
        pdf,
        MARGIN_X + CHART_WIDTH + CHART_GAP,
        112 * mm,
        CHART_WIDTH,
        62 * mm,
        "PPV x Limite ABNT",
        _build_ppv_chart(all_records),
    )

    pdf.setFillColor(colors.black)
    pdf.setFont("Helvetica", 15)
    pdf.drawString(MARGIN_X, 98 * mm, "Pontos Monitorados")

    row_height = 19.8 * mm
    row_gap = 3.9 * mm
    base_y = 72.5 * mm
    for index, record in enumerate(summary_records):
        y = base_y - index * (row_height + row_gap)
        _draw_record_row(pdf, record, MARGIN_X, y, CONTENT_WIDTH, row_height)

    pdf.setFillColor(ENAEX_DARK)
    pdf.setFont("Helvetica", 7.2)
    norma_text = "Base normativa: ABNT NBR 9653:2018."
    norma_w = pdf.stringWidth(norma_text, "Helvetica", 7.2)
    # Texto da norma posicionado na esquerda
    pdf.drawString(MARGIN_X + 10 * mm, 12 * mm, norma_text)


def _draw_additional_record_pages(
    pdf: canvas.Canvas,
    records: list[SismogramRecord],
    generated_at: datetime,
    logo: ImageReader | None,
    total_records: int,
) -> None:
    row_height = 19.8 * mm
    row_gap = 3.9 * mm
    rows_start_y = PAGE_HEIGHT - 47 * mm
    bottom_margin = 12 * mm
    rows_per_page = max(1, int(((rows_start_y - bottom_margin) + row_gap) // (row_height + row_gap)))
    pages = _chunk_records(records, rows_per_page)

    for page_index, page_records in enumerate(pages, start=1):
        pdf.showPage()
        _draw_base_background(pdf, logo)
        _draw_appendix_header(
            pdf,
            page_index=page_index,
            total_pages=len(pages),
            records_on_page=len(page_records),
            total_records=total_records,
            generated_at=generated_at,
        )

        for index, record in enumerate(page_records):
            y = rows_start_y - index * (row_height + row_gap)
            _draw_record_row(pdf, record, MARGIN_X, y, CONTENT_WIDTH, row_height)

        pdf.setFillColor(ENAEX_DARK)
        pdf.setFont("Helvetica", 7.2)
        pdf.drawString(MARGIN_X + 10 * mm, 12 * mm, "Continuação do resumo executivo.")


def _draw_appendix_header(
    pdf: canvas.Canvas,
    page_index: int,
    total_pages: int,
    records_on_page: int,
    total_records: int,
    generated_at: datetime,
) -> None:
    pdf.setFillColor(ENAEX_RED)
    pdf.setFont("Helvetica-Bold", 13.2)
    pdf.drawString(MARGIN_X, PAGE_HEIGHT - 25 * mm, "REGISTROS COMPLEMENTARES")

    pdf.setFillColor(colors.HexColor("#667487"))
    pdf.setFont("Helvetica", 8.2)
    pdf.drawString(
        MARGIN_X,
        PAGE_HEIGHT - 30 * mm,
        f"Página {page_index + 1} de {total_pages + 1} | {records_on_page} sismograma(s) nesta página",
    )
    pdf.drawString(
        MARGIN_X,
        PAGE_HEIGHT - 34 * mm,
        f"Total processado: {total_records} sismograma(s) | Gerado em {generated_at:%d/%m/%Y %H:%M}",
    )


def _chunk_records(records: list[SismogramRecord], chunk_size: int) -> list[list[SismogramRecord]]:
    return [records[index : index + chunk_size] for index in range(0, len(records), chunk_size)]


def _draw_title_card(pdf: canvas.Canvas, records: list[SismogramRecord], generated_at: datetime) -> None:
    x = MARGIN_X
    y = PAGE_HEIGHT - 52 * mm
    width = CONTENT_WIDTH
    height = 30 * mm

    _draw_shadow_card(pdf, x, y, width, height)
    pdf.setFillColor(ENAEX_WHITE)
    pdf.roundRect(x, y, width, height, 5, fill=1, stroke=0)
    pdf.setFillColor(colors.HexColor("#C8C8C8"))
    pdf.roundRect(x, y + height - 4 * mm, width, 4 * mm, 5, fill=1, stroke=0)

    pdf.setFillColor(ENAEX_RED)
    pdf.setFont("Helvetica-Bold", 13.5)
    pdf.drawString(x + 7 * mm, y + 18 * mm, "MONITORAMENTO SISMOGRÁFICO")

    pdf.setFillColor(colors.HexColor("#667487"))
    _draw_fit_text(
        pdf,
        get_primary_client(records),
        x + 7 * mm,
        y + 8.4 * mm,
        width - 14 * mm,
        "Helvetica-Bold",
        10.2,
        8.0,
    )

    footer = f"{len(records)} ponto(s)"
    pdf.setFillColor(colors.black)
    _draw_fit_text(pdf, footer, x + 7 * mm, y + 2.8 * mm, width - 14 * mm, "Helvetica-Bold", 7.2, 6.0)


def _draw_box(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    title: str,
    lines: list[str],
    accent_color,
) -> None:
    _draw_shadow_card(pdf, x, y, width, height)
    pdf.setFillColor(ENAEX_WHITE)
    pdf.roundRect(x, y, width, height, 4, fill=1, stroke=0)
    pdf.setFillColor(accent_color)
    pdf.roundRect(x, y + height - 7.2 * mm, width, 7.2 * mm, 4, fill=1, stroke=0)

    pdf.setFillColor(ENAEX_WHITE)
    pdf.setFont("Helvetica-Bold", 9.8)
    pdf.drawString(x + 4 * mm, y + height - 5.0 * mm, title)

    pdf.setFillColor(ENAEX_TEXT)
    text_y = y + height - 10.8 * mm
    for line in lines[:4]:
        if line.startswith("⚠️"):
            pdf.setFillColor(ENAEX_RED)
        elif line.startswith("✅"):
            pdf.setFillColor(ENAEX_GREEN)
        else:
            pdf.setFillColor(ENAEX_TEXT)
        _draw_fit_text(pdf, line, x + 4 * mm, text_y, width - 8 * mm, "Helvetica", 7.8, 6.7)
        text_y -= 3.8 * mm


def _draw_chart_panel(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    title: str,
    chart_image: io.BytesIO,
) -> None:
    _draw_shadow_card(pdf, x, y, width, height)
    pdf.setFillColor(ENAEX_WHITE)
    pdf.roundRect(x, y, width, height, 4, fill=1, stroke=0)
    pdf.setFillColor(ENAEX_GREEN)
    pdf.roundRect(x, y + height - 7.2 * mm, width, 7.2 * mm, 4, fill=1, stroke=0)

    pdf.setFillColor(ENAEX_WHITE)
    pdf.setFont("Helvetica-Bold", 9.6)
    pdf.drawString(x + 4 * mm, y + height - 5.0 * mm, title)
    pdf.drawImage(
        ImageReader(chart_image),
        x + 2.8 * mm,
        y + 2.2 * mm,
        width=width - 5.6 * mm,
        height=height - 9.8 * mm,
        mask="auto",
        preserveAspectRatio=True,
        anchor="c",
    )


def _draw_table_box(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    title: str,
    table: Table,
    accent_color,
) -> None:
    _draw_shadow_card(pdf, x, y, width, height)
    pdf.setFillColor(ENAEX_WHITE)
    pdf.roundRect(x, y, width, height, 4, fill=1, stroke=0)
    pdf.setFillColor(accent_color)
    pdf.roundRect(x, y + height - 7.2 * mm, width, 7.2 * mm, 4, fill=1, stroke=0)

    pdf.setFillColor(ENAEX_WHITE)
    pdf.setFont("Helvetica-Bold", 9.8)
    pdf.drawString(x + 4 * mm, y + height - 5.0 * mm, title)

    body_width = width - 8 * mm
    body_height = height - 9.8 * mm
    table.wrapOn(pdf, body_width, body_height)
    table.drawOn(pdf, x + 4 * mm, y + 1.4 * mm)


def _draw_record_row(
    pdf: canvas.Canvas,
    record: SismogramRecord,
    x: float,
    y: float,
    width: float,
    height: float,
) -> None:
    header_h = 5.7 * mm
    badge_w = 34 * mm
    badge_h = 6.2 * mm
    table_width = width - badge_w - 13 * mm

    tran = record.get_channel("Tran")
    vert = record.get_channel("Vert")
    long = record.get_channel("Long")

    _draw_shadow_card(pdf, x, y, width, height)
    pdf.setFillColor(ENAEX_WHITE)
    pdf.roundRect(x, y, width, height, 4, fill=1, stroke=0)
    pdf.setFillColor(ENAEX_DARK)
    pdf.roundRect(x, y + height - header_h, width, header_h, 4, fill=1, stroke=0)

    pdf.setFillColor(ENAEX_WHITE)
    _draw_fit_text(pdf, record.location, x + 4 * mm, y + height - 4.1 * mm, 88 * mm, "Helvetica-Bold", 8.7, 7.4)

    table = _build_record_table(
        record,
        tran,
        vert,
        long,
        table_width,
        height - header_h - 2.8 * mm,
    )
    table.wrapOn(pdf, table_width, height - header_h - 2.8 * mm)
    table.drawOn(pdf, x + 4 * mm, y + 1.6 * mm)

    compliant = record.overall_compliant()
    badge_x = x + width - badge_w - 4 * mm
    badge_y = y + (height - header_h - badge_h) / 2
    pdf.setFillColor(ENAEX_GREEN if compliant else ENAEX_RED)
    pdf.roundRect(badge_x, badge_y, badge_w, badge_h, 3, fill=1, stroke=0)
    pdf.setFillColor(ENAEX_WHITE)
    pdf.setFont("Helvetica-Bold", 7.0)
    pdf.drawCentredString(
        badge_x + (badge_w / 2),
        badge_y + 2.0 * mm,
        "CONFORME ABNT" if compliant else "VERIFICAR",
    )


def _draw_base_background(pdf: canvas.Canvas, logo: ImageReader | None) -> None:
    pdf.setFillColor(ENAEX_LIGHT)
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    pdf.setFillColor(ENAEX_RED)
    pdf.rect(0, 0, PAGE_WIDTH, 1.8 * mm, fill=1, stroke=0)

    if logo:
        pdf.drawImage(logo, 8 * mm, PAGE_HEIGHT - 18 * mm, width=30 * mm, height=9.7 * mm, mask="auto")

    _draw_corner_motif(pdf, PAGE_WIDTH - 12.5 * mm, PAGE_HEIGHT - 11.5 * mm, 5.4 * mm)
    _draw_corner_motif(pdf, 7.5 * mm, 10.2 * mm, 4.8 * mm, reverse=True)
    _draw_dna_badge(pdf)


def _draw_dna_badge(pdf: canvas.Canvas) -> None:
    badge_w = 40 * mm
    badge_h = 8.5 * mm
    # Posicionado na inferior direita, alinhado com a margem
    badge_x = PAGE_WIDTH - badge_w - MARGIN_X
    badge_y = 10.8 * mm

    pdf.saveState()
    # Fundo do badge com borda sutil
    pdf.setFillColor(ENAEX_NAVY)
    pdf.setStrokeColor(colors.HexColor("#667487"))
    pdf.setLineWidth(0.3)
    pdf.roundRect(badge_x, badge_y, badge_w, badge_h, 2.5, fill=1, stroke=1)

    # Configuração de texto
    font_name = "Helvetica-Bold"
    font_size = 8.2
    gap = 2.8 * mm
    dna_text = "DNA"
    dot_text = "•"
    enaex_text = "ENAEX"

    group_w = (
        pdf.stringWidth(dna_text, font_name, font_size)
        + gap
        + pdf.stringWidth(dot_text, font_name, font_size)
        + gap
        + pdf.stringWidth(enaex_text, font_name, font_size)
    )
    start_x = badge_x + (badge_w - group_w) / 2
    # Ajuste para centralização vertical (baseline)
    baseline_y = badge_y + 3.0 * mm

    pdf.setFont(font_name, font_size)
    # DNA em Amarelo/Dourado
    pdf.setFillColor(colors.HexColor("#FDB515"))
    pdf.drawString(start_x, baseline_y, dna_text)

    # Ponto em Verde Enaex (mais harmônico que o teal anterior)
    start_x += pdf.stringWidth(dna_text, font_name, font_size) + gap
    pdf.setFillColor(ENAEX_GREEN)
    pdf.drawString(start_x, baseline_y, dot_text)

    # ENAEX em Branco para contraste superior no fundo Navy
    start_x += pdf.stringWidth(dot_text, font_name, font_size) + gap
    pdf.setFillColor(ENAEX_WHITE)
    pdf.drawString(start_x, baseline_y, enaex_text)
    pdf.restoreState()


def _draw_corner_motif(pdf: canvas.Canvas, x: float, y: float, radius: float, reverse: bool = False) -> None:
    stroke = colors.HexColor("#2A2F46")
    _draw_hexagon(pdf, x, y, radius, stroke, line_width=0.9)
    _draw_hexagon(pdf, x, y, radius * 1.18, stroke, line_width=0.7)


def _draw_hexagon(
    pdf: canvas.Canvas,
    center_x: float,
    center_y: float,
    radius: float,
    stroke_color,
    line_width: float,
) -> None:
    path = pdf.beginPath()
    for index in range(6):
        angle = math.radians(60 * index - 30)
        px = center_x + radius * math.cos(angle)
        py = center_y + radius * math.sin(angle)
        if index == 0:
            path.moveTo(px, py)
        else:
            path.lineTo(px, py)
    path.close()
    pdf.setStrokeColor(stroke_color)
    pdf.setLineWidth(line_width)
    pdf.drawPath(path, fill=0, stroke=1)


def _draw_shadow_card(pdf: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    pdf.setFillColor(colors.Color(0, 0, 0, alpha=0.08))
    pdf.roundRect(x + 1.3 * mm, y - 1.0 * mm, width, height, 4, fill=1, stroke=0)


def _build_record_table(
    record: SismogramRecord,
    tran,
    vert,
    long,
    width: float,
    height: float,
) -> Table:
    data = [
        [
            "Data",
            format_date_br(record.event_date),
            "PSPL",
            f"{format_pspl(record.pspl_db_l)} dB(L)",
            "Mic",
            f"{format_microphone_frequency(record.microphone_zc_freq_hz)} Hz",
        ],
        [
            "PVS",
            f"{format_mm_s(record.peak_vector_sum_mm_s)} mm/s",
            "SD",
            format_distance(record.scaled_distance),
            "Dist / Carga",
            f"{format_distance(record.distance_m)} m | {format_charge(record.charge_kg)} kg",
        ],
        [
            "Tran",
            f"{format_mm_s(tran.ppv_mm_s)} mm/s | {format_channel_frequency(tran.zc_freq_hz)} Hz",
            "Vert",
            f"{format_mm_s(vert.ppv_mm_s)} mm/s | {format_channel_frequency(vert.zc_freq_hz)} Hz",
            "Long",
            f"{format_mm_s(long.ppv_mm_s)} mm/s | {format_channel_frequency(long.zc_freq_hz)} Hz",
        ],
    ]

    col_widths = [
        14 * mm,
        26 * mm,
        12 * mm,
        24 * mm,
        22 * mm,
        width - (98 * mm),
    ]
    row_heights = [height / 3] * 3
    table = Table(data, colWidths=col_widths, rowHeights=row_heights)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF5D7")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#EAF5D7")),
                ("BACKGROUND", (4, 0), (4, -1), colors.HexColor("#EAF5D7")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C9D1DA")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTNAME", (4, 0), (4, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 5.9),
                ("LEFTPADDING", (0, 0), (-1, -1), 3.0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3.0),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                ("TEXTCOLOR", (0, 0), (-1, -1), ENAEX_TEXT),
            ]
        )
    )
    return table


def _build_conclusion_table(records: list[SismogramRecord], width: float, height: float) -> Table:
    highest_pspl = _pick_max_record(records, lambda item: item.pspl_db_l)
    highest_pvs = _pick_max_record(records, lambda item: item.peak_vector_sum_mm_s)
    highest_ppv = _pick_max_record(records, lambda item: item.max_channel().ppv_mm_s)
    compliance_text = "Todos os pontos abaixo dos limites da ABNT NBR 9653:2018."
    if not _overall_batch_compliance(records):
        compliance_text = "Ocorrência com necessidade de verificação manual frente à ABNT NBR 9653:2018."

    value_style = ParagraphStyle(
        "conclusion_value",
        fontName="Helvetica",
        fontSize=6.2,
        leading=7.0,
        textColor=ENAEX_TEXT,
    )
    label_style = ParagraphStyle(
        "conclusion_label",
        fontName="Helvetica-Bold",
        fontSize=6.2,
        leading=7.0,
        textColor=ENAEX_TEXT,
    )

    data = [
        [Paragraph("Conformidade", label_style), Paragraph(compliance_text, value_style)],
        [
            Paragraph("Maior PSPL", label_style),
            Paragraph(
                f"{format_pspl(highest_pspl.pspl_db_l if highest_pspl else None)} dB(L) | "
                f"{highest_pspl.location if highest_pspl else 'N/D'}",
                value_style,
            ),
        ],
        [
            Paragraph("Maior PPV", label_style),
            Paragraph(
                f"{format_mm_s(highest_ppv.max_channel().ppv_mm_s if highest_ppv else None)} mm/s | "
                f"{highest_ppv.location if highest_ppv else 'N/D'}",
                value_style,
            ),
        ],
        [
            Paragraph("Maior PVS", label_style),
            Paragraph(
                f"{format_mm_s(highest_pvs.peak_vector_sum_mm_s if highest_pvs else None)} mm/s | "
                f"{highest_pvs.location if highest_pvs else 'N/D'}",
                value_style,
            ),
        ],
    ]

    table = Table(
        data,
        colWidths=[31 * mm, width - 31 * mm],
        rowHeights=[height / 4] * 4,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EAF5D7")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C9D1DA")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2.2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2.2),
                ("TOPPADDING", (0, 0), (-1, -1), 0.8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0.8),
            ]
        )
    )
    return table


def _draw_fit_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font_name: str,
    initial_size: float,
    min_size: float,
) -> None:
    font_size = initial_size
    while font_size > min_size and pdf.stringWidth(text, font_name, font_size) > max_width:
        font_size -= 0.2
    if pdf.stringWidth(text, font_name, font_size) > max_width:
        base_text = text
        while base_text and pdf.stringWidth(base_text + "...", font_name, font_size) > max_width:
            base_text = base_text[:-1]
        text = (base_text + "...") if base_text else "..."
    pdf.setFont(font_name, font_size)
    pdf.drawString(x, y, text)


def _build_pspl_chart(records: list[SismogramRecord]) -> io.BytesIO:
    chart_background = "#FFFFFF"
    grid_color = "#D7D7D7"
    axis_color = "#2E2E2E"
    limit_color = ENAEX_DARK_HEX
    marker_styles = [("o", ENAEX_DARK_HEX), ("s", "#2E86AB"), ("^", ENAEX_GREEN_HEX)]

    figure, axis = plt.subplots(figsize=(4.8, 3.0), dpi=320)
    figure.patch.set_facecolor(chart_background)
    axis.set_facecolor(chart_background)

    known_distances = [record.distance_m for record in records if record.distance_m is not None]
    x_limit = max(6000.0, math.ceil(max(known_distances, default=0.0) / 1000.0) * 1000.0)
    nd_position = x_limit + 650.0
    axis_max = nd_position + 500.0
    display_points = []
    for record_index, record in enumerate(records):
        if record.pspl_db_l is None:
            continue
        marker, color = marker_styles[record_index % len(marker_styles)]
        distance = record.distance_m if record.distance_m is not None else nd_position
        display_points.append((distance, record.pspl_db_l, _chart_label(record.location), color, marker))

    axis.set_xlim(0.0, axis_max)
    axis.set_ylim(0.0, 160.0)
    x_ticks = list(np.arange(0.0, x_limit + 1.0, 1000.0)) + [nd_position]
    x_labels = [str(int(value)) for value in np.arange(0.0, x_limit + 1.0, 1000.0)] + ["N/D"]
    axis.set_xticks(x_ticks, labels=x_labels)
    axis.set_yticks(np.arange(0.0, 161.0, 20.0))
    axis.grid(True, which="major", color=grid_color, linestyle=":", linewidth=0.8, alpha=0.9)
    axis.set_axisbelow(True)
    axis.spines["top"].set_visible(False)
    axis.spines["right"].set_visible(False)
    axis.spines["left"].set_color(axis_color)
    axis.spines["bottom"].set_color(axis_color)
    axis.spines["left"].set_linewidth(0.8)
    axis.spines["bottom"].set_linewidth(0.8)

    axis.tick_params(axis="both", labelsize=5.8, colors=axis_color, pad=3)
    axis.set_xlabel("Distância (m)", fontsize=6.4, color=axis_color, labelpad=10)
    axis.set_ylabel("Pressão Acústica (dB)", fontsize=6.4, color=axis_color, labelpad=10)
    axis.set_title(
        "Pressão Sonora x Distância - ABNT NBR 9653:2018",
        fontsize=6.8,
        color="#7A7A7A",
        pad=8,
    )

    axis.axhline(134.0, color=limit_color, linewidth=1.4, zorder=2)
    limit_box = {
        "boxstyle": "square,pad=0.30",
        "facecolor": chart_background,
        "edgecolor": "#111111",
        "linewidth": 0.6,
    }
    axis.annotate(
        "134",
        xy=(x_limit * 0.02, 134.0),
        xytext=(0, 0),
        textcoords="offset points",
        ha="center",
        va="center",
        fontsize=5.8,
        color="#666666",
        bbox=limit_box,
        zorder=5,
    )
    axis.annotate(
        "134",
        xy=(axis_max * 0.97, 134.0),
        xytext=(0, 0),
        textcoords="offset points",
        ha="center",
        va="center",
        fontsize=5.8,
        color="#666666",
        bbox=limit_box,
        zorder=5,
    )

    for distance, value, _label, color, marker in display_points:
        axis.scatter(
            distance,
            value,
            color=color,
            edgecolors="#FFFFFF",
            linewidths=0.35,
            s=40,
            marker=marker,
            zorder=4,
        )
    _draw_pspl_point_labels(
        axis,
        [(distance, value, f"{label}\n{format_pspl(value)} dB", color) for distance, value, label, color, _marker in display_points],
        axis_max,
    )
    figure.text(0.86, 0.05, "N/D = sem distancia no PDF", fontsize=4.8, color=axis_color, ha="right", va="center")

    image = io.BytesIO()
    figure.subplots_adjust(left=0.12, right=0.98, top=0.82, bottom=0.22)
    figure.savefig(image, format="png", transparent=False, facecolor=figure.get_facecolor())
    plt.close(figure)
    image.seek(0)
    return image


def _build_ppv_chart(records: list[SismogramRecord]) -> io.BytesIO:
    figure, axis = plt.subplots(figsize=(4.2, 3.0), dpi=320)
    curve_x = [4.0, 15.0, 40.0, 1000.0]
    curve_y = [15.0, 20.0, 50.0, 50.0]
    axis.plot(curve_x, curve_y, color=ENAEX_RED_HEX, linewidth=1.8)
    for guide_x in [4.0, 15.0, 40.0]:
        axis.axvline(guide_x, color=ENAEX_RED_HEX, linewidth=0.8, linestyle="--", alpha=0.35)
    for guide_y in [15.0, 20.0, 50.0]:
        axis.axhline(guide_y, color=ENAEX_RED_HEX, linewidth=0.8, linestyle="--", alpha=0.25)

    marker_styles = [("o", ENAEX_DARK_HEX), ("s", "#2E86AB"), ("^", ENAEX_GREEN_HEX)]
    plotted_points: list[tuple[float, float, str, str]] = []
    for index, record in enumerate(records):
        best_channel = record.max_channel()
        freq = _frequency_value(best_channel.zc_freq_hz)
        ppv = max(best_channel.ppv_mm_s or 0.0, PPV_Y_FLOOR)
        marker, color = marker_styles[index % len(marker_styles)]
        axis.scatter(freq, ppv, color=color, edgecolors="#FFFFFF", linewidths=0.35, s=40, marker=marker, zorder=4)
        plotted_points.append((freq, ppv, _chart_label(record.location), color))

    axis.set_xscale("log")
    axis.set_yscale("function", functions=(_ppv_y_forward, _ppv_y_inverse))
    axis.set_xlim(1.0, 1000.0)
    axis.set_ylim(PPV_Y_FLOOR, 60.0)
    axis.set_xticks([1, 4, 10, 15, 40, 100, 1000], labels=["1", "4", "10", "15", "40", "100", "1000"])
    axis.set_yticks(PPV_Y_TICKS)
    axis.yaxis.set_major_formatter(FuncFormatter(_format_ppv_y_tick))
    axis.tick_params(axis="x", labelsize=5.8)
    axis.tick_params(axis="y", labelsize=4.9)
    axis.grid(True, which="both", linestyle=":", alpha=0.35)
    axis.spines["top"].set_visible(False)
    axis.spines["right"].set_visible(False)
    axis.set_xlabel("Frequência (Hz)", fontsize=6.2)
    axis.set_ylabel("PPV (mm/s)", fontsize=6.2)
    _draw_ppv_point_labels(axis, plotted_points)
    axis.text(760, 52, "Limite ABNT", fontsize=5.6, color=ENAEX_RED_HEX, ha="right")

    image = io.BytesIO()
    figure.tight_layout(pad=0.25)
    figure.savefig(image, format="png", bbox_inches="tight", transparent=False)
    plt.close(figure)
    image.seek(0)
    return image


def _overview_lines(
    records: list[SismogramRecord],
    generated_at: datetime,
    status_text: str | None,
) -> list[str]:
    lines = [
        f"Data do evento: {_report_date_text(records)}",
        f"Cliente: {get_primary_client(records)}",
        f"Pontos monitorados: {len(records)} fontes de dados de sismógrafos de engenharia processadas com sucesso.",
    ]

    if status_text is not None:
        lines.append(status_text)
    return lines


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


def _report_date_text(records: list[SismogramRecord]) -> str:
    known_dates = [record.event_date for record in records if record.event_date is not None]
    if not known_dates:
        return "N/D"
    unique = sorted(set(known_dates))
    if len(unique) == 1:
        return format_date_br(unique[0])
    return f"{format_date_br(unique[0])} a {format_date_br(unique[-1])}"


def _overall_batch_compliance(records: list[SismogramRecord]) -> bool:
    states = [record.overall_compliant() for record in records]
    known_states = [state for state in states if state is not None]
    return bool(known_states) and all(known_states)


def _vibration_status_text(records: list[SismogramRecord], threshold_mm_s: float) -> str | None:
    if not records:
        return None
    if any_record_has_vibration_alert(records, threshold_mm_s):
        locations = ", ".join(vibration_alert_locations(records, threshold_mm_s))
        return f"⚠️ Índices de vibração: acima de {format_decimal(threshold_mm_s, 1)} mm/s. Pontos: {locations}."
    return f"✅ Índices de vibração: abaixo de {format_decimal(threshold_mm_s, 1)} mm/s."


def _chart_label(text: str) -> str:
    label = text.title()
    label = label.replace("Comunidade De ", "Com. ")
    label = label.replace("Barragem De ", "Barr. ")
    return _ellipsis(label, 18)


def _draw_ppv_point_labels(axis, points: list[tuple[float, float, str, str]]) -> None:
    for freq, ppv, label, color, label_x, label_y in _ppv_label_positions(points):
        axis.annotate(
            label,
            xy=(freq, ppv),
            xycoords="data",
            xytext=(label_x, label_y),
            textcoords="axes fraction",
            fontsize=5.2,
            color=color,
            ha="center",
            va="center",
            zorder=5,
            bbox={
                "boxstyle": "round,pad=0.18",
                "facecolor": "#FFFFFF",
                "edgecolor": color,
                "linewidth": 0.6,
                "alpha": 0.95,
            },
            arrowprops={
                "arrowstyle": "-",
                "color": color,
                "linewidth": 0.7,
                "alpha": 0.9,
                "shrinkA": 3,
                "shrinkB": 3,
                "connectionstyle": "angle3,angleA=90,angleB=0",
            },
            annotation_clip=False,
        )


def _draw_pspl_point_labels(axis, points: list[tuple[float, float, str, str]], axis_max: float) -> None:
    for distance, pspl, label, color, label_x, label_y in _pspl_label_positions(
        points,
        axis_max,
    ):
        axis.annotate(
            label,
            xy=(distance, pspl),
            xycoords="data",
            xytext=(label_x, label_y),
            textcoords="axes fraction",
            fontsize=5.2,
            color=color,
            ha="center",
            va="center",
            zorder=5,
            bbox={
                "boxstyle": "round,pad=0.18",
                "facecolor": "#FFFFFF",
                "edgecolor": color,
                "linewidth": 0.6,
                "alpha": 0.95,
            },
            arrowprops={
                "arrowstyle": "-",
                "color": color,
                "linewidth": 0.7,
                "alpha": 0.9,
                "shrinkA": 3,
                "shrinkB": 3,
                "connectionstyle": "angle3,angleA=90,angleB=0",
            },
            annotation_clip=False,
        )


def _pspl_label_positions(
    points: list[tuple[float, float, str, str]],
    axis_max: float,
) -> list[tuple[float, float, str, str, float, float]]:
    if not points:
        return []

    sorted_points = sorted(points, key=lambda item: item[0])
    count = len(sorted_points)
    min_x = 0.10
    max_x = 0.90
    min_gap = 0.22
    y_slots_by_count = {
        1: [0.82],
        2: [0.88, 0.76],
        3: [0.90, 0.80, 0.70],
    }
    y_slots = y_slots_by_count.get(count)
    if y_slots is None:
        y_slots = np.linspace(0.90, 0.70, count).tolist()

    desired_x = []
    for distance, _pspl, _label, _color in sorted_points:
        normalized_x = distance / max(axis_max, 1.0)
        desired_x.append(min(max(normalized_x, min_x), max_x))

    adjusted_x = desired_x[:]
    for index in range(1, count):
        adjusted_x[index] = max(adjusted_x[index], adjusted_x[index - 1] + min_gap)

    overflow = adjusted_x[-1] - max_x
    if overflow > 0:
        adjusted_x = [value - overflow for value in adjusted_x]
        for index in range(count - 2, -1, -1):
            adjusted_x[index] = min(adjusted_x[index], adjusted_x[index + 1] - min_gap)

    underflow = min_x - adjusted_x[0]
    if underflow > 0:
        adjusted_x = [value + underflow for value in adjusted_x]

    adjusted_x = [min(max(value, min_x), max_x) for value in adjusted_x]
    return [
        (distance, pspl, label, color, adjusted_x[index], y_slots[index])
        for index, (distance, pspl, label, color) in enumerate(sorted_points)
    ]


def _ppv_label_positions(
    points: list[tuple[float, float, str, str]],
) -> list[tuple[float, float, str, str, float, float]]:
    if not points:
        return []

    sorted_points = sorted(points, key=lambda item: item[0])
    count = len(sorted_points)
    min_x = 0.42
    max_x = 0.82
    min_gap = 0.19
    y_slots_by_count = {
        1: [0.10],
        2: [0.15, 0.08],
        3: [0.18, 0.12, 0.06],
    }
    y_slots = y_slots_by_count.get(count)
    if y_slots is None:
        y_slots = np.linspace(0.18, 0.06, count).tolist()

    log_min = math.log10(1.0)
    log_max = math.log10(1000.0)
    desired_x = []
    for freq, _ppv, _label, _color in sorted_points:
        normalized_x = (math.log10(max(freq, 1.0)) - log_min) / (log_max - log_min)
        desired_x.append(min(max(normalized_x, min_x), max_x))

    adjusted_x = desired_x[:]
    for index in range(1, count):
        adjusted_x[index] = max(adjusted_x[index], adjusted_x[index - 1] + min_gap)

    overflow = adjusted_x[-1] - max_x
    if overflow > 0:
        adjusted_x = [value - overflow for value in adjusted_x]
        for index in range(count - 2, -1, -1):
            adjusted_x[index] = min(adjusted_x[index], adjusted_x[index + 1] - min_gap)

    underflow = min_x - adjusted_x[0]
    if underflow > 0:
        adjusted_x = [value + underflow for value in adjusted_x]

    adjusted_x = [min(max(value, min_x), max_x) for value in adjusted_x]
    return [
        (freq, ppv, label, color, adjusted_x[index], y_slots[index])
        for index, (freq, ppv, label, color) in enumerate(sorted_points)
    ]


def _ellipsis(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def _frequency_value(value: float | str | None) -> float:
    if value is None:
        return 1.0
    if isinstance(value, str):
        text = value.strip()
        if text.startswith(">"):
            return 100.0
        try:
            return float(text.replace(",", "."))
        except ValueError:
            return 1.0
    return float(value)


def _format_ppv_y_tick(value: float, _position: float) -> str:
    if math.isclose(value, PPV_Y_FLOOR, rel_tol=0.0, abs_tol=1e-6):
        return "0,05"
    if math.isclose(value, PPV_Y_BREAK, rel_tol=0.0, abs_tol=1e-6):
        return "0,1"
    rounded = round(value)
    if math.isclose(value, rounded, rel_tol=0.0, abs_tol=1e-6) and rounded in PPV_Y_LABELS:
        return str(rounded)
    return ""


def _ppv_y_forward(values):
    scalar_input = np.isscalar(values)
    array = np.asarray(values, dtype=float)
    safe_low_values = np.clip(array, PPV_Y_FLOOR, PPV_Y_BREAK)
    transformed = np.where(
        array <= PPV_Y_BREAK,
        PPV_Y_LOW_BAND * np.log(safe_low_values / PPV_Y_FLOOR) / math.log(PPV_Y_BREAK / PPV_Y_FLOOR),
        array + PPV_Y_OFFSET,
    )
    if scalar_input:
        return float(transformed)
    return transformed


def _ppv_y_inverse(values):
    scalar_input = np.isscalar(values)
    array = np.asarray(values, dtype=float)
    restored = np.where(
        array <= PPV_Y_LOW_BAND,
        PPV_Y_FLOOR * np.exp((array / PPV_Y_LOW_BAND) * math.log(PPV_Y_BREAK / PPV_Y_FLOOR)),
        array - PPV_Y_OFFSET,
    )
    if scalar_input:
        return float(restored)
    return restored
