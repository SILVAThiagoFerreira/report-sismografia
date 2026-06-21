from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from sismo_report.config import load_runtime_config, resolve_input_directory
from sismo_report import generate_outputs, watch_inputs


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Gera relatório sismográfico em PDF e nota rápida a partir dos PDFs da pasta configurada.",
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="generate",
        choices=("generate", "watch"),
        help="generate: executa uma vez | watch: monitora a pasta e regenera automaticamente",
    )
    parser.add_argument("--inputs", default=None, help="Pasta com os PDFs de entrada")
    parser.add_argument("--outputs", default=None, help="Pasta para os arquivos gerados")
    parser.add_argument(
        "--logo",
        default=None,
        help="Caminho para a logo da OpenBlast",
    )
    parser.add_argument("--interval", type=int, default=None, help="Intervalo em segundos para o modo watch")
    parser.add_argument("--config", default=str(ROOT_DIR / "config.json"), help="Arquivo de configuração externo")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    runtime = load_runtime_config(ROOT_DIR, args.config)
    inputs_path = resolve_input_directory(runtime, args.inputs)
    outputs_path = Path(args.outputs) if args.outputs else runtime.output_dir
    logo_path = Path(args.logo) if args.logo else runtime.logo_path
    interval_seconds = args.interval if args.interval is not None else runtime.watch_interval_seconds

    if args.command == "watch":
        try:
            watch_inputs(
                inputs_path,
                outputs_path,
                logo_path,
                interval_seconds=interval_seconds,
                png_scale=runtime.report_png_scale,
                report_max_records=runtime.report_summary_record_limit,
                png_page_number=runtime.report_png_page_number,
                vibration_alert_threshold_mm_s=runtime.report_vibration_alert_threshold_mm_s,
            )
        except KeyboardInterrupt:
            print("\nMonitoramento encerrado.")
        return 0

    try:
        outputs = generate_outputs(
            inputs_path,
            outputs_path,
            logo_path,
            png_scale=runtime.report_png_scale,
            report_max_records=runtime.report_summary_record_limit,
            png_page_number=runtime.report_png_page_number,
            vibration_alert_threshold_mm_s=runtime.report_vibration_alert_threshold_mm_s,
        )
    except Exception as exc:
        print(f"Falha ao gerar relatório: {exc}")
        return 1

    print("Arquivos gerados:")
    for label, value in outputs.items():
        print(f"- {label}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
