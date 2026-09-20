// Validação explícita do contrato web antes da avaliação e da exportação.
(() => {
  const REQUIRED_FIELDS = [
    "source_file", "event_date", "point_name", "pspl_db", "pvs_mm_s",
    "tran_ppv_mm_s", "vert_ppv_mm_s", "long_ppv_mm_s",
  ];
  const OPTIONAL_NUMERIC_FIELDS = [
    "gps_distance_m", "scaled_distance", "charge_kg", "mic_freq_hz",
    "tran_freq_hz", "vert_freq_hz", "long_freq_hz",
  ];
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  const finiteNumber = (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;

  const validateRecords = (records, config) => {
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error("Nenhum CSV válido foi encontrado.");
    }
    const eventDates = new Set();
    records.forEach((record, index) => {
      const label = `Arquivo ${index + 1}`;
      if (!record || typeof record !== "object") throw new Error(`${label}: registro inválido.`);
      for (const field of REQUIRED_FIELDS) {
        if (record[field] === null || record[field] === undefined || record[field] === "") {
          throw new Error(`${label}: campo obrigatório ausente (${field}).`);
        }
      }
      if (!DATE_PATTERN.test(String(record.event_date))) {
        throw new Error(`${label}: data do evento inválida.`);
      }
      eventDates.add(String(record.event_date));
      for (const field of ["pspl_db", "pvs_mm_s", "tran_ppv_mm_s", "vert_ppv_mm_s", "long_ppv_mm_s"]) {
        if (!finiteNumber(record[field])) throw new Error(`${label}: valor inválido em ${field}.`);
      }
      for (const field of OPTIONAL_NUMERIC_FIELDS) {
        if (record[field] !== null && record[field] !== undefined && !finiteNumber(record[field])) {
          throw new Error(`${label}: valor inválido em ${field}.`);
        }
      }
      const qualifiers = record.numeric_qualifiers || {};
      if (typeof qualifiers !== "object" || Object.values(qualifiers).some((value) => !["<", ">"].includes(value))) {
        throw new Error(`${label}: qualificador de medição inválido.`);
      }
    });
    if (config.processing?.require_single_event_date !== false && eventDates.size > 1) {
      throw new Error("Os CSVs possuem datas de evento diferentes. Separe as campanhas antes de gerar.");
    }
    return records;
  };

  const orderRecords = (records, config) => {
    const order = config.processing?.record_order || "source_order";
    if (order === "source_order") {
      // O parser Python percorre os caminhos em ordem estável; ordenar pelos
      // nomes recebidos mantém o mesmo contrato quando o usuário seleciona
      // os arquivos em uma ordem diferente no navegador.
      return [...records].sort((a, b) =>
        String(a.source_file || a.point_name || "").localeCompare(
          String(b.source_file || b.point_name || ""),
          "pt-BR"
        )
      );
    }
    if (order !== "gps_distance_ascending") throw new Error(`Ordenação configurada não suportada: ${order}.`);
    return [...records].sort((a, b) => {
      const aMissing = a.gps_distance_m === null || a.gps_distance_m === undefined;
      const bMissing = b.gps_distance_m === null || b.gps_distance_m === undefined;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (!aMissing && a.gps_distance_m !== b.gps_distance_m) return a.gps_distance_m - b.gps_distance_m;
      return String(a.point_name || a.source_file).localeCompare(String(b.point_name || b.source_file), "pt-BR");
    });
  };

  window.SismoValidation = { validateRecords, orderRecords };
})();
