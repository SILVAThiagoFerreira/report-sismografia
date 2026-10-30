const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const folder of ['web', 'docs']) {
  const window = {};
  const ctx = { window };
  vm.runInNewContext(fs.readFileSync(`${folder}/js/config.js`, 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(`${folder}/js/charts.js`, 'utf8'), ctx);
  const config = window.SISMO_CONFIG;
  const canvas = window.SismoCharts.canvasDimensions(config);
  assert.equal(canvas.width, 1430);
  assert.equal(canvas.height, 1112);
  assert.equal(config.report_layout.first_page_last_card_y, 45);
  assert.equal(config.report_layout.point_card_gap, 8);
  assert.equal(config.report_layout.points_title_gap, 12);
  assert.equal(config.report_layout.chart_to_points_gap, 8);
  assert.ok(canvas.height / canvas.width > 0.75, 'canvas deve aproveitar mais altura');
}
console.log('Proporção dos gráficos e espaçamento configurado: OK');
