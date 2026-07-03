// Port fiel de src/parser.py — extrai metadados do CSV de sismógrafo.
// Só o cabeçalho é interpretado; o corpo de amostras (waveform) é ignorado, igual ao Python.
(() => {
  // U+0300..U+036F = bloco Unicode Combining Diacritical Marks.
  const COMBINING = /[̀-ͯ]/g;
  const stripAccents = (s) => String(s).normalize("NFD").replace(COMBINING, "");

  const normKey = (s) =>
    stripAccents(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, "");

  const parseFloatSafe = (value) => {
    if (value === null || value === undefined) return null;
    const txt = String(value).trim().replace(/ /g, " ");
    if (!txt) return null;
    const m = txt.match(/[-+]?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    const n = Number(m[0].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const parseScaledDistance = (value) => {
    const result = { scaled_distance: null, distance_m: null, charge_kg: null };
    if (!value) return result;
    const raw = String(value).match(/[-+]?\d+(?:[.,]\d+)?/g);
    if (!raw) return result;
    const nums = raw.map((n) => Number(n.replace(",", ".")));
    if (nums.length >= 1) result.scaled_distance = nums[0];
    if (nums.length >= 2) result.distance_m = nums[1];
    if (nums.length >= 3) result.charge_kg = nums[2];
    return result;
  };

  // Divide uma linha CSV respeitando aspas duplas. O parser do Python usa csv.reader;
  // aqui reproduzimos o mesmo comportamento suficiente para os cabeçalhos de sismógrafo.
  const splitCsvLine = (line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };

  const readHeaderMetadata = (text) => {
    // Remove BOM se presente.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rawLines = text.split(/\r\n|\n|\r/);
    const metadata = {};
    const titleNotes = {};
    const titleStrings = {};

    for (const line of rawLines) {
      if (!line.trim()) continue;
      const row = splitCsvLine(line);
      if (row.length >= 4) {
        const head4 = row.slice(0, 4).map(normKey);
        if (
          head4[0] === "tran" &&
          head4[1] === "vert" &&
          head4[2] === "long" &&
          head4[3] === "micl"
        ) {
          break;
        }
      }
      if (row.length >= 2) {
        const key = row[0];
        const value = row[1];
        metadata[key] = value;
        const nk = normKey(key);
        const noteMatch = nk.match(/^titlenote(\d+)$/);
        const strMatch = nk.match(/^titlestring(\d+)$/);
        if (noteMatch) titleNotes[noteMatch[1]] = value;
        if (strMatch) titleStrings[strMatch[1]] = value;
      }
    }
    // Reproduz alias Title::<Nota> = TitleString<N>.
    for (const [idx, note] of Object.entries(titleNotes)) {
      const value = titleStrings[idx] ?? "";
      if (note) metadata[`Title::${note}`] = value;
    }
    return metadata;
  };

  const parseSismoCsv = (fileName, text) => {
    const meta = readHeaderMetadata(text);
    const normalized = {};
    for (const [k, v] of Object.entries(meta)) normalized[normKey(k)] = v;

    const location =
      normalized["titlelocation"] ||
      meta["Title::Location"] ||
      meta["TitleString1"] ||
      fileName.replace(/\.csv$/i, "");
    const client =
      normalized["titleclient"] || meta["Title::Client"] || meta["TitleString2"];
    const company =
      normalized["titlecompany"] || meta["Title::Company"] || meta["TitleString3"];

    const scaled = parseScaledDistance(meta["ScaledDistance"] || "");
    const gpsDistance =
      parseFloatSafe(meta["GpsDistance"]) ?? scaled.distance_m;

    return {
      source_file: fileName,
      event_date: meta["EventDate"] || null,
      event_time: meta["EventTime"] || null,
      point_name: String(location).trim() || fileName.replace(/\.csv$/i, ""),
      client: client || null,
      company: company || null,
      serial_number: meta["SerialNumber"] || null,
      calibration: meta["Calibration"] || null,
      gps_distance_m: gpsDistance,
      scaled_distance: scaled.scaled_distance,
      charge_kg: scaled.charge_kg,
      pspl_db: parseFloatSafe(meta["MicPSPL"]),
      mic_freq_hz: parseFloatSafe(meta["MicZCFreq"]),
      pvs_mm_s: parseFloatSafe(meta["PeakVectorSum"]),
      tran_ppv_mm_s: parseFloatSafe(meta["TranPPV"]),
      vert_ppv_mm_s: parseFloatSafe(meta["VertPPV"]),
      long_ppv_mm_s: parseFloatSafe(meta["LongPPV"]),
      tran_freq_hz: parseFloatSafe(meta["TranZCFreq"]),
      vert_freq_hz: parseFloatSafe(meta["VertZCFreq"]),
      long_freq_hz: parseFloatSafe(meta["LongZCFreq"]),
      tran_time_peak_s: parseFloatSafe(meta["TranTimeofPeak"]),
      vert_time_peak_s: parseFloatSafe(meta["VertTimeofPeak"]),
      long_time_peak_s: parseFloatSafe(meta["LongTimeofPeak"]),
      mic_time_peak_s: parseFloatSafe(meta["MicTimeofPeak"]),
      mic_test_result: meta["MicTestResults"] || null,
      tran_test_result: meta["TranTestResults"] || null,
      vert_test_result: meta["VertTestResults"] || null,
      long_test_result: meta["LongTestResults"] || null,
      metadata: meta,
    };
  };

  window.SismoParser = { parseSismoCsv, parseFloatSafe, normKey };
})();
