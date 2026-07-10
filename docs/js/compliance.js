// Port fiel de src/compliance.py — interpolação da curva NBR 9653 e agregação.
(() => {
  const interpolateLimit = (freqHz, curve) => {
    if (freqHz === null || freqHz === undefined) return null;
    if (!curve || curve.length === 0) return null;
    const points = curve
      .map(([x, y]) => [Number(x), Number(y)])
      .sort((a, b) => a[0] - b[0]);
    const x = Number(freqHz);
    if (x <= points[0][0]) return points[0][1];
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[i + 1];
      if (x0 <= x && x <= x1) {
        if (x1 === x0) return y1;
        const t = (x - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
      }
    }
    return points[points.length - 1][1];
  };

  const axisValues = (r) => [
    ["Tran", r.tran_ppv_mm_s, r.tran_freq_hz],
    ["Vert", r.vert_ppv_mm_s, r.vert_freq_hz],
    ["Long", r.long_ppv_mm_s, r.long_freq_hz],
  ];

  const evaluateRecord = (record, config) => {
    const limits = config.limits || {};
    const curve = limits.nbr9653_curve || [
      [0, 15], [4, 15], [15, 20], [40, 50], [1000, 50],
    ];
    const psplLimit = Number(limits.sound_pressure_db ?? 134.0);
    const vibStatusLimit = Number(limits.vibration_status_mm_s ?? 0.8);

    const axes = axisValues(record).map(([axis, ppv, freq]) => {
      const lim = interpolateLimit(freq, curve);
      const conforming = ppv == null || lim == null ? null : ppv <= lim;
      return {
        axis,
        ppv_mm_s: ppv,
        freq_hz: freq,
        nbr9653_limit_mm_s: lim,
        conforme_nbr9653: conforming,
      };
    });

    const numericPpvs = axes
      .map((a) => a.ppv_mm_s)
      .filter((v) => v !== null && v !== undefined);
    const ppvMax = numericPpvs.length ? Math.max(...numericPpvs) : null;
    let ppvMaxAxis = null;
    let ppvMaxFreq = null;
    if (ppvMax !== null) {
      for (const a of axes) {
        if (a.ppv_mm_s === ppvMax) {
          ppvMaxAxis = a.axis;
          ppvMaxFreq = a.freq_hz;
          break;
        }
      }
    }

    const pvs = record.pvs_mm_s;
    const candidates = [ppvMax, pvs].filter((v) => v !== null && v !== undefined);
    const vibrationIndex = candidates.length ? Math.max(...candidates) : null;

    const pspl = record.pspl_db;
    const soundOk = pspl == null ? null : pspl <= psplLimit;
    const vibStatusOk =
      vibrationIndex == null ? null : vibrationIndex <= vibStatusLimit;
    const nbrChecks = axes
      .map((a) => a.conforme_nbr9653)
      .filter((v) => v !== null);
    const nbrVibrationOk = nbrChecks.length ? nbrChecks.every(Boolean) : null;

    const overallChecks = [soundOk, nbrVibrationOk].filter((v) => v !== null);
    const overallOk = overallChecks.length ? overallChecks.every(Boolean) : null;

    record.evaluation = {
      axis_results: axes,
      ppv_max_mm_s: ppvMax,
      ppv_max_axis: ppvMaxAxis,
      ppv_max_freq_hz: ppvMaxFreq,
      vibration_index_mm_s: vibrationIndex,
      vibration_status_limit_mm_s: vibStatusLimit,
      vibration_status_ok: vibStatusOk,
      sound_pressure_limit_db: psplLimit,
      sound_ok: soundOk,
      nbr_vibration_ok: nbrVibrationOk,
      overall_conforme_abnt: overallOk,
    };
    return record;
  };

  const evaluateRecords = (records, config) =>
    records.map((r) => evaluateRecord({ ...r }, config));

  // Reproduz `max(iterable, key=...)` do Python — tratando None como pior candidato.
  const maxBy = (arr, keyFn) => {
    let best = null;
    let bestKey = null;
    for (const item of arr) {
      const k = keyFn(item);
      if (best === null) {
        best = item;
        bestKey = k;
        continue;
      }
      // Comparação lexicográfica dos pares [hasValue, value] como no Python.
      if (
        k[0] > bestKey[0] ||
        (k[0] === bestKey[0] && k[1] > bestKey[1])
      ) {
        best = item;
        bestKey = k;
      }
    }
    return best;
  };

  const campaignSummary = (records, config) => {
    const projectCfg = config.project || {};
    const maxPsplRecord = maxBy(records, (r) => [
      r.pspl_db !== null && r.pspl_db !== undefined ? 1 : 0,
      r.pspl_db ?? -1,
    ]);
    const maxPpvRecord = maxBy(records, (r) => {
      const v = r.evaluation?.ppv_max_mm_s;
      return [v !== null && v !== undefined ? 1 : 0, v ?? -1];
    });
    const maxPvsRecord = maxBy(records, (r) => [
      r.pvs_mm_s !== null && r.pvs_mm_s !== undefined ? 1 : 0,
      r.pvs_mm_s ?? -1,
    ]);

    const overallValues = records
      .map((r) => r.evaluation?.overall_conforme_abnt)
      .filter((v) => v !== null && v !== undefined);
    const vibStatusValues = records
      .map((r) => r.evaluation?.vibration_status_ok)
      .filter((v) => v !== null && v !== undefined);

    let clientDisplay = projectCfg.client_override;
    if (!clientDisplay && records.length) {
      clientDisplay = records[0].client || records[0].company;
    }
    if (!clientDisplay) clientDisplay = projectCfg.client_default;

    return {
      points_count: records.length,
      event_date: records[0]?.event_date ?? null,
      client: clientDisplay,
      all_conforme_abnt: overallValues.length
        ? overallValues.every(Boolean)
        : null,
      all_below_configured_vibration_limit: vibStatusValues.length
        ? vibStatusValues.every(Boolean)
        : null,
      max_pspl: {
        value_db: maxPsplRecord?.pspl_db ?? null,
        point_name: maxPsplRecord?.point_name ?? null,
      },
      max_ppv: {
        value_mm_s: maxPpvRecord?.evaluation?.ppv_max_mm_s ?? null,
        axis: maxPpvRecord?.evaluation?.ppv_max_axis ?? null,
        point_name: maxPpvRecord?.point_name ?? null,
      },
      max_pvs: {
        value_mm_s: maxPvsRecord?.pvs_mm_s ?? null,
        point_name: maxPvsRecord?.point_name ?? null,
      },
    };
  };

  window.SismoCompliance = {
    interpolateLimit,
    evaluateRecord,
    evaluateRecords,
    campaignSummary,
  };
})();
