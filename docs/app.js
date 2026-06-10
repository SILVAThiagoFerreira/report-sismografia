const CHANNEL_ORDER = ["Tran", "Vert", "Long"];
const DEFAULT_THRESHOLD = 0.8;

const state = {
  files: [],
  records: [],
  report: null,
};

const els = {
  csvInput: document.getElementById("csvInput"),
  dropZone: document.getElementById("dropZone"),
  fileList: document.getElementById("fileList"),
  generateBtn: document.getElementById("generateBtn"),
  pdfBtn: document.getElementById("pdfBtn"),
  pngBtn: document.getElementById("pngBtn"),
  jsonBtn: document.getElementById("jsonBtn"),
  txtBtn: document.getElementById("txtBtn"),
  thresholdInput: document.getElementById("thresholdInput"),
  clientInput: document.getElementById("clientInput"),
  statusBox: document.getElementById("statusBox"),
  validationBox: document.getElementById("validationBox"),
  summaryGrid: document.getElementById("summaryGrid"),
  reportCanvas: document.getElementById("reportCanvas"),
  footerHint: document.getElementById("footerHint"),
  recordHint: document.getElementById("recordHint"),
};

els.thresholdInput.value = String(DEFAULT_THRESHOLD);

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(",", ".");
  if (!text) return null;
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{4})\/(\d{2})\/(\d{2})$/,
  ];
  for (const pattern of formats) {
    const match = text.match(pattern);
    if (!match) continue;
    const parts = match.slice(1).map(Number);
    const date = pattern === formats[1]
      ? new Date(parts[2], parts[1] - 1, parts[0])
      : new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function fmt(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/D";
  return Number(value).toFixed(decimals).replace(".", ",");
}

function fmtDate(value) {
  if (!value) return "N/D";
  const d = value instanceof Date ? value : parseDate(value);
  if (!d) return "N/D";
  return d.toLocaleDateString("pt-BR");
}

function normalizeKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function rowToObject(row) {
  const obj = {};
  for (const [key, value] of Object.entries(row)) obj[normalizeKey(key)] = value;
  return obj;
}

function buildChannel(axis, row) {
  const ppv = parseNumber(row[`${axis.toLowerCase()}_ppv_mm_s`] ?? row[`${axis.toLowerCase()}_ppv`] ?? row[`${axis.toLowerCase()}_mm_s`]);
  const freq = parseNumber(row[`${axis.toLowerCase()}_zc_freq_hz`] ?? row[`${axis.toLowerCase()}_frequency_hz`] ?? row[`${axis.toLowerCase()}_freq_hz`]);
  const limit = freq === null ? null : freq <= 4 ? 15 : freq <= 15 ? 15 + ((freq - 4) * (5 / 11)) : freq <= 40 ? 20 + ((freq - 15) * (30 / 25)) : 50;
  return {
    axis,
    ppv_mm_s: ppv,
    zc_freq_hz: freq,
    reference_limit_mm_s: limit,
    compliant: ppv === null || limit === null ? null : ppv <= limit,
  };
}

function parseRecord(row, sourceFile) {
  const r = rowToObject(row);
  const record = {
    source_file: sourceFile,
    location: r.location || r.ponto || r.localizacao || sourceFile.replace(/\.[^.]+$/, ""),
    client: r.client || r.cliente || null,
    user_name: r.user_name || r.usuario || null,
    serial_number: r.serial_number || r.serial || null,
    battery_level: r.battery_level || r.bateria || null,
    unit_calibration: r.unit_calibration || r.calibracao || null,
    file_name: r.file_name || r.nome_arquivo || null,
    scaled_distance: parseNumber(r.scaled_distance || r.distancia_escalada),
    distance_m: parseNumber(r.distance_m || r.distancia_m),
    charge_kg: parseNumber(r.charge_kg || r.carga_kg),
    raw_scaled_distance: r.raw_scaled_distance || null,
    event_date: parseDate(r.event_date || r.data_evento || r.data),
    pspl_db_l: parseNumber(r.pspl_db_l || r.pspl),
    microphone_zc_freq_hz: parseNumber(r.microphone_zc_freq_hz || r.microfone_zc_freq_hz),
    peak_vector_sum_mm_s: parseNumber(r.peak_vector_sum_mm_s || r.peak_vector_sum || r.pvs),
    channels: Object.fromEntries(CHANNEL_ORDER.map((axis) => [axis, buildChannel(axis, r)])),
  };
  const psplCompliant = r.pspl_compliant;
  record.pspl_compliant = psplCompliant === undefined || psplCompliant === null || psplCompliant === "" ? (record.pspl_db_l === null ? null : record.pspl_db_l <= 134) : /^(1|true|sim|yes|y)$/i.test(String(psplCompliant));
  return record;
}

function anyAlert(records, threshold) {
  return records.some((record) => {
    const values = [record.peak_vector_sum_mm_s, ...CHANNEL_ORDER.map((axis) => record.channels[axis].ppv_mm_s)];
    return values.some((value) => value !== null && value > threshold);
  });
}

function alertLocations(records, threshold) {
  return records.filter((record) => {
    const values = [record.peak_vector_sum_mm_s, ...CHANNEL_ORDER.map((axis) => record.channels[axis].ppv_mm_s)];
    return values.some((value) => value !== null && value > threshold);
  }).map((record) => record.location);
}

function primaryClient(records) {
  return records.find((r) => r.user_name || r.client)?.user_name || records.find((r) => r.client)?.client || "ENAEX";
}

function statusText(records, threshold) {
  if (!records.length) return null;
  if (anyAlert(records, threshold)) {
    return `⚠️ Índices de vibração: acima de ${fmt(threshold, 1)} mm/s. Pontos: ${alertLocations(records, threshold).join(", ")}.`;
  }
  return `✅ Índices de vibração: abaixo de ${fmt(threshold, 1)} mm/s.`;
}

function allCompliant(records) {
  const states = records.map((record) => {
    const channelStates = Object.values(record.channels).map((c) => c.compliant).filter((v) => v !== null);
    const known = [record.pspl_compliant, channelStates.length ? channelStates.every(Boolean) : null].filter((v) => v !== null);
    return known.length ? known.every(Boolean) : null;
  }).filter((v) => v !== null);
  return states.length ? states.every(Boolean) : null;
}

function summaryStats(records, threshold) {
  const alerts = alertLocations(records, threshold).length;
  return [
    { label: "Registros", value: records.length, hint: "pontos processados" },
    { label: "Alertas", value: alerts, hint: "acima do limite" },
    { label: "Cliente", value: primaryClient(records), hint: "cabeçalho" },
    { label: "Conformidade", value: allCompliant(records) === false ? "Verificar" : "OK", hint: "PSPL + vibração" },
  ];
}

function updateFileList() {
  els.fileList.innerHTML = "";
  for (const file of state.files) {
    const item = document.createElement("div");
    item.className = "file-chip";
    item.innerHTML = `<span>${file.name}</span><span>${Math.round(file.size / 1024)} KB</span>`;
    els.fileList.appendChild(item);
  }
}

function drawReport(canvas, report) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = 1240;
  const height = 1754;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderPage(ctx, width, height, report);
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, title, accent, body, darkTitle = true) {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.08)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  roundedRect(ctx, x, y, w, h, 18);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = accent;
  roundedRect(ctx, x, y, w, 52, 18);
  ctx.fill();
  ctx.fillStyle = darkTitle ? "#fff" : "#18202a";
  ctx.font = "bold 22px Arial";
  ctx.fillText(title, x + 20, y + 34);
  ctx.fillStyle = "#18202a";
  body(ctx, x + 18, y + 70, w - 36, h - 82);
}

