from __future__ import annotations

import json
from pathlib import Path
import unittest


class SmokeTests(unittest.TestCase):
    def test_config_exists_and_has_required_sections(self) -> None:
        config_path = Path(__file__).resolve().parents[1] / "config.json"
        data = json.loads(config_path.read_text(encoding="utf-8"))

        self.assertIn("paths", data)
        self.assertIn("execution", data)
        self.assertIn("report", data)
        self.assertEqual(data["execution"]["default_command"], "generate")
        self.assertEqual(data["report"]["vibration_alert_threshold_mm_s"], 0.8)

    def test_main_parser_builds(self) -> None:
        root = Path(__file__).resolve().parents[1]
        import sys

        if str(root) not in sys.path:
            sys.path.insert(0, str(root))

        import main

        parser = main.build_parser()
        self.assertIsNotNone(parser.parse_args([]))

    def test_whatsapp_message_includes_vibration_status_above(self) -> None:
        root = Path(__file__).resolve().parents[1]
        import sys

        src = root / "src"
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))

        from datetime import date

        from sismo_report.models import ChannelReading, SismogramRecord
        from sismo_report.whatsapp import build_whatsapp_message

        record = SismogramRecord(
            source_pdf="/tmp/sample.pdf",
            location="Ponto 01",
            event_date=date(2026, 5, 13),
            pspl_db_l=120.0,
            pspl_compliant=True,
            peak_vector_sum_mm_s=0.9,
            channels={
                "Tran": ChannelReading(axis="Tran", ppv_mm_s=0.7, compliant=True),
                "Vert": ChannelReading(axis="Vert", ppv_mm_s=0.6, compliant=True),
                "Long": ChannelReading(axis="Long", ppv_mm_s=0.5, compliant=True),
            },
        )

        message = build_whatsapp_message([record], vibration_alert_threshold_mm_s=0.8)
        self.assertIn("⚠️ Índices de vibração: acima de 0,8 mm/s. Pontos: Ponto 01.", message)

    def test_whatsapp_message_includes_vibration_status_below(self) -> None:
        root = Path(__file__).resolve().parents[1]
        import sys

        src = root / "src"
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))

        from datetime import date

        from sismo_report.models import ChannelReading, SismogramRecord
        from sismo_report.whatsapp import build_whatsapp_message

        record = SismogramRecord(
            source_pdf="/tmp/sample.pdf",
            location="Ponto 01",
            event_date=date(2026, 5, 13),
            pspl_db_l=120.0,
            pspl_compliant=True,
            peak_vector_sum_mm_s=0.7,
            channels={
                "Tran": ChannelReading(axis="Tran", ppv_mm_s=0.6, compliant=True),
                "Vert": ChannelReading(axis="Vert", ppv_mm_s=0.5, compliant=True),
                "Long": ChannelReading(axis="Long", ppv_mm_s=0.4, compliant=True),
            },
        )

        message = build_whatsapp_message([record], vibration_alert_threshold_mm_s=0.8)
        self.assertIn("✅ Índices de vibração: abaixo de 0,8 mm/s.", message)

    def test_report_overview_lines_include_vibration_status_above(self) -> None:
        root = Path(__file__).resolve().parents[1]
        import sys

        src = root / "src"
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))

        from datetime import date, datetime

        from sismo_report.models import ChannelReading, SismogramRecord
        from sismo_report.report import _overview_lines, _vibration_status_text

        record = SismogramRecord(
            source_pdf="/tmp/sample.pdf",
            location="Ponto 01",
            event_date=date(2026, 5, 13),
            pspl_db_l=120.0,
            pspl_compliant=True,
            peak_vector_sum_mm_s=0.9,
            channels={
                "Tran": ChannelReading(axis="Tran", ppv_mm_s=0.7, compliant=True),
                "Vert": ChannelReading(axis="Vert", ppv_mm_s=0.6, compliant=True),
                "Long": ChannelReading(axis="Long", ppv_mm_s=0.5, compliant=True),
            },
        )

        status_text = _vibration_status_text([record], 0.8)
        lines = _overview_lines([record], datetime(2026, 5, 13), status_text)
        self.assertIn("⚠️ Índices de vibração: acima de 0,8 mm/s. Pontos: Ponto 01.", lines)

    def test_report_adds_appendix_page_for_extra_records(self) -> None:
        root = Path(__file__).resolve().parents[1]
        import sys
        import tempfile

        src = root / "src"
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))

        import fitz

        from datetime import date, datetime

        from sismo_report.models import ChannelReading, SismogramRecord
        from sismo_report.report import export_pdf_pages_as_png, generate_report

        def build_record(index: int) -> SismogramRecord:
            return SismogramRecord(
                source_pdf=f"/tmp/sample-{index}.pdf",
                location=f"Ponto {index:02d}",
                user_name="Cliente Exemplo",
                event_date=date(2026, 5, 15),
                pspl_db_l=120.0 + index,
                pspl_compliant=True,
                peak_vector_sum_mm_s=0.5 + (index * 0.05),
                distance_m=1000.0 + (index * 10.0),
                charge_kg=10.0 + index,
                channels={
                    "Tran": ChannelReading(axis="Tran", ppv_mm_s=0.5, zc_freq_hz=10.0, compliant=True),
                    "Vert": ChannelReading(axis="Vert", ppv_mm_s=0.4, zc_freq_hz=12.0, compliant=True),
                    "Long": ChannelReading(axis="Long", ppv_mm_s=0.3, zc_freq_hz=8.0, compliant=True),
                },
            )

        records = [build_record(index) for index in range(1, 5)]

        with tempfile.TemporaryDirectory() as tmpdir:
            pdf_path = Path(tmpdir) / "report.pdf"
            png_path = Path(tmpdir) / "report.png"
            generate_report(records, pdf_path, None, datetime(2026, 5, 15, 10, 30), max_records=3)

            with fitz.open(str(pdf_path)) as document:
                self.assertEqual(document.page_count, 2)
                self.assertIn("Ponto 04", document.load_page(1).get_text())

            exported = export_pdf_pages_as_png(pdf_path, png_path, page_numbers=(0, 1), scale=1.0)
            self.assertIn("png", exported)
            self.assertIn("png_p2", exported)
            self.assertTrue(exported["png"].exists())
            self.assertTrue(exported["png_p2"].exists())


if __name__ == "__main__":
    unittest.main()
