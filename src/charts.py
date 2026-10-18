from __future__ import annotations

from pathlib import Path
from typing import Dict, List

import matplotlib.pyplot as plt
from matplotlib.ticker import MultipleLocator

from .artifacts import resolve_artifact_name
from .compliance import interpolate_limit
from .measurements import format_record_value


COLORS = {
    "dark": "#38424B",
    "red": "#E20613",
    "green": "#16A34A",
    "longitudinal": "#38424B",
    "vertical": "#16A34A",
    "gray": "#8A8F96",
    "guide": "#C4C7CB",
    "grid": "#B7BDC7",
    "grid_minor": "#D7DCE5",
    "box_edge": "#CBD5E1",
    "arrow": "#94A3B8",
    "white": "#FFFFFF",
}

FIGSIZE = (9.0, 5.0)


def _chart_style(config: Dict) -> Dict[str, float | tuple[float, float]]:
    """Return sizing tuned for both the standalone PNG and the embedded PDF chart."""
    chart_cfg = config.get("charts", {})
    return {
        "figsize": (
            float(chart_cfg.get("figure_width", FIGSIZE[0])),
            float(chart_cfg.get("figure_height", FIGSIZE[1])),
        ),
        "dpi": float(chart_cfg.get("figure_dpi", 220)),
        "title": float(chart_cfg.get("title_font_size", 11.0)),
        "axis": float(chart_cfg.get("axis_label_font_size", 9.0)),
        "tick": float(chart_cfg.get("tick_font_size", 8.0)),
        "legend": float(chart_cfg.get("legend_font_size", 8.0)),
        "annotation": float(chart_cfg.get("annotation_font_size", 8.0)),
        "marker": float(chart_cfg.get("marker_size", 48.0)),
    }


def _palette(config: Dict) -> Dict[str, str]:
    """Resolve chart colors from the shared branding palette.

    The longitudinal series intentionally uses Cinza Enaex instead of blue;
    the vertical series keeps its green distinction for chart readability.
    """
    palette = config.get("branding", {}).get("palette", {})
    return {
        **COLORS,
        "dark": palette.get("enaex_gray", COLORS["dark"]),
        "red": palette.get("series_transversal", palette.get("enaex_red", COLORS["red"])),
        "longitudinal": palette.get("series_longitudinal", palette.get("enaex_gray", COLORS["longitudinal"])),
        "vertical": palette.get("series_vertical", COLORS["vertical"]),
        "gray": palette.get("axis_gray", COLORS["gray"]),
        "guide": palette.get("guide", COLORS["guide"]),
        "green": palette.get("series_vertical", COLORS["green"]),
    }


def _safe_name(name: str) -> str:
    return str(name).replace("COMUNIDADE DE ", "Com. ").title()


def _annotation_candidates(x: float, xmid: float) -> List[tuple[float, float, str, str]]:
    """Retorna offsets candidatos em pontos, priorizando o lado mais livre do gráfico."""
    if x <= xmid:
        return [
            (14.0, 14.0, "left", "bottom"),
            (14.0, -18.0, "left", "top"),
            (-14.0, 14.0, "right", "bottom"),
            (-14.0, -18.0, "right", "top"),
            (24.0, 20.0, "left", "bottom"),
            (24.0, -24.0, "left", "top"),
            (-24.0, 20.0, "right", "bottom"),
            (-24.0, -24.0, "right", "top"),
        ]
    return [
        (-14.0, 14.0, "right", "bottom"),
        (-14.0, -18.0, "right", "top"),
        (14.0, 14.0, "left", "bottom"),
        (14.0, -18.0, "left", "top"),
        (-24.0, 20.0, "right", "bottom"),
        (-24.0, -24.0, "right", "top"),
        (24.0, 20.0, "left", "bottom"),
        (24.0, -24.0, "left", "top"),
    ]


def _estimate_text_box(text: str, fontsize: float, dpi: float, pad_px: float = 4.0) -> tuple[float, float]:
    lines = str(text).splitlines() or [""]
    max_chars = max((len(line) for line in lines), default=0)
    char_width = fontsize * dpi / 72.0 * 0.58
    line_height = fontsize * dpi / 72.0 * 1.18
    width = max_chars * char_width + pad_px * 2.0
    height = len(lines) * line_height + pad_px * 2.0
    return width, height