function renderPage(ctx, width, height, report) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f1f1f1";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e5231b";
  ctx.fillRect(0, height - 10, width, 10);

  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, 30, 28, width - 60, 96, 20);
  ctx.fill();
  ctx.fillStyle = "#e5231b";
  ctx.font = "bold 30px Arial";
  ctx.fillText("MONITORAMENTO SISMOGRÁFICO", 56, 72);
  ctx.fillStyle = "#667487";
  ctx.font = "bold 21px Arial";
  ctx.fillText(report.client, 56, 105);
  ctx.fillStyle = "#18202a";
  ctx.font = "16px Arial";
  ctx.fillText(`${report.records.length} ponto(s) | Gerado em ${new Date(report.generatedAt).toLocaleString("pt-BR")}`, 56, 130);

  panel(ctx, 30, 150, width - 60, 110, "Escopo da Campanha", "#7bc51c", (c, x, y, w) => {
    drawWrapped(c, report.overview, x, y, w, 22);
  }, false);

  panel(ctx, 30, 280, width - 60, 130, "Conclusão Técnica", "#7bc51c", (c, x, y, w) => {
    drawWrapped(c, report.conclusion, x, y, w, 21);
  }, false);

  const half = (width - 78) / 2;
  panel(ctx, 30, 430, half, 350, "Pressão Sonora x Distância", "#434c5b", (c, x, y, w, h) => {
    c.fillStyle = "#fafafa";
    roundedRect(c, x, y, w, h, 14);
    c.fill();
    c.fillStyle = "#667487";
    c.font = "14px Arial";
    c.fillText("Visualização resumida dos valores registrados.", x + 16, y + 28);
    drawMiniList(c, report.records.map((r) => `${r.location}: PSPL ${fmt(r.pspl_db_l, 1)} dB(L)`), x + 16, y + 58, w - 32, 22);
  }, false);
  panel(ctx, 48 + half, 430, half, 350, "PPV x Limite ABNT", "#7bc51c", (c, x, y, w, h) => {
    c.fillStyle = "#fafafa";
    roundedRect(c, x, y, w, h, 14);
    c.fill();
    c.fillStyle = "#667487";
    c.font = "14px Arial";
    c.fillText("Limite configurado na interface.", x + 16, y + 28);
    drawMiniList(c, report.records.map((r) => `${r.location}: ${fmt(maxPPV(r), 3)} mm/s`), x + 16, y + 58, w - 32, 22);
  }, false);

  ctx.fillStyle = "#18202a";
  ctx.font = "bold 24px Arial";
  ctx.fillText("Pontos Monitorados", 30, 840);
  drawRecords(ctx, report.records.slice(0, 3), 30, 870, width - 60, 160);

  if (report.records.length > 3) {
    ctx.fillStyle = "#e5231b";
    ctx.font = "bold 24px Arial";
    ctx.fillText("Registros Complementares", 30, 1125);
    drawRecords(ctx, report.records.slice(3), 30, 1155, width - 60, 135, true);
  }

  ctx.fillStyle = "#667487";
  ctx.font = "14px Arial";
  ctx.fillText("Base normativa: ABNT NBR 9653:2018.", 60, height - 38);
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(/\s+/);
  let line = "";
  let currentY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, currentY);
}

