const CHANNEL_ORDER = ["Tran", "Vert", "Long"];
const LIMIT_FORMULA = (freq) => (freq <= 4 ? 15 : freq <= 15 ? 15 + (freq - 4) * (5 / 11) : freq <= 40 ? 20 + (freq - 15) * (30 / 25) : 50);

const state = { files: [], report: null };
const els = Object.fromEntries([
  "csvInput","dropZone","fileList","generateBtn","pdfBtn","pngBtn","jsonBtn","txtBtn",
  "thresholdInput","clientInput","statusBox","validationBox","summaryGrid","reportCanvas","footerHint","recordHint",
].map((id) => [id, document.getElementById(id)]));

els.thresholdInput.value = "0.8";

const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "N/D" : Number(v).toFixed(d).replace(".", ","));
const fmtDate = (v) => v instanceof Date ? v.toLocaleDateString("pt-BR") : (v ? new Date(v).toLocaleDateString("pt-BR") : "N/D");
const clean = (s) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const parseNum = (v) => { if (v == null) return null; const m = String(v).trim().replace(",", ".").match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
const parseDate = (v) => {
  const t = String(v ?? "").trim(); if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/) || t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) || t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) return m[1].length === 4 ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d;
};
const toBool = (v) => /^(1|true|sim|yes|y|passed|passed)$/i.test(String(v ?? "").trim());

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[clean(k)] = v;
  return out;
}

function parseRecord(row, sourceFile) {
  const r = normalizeRow(row);
  const eventDate = parseDate(r.eventdate || r.dataevento || r.data);
  const channels = Object.fromEntries(CHANNEL_ORDER.map((axis) => {
    const key = axis.toLowerCase();
    const ppv = parseNum(r[`${key}ppv`] ?? r[`${key}ppv_mm_s`] ?? r[`${key}_ppv`] ?? r[`${key}_ppv_mm_s`]);
    const freq = parseNum(r[`${key}zcfreq`] ?? r[`${key}zc_freq`] ?? r[`${key}zc_freq_hz`] ?? r[`${key}freq`]);
    return [axis, { axis, ppv_mm_s: ppv, zc_freq_hz: freq, reference_limit_mm_s: freq == null ? null : LIMIT_FORMULA(freq), compliant: ppv == null || freq == null ? null : ppv <= LIMIT_FORMULA(freq) }];
  }));
  const peak = parseNum(r.peakvectorsum || r.peak_vector_sum || r.pvs);
  return {
    source_file: sourceFile,
    location: r.titlestring1 || r.location || r.ponto || sourceFile.replace(/\.[^.]+$/, ""),
    client: r.titlestring2 || r.client || r.cliente || null,
    user_name: r.titlestring3 || r.user_name || r.usuario || null,
    serial_number: r.serialnumber || r.serial_number || null,
    battery_level: r.batterylevel || r.battery_level || null,
    unit_calibration: r.calibration || r.unit_calibration || null,
    file_name: r.filename || r.file_name || null,
    scaled_distance: parseNum(r.scaleddistance || r.scaled_distance),
    distance_m: parseNum(r.distance_m),
    charge_kg: parseNum(r.charge_kg),
    raw_scaled_distance: r.scaleddistance || r.raw_scaled_distance || null,
    event_date: eventDate,
    pspl_db_l: parseNum(r.micpspl || r.pspl_db_l || r.pspl),
    microphone_zc_freq_hz: parseNum(r.miczcfreq || r.microphone_zc_freq_hz),
    peak_vector_sum_mm_s: peak,
    channels,
    pspl_compliant: r.pspl_compliant == null || r.pspl_compliant === "" ? (parseNum(r.micpspl || r.pspl_db_l) == null ? null : parseNum(r.micpspl || r.pspl_db_l) <= 134) : toBool(r.pspl_compliant),
  };
}

function primaryClient(records) {
  return records.find((r) => r.user_name || r.client)?.user_name || records.find((r) => r.client)?.client || "OPENBLAST";
}

