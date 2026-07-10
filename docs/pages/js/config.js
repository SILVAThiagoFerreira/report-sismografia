// Config embarcada (equivalente a config.json do pipeline Python).
// Editar aqui para mudar limites, prefixos ou textos exibidos.
window.SISMO_CONFIG = {
  project: {
    title: "MONITORAMENTO SISMOGRÁFICO",
    client_default: "US MINERAÇÃO VALE-VERDE",
    base_normativa: "ABNT NBR 9653:2018",
    footer_badge: "DNA  •  ENAEX",
    client_override: "US MINERAÇÃO VALE-VERDE",
  },
  output: {
    folder_prefix: "monitoramento_sismografico",
    file_prefix: "ENAEX_NSR",
  },
  artifacts: {
    report_pdf: "{file_prefix}-{date}.pdf",
    report_png: "{file_prefix}-{date}.png",
    whatsapp_note: "{file_prefix}-{date}_nota_whatsapp.txt",
    pressure_chart: "{file_prefix}-{date}_pressao_sonora_nbr.png",
    vibration_chart: "{file_prefix}-{date}_vibracao_nbr_eixos_zero.png",
  },
  limits: {
    sound_pressure_db: 134.0,
    vibration_status_mm_s: 0.8,
    nbr9653_curve: [
      [0.0, 15.0],
      [4.0, 15.0],
      [15.0, 20.0],
      [40.0, 50.0],
      [1000.0, 50.0],
    ],
  },
  charts: {
    vibration_x_min: 0.0,
    vibration_y_min: 0.0,
    vibration_y_tick_step: 0.1,
    vibration_use_broken_y: true,
    vibration_y_focus_max: 1.0,
    vibration_x_max_minimum: 60.0,
    vibration_y_max_minimum: 60.0,
    pressure_x_min: 0.0,
    pressure_y_min: 0.0,
    pressure_y_max: 160.0,
  },
  branding: {
    // Logo Enaex embutido no header do PDF — resolvido em runtime como fetch.
    logo_path: "assets/enaex_logo_horizontal.png",
  },
};