function drawMiniList(ctx, lines, x, y, maxWidth, lineHeight) {
  ctx.fillStyle = "#18202a";
  ctx.font = "16px Arial";
  lines.slice(0, 8).forEach((line, index) => {
    const trimmed = line.length > 60 ? `${line.slice(0, 57)}...` : line;
    ctx.fillText(trimmed, x, y + index * lineHeight);
  });
}

function drawRecords(ctx, records, x, y, w, h, compact = false) {
  const rowH = compact ? 56 : 74;
  records.forEach((record, index) => {
    const top = y + index * (rowH + 14);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, x, top, w, rowH, 14);
    ctx.fill();
    ctx.fillStyle = "#434c5b";
    roundedRect(ctx, x, top, w, 24, 14);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Arial";
    ctx.fillText(record.location, x + 14, top + 17);
    ctx.fillStyle = "#18202a";
    ctx.font = "13px Arial";
    const line1 = `${fmtDate(record.event_date)} | PSPL ${fmt(record.pspl_db_l, 1)} dB(L) | PVS ${fmt(record.peak_vector_sum_mm_s, 3)} mm/s`;
    const line2 = `Tran ${fmt(record.channels.Tran.ppv_mm_s, 3)} | Vert ${fmt(record.channels.Vert.ppv_mm_s, 3)} | Long ${fmt(record.channels.Long.ppv_mm_s, 3)}`;
    ctx.fillText(line1, x + 14, top + 45);
    if (!compact) ctx.fillText(line2, x + 14, top + 63);
  });
}

function maxPPV(record) {
  return Math.max(record.peak_vector_sum_mm_s ?? 0, ...CHANNEL_ORDER.map((axis) => record.channels[axis].ppv_mm_s ?? 0));
}

async function readFiles(files) {
  const parsed = [];
  for (const file of files) {
    const text = await file.text();
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    if (result.errors.length) {
      throw new Error(`Erro ao ler ${file.name}: ${result.errors[0].message}`);
    }
    for (const row of result.data) parsed.push(parseRecord(row, file.name));
  }
  return parsed;
}

