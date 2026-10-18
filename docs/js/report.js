// Port de src/report.py — onepage A4 em pdf-lib com paridade coordenada-a-coordenada.
// Origem A4 em pdf-lib e reportlab: canto inferior esquerdo, y cresce para cima. 1 pt = 1/72".
// Estilo: fundo branco, sem cartões nem molduras; título vermelho em caixa alta,
// rótulos de seção cinza com fio fino, tabelas só com fios horizontais.
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
    red: palette.enaex_red || "#B5121B",
    green: palette.status_conforme || "#67C70A",
    dark: palette.enaex_gray || "#3D4148",
    text: palette.text || "#3D4148",
    muted: palette.muted || "#4A4F55",
    axis_gray: palette.axis_gray || "#8A8F96",
    line: palette.gray_200 || "#E3E3E3",
    white: palette.white || "#FFFFFF",
    status_gray: palette.status_ausente_text || "#8A8F96",
    status_verificar: palette.status_verificar_text || "#A4232B",
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

  // Fontes Standard do pdf-lib (Helvetica) usam WinAnsi. Substituímos glifos
  // comuns que não caem no encoding por equivalentes textuais.
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
  const drawHairline = (page, x1, x2, y, thickness, color, pdflib) => {
    page.drawLine({
      start: { x: x1, y },
      end: { x: x2, y },
      color: rgbColor(color, pdflib),
      thickness,
    });
  };

  // Rótulo de seção em cinza, com um único fio fino abaixo (como _section_header em Python).
  const drawSectionHeader = (page, x, y, w, h, title, fonts, pdflib, ruleWidth = 0.85, align = "left") => {
    const safeTitle = sanitizeForWinAnsi(title);
    const textWidth = fonts.bold.widthOfTextAtSize(safeTitle, 8.5);
    const textX = align === "center" ? x + (w - textWidth) / 2 : x;
    drawText(page, safeTitle, textX, y + h - 9, 8.5, COLORS.muted, true, fonts, pdflib);
    drawHairline(page, x, x + w, y + 1, ruleWidth, COLORS.line, pdflib);
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
      fitImage(page, assets.logo, PAGE_W - margin - 112, PAGE_H - 62, 112, 30);
    }
    const title = String(config.project?.title || "MONITORAMENTO SISMOGRÁFICO").toUpperCase();
    const client = summary.client || config.project?.client_default || "US MINERAÇÃO VALE-VERDE";
    const eventDate = fmtDateIso(summary.event_date);
    drawText(page, title, margin, PAGE_H - 112, 20, COLORS.red, true, fonts, pdflib);
    drawText(page, `Campanha de ${eventDate} · ${client} · ${records.length} ponto(s) monitorado(s)`, margin, PAGE_H - 130, 9.5, COLORS.muted, false, fonts, pdflib);
  };

  const drawScope = (page, x, y, w, h, config, records, summary, fonts, pdflib) => {
    // Sem rótulo próprio: fica abaixo de "Resumo da Campanha Realizada".
    // Data e cliente já aparecem no subtítulo do cabeçalho; aqui fica só o essencial.
    const y0 = y + h - 10;
    drawText(page, `Pontos monitorados: ${records.length} fonte(s) de dados processadas com sucesso.`, x, y0, 8, COLORS.text, false, fonts, pdflib);
    if (config.report?.show_vibration_index !== false) {
      const vibLimit = config.limits?.vibration_status_mm_s ?? 0.8;
      const ok = Boolean(summary.all_below_configured_vibration_limit);
      const status = ok ? "abaixo" : "acima";
      const statusColor = ok ? COLORS.green : COLORS.red;
      drawText(page, `Índices de vibração: ${status} de ${String(vibLimit).replace(".", ",")} mm/s.`, x, y0 - 12, 8, statusColor, true, fonts, pdflib);
    }
  };

  const drawConclusion = (page, x, y, w, h, records, summary, config, fonts, pdflib) => {
    const headerHeight = Number(config.report_layout?.section_header_height ?? 20);
    const ruleWidth = Number(config.report_layout?.section_rule_width ?? 0.85);
    drawSectionHeader(page, x, y + h - headerHeight, w, headerHeight, config.report_text?.conclusion_title || "Conclusão Técnica", fonts, pdflib, ruleWidth);
    const rows = [
      ["Conformidade", summary.all_conforme_abnt ? "Todos os pontos abaixo dos limites da ABNT NBR 9653:2018." : "Há ponto(s) acima de limite ou com dado ausente para avaliação."],
      ["Maior PSPL", `${fmtNum(summary.max_pspl?.value_db, 1, true, summary.max_pspl?.qualifier)} dB(L) | ${summary.max_pspl?.point_name || "N/D"}`],
      ["Maior PPV", `${fmtNum(summary.max_ppv?.value_mm_s, 3, true, summary.max_ppv?.qualifier)} mm/s | ${summary.max_ppv?.point_name || "N/D"}`],
      ["Maior PVS", `${fmtNum(summary.max_pvs?.value_mm_s, 3, true, summary.max_pvs?.qualifier)} mm/s | ${summary.max_pvs?.point_name || "N/D"}`],
    ];
    const tableY = y + 8;
    const rowH = 11;
    const col1 = 88;
    for (let i = 0; i < rows.length; i++) {
      const [label, value] = rows[i];
      const yy = tableY + (rows.length - 1 - i) * rowH;
      if (i < rows.length - 1) {
        drawHairline(page, x, x + w, yy, 0.4, COLORS.line, pdflib);
      }
      drawText(page, label, x, yy + 3, 7, COLORS.muted, true, fonts, pdflib);
      drawText(page, value, x + col1, yy + 3, 7, COLORS.text, false, fonts, pdflib);
    }
  };

  const drawChartCard = (page, x, y, w, h, title, chartImage, config, fonts, pdflib) => {
    const reportLayout = config.report_layout || {};
    const headerHeight = Number(reportLayout.chart_header_height ?? 20);
    const padding = Number(reportLayout.chart_inner_padding ?? 6);
    const ruleWidth = Number(reportLayout.section_rule_width ?? 0.85);
    drawSectionHeader(page, x, y + h - headerHeight, w, headerHeight, title, fonts, pdflib, ruleWidth);
    fitImage(page, chartImage, x, y + padding, w, h - headerHeight - 2 * padding);
  };

  const pointStatusText = (record) => {
    const ok = record.evaluation?.overall_conforme_abnt;
    if (ok === true) return ["CONFORME ABNT", COLORS.green];
    if (ok === false) return ["VERIFICAR", COLORS.status_verificar];
    return ["DADO AUSENTE", COLORS.status_gray];
  };

  const drawPointCard = (page, x, y, w, h, record, config, fonts, pdflib) => {
    const reportLayout = config.report_layout || {};
    const pointHeaderHeight = Number(reportLayout.point_header_height ?? 17);
    // Sem moldura: fio fino sob o nome, tabela com fios horizontais e status em texto à direita.
    drawHairline(page, x, x + w, y + h - pointHeaderHeight, 0.55, COLORS.line, pdflib);
    drawText(page, String(record.point_name || "PONTO MONITORADO").toUpperCase(), x, y + h - 12, 8.3, COLORS.dark, true, fonts, pdflib);
    const [statusLabel, statusColor] = pointStatusText(record);
    const statusWidth = fonts.bold.widthOfTextAtSize(statusLabel, 7);
    drawText(page, statusLabel, x + w - statusWidth, y + h - 12, 7, statusColor, true, fonts, pdflib);

    const tableY = y + 7;
    const rowH = 11;
    const labelW = 42;
    const blockW = 135;
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
    for (let blockIdx = 0; blockIdx < colPairs.length; blockIdx++) {
      const rows = colPairs[blockIdx];
      const bx = x + blockIdx * (blockW + 5);
      for (let i = 0; i < rows.length; i++) {
        const [label, value] = rows[i];
        const yy = tableY + (2 - i) * rowH;
        if (i < 2) {
          drawHairline(page, bx + labelW, bx + blockW, yy, 0.35, COLORS.line, pdflib);
        }
        drawText(page, label, bx, yy + 3, 5.8, COLORS.text, true, fonts, pdflib);
        drawText(page, value, bx + labelW, yy + 3, 5.8, COLORS.text, false, fonts, pdflib);
      }
    }
  };

  const drawFooter = (page, config, fonts, pdflib) => {
    const reportLayout = config.report_layout || {};
    const footerH = Number(reportLayout.footer_height ?? 30);
    const side = Number(reportLayout.footer_side_padding ?? 28);
    // Régua fina escura no topo do rodapé; texto pequeno, cinza, em caixa alta, à direita.
    drawHairline(page, side, PAGE_W - side, footerH, 0.6, COLORS.dark, pdflib);
    const base = config.project?.base_normativa || "ABNT NBR 9653:2018";
    const footerBadge = config.project?.footer_badge || "DNA  •  ENAEX";
    const footerText = sanitizeForWinAnsi(`BASE NORMATIVA: ${base.toUpperCase()}   ·   ${footerBadge}`);
    const textWidth = fonts.regular.widthOfTextAtSize(footerText, 6.5);
    drawText(page, footerText, PAGE_W - side - textWidth, footerH / 2 - 2, 6.5, COLORS.muted, false, fonts, pdflib);
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
    const reportLayout = config.report_layout || {};
    const ruleWidth = Number(reportLayout.section_rule_width ?? 0.85);
    drawHeader(page, config, records, summary, { logo: logoImage }, fonts, pdflib);
    const margin = layout.pageMargin;
    const contentW = PAGE_W - 2 * margin;
    drawSectionHeader(page, margin, 650, contentW, 20, config.report_text?.executive_title || "Resumo da Campanha Realizada", fonts, pdflib, ruleWidth);
    drawScope(page, margin, 566, contentW, 58, config, records, summary, fonts, pdflib);
    drawConclusion(page, margin, 494, contentW, 72, records, summary, config, fonts, pdflib);

    const chartW = (contentW - layout.chartColumnGap) / 2;
    drawChartCard(page, margin, layout.chartY, chartW, layout.chartH, config.report_text?.pressure_chart_title || "Pressão Sonora x Distância", pressureImg, config, fonts, pdflib);
    drawChartCard(page, margin + chartW + layout.chartColumnGap, layout.chartY, chartW, layout.chartH, config.report_text?.vibration_chart_title || "PPV x Limite ABNT", vibrationImg, config, fonts, pdflib);

    drawSectionHeader(page, margin, layout.pointsTitleY - 6, contentW, 20, config.report_text?.points_title || "Pontos Monitorados", fonts, pdflib, ruleWidth);
    let y = layout.firstCardY;
    const cardH = layout.cardHeight;
    for (const r of records.slice(0, FIRST_PAGE_CARD_SLOTS)) {
      drawPointCard(page, margin, y, contentW, cardH, r, config, fonts, pdflib);
      y -= cardH + layout.cardGap;
    }
    if (records.length > FIRST_PAGE_CARD_SLOTS) {
      drawText(page, `+ ${records.length - FIRST_PAGE_CARD_SLOTS} ponto(s) adicionais no JSON consolidado.`, margin, y + 10, 8, COLORS.muted, false, fonts, pdflib);
    }
    drawFooter(page, config, fonts, pdflib);

    // Páginas extras.
    if (records.length > FIRST_PAGE_CARD_SLOTS) {
      const remaining = records.slice(FIRST_PAGE_CARD_SLOTS);
      for (let idx = 0; idx < remaining.length; idx += 8) {
        const batch = remaining.slice(idx, idx + 8);
        const extra = doc.addPage([PAGE_W, PAGE_H]);
        drawSectionHeader(extra, margin, PAGE_H - 70, contentW, 20, config.report_text?.continued_points_title || "Pontos Monitorados - Continuação", fonts, pdflib, ruleWidth);
        let yy = PAGE_H - 120;
        for (const r of batch) {
          drawPointCard(extra, margin, yy, contentW, cardH, r, config, fonts, pdflib);
          yy -= cardH + 12;
        }
        drawFooter(extra, config, fonts, pdflib);
      }
    }

    return await doc.save();
  };

  window.SismoReport = { buildPdfReport, PAGE_W, PAGE_H };
})();