def _rect_overlap_area(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    x0 = max(a[0], b[0])
    y0 = max(a[1], b[1])
    x1 = min(a[2], b[2])
    y1 = min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return (x1 - x0) * (y1 - y0)


def _build_bbox(
    point_disp: tuple[float, float],
    text: str,
    fontsize: float,
    dpi: float,
    dx_pt: float,
    dy_pt: float,
    ha: str,
    va: str,
) -> tuple[float, float, float, float]:
    dx = dx_pt * dpi / 72.0
    dy = dy_pt * dpi / 72.0
    anchor_x = point_disp[0] + dx
    anchor_y = point_disp[1] + dy
    width, height = _estimate_text_box(text, fontsize, dpi)

    if ha == "center":
        x0 = anchor_x - width / 2.0
    elif ha == "right":
        x0 = anchor_x - width
    else:
        x0 = anchor_x

    if va == "center":
        y0 = anchor_y - height / 2.0
    elif va == "top":
        y0 = anchor_y - height
    else:
        y0 = anchor_y

    return (x0, y0, x0 + width, y0 + height)


def _pick_annotation(
    ax,
    x: float,
    y: float,
    text: str,
    used_boxes: List[tuple[float, float, float, float]],
    point_boxes: List[tuple[float, float, float, float]],
    current_index: int,
    fontsize: float,
    renderer,
) -> tuple[float, float, str, str]:
    point_disp = ax.transData.transform((x, y))
    xmid = sum(ax.get_xlim()) / 2.0
    axes_box = ax.get_window_extent(renderer=renderer)
    candidates = _annotation_candidates(x, xmid)

    best = None
    best_score = None
    for dx_pt, dy_pt, ha, va in candidates:
        bbox = _build_bbox(point_disp, text, fontsize, ax.figure.dpi, dx_pt, dy_pt, ha, va)
        overlap = sum(_rect_overlap_area(bbox, used) for used in used_boxes)
        # Um rótulo não pode esconder outro marcador. O próprio marcador
        # permanece permitido, pois a seta precisa sair dele.
        overlap += sum(
            _rect_overlap_area(bbox, point_box)
            for idx, point_box in enumerate(point_boxes)
            if idx != current_index
        )
        outside_penalty = 0.0
        if bbox[0] < axes_box.x0 - 4:
            outside_penalty += (axes_box.x0 - 4 - bbox[0]) * 4.0
        if bbox[1] < axes_box.y0 - 4:
            outside_penalty += (axes_box.y0 - 4 - bbox[1]) * 4.0
        if bbox[2] > axes_box.x1 + 4:
            outside_penalty += (bbox[2] - axes_box.x1 - 4) * 4.0
        if bbox[3] > axes_box.y1 + 4:
            outside_penalty += (bbox[3] - axes_box.y1 - 4) * 4.0
        score = overlap + outside_penalty
        if best is None or score < best_score:
            best = (dx_pt, dy_pt, ha, va)
            best_score = score
        if score == 0:
            return best

    return best if best is not None else candidates[0]


def _annotate_points(ax, items: List[Dict], fontsize: float = 6.2, colors: Dict[str, str] = COLORS) -> None:
    fig = ax.figure
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    used_boxes: List[tuple[float, float, float, float]] = []
    point_boxes = []
    marker_radius = 7.0
    for item in items:
        point_disp = ax.transData.transform((item.get("x"), item.get("y")))
        point_boxes.append(
            (
                point_disp[0] - marker_radius,
                point_disp[1] - marker_radius,
                point_disp[0] + marker_radius,
                point_disp[1] + marker_radius,
            )
        )

    for current_index, item in enumerate(items):
        x = item.get("x")
        y = item.get("y")
        text = item.get("text")
        if x is None or y is None or not text:
            continue
        dx_pt, dy_pt, ha, va = _pick_annotation(
            ax, x, y, text, used_boxes, point_boxes, current_index, fontsize, renderer
        )
        point_disp = ax.transData.transform((x, y))
        bbox = _build_bbox(point_disp, text, fontsize, fig.dpi, dx_pt, dy_pt, ha, va)
        used_boxes.append(bbox)
        # Rótulo direto no ponto, sem caixa nem seta: o texto já identifica o ponto.
        ax.annotate(
            text,
            (x, y),
            textcoords="offset points",
            xytext=(dx_pt, dy_pt),
            ha=ha,
            va=va,
            fontsize=fontsize,
            color=colors["dark"],
            linespacing=1.25,
            zorder=5,
        )


def _style_clean_axes(ax, colors: Dict[str, str], keep_left: bool = False) -> None:
    """Estilo do relatório: sem grade, sem moldura e com apenas uma linha de base fina."""
    ax.grid(False)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_visible(keep_left)
    ax.spines["bottom"].set_color(colors["gray"])
    ax.spines["bottom"].set_linewidth(0.6)
    if keep_left:
        ax.spines["left"].set_color(colors["gray"])
        ax.spines["left"].set_linewidth(0.6)
    ax.tick_params(axis="both", length=0, colors=colors["gray"], pad=4)
    ax.tick_params(axis="x", length=3, width=0.6)


def _legend_below(ax, style: Dict, handles=None, labels=None, ncol: int = 3):
    kwargs = dict(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=ncol, frameon=False, fontsize=style["legend"], handlelength=1.6, columnspacing=1.4)
    if handles is not None:
        return ax.legend(handles, labels, **kwargs)
    return ax.legend(**kwargs)


def make_pressure_chart(records: List[Dict], config: Dict, out_path: str | Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    colors = _palette(config)
    limit = float(config.get("limits", {}).get("sound_pressure_db", 134.0))
    chart_cfg = config.get("charts", {})
    style = _chart_style(config)

    xs = [r.get("gps_distance_m") for r in records if r.get("gps_distance_m") is not None and r.get("pspl_db") is not None]
    ys = [r.get("pspl_db") for r in records if r.get("gps_distance_m") is not None and r.get("pspl_db") is not None]
    max_x = max(xs) if xs else 1000
    x_max = max(max_x * 1.25, 2000)
    y_max = float(chart_cfg.get("pressure_y_max", 160.0))

    fig, ax = plt.subplots(figsize=style["figsize"], dpi=style["dpi"])
    ax.axhline(limit, color=colors["dark"], linewidth=1.4, label=f"Limite de {limit:g} dB")
    ax.scatter(xs, ys, s=style["marker"], color=colors["red"], label="Pressão sonora (dB)", zorder=3)

    label_items = []
    for idx, r in enumerate(sorted(records, key=lambda rec: (rec.get("gps_distance_m") is None, rec.get("gps_distance_m") or 0.0))):
        x = r.get("gps_distance_m")
        y = r.get("pspl_db")
        if x is None or y is None:
            continue
        label_items.append({
            "x": x,
            "y": y,
            "text": f"{_safe_name(r.get('point_name', 'Ponto'))}\n{format_record_value(r, 'pspl_db', 1)}",
            "index": idx,
        })

    ax.set_xlim(float(chart_cfg.get("pressure_x_min", 0.0)), x_max)
    ax.set_ylim(float(chart_cfg.get("pressure_y_min", 0.0)), y_max)
    ax.set_xlabel("Distância (m)", fontsize=style["axis"], labelpad=6, color=colors["gray"])
    ax.set_ylabel("Pressão acústica (dB)", fontsize=style["axis"], labelpad=6, color=colors["gray"])
    ax.tick_params(axis="both", labelsize=style["tick"])
    _style_clean_axes(ax, colors, keep_left=True)
    _legend_below(ax, style, ncol=2)
    # O posicionamento precisa ocorrer depois do layout final: tight_layout altera
    # a caixa do eixo e pode invalidar a detecção de colisões entre rótulos.
    fig.tight_layout(pad=1.2)
    _annotate_points(ax, label_items, fontsize=style["annotation"], colors=colors)
    fig.savefig(out_path, bbox_inches="tight", pad_inches=0.06, facecolor="white")
    plt.close(fig)
    return out_path


def _curve_points_for_xmax(curve, xmax):
    pts = sorted((float(x), float(y)) for x, y in curve)
    selected = []
    for x, y in pts:
        if x <= xmax:
            selected.append((x, y))
    if not selected or selected[-1][0] < xmax:
        selected.append((xmax, interpolate_limit(xmax, curve)))
    return selected


def make_vibration_chart(records: List[Dict], config: Dict, out_path: str | Path) -> Path:
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    colors = _palette(config)
    curve = config.get("limits", {}).get("nbr9653_curve", [[0, 15], [4, 15], [15, 20], [40, 50], [1000, 50]])
    chart_cfg = config.get("charts", {})
    style = _chart_style(config)
    y_tick_step = float(chart_cfg.get("vibration_y_tick_step", 0.1))
    use_broken_y = bool(chart_cfg.get("vibration_use_broken_y", True))
    focus_y_max = float(chart_cfg.get("vibration_y_focus_max", 1.0))

    axes = [
        ("Transversal", "tran_ppv_mm_s", "tran_freq_hz", "s", colors["red"]),
        ("Longitudinal", "long_ppv_mm_s", "long_freq_hz", "D", colors["longitudinal"]),
        ("Vertical", "vert_ppv_mm_s", "vert_freq_hz", "^", colors["vertical"]),
    ]
    freqs = []
    ppvs = []
    for r in records:
        for _, ppv_key, freq_key, _, _ in axes:
            if r.get(freq_key) is not None and r.get(ppv_key) is not None:
                freqs.append(r.get(freq_key))
                ppvs.append(r.get(ppv_key))
    max_freq = max(freqs) if freqs else 60.0
    max_ppv = max(ppvs) if ppvs else 1.0
    x_max = max(float(chart_cfg.get("vibration_x_max_minimum", 60.0)), max_freq * 1.35)
    y_max = max(float(chart_cfg.get("vibration_y_max_minimum", 60.0)), max_ppv * 1.35)

    curve_pts = _curve_points_for_xmax(curve, x_max)
    curve_ys = [p[1] for p in curve_pts]
    curve_y_min = min(curve_ys) if curve_ys else 15.0
    curve_y_max = max(curve_ys) if curve_ys else 50.0
    should_break_y = use_broken_y and max_ppv < curve_y_min * 0.25

    if should_break_y:
        y_focus_max = max(focus_y_max, max_ppv * 1.35, y_tick_step * 5)
        fig, (ax_top, ax) = plt.subplots(
            2,
            1,
            sharex=True,
            figsize=style["figsize"],
            dpi=style["dpi"],
            gridspec_kw={"height_ratios": [1.0, 1.25], "hspace": 0.08},
        )
        ax_top.plot([p[0] for p in curve_pts], [p[1] for p in curve_pts], color=colors["dark"], linewidth=1.4, label="Limite ABNT")
        ax_top.set_ylim(max(0.0, curve_y_min - 2.0), curve_y_max + 5.0)
        ax_top.set_xlim(float(chart_cfg.get("vibration_x_min", 0.0)), x_max)
        ax_top.tick_params(axis="both", labelsize=style["tick"])
        _style_clean_axes(ax_top, colors, keep_left=True)
        ax_top.spines["bottom"].set_visible(False)
        ax_top.tick_params(labelbottom=False)

        # Guias finos nos vértices da curva, preservando a leitura da NBR.
        top_y_min, top_y_max = ax_top.get_ylim()
        for x, y in curve_pts[1:-1]:
            if x <= x_max and top_y_min <= y <= top_y_max:
                ax.axvline(x, color=colors["guide"], linewidth=0.7, linestyle=(0, (3, 3)))
                ax_top.axvline(x, ymin=0, ymax=(y - top_y_min) / (top_y_max - top_y_min), color=colors["guide"], linewidth=0.7, linestyle=(0, (3, 3)))
                ax_top.axhline(y, xmin=0, xmax=x / x_max, color=colors["guide"], linewidth=0.7, linestyle=(0, (3, 3)))

        ax.set_ylim(float(chart_cfg.get("vibration_y_min", 0.0)), y_focus_max)
        _style_clean_axes(ax, colors, keep_left=True)

        d = 0.012
        kwargs = dict(transform=ax_top.transAxes, color=colors["gray"], clip_on=False, linewidth=0.6)
        ax_top.plot((-d, +d), (-d, +d), **kwargs)
        ax_top.plot((1 - d, 1 + d), (-d, +d), **kwargs)
        kwargs.update(transform=ax.transAxes)
        ax.plot((-d, +d), (1 - d, 1 + d), **kwargs)
        ax.plot((1 - d, 1 + d), (1 - d, 1 + d), **kwargs)
    else:
        fig, ax = plt.subplots(figsize=style["figsize"], dpi=style["dpi"])
        ax.plot([p[0] for p in curve_pts], [p[1] for p in curve_pts], color=colors["dark"], linewidth=1.4, label="Limite ABNT")

        # Guias finos nos vértices da curva.
        for x, y in curve_pts[1:-1]:
            if x <= x_max and y <= y_max:
                ax.axvline(x, ymin=0, ymax=y / y_max, color=colors["guide"], linewidth=0.7, linestyle=(0, (3, 3)))
                ax.axhline(y, xmin=0, xmax=x / x_max, color=colors["guide"], linewidth=0.7, linestyle=(0, (3, 3)))
        ax.set_ylim(float(chart_cfg.get("vibration_y_min", 0.0)), y_max)
        _style_clean_axes(ax, colors, keep_left=True)

    for label, ppv_key, freq_key, marker, color in axes:
        xs, ys = [], []
        for r in records:
            if r.get(freq_key) is not None and r.get(ppv_key) is not None:
                xs.append(r.get(freq_key))
                ys.append(r.get(ppv_key))
        ax.scatter(xs, ys, s=style["marker"], marker=marker, color=color, label=f"{label} (mm/s)", zorder=4)

    # Anota apenas o maior eixo de cada ponto para manter o gráfico limpo.
    label_items = []
    for idx, r in enumerate(sorted(records, key=lambda rec: (rec.get("evaluation", {}).get("ppv_max_freq_hz") is None, rec.get("evaluation", {}).get("ppv_max_freq_hz") or 0.0))):
        ev = r.get("evaluation", {})
        freq = ev.get("ppv_max_freq_hz")
        ppv = ev.get("ppv_max_mm_s")
        if freq is None or ppv is None:
            continue
        label_items.append({
            "x": freq,
            "y": ppv,
            "text": (
                f"{_safe_name(r.get('point_name', 'Ponto'))}\n"
                f"{format_record_value(r, {'Tran': 'tran_ppv_mm_s', 'Vert': 'vert_ppv_mm_s', 'Long': 'long_ppv_mm_s'}.get(ev.get('ppv_max_axis'), 'tran_ppv_mm_s'), 3)}"
            ),
            "index": idx,
        })

    ax.set_xlim(float(chart_cfg.get("vibration_x_min", 0.0)), x_max)
    if y_tick_step > 0:
        if should_break_y:
            ax.yaxis.set_major_locator(MultipleLocator(y_tick_step))
        else:
            ax.yaxis.set_minor_locator(MultipleLocator(y_tick_step))
        if not should_break_y and y_max <= 5:
            ax.yaxis.set_major_locator(MultipleLocator(y_tick_step))
    ax.set_xlabel("Frequência (Hz)", fontsize=style["axis"], labelpad=6, color=colors["gray"])
    ax.set_ylabel("PPV (mm/s)", fontsize=style["axis"], labelpad=6, color=colors["gray"])
    ax.tick_params(axis="both", labelsize=style["tick"])
    if should_break_y:
        handles_top, labels_top = ax_top.get_legend_handles_labels()
        handles_bottom, labels_bottom = ax.get_legend_handles_labels()
        _legend_below(ax, style, handles=handles_top + handles_bottom, labels=labels_top + labels_bottom, ncol=4)
        fig.subplots_adjust(left=0.10, right=0.97, top=0.88, bottom=0.22, hspace=0.08)
    else:
        _legend_below(ax, style, ncol=4)
        fig.tight_layout(pad=1.2)
    # Mantém a mesma ordem: primeiro fixa a geometria final, depois calcula
    # caixas de rótulos e escolhe posições sem sobreposição.
    _annotate_points(ax, label_items, fontsize=style["annotation"], colors=colors)
    fig.savefig(out_path, bbox_inches="tight", pad_inches=0.06, facecolor="white")
    plt.close(fig)
    return out_path


def make_all_charts(records: List[Dict], config: Dict, out_dir: str | Path, artifact_context: Dict[str, str]) -> Dict[str, str]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    pressure_name = resolve_artifact_name(config, "pressure_chart", artifact_context)
    vibration_name = resolve_artifact_name(config, "vibration_chart", artifact_context)
    pressure = make_pressure_chart(records, config, out_dir / pressure_name)
    vibration = make_vibration_chart(records, config, out_dir / vibration_name)
    return {"pressure_chart": str(pressure), "vibration_chart": str(vibration)}