function buildReport(records, threshold) {
  const generatedAt = new Date().toISOString();
  const client = els.clientInput.value.trim() || primaryClient(records);
  const status = statusText(records, threshold);
  const alertList = alertLocations(records, threshold);
  return {
    generatedAt,
    client,
    records,
    overview: `Data do evento: ${records.some((r) => r.event_date) ? `${fmtDate(records[0].event_date)}${records.length > 1 ? ` a ${fmtDate(records[records.length - 1].event_date)}` : ""}` : "N/D"}. Cliente: ${client}. ${records.length} registros processados.${status ? ` ${status}` : ""}`,
    conclusion: allCompliant(records)
      ? "Todos os pontos analisados ficaram em conformidade com os limites configurados."
      : `Ocorrência com necessidade de verificação manual. Pontos com alerta: ${alertList.join(", ")}.`,
    status,
  };
}

function refreshUI(report) {
  state.report = report;
  els.statusBox.value = report.status || "Sem status disponível.";
  els.validationBox.textContent = `CSV(s) processados: ${state.files.map((f) => f.name).join(", ")}`;
  els.summaryGrid.innerHTML = "";
  for (const metric of summaryStats(report.records, Number(els.thresholdInput.value))) {
    const node = document.createElement("div");
    node.className = "metric";
    node.innerHTML = `<div class="label">${metric.label}</div><div class="value">${metric.value}</div><div class="hint">${metric.hint}</div>`;
    els.summaryGrid.appendChild(node);
  }
  els.footerHint.textContent = `Gerado em ${new Date(report.generatedAt).toLocaleString("pt-BR")}`;
  els.recordHint.textContent = `${report.records.length} registros`;
  drawReport(els.reportCanvas, report);
  for (const btn of [els.pdfBtn, els.pngBtn, els.jsonBtn, els.txtBtn]) btn.disabled = false;
}

function download(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPdf() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
  const canvas = els.reportCanvas;
  const img = canvas.toDataURL("image/png");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.addImage(img, "PNG", 0, 0, pageWidth, pageHeight);
  pdf.save(`ENAEX_NSR-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function exportPng() {
  const link = document.createElement("a");
  link.href = els.reportCanvas.toDataURL("image/png");
  link.download = `ENAEX_NSR-${new Date().toISOString().slice(0, 10)}.png`;
  link.click();
}

function exportJson() {
  download(
    `DADOS_EXTRAIDOS_${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({
      generated_at: state.report.generatedAt,
      source_files: state.files.map((f) => f.name),
      records: state.report.records,
    }, null, 2),
    "application/json;charset=utf-8",
  );
}

function exportTxt() {
  const lines = [
    "📊 *MONITORAMENTO SISMOGRÁFICO - ENAEX*",
    "---",
    `🏢 *Cliente:* ${state.report.client}`,
    `📅 *Data:* ${fmtDate(state.report.records[0]?.event_date)}`,
    "",
    state.report.status,
    "",
    ...state.report.records.map((record) => `• ${record.location} | PSPL ${fmt(record.pspl_db_l, 1)} dB(L) | PVS ${fmt(record.peak_vector_sum_mm_s, 3)} mm/s`),
  ];
  download(`NOTA_RAPIDA_WHATSAPP_${new Date().toISOString().slice(0, 10)}.txt`, lines.join("\n"));
}

async function handleGenerate() {
  if (!state.files.length) return;
  const records = await readFiles(state.files);
  if (!records.length) throw new Error("Nenhum registro válido encontrado nos CSVs.");
  const threshold = Number(els.thresholdInput.value) || DEFAULT_THRESHOLD;
  const report = buildReport(records, threshold);
  state.records = records;
  els.generateBtn.disabled = false;
  refreshUI(report);
}

function setFiles(files) {
  state.files = [...files];
  updateFileList();
  els.generateBtn.disabled = !state.files.length;
}

els.csvInput.addEventListener("change", () => setFiles(els.csvInput.files || []));
els.generateBtn.addEventListener("click", async () => {
  try {
    await handleGenerate();
  } catch (error) {
    els.statusBox.value = String(error.message || error);
    els.validationBox.textContent = "Falha ao processar os CSVs.";
  }
});
els.pdfBtn.addEventListener("click", exportPdf);
els.pngBtn.addEventListener("click", exportPng);
els.jsonBtn.addEventListener("click", exportJson);
els.txtBtn.addEventListener("click", exportTxt);

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragover");
  });
});
els.dropZone.addEventListener("drop", (event) => {
  const files = [...(event.dataTransfer?.files || [])].filter((file) => file.name.toLowerCase().endsWith(".csv"));
  setFiles(files);
});

els.statusBox.value = "Aguardando upload de CSV.";
els.validationBox.textContent = "Envie um ou mais CSVs para liberar os botões de exportação.";
