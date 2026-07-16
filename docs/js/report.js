// Port de src/report.py — onepage A4 em pdf-lib com paridade coordenada-a-coordenada.
// Origem A4 em pdf-lib e reportlab: canto inferior esquerdo, y cresce para cima. 1 pt = 1/72".
(() => {
  const palette = window.SISMO_CONFIG?.branding?.palette || {};
  // --- Constantes idênticas a src/report.py ---
  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const FIRST_PAGE_CARD_SLOTS = 3;
  // A primeira página fica dedicada ao resumo e aos pontos; os gráficos
  // ganham uma página própria para não serem reduzidos a miniaturas.
  const FIRST_PAGE_LAST_CARD_Y = 220;
  const POINT_CARD_HEIGHT = 58;
  const POINT_CARD_GAP = 14;
  const POINTS_TITLE_GAP = 22;
  const CHART_TO_POINTS_GAP = 40;
  const CHARTS_TOP_LIMIT = 480;
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

  const fmtNum = (value, digits = 3, comma = true) => {
    if (value === null || value === undefined) return "N/D";
    let txt = Number(value).toFixed(digits);
    if (comma) txt = txt.replace(".", ",");
    return txt;
  };
  const fmtDateIso = (value) => {
    if (!value) return "N/D";
    const parts = String(value).split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return String(value);
  };

  // --- Helpers de desenho (equivalentes a _hex, _draw_round_rect, etc) ---

  const drawRoundRect = (page, opts, pdflib) => {
    const { x, y, w, h, radius = 5, fill = "#FFFFFF", stroke = null, shadow = true } = opts;
    if (shadow) {
      page.drawRectangle({
        x: x + 2, y: y - 2, width: w, height: h,
        color: rgbColor(COLORS.shadow, pdflib),
      });
    }
    page.drawRectangle({
      x, y, width: w, height: h,
      color: rgbColor(fill, pdflib),
      borderColor: stroke ? rgbColor(stroke, pdflib) : rgbColor(fill, pdflib),
      borderWidth: stroke ? 1 : 0,
    });
    // pdf-lib ainda não suporta radius nativo em drawRectangle. Como o
    // reportlab usa radius pequeno (5pt) e o efeito é discreto em A4, usar
    // retângulo puro mantém proximidade visual sem quebrar layout.
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

  const drawSectionHeader = (page, x, y, w, h, title, color, fonts, pdflib) => {
    page.drawRectangle({
      x, y, width: w, height: h,
      color: rgbColor(color, pdflib),
    });
    drawText(page, title, x + 12, y + h - 13, 10, "#FFFFFF", true, fonts, pdflib);
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
    if (assets.logo) {
      fitImage(page, assets.logo, MARGIN, PAGE_H - 62, 112, 30);
    }
    // Selo geométrico: círculo com número de pontos.
    page.drawCircle({
      x: PAGE_W - 52, y: PAGE_H - 46, size: 14,
      borderColor: rgbColor(COLORS.dark, pdflib),
      borderWidth: 1,
    });
    drawText(page, String(records.length), PAGE_W - 55, PAGE_H - 50, 12, COLORS.dark, true, fonts, pdflib);

    const x = MARGIN;
    const y = PAGE_H - 144;
    const w = PAGE_W - 2 * MARGIN;
    const h = 78;
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    // Faixa superior cinza clara.
    page.drawRectangle({
      x, y: y + h - 10, width: w, height: 10,
      color: rgbColor(COLORS.header_band, pdflib),
    });
    drawText(page, config.project?.title || "MONITORAMENTO SISMOGRÁFICO", x + 22, y + 46, 15, COLORS.red, true, fonts, pdflib);
    const client = summary.client || config.project?.client_default || "US MINERAÇÃO VALE-VERDE";
    drawText(page, String(client).toUpperCase(), x + 22, y + 26, 11, COLORS.header_client, true, fonts, pdflib);
    drawText(page, `${records.length} ponto(s)`, x + 22, y + 12, 8, COLORS.text, true, fonts, pdflib);
  };

  const drawScope = (page, x, y, w, h, config, records, summary, fonts, pdflib) => {
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    drawSectionHeader(page, x, y + h - 20, w, 20, "Escopo da Campanha", COLORS.dark, fonts, pdflib);
    const y0 = y + h - 32;
    const eventDate = fmtDateIso(summary.event_date);
    const client = summary.client || config.project?.client_default || "N/D";
    drawText(page, `Data do evento: ${eventDate}`, x + 12, y0, 8, COLORS.text, false, fonts, pdflib);
    drawText(page, `Cliente: ${client}`, x + 12, y0 - 11, 8, COLORS.text, false, fonts, pdflib);
    drawText(page, `Pontos monitorados: ${records.length} fonte(s) de dados de sismógrafos processadas com sucesso.`, x + 12, y0 - 22, 8, COLORS.text, false, fonts, pdflib);
    const vibLimit = config.limits?.vibration_status_mm_s ?? 0.8;
    const status = summary.all_below_configured_vibration_limit ? "abaixo" : "acima";
    // pdf-lib com fonte Helvetica (WinAnsi) não codifica U+25A0. Usamos "•" (U+2022) que
    // é o mesmo bullet usado nas outras seções e cabe no encoding.
    drawText(page, `• Índices de vibração: ${status} de ${String(vibLimit).replace(".", ",")} mm/s.`, x + 12, y0 - 33, 8, COLORS.green, true, fonts, pdflib);
  };

  const drawConclusion = (page, x, y, w, h, records, summary, fonts, pdflib) => {
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    drawSectionHeader(page, x, y + h - 20, w, 20, "Conclusão Técnica", COLORS.dark, fonts, pdflib);
    const rows = [
      ["Conformidade", summary.all_conforme_abnt ? "Todos os pontos abaixo dos limites da ABNT NBR 9653:2018." : "Há ponto(s) acima de limite ou com dado ausente para avaliação."],
      ["Maior PSPL", `${fmtNum(summary.max_pspl?.value_db, 1)} dB(L) | ${summary.max_pspl?.point_name || "N/D"}`],
      ["Maior PPV", `${fmtNum(summary.max_ppv?.value_mm_s, 3)} mm/s | ${summary.max_ppv?.point_name || "N/D"}`],
      ["Maior PVS", `${fmtNum(summary.max_pvs?.value_mm_s, 3)} mm/s | ${summary.max_pvs?.point_name || "N/D"}`],
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

  const drawChartCard = (page, x, y, w, h, title, chartImage, fonts, pdflib) => {
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    drawSectionHeader(page, x, y + h - 20, w, 20, title, COLORS.dark, fonts, pdflib);
    fitImage(page, chartImage, x + 9, y + 10, w - 18, h - 38);
  };

  const drawChartPage = (page, config, chartImages, fonts, pdflib) => {
    const chartCfg = config.charts || {};
    const cardH = Number(chartCfg.report_chart_page_card_height ?? 300);
    const gap = Number(chartCfg.report_chart_page_gap ?? 24);
    const title = chartCfg.report_chart_page_title || "Gráficos Normativos — ABNT NBR 9653:2018";
    const chartW = PAGE_W - 2 * MARGIN;
    const topY = PAGE_H - 86 - cardH;
    const bottomY = topY - gap - cardH;

    drawText(page, title, MARGIN, PAGE_H - 55, 17, COLORS.text, false, fonts, pdflib);
    page.drawRectangle({
      x: MARGIN, y: PAGE_H - 62, width: 42, height: 2,
      color: rgbColor(COLORS.red, pdflib),
    });
    drawChartCard(page, MARGIN, topY, chartW, cardH, "Pressão Sonora x Distância", chartImages.pressure, fonts, pdflib);
    drawChartCard(page, MARGIN, bottomY, chartW, cardH, "PPV x Limite ABNT", chartImages.vibration, fonts, pdflib);
    drawFooter(page, config, fonts, pdflib);
  };

  const pointStatusText = (record) => {
    const ok = record.evaluation?.overall_conforme_abnt;
    if (ok === true) return ["CONFORME ABNT", COLORS.green];
    if (ok === false) return ["VERIFICAR", COLORS.red];
    return ["DADO AUSENTE", COLORS.status_gray];
  };

  const drawPointCard = (page, x, y, w, h, record, fonts, pdflib) => {
    drawRoundRect(page, { x, y, w, h, radius: 5, fill: "#FFFFFF", shadow: true }, pdflib);
    // Cabeçalho escuro.
    page.drawRectangle({
      x, y: y + h - 17, width: w, height: 17,
      color: rgbColor(COLORS.dark, pdflib),
    });
    // Régua vermelha identifica o cartão; verde fica reservado à conformidade.
    page.drawRectangle({
      x, y: y + h - 17, width: 3.5, height: 17,
      color: rgbColor(COLORS.red, pdflib),
    });
    drawText(page, String(record.point_name || "PONTO MONITORADO").toUpperCase(), x + 14, y + h - 12, 9, "#FFFFFF", true, fonts, pdflib);

    const tableX = x + 12;
    const tableY = y + 7;
    const rowH = 11;
    const labelW = 42;
    const colPairs = [
      [
        ["Data", fmtDateIso(record.event_date)],
        ["PSPL", `${fmtNum(record.pspl_db, 1)} dB(L)`],
        ["Mic", `${fmtNum(record.mic_freq_hz, 1)} Hz`],
      ],
      [
        ["PVS", `${fmtNum(record.pvs_mm_s, 3)} mm/s`],
        ["SD", fmtNum(record.scaled_distance, 1)],
        ["Dist / Carga", `${fmtNum(record.gps_distance_m, 1)} m | ${fmtNum(record.charge_kg, 1)} kg`],
      ],
      [
        ["Tran", `${fmtNum(record.tran_ppv_mm_s, 3)} mm/s | ${fmtNum(record.tran_freq_hz, 1)} Hz`],
        ["Vert", `${fmtNum(record.vert_ppv_mm_s, 3)} mm/s | ${fmtNum(record.vert_freq_hz, 1)} Hz`],
        ["Long", `${fmtNum(record.long_ppv_mm_s, 3)} mm/s | ${fmtNum(record.long_freq_hz, 1)} Hz`],
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
    // Badge de status.
    const [label, color] = pointStatusText(record);
    const btnW = 96;
    const btnH = 18;
    page.drawRectangle({
      x: x + w - btnW - 12, y: y + 13, width: btnW, height: btnH,
      color: rgbColor(color, pdflib),
    });
    drawText(page, label, x + w - btnW + 6, y + 19, 7.5, "#FFFFFF", true, fonts, pdflib);
  };

  const drawFooter = (page, config, fonts, pdflib) => {
    const badgeW = 112;
    const badgeH = 22;
    const badgeX = PAGE_W - 145;
    const badgeY = 16;
    drawText(page, `Base normativa: ${config.project?.base_normativa || "ABNT NBR 9653:2018"}.`, 58, badgeY + 8, 7.5, COLORS.muted, false, fonts, pdflib);
    page.drawRectangle({
      x: badgeX, y: badgeY, width: badgeW, height: badgeH,
      color: rgbColor(COLORS.navy, pdflib),
    });
    drawText(page, config.project?.footer_badge || "DNA  •  OpenBlast", badgeX + 23, badgeY + 8, 8, "#FFFFFF", true, fonts, pdflib);
    // Faixa vermelha na base.
    page.drawRectangle({
      x: 0, y: 0, width: PAGE_W, height: 6,
      color: rgbColor(COLORS.red, pdflib),
    });
  };

  const firstPageLayout = () => {
    const firstCardY = FIRST_PAGE_LAST_CARD_Y + (FIRST_PAGE_CARD_SLOTS - 1) * (POINT_CARD_HEIGHT + POINT_CARD_GAP);
    const pointsTitleY = firstCardY + POINT_CARD_HEIGHT + POINTS_TITLE_GAP;
    return {
      pointsTitleY, firstCardY,
      cardHeight: POINT_CARD_HEIGHT,
      cardGap: POINT_CARD_GAP,
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

    const layout = firstPageLayout();
    drawHeader(page, config, records, summary, { logo: logoImage }, fonts, pdflib);
    drawText(page, "Resumo Executivo", MARGIN, 652, 17, COLORS.text, false, fonts, pdflib);
    page.drawRectangle({
      x: MARGIN, y: 645, width: 42, height: 2,
      color: rgbColor(COLORS.red, pdflib),
    });
    drawScope(page, MARGIN, 566, PAGE_W - 2 * MARGIN, 72, config, records, summary, fonts, pdflib);
    drawConclusion(page, MARGIN, 488, PAGE_W - 2 * MARGIN, 72, records, summary, fonts, pdflib);

    drawText(page, "Pontos Monitorados", MARGIN, layout.pointsTitleY, 17, COLORS.text, false, fonts, pdflib);
    page.drawRectangle({
      x: MARGIN, y: layout.pointsTitleY - 7, width: 42, height: 2,
      color: rgbColor(COLORS.red, pdflib),
    });
    let y = layout.firstCardY;
    const cardH = layout.cardHeight;
    for (const r of records.slice(0, FIRST_PAGE_CARD_SLOTS)) {
      drawPointCard(page, MARGIN, y, PAGE_W - 2 * MARGIN, cardH, r, fonts, pdflib);
      y -= cardH + layout.cardGap;
    }
    if (records.length > FIRST_PAGE_CARD_SLOTS) {
      drawText(page, `+ ${records.length - FIRST_PAGE_CARD_SLOTS} ponto(s) adicionais no JSON consolidado.`, MARGIN + 10, y + 10, 8, COLORS.muted, false, fonts, pdflib);
    }
    drawFooter(page, config, fonts, pdflib);

    const chartPage = doc.addPage([PAGE_W, PAGE_H]);
    drawChartPage(chartPage, config, { pressure: pressureImg, vibration: vibrationImg }, fonts, pdflib);

    // Páginas extras.
    if (records.length > FIRST_PAGE_CARD_SLOTS) {
      const remaining = records.slice(FIRST_PAGE_CARD_SLOTS);
      for (let idx = 0; idx < remaining.length; idx += 8) {
        const batch = remaining.slice(idx, idx + 8);
        const extra = doc.addPage([PAGE_W, PAGE_H]);
        drawText(extra, "Pontos Monitorados - Continuação", MARGIN, PAGE_H - 55, 17, COLORS.text, false, fonts, pdflib);
        let yy = PAGE_H - 120;
        for (const r of batch) {
          drawPointCard(extra, MARGIN, yy, PAGE_W - 2 * MARGIN, cardH, r, fonts, pdflib);
          yy -= cardH + 12;
        }
        drawFooter(extra, config, fonts, pdflib);
      }
    }

    return await doc.save();
  };

  window.SismoReport = { buildPdfReport, PAGE_W, PAGE_H };
})();
