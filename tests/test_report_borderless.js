const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function checkReport(path) {
  const pages = [];
  const doc = {
    addPage() {
      const calls = [];
      const page = { calls };
      for (const name of ['drawRectangle', 'drawLine', 'drawCircle', 'drawText', 'drawImage']) {
        page[name] = (options, maybeOptions) => calls.push({ name, options: maybeOptions || options });
      }
      pages.push(page);
      return page;
    },
    async embedFont() { return { widthOfTextAtSize: (text, size) => text.length * size / 2 }; },
    async embedPng() { return { width: 100, height: 100 }; },
    async save() { return new Uint8Array([1]); },
  };
  const window = {
    PDFLib: { PDFDocument: { create: async () => doc }, StandardFonts: { Helvetica: 1, HelveticaBold: 2 }, rgb: (r, g, b) => ({ r, g, b }) },
    SismoCharts: { canvasToPngBytes: async () => new Uint8Array([1]) },
  };
  const sandbox = { window, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }), console, Uint8Array };
  vm.runInNewContext(fs.readFileSync(path, 'utf8'), sandbox);
  const record = { point_name: 'Ponto', evaluation: { overall_conforme_abnt: true } };
  await window.SismoReport.buildPdfReport({ records: [record, record, record, record], summary: {}, config: {}, chartCanvases: {}, logoUrl: '' });
  assert.equal(pages.length, 2, 'deve incluir a página de continuação');
  for (const page of pages) {
    assert.ok(page.calls.some(call => call.name === 'drawLine'), 'as linhas internas devem permanecer visíveis');
    assert.equal(page.calls.filter(call => call.name === 'drawRectangle' && call.options.borderColor).length, 0, 'não deve desenhar contornos nos blocos ou indicadores');
  }
}
Promise.all(['web/js/report.js', 'docs/js/report.js'].map(checkReport))
  .then(() => console.log('Relatório sem contornos, com separadores e continuação: OK'))
  .catch(error => { console.error(error); process.exitCode = 1; });
