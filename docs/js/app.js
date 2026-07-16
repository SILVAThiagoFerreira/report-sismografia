// Orquestrador: drop de CSVs → parser → compliance → charts → pdf → png → zip.
// Roda 100% no navegador; nenhum arquivo sai do computador.

(() => {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const pickBtn = document.getElementById("pick-btn");
  const listEl = document.getElementById("file-list");
  const generateBtn = document.getElementById("generate-btn");
  const clearBtn = document.getElementById("clear-btn");
  const statusEl = document.getElementById("status");
  const resultsSection = document.getElementById("results-section");
  const resultsGrid = document.getElementById("results-grid");
  const zipLink = document.getElementById("zip-link");
  const zipMeta = document.getElementById("zip-meta");
  const clientInput = document.getElementById("client-input");

  /** @type {File[]} */
  let selected = [];
  /** Última geração — usada só para revogar URLs anteriores no clear. */
  let lastArtifactUrls = [];

  const formatBytes = (n) => {
    if (n === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const idx = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3));
    const value = n / Math.pow(1024, idx);
    return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
  };
  const setStatus = (text, kind = "") => {
    statusEl.textContent = text || "";
    statusEl.classList.remove("is-error", "is-ok");
    if (kind) statusEl.classList.add(`is-${kind}`);
  };
  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const renderList = () => {
    listEl.innerHTML = "";
    for (const [idx, f] of selected.entries()) {
      const li = document.createElement("li");
      li.className = "file-item";
      li.innerHTML = `
        <span class="file-item__dot" aria-hidden="true"></span>
        <span class="file-item__name">${escapeHtml(f.name)}</span>
        <span class="file-item__size">${formatBytes(f.size)}</span>
        <button type="button" class="file-item__remove" data-idx="${idx}" aria-label="Remover ${escapeHtml(f.name)}">Remover</button>
      `;
      listEl.appendChild(li);
    }
    generateBtn.disabled = selected.length === 0;
    clearBtn.hidden = selected.length === 0;
  };

  const addFiles = (files) => {
    const incoming = Array.from(files || []).filter((f) => /\.csv$/i.test(f.name));
    if (incoming.length === 0) {
      setStatus("Envie arquivos .csv exportados do sismógrafo.", "error");
      return;
    }
    const key = (f) => `${f.name}::${f.size}`;
    const seen = new Set(selected.map(key));
    for (const f of incoming) {
      if (!seen.has(key(f))) {
        selected.push(f);
        seen.add(key(f));
      }
    }
    setStatus("");
    renderList();
  };

  // ---- Interações ----

  pickBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-drag");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files) addFiles(dt.files);
  });

  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".file-item__remove");
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    selected.splice(idx, 1);
    renderList();
  });

  clearBtn.addEventListener("click", () => {
    selected = [];
    renderList();
    resultsSection.hidden = true;
    revokeLastUrls();
    setStatus("");
  });

  const revokeLastUrls = () => {
    for (const u of lastArtifactUrls) URL.revokeObjectURL(u);
    lastArtifactUrls = [];
  };

  // ---- Pipeline ----

  const readFileText = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
      r.readAsText(file, "utf-8");
    });

  const outputName = (template, ctx) =>
    template.replace(/\{(\w+)\}/g, (_, k) => ctx[k] ?? "");

  const buildOutputContext = (records, config) => {
    // A pasta canônica do Python usa event_date; se ausente, cai para a data corrente.
    const firstDate = records[0]?.event_date;
    const now = new Date();
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    const datePart = firstDate
      ? String(firstDate).replace(/-/g, "")
      : `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    return {
      date: datePart,
      time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      file_prefix: config.output?.file_prefix || "ENAEX_NSR",
      folder_prefix: config.output?.folder_prefix || "monitoramento_sismografico",
    };
  };

  const pdfPageToPngBlob = async (pdfBytes, dpi = 300) => {
    // pdf.js foi carregado como <script type="module">; a lib exporta window.pdfjsLib
    // em builds legacy, mas o build .mjs recente expõe global.pdfjsLib via ESM injection.
    // Fazemos import dinâmico para funcionar em ambos os cenários.
    let pdfjs = window.pdfjsLib;
    if (!pdfjs) {
      pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
    }
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc =
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    }
    const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
    const page = await doc.getPage(1);
    const scale = dpi / 72; // pdf.js usa unidades de 72 DPI por padrão.
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const runPipeline = async () => {
    if (selected.length === 0) return;

    const cfg = window.SISMO_CONFIG;
    const clientName = String(clientInput?.value || "").trim();
    if (!clientName) {
      clientInput?.focus();
      throw new Error("Informe a unidade de serviço antes de gerar o relatório.");
    }
    // O valor digitado substitui o padrão apenas nesta execução; a configuração
    // permanece com US MINERAÇÃO VALE-VERDE para a próxima abertura do site.
    cfg.project.client_override = clientName;
    setStatus(`Processando ${selected.length} sismograma(s)…`);

    // 1) Parse.
    const rawRecords = [];
    for (const file of selected) {
      const text = await readFileText(file);
      rawRecords.push(window.SismoParser.parseSismoCsv(file.name, text));
    }
    // 2) Compliance.
    const records = window.SismoCompliance.evaluateRecords(rawRecords, cfg);
    const summary = window.SismoCompliance.campaignSummary(records, cfg);

    // 3) Charts em canvas.
    setStatus("Gerando gráficos…");
    const pressureCanvas = window.SismoCharts.makePressureChart(records, cfg);
    const vibrationCanvas = window.SismoCharts.makeVibrationChart(records, cfg);

    // 4) PDF.
    setStatus("Montando PDF…");
    const pdfBytes = await window.SismoReport.buildPdfReport({
      records,
      summary,
      config: cfg,
      chartCanvases: { pressure: pressureCanvas, vibration: vibrationCanvas },
      logoUrl: cfg.branding?.logo_path || "assets/openblast.png",
    });

    // 5) PDF → PNG (300 DPI).
    // ATENÇÃO: pdf.js transfere/detacha o ArrayBuffer subjacente ao ler o PDF.
    // Se passarmos `pdfBytes` direto para o ZIP/blob abaixo, o conteúdo vem vazio.
    // Copiamos os bytes antes de entregar ao pdf.js para preservar o original.
    setStatus("Renderizando imagem do relatório…");
    const pdfBytesForPng = pdfBytes.slice();
    const pngBlob = await pdfPageToPngBlob(pdfBytesForPng, 300);

    // 6) Nota WhatsApp.
    const noteText = window.SismoWhatsapp.buildWhatsappNote(records, summary, cfg);
    const noteBlob = new Blob([noteText], { type: "text/plain;charset=utf-8" });

    // 7) Nomes canônicos.
    const ctx = buildOutputContext(records, cfg);
    const nameTxt = outputName(cfg.artifacts.whatsapp_note, ctx);
    const namePdf = outputName(cfg.artifacts.report_pdf, ctx);
    const namePng = outputName(cfg.artifacts.report_png, ctx);

    const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
    const runId = `${ctx.date}_${ctx.time}`;

    // 8) ZIP.
    setStatus("Empacotando ZIP…");
    const zip = new JSZip();
    zip.file(nameTxt, noteBlob);
    zip.file(namePdf, pdfBlob);
    zip.file(namePng, pngBlob);
    const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const zipName = `${ctx.file_prefix}-${ctx.date}_report.zip`;

    return {
      run_id: runId,
      artifacts: {
        whatsapp: { name: nameTxt, blob: noteBlob },
        pdf: { name: namePdf, blob: pdfBlob },
        png: { name: namePng, blob: pngBlob },
      },
      zip: { name: zipName, blob: zipBlob },
    };
  };

  const renderResults = (result) => {
    revokeLastUrls();
    resultsGrid.innerHTML = "";

    const specs = [
      {
        key: "whatsapp",
        number: "01",
        title: "Nota para WhatsApp",
        description: "Texto formatado com PVS, PSPL e status de conformidade por ponto.",
        category: "txt · WhatsApp",
        previewLabel: "Ver texto",
      },
      {
        key: "pdf",
        number: "02",
        title: "Relatório onepage",
        description: "PDF com gráficos NBR 9653, tabela de resultados e cabeçalho ENAEX.",
        category: "pdf · Relatório",
        previewLabel: "Abrir PDF",
      },
      {
        key: "png",
        number: "03",
        title: "Imagem do relatório",
        description: "Versão em imagem do relatório onepage, pronta para anexo.",
        category: "png · Imagem",
        previewLabel: "Ver imagem",
      },
    ];

    for (const spec of specs) {
      const art = result.artifacts[spec.key];
      const url = URL.createObjectURL(art.blob);
      lastArtifactUrls.push(url);
      const card = document.createElement("article");
      card.className = "result-card";
      card.innerHTML = `
        <div class="result-card__head">
          <span class="result-card__number">${spec.number}</span>
          <span class="result-card__status"><span class="result-card__status-dot"></span>PRONTO</span>
        </div>
        <h3>${escapeHtml(spec.title)}</h3>
        <p>${escapeHtml(spec.description)}</p>
        <p class="result-card__filename">${escapeHtml(art.name)} · ${formatBytes(art.blob.size)}</p>
        <div class="result-card__footer">
          <span class="result-card__category">${escapeHtml(spec.category)}</span>
          <span>
            <a class="tool-link tool-link--ghost" href="${url}" target="_blank" rel="noopener">${spec.previewLabel}</a>
            &nbsp;·&nbsp;
            <a class="tool-link" href="${url}" download="${escapeHtml(art.name)}">Baixar</a>
          </span>
        </div>
      `;
      resultsGrid.appendChild(card);
    }

    const zipUrl = URL.createObjectURL(result.zip.blob);
    lastArtifactUrls.push(zipUrl);
    zipLink.href = zipUrl;
    zipLink.setAttribute("download", result.zip.name);
    zipMeta.textContent = `run ${result.run_id} · ${formatBytes(result.zip.blob.size)}`;

    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  generateBtn.addEventListener("click", async () => {
    if (selected.length === 0) return;
    generateBtn.disabled = true;
    generateBtn.classList.add("is-loading");
    setStatus("");
    try {
      const result = await runPipeline();
      renderResults(result);
      setStatus("Relatório gerado com sucesso.", "ok");
    } catch (err) {
      console.error(err);
      setStatus(`Erro: ${err.message}`, "error");
    } finally {
      generateBtn.disabled = selected.length === 0;
      generateBtn.classList.remove("is-loading");
    }
  });
})();
