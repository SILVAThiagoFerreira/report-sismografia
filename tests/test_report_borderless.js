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
        page[name] = (options, maybeOptions) => calls.push({ name, text: name === 'drawText' ? options : undefined, options: maybeOptions || options });
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
  const record = ok => ({ point_name: 'Ponto', evaluation: { overall_conforme_abnt: ok } });
  await window.SismoReport.buildPdfReport({ records: [record(true), record(false), record(null), record(true)], summary: {}, config: {}, chartCanvases: {}, logoUrl: '' });
  assert.equal(pages.length, 2, 'deve incluir a página de continuação');
  const texts = pages[0].calls.filter(call => call.name === 'drawText').map(call => call.text);
  assert.ok(texts.includes('RELATÓRIO TÉCNICO'));
  assert.ok(!texts.some(text => String(text).startsWith('RELATÓRIO TÉCNICO  |')));
  assert.ok(texts.some(text => String(text).includes('pontos monitorados')), 'contagem da campanha deve permanecer');
  assert.ok(texts.filter(text => text === '>').length >= 4, 'marcadores discretos nas seções');
  for (const label of ['CONFORME ABNT', 'VERIFICAR', 'DADO AUSENTE']) {
    const status = pages[0].calls.find(call => call.name === 'drawText' && call.text === label);
    assert.ok(status, `estado ${label} deve ser texto vetorial`);
    assert.ok(pages[0].calls.some(call => call.name === 'drawRectangle' && call.options.width === 2 && call.options.x === status.options.x - 18 && status.options.y > call.options.y && status.options.y < call.options.y + call.options.height), 'cada estado deve ter filete vetorial');
  }
  const continuation = pages[0].calls.find(call => call.name === 'drawText' && String(call.text).includes('páginas seguintes'));
  assert.ok(continuation && continuation.options.y > 30, 'aviso da continuação deve ficar acima do rodapé');
  for (const page of pages) {
    assert.ok(page.calls.some(call => call.name === 'drawLine'), 'os traços da assinatura vetorial devem permanecer visíveis');
    assert.equal(page.calls.filter(call => call.name === 'drawRectangle' && call.options.borderColor).length, 0, 'não deve desenhar contornos nos blocos ou indicadores');
  }
}
Promise.all(['web/js/report.js', 'docs/js/report.js'].map(checkReport))
  .then(() => console.log('Relatório sem contornos, com separadores e continuação: OK'))
  .catch(error => { console.error(error); process.exitCode = 1; });
