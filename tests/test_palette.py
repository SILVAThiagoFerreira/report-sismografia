from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_web_report_palette_replaces_blue_longitudinal_series():
    config = (ROOT / "docs" / "js" / "config.js").read_text(encoding="utf-8")
    charts = (ROOT / "docs" / "js" / "charts.js").read_text(encoding="utf-8")
    report = (ROOT / "docs" / "js" / "report.js").read_text(encoding="utf-8")

    assert 'series_longitudinal: "#38424B"' in config
    assert 'series_vertical: "#16A34A"' in config
    assert 'status_conforme: "#67C70A"' in config
    assert "COLORS.longitudinal" in charts
    assert "#1D4ED8" not in charts
    assert "#2D7DBF" not in charts
    assert "COLORS.dark" in report
    assert "COLORS.green" in report
