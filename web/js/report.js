// Port de src/report.py — onepage A4 em pdf-lib com paridade coordenada-a-coordenada.
// Origem A4 em pdf-lib e reportlab: canto inferior esquerdo, y cresce para cima. 1 pt = 1/72".
(() => {
  const palette = window.SISMO_CONFIG?.branding?.palette || {};
  // --- Constantes idênticas a src/report.py ---
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const FIRST_PAGE_CARD_SLOTS = 3;
  const FIRST_PAGE_LAST_CARD_Y = 70;
  const POINT_CARD_HEIGHT = 58;
  const POINT_CARD_GAP = 14;
  const POINTS_TITLE_GAP = 22;
  const CHART_TO_POINTS_GAP = 16;
  const CHARTS_TOP_LIMIT = 484;
  const MARGIN = 28;

  const COLORS = {
    red: palette.enaex_red || "#E20613",
    green: palette.status_conforme || "#67C70A",
    dark: palette.enaex_gray || "#38424B",
    navy: palette.enaex_gray || "#38424B",
    text: palette.text || "#111827",
    muted: palette.muted || "#667085",
    line: palette.gray_200 || "#D9DEE7",
    light_green: palette.gray_50 || "#F7F8FA",
    shadow: palette.gray_300 || "#E1E5EA",
    header_band: palette.gray_100 || "#E8EAEE",
    header_client: "#697386",
    status_gray: palette.status_ausente || "#9AA1AC",
  };

  const hexToRgb = (hex) => {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  };
  const rgbColor = (hex, pdflib) => {
    const { r, g, b } = hexToRgb(hex);
    return pdflib.rgb(r, g, b);
  };

  const fmtNum = (value, digits = 3, comma = true, qualifier = null) => {
    if (value === null || value === undefined) return "N/D";
    let txt = Number(value).toFixed(digits);
    if (comma) txt = txt.replace(".", ",");
    if (qualifier === "<" || qualifier === ">") txt = `${qualifier}${txt}`;
    return txt;
  };
  const fmtRecordNum = (record, field, digits = 3) =>
    fmtNum(record?.[field], digits, true, record?.numeric_qualifiers?.[field]);
  const fmtDateIso = (value) => {
    if (!value) return "N/D";
    const parts = String(value).split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return String(value);
  };

  // --- Helpers de desenho (equivalentes a _hex, _draw_round_rect, etc) ---

  const drawRoundedFill = (page, x, y, w, h, radius, color, pdflib) => {
    const r = Math.max(0, Math.min(Number(radius) || 0, w / 2, h / 2));
    if (r === 0) {
      page.drawRectangle({ x, y, width: w, height: h, color: rgbColor(color, pdflib) });
      return;
    }
    const fill = rgbColor(color, pdflib);
    page.drawRectangle({ x: x + r, y, width: Math.max(0, w - 2 * r), height: h, color: fill });
    page.drawRectangle({ x, y: y + r, width: w, height: Math.max(0, h - 2 * r), color: fill });
    page.drawCircle({ x: x + r, y: y + r, size: r, color: fill });
    page.drawCircle({ x: x + w - r, y: y + r, size: r, color: fill });
    page.drawCircle({ x: x + r, y: y + h - r, size: r, color: fill });
    page.drawCircle({ x: x + w - r, y: y + h - r, size: r, color: fill });
  };

  const drawRoundRect = (page, opts, pdflib) => {
    const { x, y, w, h, radius = 5, fill = "#FFFFFF", shadow = true } = opts;
    if (shadow) {
      drawRoundedFill(page, x + 2, y - 2, w, h, radius, COLORS.shadow, pdflib);
    }
    drawRoundedFill(page, x, y, w, h, radius, fill, pdflib);
    // O contrato atual não usa contornos nos cards; o preenchimento
    // arredondado mantém a mesma linguagem visual do ReportLab.
  };

  // Fontes Standard do pdf-lib (Helvetica) usam WinAnsi. Substituímos glifos
  // comuns que não caem no encoding por equivalentes textuais para não quebrar
  // a geração do PDF em campos gerados pelo usuário.
  const WIN_ANSI_FALLBACK = {
    "■": "•", "▪": "•", "◼": "•",
    "≤": "<=", "≥": ">=", "≠": "!=", "→": "->", "←": "<-",
    "✅": "OK", "⚠️": "!", "⚠": "!",
  };
  const sanitizeForWinAnsi = (text) => {
    let out = "";
    for (const ch of String(text)) {
      out += WIN_ANSI_FALLBACK[ch] ?? ch;
    }
    return out;
  };
  const drawText = (page, text, x, y, size, color, bold, fonts, pdflib) => {
    page.drawText(sanitizeForWinAnsi(text), {
      x, y, size,
      font: bold ? fonts.bold : fonts.regular,
      color: rgbColor(color, pdflib),
    });
  };

  const drawSectionHeader = (page, x, y, w, h, title, color, fonts, pdflib, align = "left") => {
    drawRoundedFill(page, x, y, w, h, 5, color, pdflib);
    const safeTitle = sanitizeForWinAnsi(title);
    const titleWidth = fonts.bold.widthOfTextAtSize(safeTitle, 10);
    const textX = align === "center" ? x + (w - titleWidth) / 2 : x + 12;
    drawText(page, title, textX, y + h - 13, 10, "#FFFFFF", true, fonts, pdflib);
  };

  const fitImage = (page, image, x, y, w, h) => {
    if (!image) return;
    const iw = image.width;
    const ih = image.height;
    const scale = Math.min(w / iw, h / ih);
    const nw = iw * scale;
    const nh = ih * scale;
    page.drawImage(image, {
      x: x + (w - nw) / 2,
      y: y + (h - nh) / 2,
      width: nw,
      height: nh,
    });
  };

  // --- Seções idênticas ao Python ---

  const drawHeader = (page, config, records, summary, assets, fonts, pdflib) => {
    const margin = Number(config.report_layout?.page_margin ?? MARGIN);
    if (assets.logo) {
      fitImage(page, assets.logo, margin, PAGE_H - 62, 112, 30);
    }
    // Selo geométrico: círculo com número de pontos.
    page.drawCircle({
      x: PAGE_W - 52, y: PAGE_H - 46, size: 14,
      borderColor: rgbColor(COLORS.dark, pdflib),
      borderWidth: 1,
    });
    drawText(page, String(records.length), PAGE_W - 55, PAGE_H - 50, 12, COLORS.dark, true, fonts, pdflib);

    const x = margin;
    const y = PAGE_H - 144;
    const w = PAGE_W - 2 * margin;
    const h = 78;
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    // Faixa superior cinza clara.
    drawRoundedFill(page, x, y + h - 10, w, 10, 5, COLORS.header_band, pdflib);
    drawText(page, config.project?.title || "MONITORAMENTO SISMOGRÁFICO", x + 22, y + 46, 15, COLORS.red, true, fonts, pdflib);
    const client = summary.client || config.project?.client_default || "US MINERAÇÃO VALE-VERDE";
    drawText(page, String(client).toUpperCase(), x + 22, y + 26, 11, COLORS.header_client, true, fonts, pdflib);
    const arrowOffset = Number(config.report_layout?.header_points_arrow_offset ?? 12);
    const arrowWidth = Number(config.report_layout?.header_points_arrow_width ?? 14);
    const arrowGap = Number(config.report_layout?.header_points_arrow_gap ?? 8);
    const arrowLineWidth = Number(config.report_layout?.header_points_arrow_line_width ?? 1.5);
    const arrowStartX = x + arrowOffset;
    const arrowTipX = arrowStartX + arrowWidth;
    const arrowY = y + 14;
    const arrowHead = Math.min(3.5, arrowWidth * 0.3);
    page.drawLine({
      start: { x: arrowStartX, y: arrowY },
      end: { x: arrowTipX - arrowHead, y: arrowY },
      color: rgbColor(COLORS.red, pdflib),
      thickness: arrowLineWidth,
    });
    page.drawLine({
      start: { x: arrowTipX, y: arrowY },
      end: { x: arrowTipX - arrowHead, y: arrowY + arrowHead * 0.7 },
      color: rgbColor(COLORS.red, pdflib),
      thickness: arrowLineWidth,
    });
    page.drawLine({
      start: { x: arrowTipX, y: arrowY },
      end: { x: arrowTipX - arrowHead, y: arrowY - arrowHead * 0.7 },
      color: rgbColor(COLORS.red, pdflib),
      thickness: arrowLineWidth,
    });
    drawText(page, `${records.length} ponto(s)`, x + arrowOffset + arrowWidth + arrowGap, y + 12, 8, COLORS.text, true, fonts, pdflib);
  };

  const drawScope = (page, x, y, w, h, config, records, summary, fonts, pdflib) => {
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    drawSectionHeader(page, x, y + h - 20, w, 20, config.report_text?.scope_title || "Escopo da Campanha", COLORS.dark, fonts, pdflib);
    const y0 = y + h - 32;
    const eventDate = fmtDateIso(summary.event_date);
    const client = summary.client || config.project?.client_default || "N/D";
    drawText(page, `Data do evento: ${eventDate}`, x + 12, y0, 8, COLORS.text, false, fonts, pdflib);
    drawText(page, `Cliente: ${client}`, x + 12, y0 - 11, 8, COLORS.text, false, fonts, pdflib);
    drawText(page, `Pontos monitorados: ${records.length} fonte(s) de dados de sismógrafos processadas com sucesso.`, x + 12, y0 - 22, 8, COLORS.text, false, fonts, pdflib);
    if (config.report?.show_vibration_index !== false) {
      const vibLimit = config.limits?.vibration_status_mm_s ?? 0.8;
      const status = summary.all_below_configured_vibration_limit ? "abaixo" : "acima";
      const statusColor = summary.all_below_configured_vibration_limit ? COLORS.green : COLORS.red;
      page.drawRectangle({
        x: x + 12, y: y0 - 34, width: 6, height: 6,
        color: rgbColor(statusColor, pdflib),
      });
      drawText(page, `Índices de vibração: ${status} de ${String(vibLimit).replace(".", ",")} mm/s.`, x + 21, y0 - 33, 8, statusColor, true, fonts, pdflib);
    }
  };

  const drawConclusion = (page, x, y, w, h, records, summary, config, fonts, pdflib) => {
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    drawSectionHeader(page, x, y + h - 20, w, 20, config.report_text?.conclusion_title || "Conclusão Técnica", COLORS.dark, fonts, pdflib);
    const rows = [
      ["Conformidade", summary.all_conforme_abnt ? "Todos os pontos abaixo dos limites da ABNT NBR 9653:2018." : "Há ponto(s) acima de limite ou com dado ausente para avaliação."],
      ["Maior PSPL", `${fmtNum(summary.max_pspl?.value_db, 1, true, summary.max_pspl?.qualifier)} dB(L) | ${summary.max_pspl?.point_name || "N/D"}`],
      ["Maior PPV", `${fmtNum(summary.max_ppv?.value_mm_s, 3, true, summary.max_ppv?.qualifier)} mm/s | ${summary.max_ppv?.point_name || "N/D"}`],
      ["Maior PVS", `${fmtNum(summary.max_pvs?.value_mm_s, 3, true, summary.max_pvs?.qualifier)} mm/s | ${summary.max_pvs?.point_name || "N/D"}`],
    ];
    const tableX = x + 12;
    const tableY = y + 8;
    const rowH = 11;
    const col1 = 88;
    const totalW = w - 24;
    for (let i = 0; i < rows.length; i++) {
      const [label, value] = rows[i];
      const yy = tableY + (rows.length - 1 - i) * rowH;
      page.drawRectangle({
        x: tableX, y: yy, width: col1, height: rowH,
        color: rgbColor(COLORS.light_green, pdflib),
      });
      if (i < rows.length - 1) {
        page.drawLine({
          start: { x: tableX + col1, y: yy },
          end: { x: tableX + totalW, y: yy },
          color: rgbColor(COLORS.line, pdflib),
          thickness: 0.4,
        });
      }
      drawText(page, label, tableX + 6, yy + 3, 7, COLORS.text, true, fonts, pdflib);
      drawText(page, value, tableX + col1 + 6, yy + 3, 7, COLORS.text, false, fonts, pdflib);
    }
  };

  const drawChartCard = (page, x, y, w, h, title, chartImage, config, fonts, pdflib) => {
    const reportLayout = config.report_layout || {};
    const headerHeight = Number(reportLayout.chart_header_height ?? 20);
    const padding = Number(reportLayout.chart_inner_padding ?? 9);
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    drawSectionHeader(page, x, y + h - headerHeight, w, headerHeight, title, COLORS.dark, fonts, pdflib, "center");
    fitImage(page, chartImage, x + padding, y + padding, w - 2 * padding, h - headerHeight - padding - 2);
  };

  const pointStatusText = (record) => {
    const ok = record.evaluation?.overall_conforme_abnt;
    if (ok === true) return ["CONFORME ABNT", COLORS.green];
    if (ok === false) return ["VERIFICAR", COLORS.red];
    return ["DADO AUSENTE", COLORS.status_gray];
  };

  const drawPointCard = (page, x, y, w, h, record, config, fonts, pdflib) => {
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    // Cabeçalho escuro.
    page.drawRectangle({
      x, y: y + h - 17, width: w, height: 17,
      color: rgbColor(COLORS.dark, pdflib),
    });
    drawText(page, String(record.point_name || "PONTO MONITORADO").toUpperCase(), x + 12, y + h - 12, 9, "#FFFFFF", true, fonts, pdflib);

    const tableX = x + 12;
    const tableY = y + 7;
    const rowH = 11;
    const labelW = 42;
    const colPairs = [
      [
        ["Data", fmtDateIso(record.event_date)],
        ["PSPL", `${fmtRecordNum(record, "pspl_db", 1)} dB(L)`],
        ["Mic", `${fmtRecordNum(record, "mic_freq_hz", 1)} Hz`],
      ],
      [
        ["PVS", `${fmtRecordNum(record, "pvs_mm_s", 3)} mm/s`],
        ["SD", fmtRecordNum(record, "scaled_distance", 1)],
        ["Dist / Carga", `${fmtRecordNum(record, "gps_distance_m", 1)} m | ${fmtRecordNum(record, "charge_kg", 1)} kg`],
      ],
      [
        ["Tran", `${fmtRecordNum(record, "tran_ppv_mm_s", 3)} mm/s | ${fmtRecordNum(record, "tran_freq_hz", 1)} Hz`],
        ["Vert", `${fmtRecordNum(record, "vert_ppv_mm_s", 3)} mm/s | ${fmtRecordNum(record, "vert_freq_hz", 1)} Hz`],
        ["Long", `${fmtRecordNum(record, "long_ppv_mm_s", 3)} mm/s | ${fmtRecordNum(record, "long_freq_hz", 1)} Hz`],
      ],
    ];
    const blockW = 135;
    for (let blockIdx = 0; blockIdx < colPairs.length; blockIdx++) {
      const rows = colPairs[blockIdx];
      const bx = tableX + blockIdx * (blockW + 5);
      for (let i = 0; i < rows.length; i++) {
        const [label, value] = rows[i];
        const yy = tableY + (2 - i) * rowH;
        page.drawRectangle({
          x: bx, y: yy, width: labelW, height: rowH,
          color: rgbColor(COLORS.light_green, pdflib),
        });
        if (i < 2) {
          page.drawLine({
            start: { x: bx + labelW, y: yy },
            end: { x: bx + blockW, y: yy },
            color: rgbColor(COLORS.line, pdflib),
            thickness: 0.35,
          });
        }
        drawText(page, label, bx + 5, yy + 3, 5.8, COLORS.text, true, fonts, pdflib);
        drawText(page, value, bx + labelW + 5, yy + 3, 5.8, COLORS.text, false, fonts, pdflib);
      }
    }
    const [label, color] = pointStatusText(record);
    const reportLayout = config.report_layout || {};
    const btnW = Number(reportLayout.status_badge_width ?? 112);
    const btnH = Number(reportLayout.status_badge_height ?? 20);
    const btnX = x + w - btnW - 12;
    const btnY = y + 12;
    const radius = Math.min(Number(reportLayout.status_badge_radius ?? 6), btnH / 2);
    drawRoundedFill(page, btnX, btnY, btnW, btnH, radius, color, pdflib);
    const iconX = btnX + 13;
    const iconY = btnY + btnH / 2;
    page.drawCircle({ x: iconX, y: iconY, size: 5.2, color: rgbColor("#FFFFFF", pdflib) });
    if (label === "CONFORME ABNT") {
      page.drawLine({ start: { x: iconX - 2.7, y: iconY }, end: { x: iconX - 0.7, y: iconY - 2 }, color: rgbColor(color, pdflib), thickness: 1.1 });
      page.drawLine({ start: { x: iconX - 0.7, y: iconY - 2 }, end: { x: iconX + 3, y: iconY + 2.4 }, color: rgbColor(color, pdflib), thickness: 1.1 });
    } else if (label === "VERIFICAR") {
      page.drawLine({ start: { x: iconX, y: iconY - 2.4 }, end: { x: iconX, y: iconY + 2 }, color: rgbColor(color, pdflib), thickness: 1.1 });
      page.drawCircle({ x: iconX, y: iconY - 3.4, size: 0.55, borderColor: rgbColor(color, pdflib), borderWidth: 1.1 });
    } else {
      page.drawLine({ start: { x: iconX - 2.5, y: iconY }, end: { x: iconX + 2.5, y: iconY }, color: rgbColor(color, pdflib), thickness: 1.1 });
    }
    drawText(page, label, btnX + 23, btnY + (btnH - 7.5) / 2 + 2, 7.5, "#FFFFFF", true, fonts, pdflib);
  };

  const drawFooter = (page, config, fonts, pdflib) => {
    const reportLayout = config.report_layout || {};
    const footerH = Number(reportLayout.footer_height ?? 30);
    const side = Number(reportLayout.footer_side_padding ?? 28);
    const accentH = Math.min(Number(reportLayout.footer_accent_height ?? 2), footerH / 2);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: footerH, color: rgbColor(COLORS.navy, pdflib) });
    page.drawRectangle({
      x: 0, y: footerH - accentH, width: PAGE_W, height: accentH,
      color: rgbColor(COLORS.red, pdflib),
    });
    drawText(page, `Base normativa: ${config.project?.base_normativa || "ABNT NBR 9653:2018"}`, side, 10.5, 7.5, "#FFFFFF", false, fonts, pdflib);
    page.drawLine({
      start: { x: PAGE_W - 148, y: 8 },
      end: { x: PAGE_W - 148, y: footerH - 8 },
      color: rgbColor(COLORS.header_band, pdflib),
      thickness: 0.6,
    });
    const footerBadge = config.project?.footer_badge || "DNA  •  ENAEX";
    const footerBadgeWidth = fonts.bold.widthOfTextAtSize(sanitizeForWinAnsi(footerBadge), 8.5);
    drawText(page, footerBadge, PAGE_W - side - footerBadgeWidth, 10.5, 8.5, "#FFFFFF", true, fonts, pdflib);
  };

  const firstPageLayout = (config = {}) => {
    const reportLayout = config.report_layout || {};
    const firstCardY = FIRST_PAGE_LAST_CARD_Y + (FIRST_PAGE_CARD_SLOTS - 1) * (POINT_CARD_HEIGHT + POINT_CARD_GAP);
    const pointsTitleY = firstCardY + POINT_CARD_HEIGHT + POINTS_TITLE_GAP;
    const chartY = pointsTitleY + Number(reportLayout.chart_to_points_gap ?? CHART_TO_POINTS_GAP);
    const chartH = Number(reportLayout.charts_top_limit ?? CHARTS_TOP_LIMIT) - chartY;
    if (chartH <= 0) throw new Error("Configuração inválida: altura dos gráficos deve ser positiva.");
    return {
      pointsTitleY, firstCardY,
      cardHeight: POINT_CARD_HEIGHT,
      cardGap: POINT_CARD_GAP,
      chartY, chartH,
      chartColumnGap: Number(reportLayout.chart_column_gap ?? 14),
      pageMargin: Number(reportLayout.page_margin ?? MARGIN),
    };
  };

  const fetchAssetBytes = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };

  const buildPdfReport = async ({ records, summary, config, chartCanvases, logoUrl }) => {
    const pdflib = window.PDFLib;
    if (!pdflib) throw new Error("pdf-lib ainda não carregou. Recarregue a página.");

    const doc = await pdflib.PDFDocument.create();
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const fonts = {
      regular: await doc.embedFont(pdflib.StandardFonts.Helvetica),
      bold: await doc.embedFont(pdflib.StandardFonts.HelveticaBold),
    };
    let logoImage = null;
    try {
      const logoBytes = await fetchAssetBytes(logoUrl);
      logoImage = await doc.embedPng(logoBytes);
    } catch (err) {
      console.warn("Logo não pôde ser embutido:", err);
    }
    const [pressureBytes, vibrationBytes] = await Promise.all([
      window.SismoCharts.canvasToPngBytes(chartCanvases.pressure),
      window.SismoCharts.canvasToPngBytes(chartCanvases.vibration),
    ]);
    const pressureImg = await doc.embedPng(pressureBytes);
    const vibrationImg = await doc.embedPng(vibrationBytes);

    const layout = firstPageLayout(config);
    drawHeader(page, config, records, summary, { logo: logoImage }, fonts, pdflib);
    const margin = layout.pageMargin;
    drawText(page, config.report_text?.executive_title || "Resumo da Campanha Realizada", margin, 652, 17, COLORS.text, false, fonts, pdflib);
    page.drawRectangle({
      x: margin, y: 645, width: 42, height: 2,
      color: rgbColor(COLORS.red, pdflib),
    });
    drawScope(page, margin, 566, PAGE_W - 2 * margin, 72, config, records, summary, fonts, pdflib);
    drawConclusion(page, margin, 488, PAGE_W - 2 * margin, 72, records, summary, config, fonts, pdflib);

    const chartW = (PAGE_W - 2 * margin - layout.chartColumnGap) / 2;
    drawChartCard(page, margin, layout.chartY, chartW, layout.chartH, config.report_text?.pressure_chart_title || "Pressão Sonora x Distância", pressureImg, config, fonts, pdflib);
    drawChartCard(page, margin + chartW + layout.chartColumnGap, layout.chartY, chartW, layout.chartH, config.report_text?.vibration_chart_title || "PPV x Limite ABNT", vibrationImg, config, fonts, pdflib);

    drawText(page, config.report_text?.points_title || "Pontos Monitorados", margin, layout.pointsTitleY, 17, COLORS.text, false, fonts, pdflib);
    page.drawRectangle({
      x: margin, y: layout.pointsTitleY - 7, width: 42, height: 2,
      color: rgbColor(COLORS.red, pdflib),
    });
    let y = layout.firstCardY;
    const cardH = layout.cardHeight;
    for (const r of records.slice(0, FIRST_PAGE_CARD_SLOTS)) {
      drawPointCard(page, margin, y, PAGE_W - 2 * margin, cardH, r, config, fonts, pdflib);
      y -= cardH + layout.cardGap;
    }
    if (records.length > FIRST_PAGE_CARD_SLOTS) {
      drawText(page, `+ ${records.length - FIRST_PAGE_CARD_SLOTS} ponto(s) adicionais no JSON consolidado.`, margin + 10, y + 10, 8, COLORS.muted, false, fonts, pdflib);
    }
    drawFooter(page, config, fonts, pdflib);

    // Páginas extras.
    if (records.length > FIRST_PAGE_CARD_SLOTS) {
      const remaining = records.slice(FIRST_PAGE_CARD_SLOTS);
      for (let idx = 0; idx < remaining.length; idx += 8) {
        const batch = remaining.slice(idx, idx + 8);
        const extra = doc.addPage([PAGE_W, PAGE_H]);
        drawText(extra, config.report_text?.continued_points_title || "Pontos Monitorados - Continuação", margin, PAGE_H - 55, 17, COLORS.text, false, fonts, pdflib);
        let yy = PAGE_H - 120;
        for (const r of batch) {
          drawPointCard(extra, margin, yy, PAGE_W - 2 * margin, cardH, r, config, fonts, pdflib);
          yy -= cardH + 12;
        }
        drawFooter(extra, config, fonts, pdflib);
      }
    }

    return await doc.save();
  };

  window.SismoReport = { buildPdfReport, PAGE_W, PAGE_H };
})();