function alertLocations(records, threshold) {
  return records.filter((r) => [r.peak_vector_sum_mm_s, ...CHANNEL_ORDER.map((a) => r.channels[a].ppv_mm_s)].some((v) => v != null && v > threshold)).map((r) => r.location);
}
function anyAlert(records, threshold) { return alertLocations(records, threshold).length > 0; }
function statusText(records, threshold) {
  if (!records.length) return "Aguardando upload de CSV.";
  return anyAlert(records, threshold)
    ? `⚠️ Índices de vibração: acima de ${fmt(threshold, 1)} mm/s. Pontos: ${alertLocations(records, threshold).join(", ")}.`
    : `✅ Índices de vibração: abaixo de ${fmt(threshold, 1)} mm/s.`;
}
function allCompliant(records) {
  const known = records.flatMap((r) => [r.pspl_compliant, ...CHANNEL_ORDER.map((a) => r.channels[a].compliant)]).filter((v) => v !== null);
  return known.length ? known.every(Boolean) : null;
}

function readCsvLike(text, fileName) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const matches = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
    if (matches.length >= 2) rows.push(matches);
  }
  if (rows.length < 5) throw new Error("Formato CSV insuficiente para leitura.");
  const map = new Map(rows.map(([k, v]) => [k, v]));
  const channels = ["Tran", "Vert", "Long"].map((axis) => ({
    axis,
    ppv_mm_s: parseNum(map.get(`${axis}PPV`)),
    zc_freq_hz: parseNum(map.get(`${axis}ZCFreq`)),
    reference_limit_mm_s: null,
    compliant: null,
  }));
  channels.forEach((c) => { if (c.zc_freq_hz != null) c.reference_limit_mm_s = LIMIT_FORMULA(c.zc_freq_hz); if (c.ppv_mm_s != null && c.reference_limit_mm_s != null) c.compliant = c.ppv_mm_s <= c.reference_limit_mm_s; });
  return {
    source_file: fileName,
    location: map.get("TitleString1") || fileName.replace(/\.[^.]+$/, ""),
    client: map.get("TitleString2") || null,
    user_name: map.get("TitleString3") || null,
    serial_number: map.get("SerialNumber") || null,
    battery_level: map.get("BatteryLevel") || null,
    unit_calibration: map.get("Calibration") || null,
    file_name: map.get("FileName") || null,
    scaled_distance: parseNum(map.get("ScaledDistance")),
    distance_m: parseNum((map.get("ScaledDistance") || "").match(/\(([\d.,]+)\s*m/)?.[1]),
    charge_kg: parseNum((map.get("ScaledDistance") || "").match(/,\s*([\d.,]+)\s*kg\)/)?.[1]),
    raw_scaled_distance: map.get("ScaledDistance") || null,
    event_date: parseDate(map.get("EventDate")),
    pspl_db_l: parseNum(map.get("MicPSPL")),
    microphone_zc_freq_hz: parseNum(map.get("MicZCFreq")),
    peak_vector_sum_mm_s: parseNum(map.get("PeakVectorSum")),
    channels: Object.fromEntries(channels.map((c) => [c.axis, c])),
    pspl_compliant: parseNum(map.get("MicPSPL")) == null ? null : parseNum(map.get("MicPSPL")) <= 134,
  };
}

async function readFiles(files) {
  const records = [];
  for (const file of files) {
    const text = await file.text();
    try {
      records.push(readCsvLike(text, file.name));
    } catch {
      if (!window.Papa) throw new Error(`Não foi possível ler ${file.name}.`);
      const parsed = window.Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: "", transformHeader: (h) => h });
      if (parsed.errors.length) throw new Error(`Erro ao ler ${file.name}: ${parsed.errors[0].message}`);
      for (const row of parsed.data) records.push(parseRecord(row, file.name));
    }
  }
  return records;
}

function drawLogo(ctx, x, y, w, h) {
  const img = new Image();
  img.src = "./assets/openblast-brand.png";
  if (img.complete) ctx.drawImage(img, x, y, w, h);
  else img.onload = () => ctx.drawImage(img, x, y, w, h);
}

