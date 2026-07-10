// Port de src/charts.py em Canvas 2D. Replica dimensões matplotlib
// (FIGSIZE 6.5×4.55 in × 220 DPI) para que os PNGs entrem no PDF com o
// mesmo aspect ratio esperado por _draw_chart_card.
(() => {
  const COLORS = {
    dark: "#2F3440",
    red: "#E30613",
    green: "#67C70A",
    blue: "#2D7DBF",
    gray: "#6B7280",
    grid: "#B7BDC7",
    gridMinor: "#D7DCE5",
    boxEdge: "#CBD5E1",
    arrow: "#94A3B8",
  };

  const DPI = 220;
  // Mantemos a proporção vertical do renderer Python (matplotlib 6.5×4.55in).
  // A versão anterior reduzia a figura para 2.9in de altura e achatava a área
  // dos eixos quando o PNG era encaixado no cartão A4.
  const FIG_W_IN = 6.5;
  const FIG_H_IN = 4.55;
  const CANVAS_W = Math.round(FIG_W_IN * DPI); // 1430
  const CANVAS_H = Math.round(FIG_H_IN * DPI); // 1001

  // Layout dos "axes" dentro da figura (fração da figura), reservando espaço
  // para título, rótulos e legenda externa como no renderer Python.
  const AX_MARGIN = {
    left: 0.09,
    right: 0.79, // deixa espaço para a legenda externa
    top: 0.86,
    bottom: 0.18,
  };

  // ------- helpers gerais -------

  const safeName = (name) => {
    let s = String(name).replace("COMUNIDADE DE ", "Com. ");
    // Python str.title() capitaliza cada palavra; imitamos com regex de word-boundary Unicode.
    s = s
      .toLocaleLowerCase("pt-BR")
      .replace(/([\p{L}\p{N}]+)/gu, (w) => w[0].toLocaleUpperCase("pt-BR") + w.slice(1));
    return s;
  };

  // Pixel-space: origem no topo-esquerda, y cresce pra baixo (Canvas 2D).
  // Vamos manter uma classe leve de axes com transformação data→pixel.
  class Axes {
    constructor(ctx, box, xLim, yLim) {
      this.ctx = ctx;
      // box = { x, y, w, h } em pixels do canvas
      this.box = box;
      this.xLim = xLim; // [xMin, xMax]
      this.yLim = yLim; // [yMin, yMax]
    }
    xToPx(x) {
      const [x0, x1] = this.xLim;
      return this.box.x + ((x - x0) / (x1 - x0)) * this.box.w;
    }
    yToPx(y) {
      const [y0, y1] = this.yLim;
      // No matplotlib, y cresce para cima; convertemos.
      return this.box.y + this.box.h - ((y - y0) / (y1 - y0)) * this.box.h;
    }
  }

  const fillText = (ctx, text, x, y, opts = {}) => {
    ctx.save();
    ctx.fillStyle = opts.color || COLORS.dark;
    const size = opts.size || 12;
    const weight = opts.bold ? "600" : "400";
    ctx.font = `${weight} ${size}px "IBM Plex Sans", "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    if (opts.rotate) {
      ctx.translate(x, y);
      ctx.rotate(opts.rotate);
      ctx.fillText(text, 0, 0);
    } else {
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  };

  const measureText = (ctx, text, size, bold = false) => {
    ctx.save();
    const weight = bold ? "600" : "400";
    ctx.font = `${weight} ${size}px "IBM Plex Sans", "Segoe UI", Arial, sans-serif`;
    const m = ctx.measureText(text);
    const w = m.width;
    const h = (m.actualBoundingBoxAscent || size * 0.8) + (m.actualBoundingBoxDescent || size * 0.2);
    ctx.restore();
    return { w, h };
  };

  const drawGrid = (ax, opts = {}) => {
    const { ctx, box, xLim, yLim } = ax;
    const xTicks = opts.xTicks || niceTicks(xLim[0], xLim[1], 8);
    const yTicks = opts.yTicks || niceTicks(yLim[0], yLim[1], 8);

    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.77; // ~= 0.35pt @ 220 DPI
    ctx.globalAlpha = 0.9;
    for (const x of xTicks) {
      const px = ax.xToPx(x);
      ctx.beginPath();
      ctx.moveTo(px, box.y);
      ctx.lineTo(px, box.y + box.h);
      ctx.stroke();
    }
    for (const y of yTicks) {
      const py = ax.yToPx(y);
      ctx.beginPath();
      ctx.moveTo(box.x, py);
      ctx.lineTo(box.x + box.w, py);
      ctx.stroke();
    }
    ctx.restore();

    // Rótulos e ticks nos eixos.
    ctx.save();
    ctx.strokeStyle = COLORS.dark;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.stroke();
    ctx.restore();

    for (const x of xTicks) {
      const px = ax.xToPx(x);
      fillText(ctx, formatTickNumber(x), px, box.y + box.h + 22, {
        size: 13,
        color: COLORS.dark,
        align: "center",
      });
    }
    for (const y of yTicks) {
      const py = ax.yToPx(y);
      fillText(ctx, formatTickNumber(y), box.x - 10, py + 5, {
        size: 13,
        color: COLORS.dark,
        align: "right",
      });
    }
  };

  const drawMinorGrid = (ax, yStep) => {
    if (!yStep) return;
    const { ctx, box, yLim } = ax;
    ctx.save();
    ctx.strokeStyle = COLORS.gridMinor;
    ctx.lineWidth = 0.44;
    ctx.globalAlpha = 0.35;
    const start = Math.ceil(yLim[0] / yStep) * yStep;
    for (let y = start; y <= yLim[1] + 1e-9; y += yStep) {
      const py = ax.yToPx(y);
      ctx.beginPath();
      ctx.moveTo(box.x, py);
      ctx.lineTo(box.x + box.w, py);
      ctx.stroke();
    }
    ctx.restore();
  };

  const niceTicks = (min, max, target = 8) => {
    if (min === max) return [min];
    const span = max - min;
    const rough = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3) step = 2 * mag;
    else if (norm < 7) step = 5 * mag;
    else step = 10 * mag;
    const start = Math.ceil(min / step) * step;
    const ticks = [];
    for (let t = start; t <= max + step * 0.0001; t += step) {
      ticks.push(Number(t.toFixed(10)));
    }
    return ticks;
  };

  const formatTickNumber = (n) => {
    if (Math.abs(n) >= 1000) return String(Math.round(n));
    if (Number.isInteger(n)) return String(n);
    // Locale pt-BR: separador decimal por vírgula.
    return n
      .toFixed(Math.max(0, 2 - Math.floor(Math.log10(Math.max(Math.abs(n), 1e-9)))))
      .replace(/0+$/, "")
      .replace(/\.$/, "")
      .replace(".", ",");
  };

  const drawTitle = (ctx, text, x, y) => {
    fillText(ctx, text, x, y, {
      size: 18,
      bold: true,
      color: COLORS.dark,
      align: "center",
    });
  };

  const drawAxisLabels = (ctx, box, xLabel, yLabel) => {
    fillText(ctx, xLabel, box.x + box.w / 2, box.y + box.h + 60, {
      size: 15,
      color: COLORS.dark,
      align: "center",
    });
    fillText(ctx, yLabel, box.x - 55, box.y + box.h / 2, {
      size: 15,
      color: COLORS.dark,
      align: "center",
      rotate: -Math.PI / 2,
    });
  };

  const drawScatter = (ax, xs, ys, marker, color, size = 32) => {
    const { ctx } = ax;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const r = Math.sqrt(size) * 1.6;
    for (let i = 0; i < xs.length; i++) {
      const px = ax.xToPx(xs[i]);
      const py = ax.yToPx(ys[i]);
      ctx.beginPath();
      if (marker === "s") {
        ctx.rect(px - r, py - r, 2 * r, 2 * r);
      } else if (marker === "D") {
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py);
        ctx.lineTo(px, py + r);
        ctx.lineTo(px - r, py);
        ctx.closePath();
      } else if (marker === "^") {
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py + r);
        ctx.lineTo(px - r, py + r);
        ctx.closePath();
      } else {
        ctx.arc(px, py, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  };

  const drawLimitLine = (ax, y, label) => {
    const { ctx, box } = ax;
    const py = ax.yToPx(y);
    ctx.save();
    ctx.strokeStyle = COLORS.dark;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(box.x, py);
    ctx.lineTo(box.x + box.w, py);
    ctx.stroke();
    ctx.restore();
  };

  const drawCurve = (ax, pts, color, lineWidth = 3.5) => {
    const { ctx } = ax;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      const px = ax.xToPx(x);
      const py = ax.yToPx(y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  };

  const drawGuideLine = (ax, x0, y0, x1, y1) => {
    const { ctx } = ax;
    ctx.save();
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([10, 8]);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(ax.xToPx(x0), ax.yToPx(y0));
    ctx.lineTo(ax.xToPx(x1), ax.yToPx(y1));
    ctx.stroke();
    ctx.restore();
  };

  // ------- anotações de pontos (colisão-aware) -------

  const annotationCandidates = (x, xmid) => {
    if (x <= xmid) {
      return [
        [14, 14, "left", "bottom"],
        [14, -18, "left", "top"],
        [-14, 14, "right", "bottom"],
        [-14, -18, "right", "top"],
        [24, 20, "left", "bottom"],
        [24, -24, "left", "top"],
        [-24, 20, "right", "bottom"],
        [-24, -24, "right", "top"],
      ];
    }
    return [
      [-14, 14, "right", "bottom"],
      [-14, -18, "right", "top"],
      [14, 14, "left", "bottom"],
      [14, -18, "left", "top"],
      [-24, 20, "right", "bottom"],
      [-24, -24, "right", "top"],
      [24, 20, "left", "bottom"],
      [24, -24, "left", "top"],
    ];
  };

  const buildBbox = (ax, x, y, text, fontsize, dxPt, dyPt, ha, va) => {
    // matplotlib usa offset em pontos (1 pt = DPI/72 px). O y positivo em matplotlib
    // é para cima, então na tela do canvas invertemos o sinal do dy.
    const pxPerPt = DPI / 72;
    const anchorX = ax.xToPx(x) + dxPt * pxPerPt;
    const anchorY = ax.yToPx(y) - dyPt * pxPerPt;
    const { w, h } = measureText(ax.ctx, text.split("\n").reduce((a, b) => (b.length > a.length ? b : a)), fontsize);
    const lines = text.split("\n");
    const boxH = lines.length * fontsize * 1.18 + 8;
    const boxW = w + 8;
    let x0;
    if (ha === "center") x0 = anchorX - boxW / 2;
    else if (ha === "right") x0 = anchorX - boxW;
    else x0 = anchorX;
    let y0;
    if (va === "center") y0 = anchorY - boxH / 2;
    else if (va === "top") y0 = anchorY - boxH;
    else y0 = anchorY - boxH; // "bottom" no matplotlib = a baseline mais alta, texto acima
    return { x0, y0, x1: x0 + boxW, y1: y0 + boxH };
  };

  const rectOverlap = (a, b) => {
    const x0 = Math.max(a.x0, b.x0);
    const y0 = Math.max(a.y0, b.y0);
    const x1 = Math.min(a.x1, b.x1);
    const y1 = Math.min(a.y1, b.y1);
    if (x1 <= x0 || y1 <= y0) return 0;
    return (x1 - x0) * (y1 - y0);
  };

  const pickAnnotation = (ax, x, y, text, used, fontsize) => {
    const xmid = (ax.xLim[0] + ax.xLim[1]) / 2;
    const cands = annotationCandidates(x, xmid);
    const axesBox = { x0: ax.box.x, y0: ax.box.y, x1: ax.box.x + ax.box.w, y1: ax.box.y + ax.box.h };
    let best = null;
    let bestScore = Infinity;
    for (const [dx, dy, ha, va] of cands) {
      const bbox = buildBbox(ax, x, y, text, fontsize, dx, dy, ha, va);
      let overlap = 0;
      for (const u of used) overlap += rectOverlap(bbox, u);
      let outside = 0;
      if (bbox.x0 < axesBox.x0 - 4) outside += (axesBox.x0 - 4 - bbox.x0) * 4;
      if (bbox.y0 < axesBox.y0 - 4) outside += (axesBox.y0 - 4 - bbox.y0) * 4;
      if (bbox.x1 > axesBox.x1 + 4) outside += (bbox.x1 - axesBox.x1 - 4) * 4;
      if (bbox.y1 > axesBox.y1 + 4) outside += (bbox.y1 - axesBox.y1 - 4) * 4;
      const score = overlap + outside;
      if (score < bestScore) {
        bestScore = score;
        best = { dx, dy, ha, va, bbox };
      }
      if (score === 0) break;
    }
    return best;
  };

  const annotatePoints = (ax, items, fontsize) => {
    const used = [];
    const pxPerPt = DPI / 72;
    for (const item of items) {
      const { x, y, text } = item;
      if (x == null || y == null || !text) continue;
      const pick = pickAnnotation(ax, x, y, text, used, fontsize);
      if (!pick) continue;
      used.push(pick.bbox);
      const { dx, dy, ha, va, bbox } = pick;
      const anchorX = ax.xToPx(x) + dx * pxPerPt;
      const anchorY = ax.yToPx(y) - dy * pxPerPt;

      // Caixa branca com borda cinza clara.
      const { ctx } = ax;
      ctx.save();
      ctx.fillStyle = "#FFFFFF";
      ctx.strokeStyle = COLORS.boxEdge;
      ctx.lineWidth = 1.2;
      roundRect(ctx, bbox.x0, bbox.y0, bbox.x1 - bbox.x0, bbox.y1 - bbox.y0, 6);
      ctx.fill();
      ctx.stroke();

      // Linha do ponto até a caixa.
      ctx.strokeStyle = COLORS.arrow;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(ax.xToPx(x), ax.yToPx(y));
      const cx = (bbox.x0 + bbox.x1) / 2;
      const cy = (bbox.y0 + bbox.y1) / 2;
      ctx.lineTo(cx, cy);
      ctx.stroke();
      ctx.restore();

      // Texto (multiline centralizado).
      const lines = text.split("\n");
      const lineH = fontsize * 1.18;
      let ty = bbox.y0 + 4 + fontsize; // baseline da primeira linha
      const tx = (bbox.x0 + bbox.x1) / 2;
      for (const line of lines) {
        fillText(ctx, line, tx, ty, {
          size: fontsize,
          color: COLORS.gray,
          align: "center",
        });
        ty += lineH;
      }
    }
  };

  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const drawLegend = (ctx, entries, x, y) => {
    const size = 13;
    ctx.save();
    let ty = y;
    for (const { label, color, marker, isLine } of entries) {
      // ícone
      const cx = x + 12;
      const cy = ty - size / 2 + 2;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      if (isLine) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(x + 24, cy);
        ctx.stroke();
      } else if (marker === "s") {
        ctx.fillRect(cx - 6, cy - 6, 12, 12);
      } else if (marker === "D") {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx + 7, cy);
        ctx.lineTo(cx, cy + 7);
        ctx.lineTo(cx - 7, cy);
        ctx.closePath();
        ctx.fill();
      } else if (marker === "^") {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 7);
        ctx.lineTo(cx + 7, cy + 7);
        ctx.lineTo(cx - 7, cy + 7);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      fillText(ctx, label, x + 32, ty, { size, color: COLORS.dark });
      ty += size + 8;
    }
    ctx.restore();
  };

  // ------- chart 1: pressão sonora -------

  const makePressureChart = (records, config) => {
    const chartCfg = config.charts || {};
    const limits = config.limits || {};
    const limit = Number(limits.sound_pressure_db ?? 134);

    const canvas = createCanvas(CANVAS_W, CANVAS_H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const filtered = records.filter(
      (r) => r.gps_distance_m != null && r.pspl_db != null
    );
    const xs = filtered.map((r) => r.gps_distance_m);
    const ys = filtered.map((r) => r.pspl_db);
    const maxX = xs.length ? Math.max(...xs) : 1000;
    const xMax = Math.max(maxX * 1.25, 2000);
    const yMax = Number(chartCfg.pressure_y_max ?? 160);
    const xMin = Number(chartCfg.pressure_x_min ?? 0);
    const yMin = Number(chartCfg.pressure_y_min ?? 0);

    const box = {
      x: CANVAS_W * AX_MARGIN.left,
      y: CANVAS_H * (1 - AX_MARGIN.top),
      w: CANVAS_W * (AX_MARGIN.right - AX_MARGIN.left),
      h: CANVAS_H * (AX_MARGIN.top - AX_MARGIN.bottom),
    };
    const ax = new Axes(ctx, box, [xMin, xMax], [yMin, yMax]);

    drawTitle(
      ctx,
      "Pressão Sonora em Eventos Sismográficos - ABNT NBR 9653:2018",
      box.x + box.w / 2,
      box.y - 20
    );
    drawGrid(ax);
    drawAxisLabels(ctx, box, "Distância (m)", "Pressão Acústica (dB)");
    drawLimitLine(ax, limit);
    drawScatter(ax, xs, ys, "o", COLORS.red, 40);

    // Anotações
    const sorted = [...filtered].sort(
      (a, b) => (a.gps_distance_m ?? 0) - (b.gps_distance_m ?? 0)
    );
    const items = sorted.map((r) => ({
      x: r.gps_distance_m,
      y: r.pspl_db,
      text: `${safeName(r.point_name || "Ponto")}\n${r.pspl_db.toFixed(1).replace(".", ",")}`,
    }));
    annotatePoints(ax, items, 13);

    drawLegend(
      ctx,
      [
        { label: `Limite de ${limit} dB`, color: COLORS.dark, isLine: true },
        { label: "Pressão Sonora (dB)", color: COLORS.red, marker: "o" },
      ],
      box.x + box.w + 20,
      box.y + box.h / 2 - 20
    );

    return canvas;
  };

  // ------- chart 2: vibração NBR 9653 -------

  const curvePointsForXmax = (curve, xmax) => {
    const pts = [...curve]
      .map(([x, y]) => [Number(x), Number(y)])
      .sort((a, b) => a[0] - b[0]);
    const selected = pts.filter(([x]) => x <= xmax);
    if (
      selected.length === 0 ||
      selected[selected.length - 1][0] < xmax
    ) {
      selected.push([xmax, window.SismoCompliance.interpolateLimit(xmax, curve)]);
    }
    return selected;
  };

  const makeVibrationChart = (records, config) => {
    const chartCfg = config.charts || {};
    const limits = config.limits || {};
    const curve = limits.nbr9653_curve || [
      [0, 15], [4, 15], [15, 20], [40, 50], [1000, 50],
    ];
    const yTickStep = Number(chartCfg.vibration_y_tick_step ?? 0.1);
    const useBrokenY = chartCfg.vibration_use_broken_y !== false;
    const focusYMax = Number(chartCfg.vibration_y_focus_max ?? 1.0);

    const axesDefs = [
      { label: "Transversal", ppvKey: "tran_ppv_mm_s", freqKey: "tran_freq_hz", marker: "s", color: COLORS.red },
      { label: "Longitudinal", ppvKey: "long_ppv_mm_s", freqKey: "long_freq_hz", marker: "D", color: "#1D4ED8" },
      { label: "Vertical", ppvKey: "vert_ppv_mm_s", freqKey: "vert_freq_hz", marker: "^", color: "#16A34A" },
    ];

    const freqs = [];
    const ppvs = [];
    for (const r of records) {
      for (const a of axesDefs) {
        if (r[a.freqKey] != null && r[a.ppvKey] != null) {
          freqs.push(r[a.freqKey]);
          ppvs.push(r[a.ppvKey]);
        }
      }
    }
    const maxFreq = freqs.length ? Math.max(...freqs) : 60;
    const maxPpv = ppvs.length ? Math.max(...ppvs) : 1;
    const xMax = Math.max(
      Number(chartCfg.vibration_x_max_minimum ?? 60),
      maxFreq * 1.35
    );
    const yMax = Math.max(
      Number(chartCfg.vibration_y_max_minimum ?? 60),
      maxPpv * 1.35
    );

    const curvePts = curvePointsForXmax(curve, xMax);
    const curveYs = curvePts.map((p) => p[1]);
    const curveYMin = curveYs.length ? Math.min(...curveYs) : 15;
    const curveYMax = curveYs.length ? Math.max(...curveYs) : 50;
    const shouldBreakY = useBrokenY && maxPpv < curveYMin * 0.25;

    const canvas = createCanvas(CANVAS_W, CANVAS_H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const xMin = Number(chartCfg.vibration_x_min ?? 0);
    const yMinFocus = Number(chartCfg.vibration_y_min ?? 0);

    const outerLeft = CANVAS_W * AX_MARGIN.left;
    const outerRight = CANVAS_W * AX_MARGIN.right;
    const outerTop = CANVAS_H * (1 - AX_MARGIN.top);
    const outerBottom = CANVAS_H * (1 - AX_MARGIN.bottom);
    const outerW = outerRight - outerLeft;
    const outerH = outerBottom - outerTop;

    let axTop = null;
    let axBottom;
    if (shouldBreakY) {
      const gap = 12;
      const topRatio = 1.0 / (1.0 + 1.25);
      const topH = outerH * topRatio - gap / 2;
      const bottomH = outerH * (1 - topRatio) - gap / 2;
      const yFocusMax = Math.max(focusYMax, maxPpv * 1.35, yTickStep * 5);
      axTop = new Axes(
        ctx,
        { x: outerLeft, y: outerTop, w: outerW, h: topH },
        [xMin, xMax],
        [Math.max(0, curveYMin - 2), curveYMax + 5]
      );
      axBottom = new Axes(
        ctx,
        { x: outerLeft, y: outerTop + topH + gap, w: outerW, h: bottomH },
        [xMin, xMax],
        [yMinFocus, yFocusMax]
      );
    } else {
      axBottom = new Axes(
        ctx,
        { x: outerLeft, y: outerTop, w: outerW, h: outerH },
        [xMin, xMax],
        [yMinFocus, yMax]
      );
    }

    // Título (uma vez, acima do axTop se broken).
    const titleY = (axTop || axBottom).box.y - 20;
    drawTitle(
      ctx,
      "Vibração em Eventos Sismográficos - ABNT NBR 9653:2018",
      (axTop || axBottom).box.x + (axTop || axBottom).box.w / 2,
      titleY
    );

    // Grid + curva NBR no top.
    if (axTop) {
      drawGrid(axTop, { yTicks: niceTicks(axTop.yLim[0], axTop.yLim[1], 5) });
      drawCurve(axTop, curvePts, COLORS.dark, 3.5);
      // Guias vermelhas dos pontos internos da curva no top.
      for (const [x, y] of curvePts.slice(1, -1)) {
        if (x <= xMax && y >= axTop.yLim[0] && y <= axTop.yLim[1]) {
          // linha vertical do eixo até o ponto
          drawGuideLine(axTop, x, axTop.yLim[0], x, y);
          // linha horizontal do eixo Y até o ponto
          drawGuideLine(axTop, xMin, y, x, y);
        }
      }
      // Marca da quebra: dois traços diagonais na borda inferior do axTop.
      const d = 12;
      const y = axTop.box.y + axTop.box.h;
      ctx.save();
      ctx.strokeStyle = COLORS.dark;
      ctx.lineWidth = 2;
      for (const cx of [axTop.box.x, axTop.box.x + axTop.box.w]) {
        ctx.beginPath();
        ctx.moveTo(cx - d, y - d);
        ctx.lineTo(cx + d, y + d);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Grid + pontos de scatter no axBottom.
    drawGrid(axBottom);
    if (yTickStep > 0) {
      drawMinorGrid(axBottom, yTickStep);
    }

    // Guias vermelhas da curva NBR também no axBottom.
    if (axTop) {
      for (const [x, y] of curvePts.slice(1, -1)) {
        if (x <= xMax && y >= axTop.yLim[0] && y <= axTop.yLim[1]) {
          // vertical do axBottom pega toda a altura visível.
          drawGuideLine(axBottom, x, axBottom.yLim[0], x, axBottom.yLim[1]);
        }
      }
      // A marca de quebra também no axBottom (topo).
      const d = 12;
      const y = axBottom.box.y;
      ctx.save();
      ctx.strokeStyle = COLORS.dark;
      ctx.lineWidth = 2;
      for (const cx of [axBottom.box.x, axBottom.box.x + axBottom.box.w]) {
        ctx.beginPath();
        ctx.moveTo(cx - d, y - d);
        ctx.lineTo(cx + d, y + d);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // Sem quebra: desenha a curva NBR direto no axBottom.
      drawCurve(axBottom, curvePts, COLORS.dark, 3.5);
      for (const [x, y] of curvePts.slice(1, -1)) {
        if (x <= xMax && y <= axBottom.yLim[1]) {
          drawGuideLine(axBottom, x, axBottom.yLim[0], x, y);
          drawGuideLine(axBottom, xMin, y, x, y);
        }
      }
    }

    for (const a of axesDefs) {
      const xs = [];
      const ys = [];
      for (const r of records) {
        if (r[a.freqKey] != null && r[a.ppvKey] != null) {
          xs.push(r[a.freqKey]);
          ys.push(r[a.ppvKey]);
        }
      }
      drawScatter(axBottom, xs, ys, a.marker, a.color, 40);
    }

    // Anotações (só o maior eixo por ponto, no axBottom).
    const sortedRecords = [...records].sort((a, b) => {
      const fa = a.evaluation?.ppv_max_freq_hz;
      const fb = b.evaluation?.ppv_max_freq_hz;
      const ka = [fa == null ? 0 : 1, fa ?? 0];
      const kb = [fb == null ? 0 : 1, fb ?? 0];
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      return ka[1] - kb[1];
    });
    const items = [];
    for (const r of sortedRecords) {
      const ev = r.evaluation || {};
      const f = ev.ppv_max_freq_hz;
      const p = ev.ppv_max_mm_s;
      if (f == null || p == null) continue;
      items.push({ x: f, y: p, text: safeName(r.point_name || "Ponto") });
    }
    annotatePoints(axBottom, items, 13);

    // Labels dos eixos (só no axBottom).
    drawAxisLabels(ctx, axBottom.box, "Frequência (Hz)", "PPV (mm/s)");

    // Legenda combinada.
    const legendEntries = [
      { label: "Limite ABNT", color: COLORS.dark, isLine: true },
      ...axesDefs.map((a) => ({ label: `${a.label} (mm/s)`, color: a.color, marker: a.marker })),
    ];
    drawLegend(
      ctx,
      legendEntries,
      outerRight + 20,
      (axTop || axBottom).box.y + ((axTop ? axTop.box.h : axBottom.box.h) / 2) - 40
    );

    return canvas;
  };

  const createCanvas = (w, h) => {
    // No browser usamos OffscreenCanvas se disponível, senão canvas normal.
    if (typeof OffscreenCanvas !== "undefined") {
      try { return new OffscreenCanvas(w, h); } catch (_) { /* fallthrough */ }
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  const canvasToBlob = (canvas) => new Promise((resolve) => {
    if (typeof canvas.convertToBlob === "function") {
      canvas.convertToBlob({ type: "image/png" }).then(resolve);
    } else {
      canvas.toBlob(resolve, "image/png");
    }
  });

  const canvasToPngBytes = async (canvas) => {
    const blob = await canvasToBlob(canvas);
    return new Uint8Array(await blob.arrayBuffer());
  };

  const canvasToDataURL = (canvas) => {
    if (canvas.toDataURL) return canvas.toDataURL("image/png");
    return null; // OffscreenCanvas não tem toDataURL — use bytes.
  };

  window.SismoCharts = {
    makePressureChart,
    makeVibrationChart,
    canvasToPngBytes,
    canvasToDataURL,
    CANVAS_W,
    CANVAS_H,
  };
})();
