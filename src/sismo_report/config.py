from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class RuntimeConfig:
    project_root: Path
    config_path: Path
    input_dir: Path
    output_dir: Path
    logs_dir: Path
    legacy_input_dir: Path | None
    legacy_output_dir: Path | None
    logo_path: Path | None
    watch_interval_seconds: int
    report_summary_record_limit: int
    report_png_scale: float
    report_png_page_number: int
    report_vibration_alert_threshold_mm_s: float


def _resolve_path(project_root: Path, value: str | None) -> Path | None:
    if value is None:
        return None
    path = Path(value)
    return path if path.is_absolute() else project_root / path


def load_runtime_config(project_root: str | Path, config_path: str | Path) -> RuntimeConfig:
    root = Path(project_root).resolve()
    config_file = Path(config_path)
    if not config_file.is_absolute():
        config_file = root / config_file
    if not config_file.exists():
        raise FileNotFoundError(f"Arquivo de configuracao nao encontrado: {config_file}")

    data = json.loads(config_file.read_text(encoding="utf-8"))
    paths = data.get("paths", {})
    execution = data.get("execution", {})
    report = data.get("report", {})

    input_dir = _resolve_path(root, paths.get("input_dir")) or (root / "input")
    output_dir = _resolve_path(root, paths.get("output_dir")) or (root / "output")
    logs_dir = _resolve_path(root, paths.get("logs_dir")) or (root / "logs")

    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    runtime = RuntimeConfig(
        project_root=root,
        config_path=config_file,
        input_dir=input_dir,
        output_dir=output_dir,
        logs_dir=logs_dir,
        legacy_input_dir=_resolve_path(root, paths.get("legacy_input_dir")),
        legacy_output_dir=_resolve_path(root, paths.get("legacy_output_dir")),
        logo_path=_resolve_path(root, paths.get("logo_path")),
        watch_interval_seconds=int(execution.get("watch_interval_seconds", 5)),
        report_summary_record_limit=int(report.get("summary_record_limit", 3)),
        report_png_scale=float(report.get("png_scale", 6.0)),
        report_png_page_number=int(report.get("png_page_number", 0)),
        report_vibration_alert_threshold_mm_s=float(report.get("vibration_alert_threshold_mm_s", 0.8)),
    )
    return _validate_runtime_config(runtime)


def _validate_runtime_config(runtime: RuntimeConfig) -> RuntimeConfig:
    if runtime.watch_interval_seconds <= 0:
        raise ValueError("watch_interval_seconds deve ser maior que zero")
    if runtime.report_summary_record_limit <= 0:
        raise ValueError("summary_record_limit deve ser maior que zero")
    if runtime.report_png_scale <= 0:
        raise ValueError("png_scale deve ser maior que zero")
    if runtime.report_png_page_number < 0:
        raise ValueError("png_page_number nao pode ser negativo")
    if runtime.report_vibration_alert_threshold_mm_s <= 0:
        raise ValueError("vibration_alert_threshold_mm_s deve ser maior que zero")
    return runtime


def resolve_input_directory(runtime: RuntimeConfig, override: str | Path | None = None) -> Path:
    if override is not None:
        override_path = Path(override)
        if not override_path.is_absolute():
            override_path = runtime.project_root / override_path
        return override_path

    if any(runtime.input_dir.glob("*.pdf")):
        return runtime.input_dir

    if runtime.legacy_input_dir is not None and any(runtime.legacy_input_dir.glob("*.pdf")):
        return runtime.legacy_input_dir

    return runtime.input_dir