function render(report) {
  const canvas = els.reportCanvas;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const W = 1240, H = 1754;
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = "100%"; canvas.style.height = "100%";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#f6f7f8"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(42, 38, W - 84, H - 76);
  ctx.fillStyle = "#e5231b"; ctx.fillRect(42, 38, 10, H - 76);
  drawLogo(ctx, 72, 62, 220, 62);
  ctx.fillStyle = "#0f1720"; ctx.font = "700 32px Arial"; ctx.fillText("Relatório Executivo de Sismografia", 72, 150);
  ctx.fillStyle = "#667487"; ctx.font = "16px Arial"; ctx.fillText(`Cliente: ${report.client}  •  ${report.records.length} registros  •  ${new Date(report.generatedAt).toLocaleString("pt-BR")}`, 72, 182);

  const card = (x, y, w, h, title, body, accent = "#eaecef") => {
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#d7dce2"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(x, y, w, 46, 18); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 18px Arial"; ctx.fillText(title, x + 18, y + 30);
    ctx.fillStyle = "#18202a"; body(x + 18, y + 70, w - 36, h - 86);
  };

  card(72, 230, W - 144, 116, "Escopo da campanha", (x, y, w) => { wrap(ctx, report.overview, x, y, w, 22); }, "#1c2240");
  card(72, 368, W - 144, 130, "Conclusão técnica", (x, y, w) => { wrap(ctx, report.conclusion, x, y, w, 22); }, "#7bc51c");

  const half = (W - 164) / 2;
  card(72, 528, half, 330, "Sinais acústicos", (x, y, w) => {
    ctx.fillStyle = "#f8fafb"; ctx.beginPath(); ctx.roundRect(x, y, w, 250, 16); ctx.fill();
    list(ctx, report.records.map((r) => `${r.location}  •  PSPL ${fmt(r.pspl_db_l, 1)} dB(L)`), x + 16, y + 20, 22);
  }, "#434c5b");
  card(92 + half, 528, half, 330, "Vibração x Limite", (x, y, w) => {
    ctx.fillStyle = "#f8fafb"; ctx.beginPath(); ctx.roundRect(x, y, w, 250, 16); ctx.fill();
    list(ctx, report.records.map((r) => `${r.location}  •  PPV máx ${fmt(Math.max(r.peak_vector_sum_mm_s ?? 0, ...CHANNEL_ORDER.map((a) => r.channels[a].ppv_mm_s ?? 0)), 3)} mm/s`), x + 16, y + 20, 22);
  }, "#7bc51c");

  ctx.fillStyle = "#0f1720"; ctx.font = "700 24px Arial"; ctx.fillText("Pontos monitorados", 72, 904);
  drawRows(ctx, report.records.slice(0, 3), 72, 938, W - 144, 152, false);
  if (report.records.length > 3) {
    ctx.fillStyle = "#0f1720"; ctx.font = "700 22px Arial"; ctx.fillText("Complementares", 72, 1138);
    drawRows(ctx, report.records.slice(3), 72, 1170, W - 144, 110, true);
  }
  ctx.fillStyle = "#667487"; ctx.font = "14px Arial"; ctx.fillText("Base normativa: ABNT NBR 9653:2018.", 72, H - 44);
}

function wrap(ctx, text, x, y, w, lh) {
  const words = String(text).split(/\s+/); let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > w && line) { ctx.fillText(line, x, y); y += lh; line = word; } else line = test;
  });
  if (line) ctx.fillText(line, x, y);
}

function list(ctx, lines, x, y, lh) {
  ctx.fillStyle = "#18202a"; ctx.font = "16px Arial";
  lines.slice(0, 10).forEach((line, i) => ctx.fillText(line.length > 72 ? `${line.slice(0, 69)}...` : line, x, y + i * lh));
}

function drawRows(ctx, records, x, y, w, rowH, compact) {
  records.forEach((r, i) => {
    const top = y + i * (rowH + 14);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#d7dce2"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, top, w, rowH, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#434c5b"; ctx.beginPath(); ctx.roundRect(x, top, w, 26, 14); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "700 15px Arial"; ctx.fillText(r.location, x + 14, top + 18);
    ctx.fillStyle = "#18202a"; ctx.font = "13px Arial";
    ctx.fillText(`${fmtDate(r.event_date)} | PSPL ${fmt(r.pspl_db_l, 1)} dB(L) | PVS ${fmt(r.peak_vector_sum_mm_s, 3)} mm/s`, x + 14, top + 49);
    if (!compact) ctx.fillText(`Tran ${fmt(r.channels.Tran.ppv_mm_s, 3)} | Vert ${fmt(r.channels.Vert.ppv_mm_s, 3)} | Long ${fmt(r.channels.Long.ppv_mm_s, 3)}`, x + 14, top + 71);
  });
}

