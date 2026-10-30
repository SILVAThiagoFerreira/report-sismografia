const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() { this.listeners = {}; this.children = []; this.classList = {add(){},remove(){}}; this.hidden = false; this.value = ''; this.checked = true; this.dataset = {}; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  async fire(name, event = {}) { return this.listeners[name]?.(event); }
  appendChild(child) { this.children.push(child); }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  removeAttribute(name) { delete this[name]; }
  setAttribute(name, value) { this[name] = value; }
  scrollIntoView() {}
  focus() {}
}
const ids = ['dropzone','file-input','pick-btn','example-btn','file-list','generate-btn','clear-btn','status','results-section','results-grid','report-preview-pages','preview-open','zip-link','zip-meta','client-input','vibration-target-input','show-vibration-index-input'];
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
elements['client-input'].value = 'USMVV';
elements['vibration-target-input'].value = '0.8';
let nextUrl = 0;
const revoked = [];
const document = { getElementById(id) { return elements[id]; }, createElement(tag) { const e = new Element(); if (tag === 'canvas') { e.getContext = () => ({}); e.toBlob = cb => cb(new Blob(['page'], {type:'image/png'})); } return e; } };
const config = {examples:{files:['sample.csv']}, project:{}, limits:{}, report:{}, branding:{}, output:{}, artifacts:{report_png:'{date}.png',report_pdf:'{date}.pdf',whatsapp_note:'{date}.txt'}};
const page = { getViewport(){return {width:595, height:842}}, render(){return {promise:Promise.resolve()}}, cleanup(){} };
const pdfjsLib = {GlobalWorkerOptions:{},getDocument(){return {promise:Promise.resolve({numPages:2, getPage:async()=>page, destroy:async()=>{}})}}};
const window = {SISMO_CONFIG:config, pdfjsLib,
 SismoParser:{parseSismoCsv(){return {event_date:'2026-10-30'}}}, SismoValidation:{validateRecords(){},orderRecords(x){return x}},
 SismoCompliance:{evaluateRecords(x){return x},campaignSummary(){return {}}}, SismoCharts:{makePressureChart(){},makeVibrationChart(){}},
 SismoReport:{async buildPdfReport(){return new Uint8Array([1,2,3])}}, SismoWhatsapp:{buildWhatsappNote(){return 'nota'}}};
class File extends Blob {constructor(parts,name,opts){super(parts,opts);this.name=name;}}
class FileReader { readAsText(){this.result='csv';this.onload()} }
class JSZip {file(){} async generateAsync(){return new Blob(['zip'])}}
const sandbox = {document,window,File,FileReader,JSZip,Blob,Date,console,fetch:async()=>({ok:true,blob:async()=>new Blob(['csv'])}),URL:{createObjectURL(){return `blob:${++nextUrl}`},revokeObjectURL(url){revoked.push(url)}}};
vm.runInNewContext(fs.readFileSync('web/js/app.js','utf8'),sandbox);
(async()=>{
 await elements['example-btn'].fire('click');
 await elements['generate-btn'].fire('click');
 const pages = elements['report-preview-pages'];
 assert.equal(elements['results-section'].hidden,false);
 assert.equal(pages.children.length,2,'todas as páginas do PDF são exibidas');
 assert.equal(pages.children[0].children[0].textContent,'Página 1 de 2');
 assert.equal(pages.children[1].children[1].alt,'Página 2 do relatório sismográfico gerado');
 assert.match(elements['preview-open'].href,/^blob:/);
 await elements['client-input'].fire('input');
 assert.equal(elements['results-section'].hidden,true);
 assert.equal(pages.children.length,0,'edição invalida visualização anterior');
 assert.equal(elements['preview-open'].href,undefined);
 assert.ok(revoked.length >= 5, 'URLs dos artefatos e visualizações são revogadas');
 console.log('Prévia multipágina e invalidação da execução: OK');
})().catch(err=>{ console.error(err); process.exitCode=1; });
