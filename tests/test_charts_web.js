const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Fake canvas records the exact paths drawn by the browser chart renderer.
const paths = [];
let path = [];
const ctx = new Proxy({
  beginPath() { path = []; },
  moveTo(x, y) { path.push(["M", x, y]); },
  lineTo(x, y) { path.push(["L", x, y]); },
  stroke() { paths.push(path.slice()); },
  measureText(text) { return { width: text.length * 10 }; },
}, { get(target, key) { return key in target ? target[key] : () => {}; }, set(target, key, value) { target[key] = value; return true; } });
const window = { SismoCompliance: { interpolateLimit(x) { return x < 40 ? 20 + (x - 15) * 30 / 25 : 50; } } };
const sandbox = { window, document: { createElement() { return { getContext() { return ctx; } }; } }, console };
vm.runInNewContext(fs.readFileSync("web/js/charts.js", "utf8"), sandbox);
const curve = [[0, 15], [4, 15], [15, 20], [40, 50], [1000, 50]];
const records = [{ point_name: "Ponto", tran_freq_hz: 30, tran_ppv_mm_s: 0.5, evaluation: { ppv_max_freq_hz: 30, ppv_max_mm_s: 0.5 } }];
window.SismoCharts.makeVibrationChart(records, { limits: { nbr9653_curve: curve }, charts: { vibration_use_broken_y: true } });
// Frequency maximum is 60 Hz: four configured vertices and the interpolated endpoint.
const line = paths.find(p => p.length === 5 && p.every((step, i) => step[0] === (i ? "L" : "M")));
assert.ok(line, "Curva normativa deve preservar os quatro vértices e o extremo interpolado");
const x = line.map(p => p[1]);
const y = line.map(p => p[2]);
assert.ok(x.every((v, i) => i === 0 || v > x[i - 1]));
assert.equal(y[0], y[1], "Limite permanece constante até 4 Hz");
assert.ok(y[2] < y[1] && y[3] < y[2], "Trechos normativos crescentes preservados");
assert.equal(y[3], y[4], "Limite permanece constante após 40 Hz");
console.log("Curva ABNT desenhada com trechos e vértices exatos: OK");