function updateUI(report) {
  state.report = report;
  els.statusBox.value = report.status;
  els.validationBox.textContent = `Arquivos: ${state.files.map((f) => f.name).join(" • ")}`;
  els.footerHint.textContent = `Gerado em ${new Date(report.generatedAt).toLocaleString("pt-BR")}`;
  els.recordHint.textContent = `${report.records.length} registros`;
  els.summaryGrid.innerHTML = [
    ["Registros", report.records.length, "pontos processados"],
    ["Alertas", alertLocations(report.records, Number(els.thresholdInput.value)).length, "acima do limite"],
    ["Cliente", report.client, "cabeçalho do relatório"],
    ["Conformidade", allCompliant(report.records) === false ? "Verificar" : "OK", "PSPL + vibração"],
  ].map(([label, value, hint]) => `<div class="metric"><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`).join("");
  render(report);
  [els.pdfBtn, els.pngBtn, els.jsonBtn, els.txtBtn].forEach((b) => (b.disabled = false));
}

function download(name, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

async function generate() {
  if (!state.files.length) return;
  const records = await readFiles(state.files);
  if (!records.length) throw new Error("Nenhum registro válido encontrado.");
  const threshold = Number(els.thresholdInput.value) || 0.8;
  const client = els.clientInput.value.trim() || primaryClient(records);
  const report = {
    generatedAt: new Date().toISOString(),
    client,
    records,
    status: statusText(records, threshold),
    overview: `Cliente ${client}. ${records.length} registros processados. ${statusText(records, threshold)}`,
    conclusion: allCompliant(records) === false
      ? `Ocorrência com necessidade de verificação manual. Pontos com alerta: ${alertLocations(records, threshold).join(", ")}.`
      : "Todos os pontos analisados ficaram em conformidade com os limites configurados.",
  };
  updateUI(report);
}

function setFiles(files) {
  state.files = [...files].filter((f) => f.name.toLowerCase().endsWith(".csv"));
  els.fileList.innerHTML = state.files.map((f) => `<div class="file-chip"><span>${f.name}</span><span>${Math.round(f.size / 1024)} KB</span></div>`).join("");
  els.generateBtn.disabled = !state.files.length;
}

els.csvInput.addEventListener("change", () => setFiles(els.csvInput.files || []));
els.generateBtn.addEventListener("click", async () => { try { await generate(); } catch (e) { els.statusBox.value = e.message; els.validationBox.textContent = "Falha ao processar os CSVs."; } });
els.pdfBtn.addEventListener("click", async () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
  pdf.addImage(els.reportCanvas.toDataURL("image/png"), "PNG", 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
  pdf.save(`OPENBLAST_NSR-${new Date().toISOString().slice(0, 10)}.pdf`);
});
els.pngBtn.addEventListener("click", () => { const a = document.createElement("a"); a.href = els.reportCanvas.toDataURL("image/png"); a.download = `OPENBLAST_NSR-${new Date().toISOString().slice(0, 10)}.png`; a.click(); });
els.jsonBtn.addEventListener("click", () => download(`DADOS_EXTRAIDOS_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ generated_at: state.report.generatedAt, source_files: state.files.map((f) => f.name), records: state.report.records }, null, 2), "application/json;charset=utf-8"));
els.txtBtn.addEventListener("click", () => download(`NOTA_RAPIDA_WHATSAPP_${new Date().toISOString().slice(0, 10)}.txt`, ["📊 *MONITORAMENTO SISMOGRÁFICO - OPENBLAST*","---",`🏢 *Cliente:* ${state.report.client}`,`📅 *Data:* ${fmtDate(state.report.records[0]?.event_date)}`,"",state.report.status,"",...state.report.records.map((r) => `• ${r.location} | PSPL ${fmt(r.pspl_db_l, 1)} dB(L) | PVS ${fmt(r.peak_vector_sum_mm_s, 3)} mm/s`)].join("\n")));

["dragenter","dragover"].forEach((ev) => els.dropZone.addEventListener(ev, (e) => { e.preventDefault(); els.dropZone.classList.add("dragover"); }));
["dragleave","drop"].forEach((ev) => els.dropZone.addEventListener(ev, (e) => { e.preventDefault(); els.dropZone.classList.remove("dragover"); }));
els.dropZone.addEventListener("drop", (e) => setFiles(e.dataTransfer.files || []));
els.statusBox.value = "Aguardando upload de CSV.";
els.validationBox.textContent = "Envie um ou mais CSVs para liberar os botões de exportação.";
