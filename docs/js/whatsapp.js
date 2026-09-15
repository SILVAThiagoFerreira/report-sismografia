// Port fiel de src/whatsapp.py — texto da nota para WhatsApp.
(() => {
  const fmtNum = (value, digits = 3, qualifier = null) => {
    if (value === null || value === undefined) return "N/D";
    const text = Number(value).toFixed(digits).replace(".", ",");
    return ["<", ">"].includes(qualifier) ? `${qualifier}${text}` : text;
  };

  const fmtRecordNum = (record, field, digits = 3) =>
    fmtNum(record?.[field], digits, record?.numeric_qualifiers?.[field]);

  const fmtDate = (value) => {
    if (!value) return "N/D";
    const parts = String(value).split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return String(value);
  };

  const fmtLimit = (value) => {
    if (value === null || value === undefined) return "N/D";
    return String(value).replace(".", ",");
  };

  const buildWhatsappNote = (records, summary, config) => {
    const limits = config.limits || {};
    const vibLimit = limits.vibration_status_mm_s ?? 0.8;
    const eventDate = fmtDate(summary.event_date);
    const client =
      summary.client || config.project?.client_default || "N/D";
    const baseNormativa =
      config.project?.base_normativa || "NBR 9653:2018";

    const overLimitPoints = records
      .filter((r) => r.evaluation?.vibration_status_ok === false)
      .map((r) => r.point_name || "N/D");
    const belowLimit = summary.all_below_configured_vibration_limit;

    let vibrationStatus;
    let statusFinal;
    if (belowLimit === false) {
      vibrationStatus = `⚠️ Índices de vibração: acima de ${fmtLimit(
        vibLimit
      )} mm/s. Pontos: ${
        overLimitPoints.length ? overLimitPoints.join(", ") : "N/D"
      }.`;
      statusFinal = `⚠️ *STATUS:* Verificar pontos acima do limite da *${baseNormativa}*.`;
    } else if (belowLimit === true) {
      vibrationStatus = `✅ Índices de vibração: abaixo de ${fmtLimit(
        vibLimit
      )} mm/s.`;
      statusFinal = `✅ *STATUS:* Todos os parâmetros estão em conformidade com a *${baseNormativa}*.`;
    } else {
      vibrationStatus = "⚠️ Índices de vibração: dados insuficientes para avaliação.";
      statusFinal = `⚠️ *STATUS:* Verificar dados ausentes para a *${baseNormativa}*.`;
    }

    const pointLines = [];
    for (const r of records) {
      pointLines.push(
        ` *${r.point_name || "N/D"}*`,
        `   • PVS: ${fmtRecordNum(r, "pvs_mm_s", 3)} mm/s`,
        `   • PSPL: ${fmtRecordNum(r, "pspl_db", 1)} dB(L)`,
        ""
      );
    }
    if (pointLines.length) pointLines.pop();

    const lines = [
      "*MONITORAMENTO SISMOGRÁFICO — ENAEX*",
      "",
      `*Cliente:* ${client}`,
      `*Data:* ${eventDate}`,
      "",
      vibrationStatus,
      "",
      ...pointLines,
      "",
      statusFinal,
    ];
    return lines.join("\n");
  };

  window.SismoWhatsapp = { buildWhatsappNote, fmtNum, fmtDate };
})();
