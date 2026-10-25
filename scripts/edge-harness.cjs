// Runs the real panel code (fast-text, dil-render, fast-content) in jsdom against a
// saved raw conversation JSON, clicks "下载 ZIP" and returns the archive contents.
// Network is faked: images and files resolve to small placeholder blobs (or what
// `respond` returns), and card PNGs are placeholders, since rasterizing needs a real
// browser. Used by tests/edge-cases.test.cjs; from the command line it writes the
// archive to a folder:
//   node scripts/edge-harness.cjs <raw.json> <outDir>
// With {mode:'pdf'} it clicks "导出 PDF" instead and returns what the panel posts to the print
// page (pdf). snapshot and appPreview replace the placeholder card and AppBlock images, and
// message answers what the panel asks the background worker (search images); all three are
// used by scripts/pdf-check.cjs, which draws the cards in a real browser.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const env = require('./i18n-env.cjs'), {JSDOM} = env;
const root = path.join(__dirname, '..');
const render = require('../extension/dil-render');
const exec = (code, scope) => vm.runInNewContext(code, {...scope}, {timeout:3000});

// html: 'folder' | 'single' clicks the HTML export in that form instead (maps: the map option).
// locale: the language to export in (the one the tests run in when not given).
async function runExport(raw, {locale, ...options} = {}) {
  const before = env.locale;if (locale) env.use(locale);
  try {return await exportIn(raw, options);} finally {env.use(before);}
}
async function exportIn(raw, {respond, storage = {}, fault, searchImages = false, html = null, maps = true, mode = 'zip', snapshot, appPreview, message} = {}) {
  const id = raw.conversation_id || 'chat';
  const dom = new JSDOM('<div></div>', {url:`https://chatgpt.com/c/${id}`, runScripts:'outside-only'}), w = dom.window;
  // ChatGPT titles the tab after the chat.
  w.document.title = raw.title || 'ChatGPT';
  const files = [], errors = [], requests = [], sent = [], drawn = [];
  // jsdom's Blob has no text(); Chrome's does.
  if (!w.Blob.prototype.text) w.Blob.prototype.text = function() {return new Promise(r => {const f = new w.FileReader();f.onload = () => r(f.result);f.readAsText(this);});};
  const blob = (type = 'image/png') => new w.Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {type});
  w.fetch = async (url) => {
    const p = String(url);requests.push(p);
    const custom = respond?.(p, w);if (custom) return custom;
    if (p === '/api/auth/session') return {ok:true, status:200, json:async () => ({accessToken:'t'})};
    if (p.startsWith('/backend-api/conversation/') && !p.includes('/interpreter/')) return {ok:true, status:200, json:async () => raw};
    if (/\/backend-api\/(files|conversation)\//.test(p)) return {ok:true, status:200, json:async () => ({status:'success', download_url:'https://files.example/' + encodeURIComponent(p)})};
    return {ok:true, status:200, headers:{get:() => 'image/png'}, json:async () => ({}), blob:async () => blob(), text:async () => ''};
  };
  w.createImageBitmap = async () => ({width:640, height:480, close() {}});
  w.OffscreenCanvas = class {constructor(a, b) {this.width = a;this.height = b;}getContext() {return new Proxy({}, {get:() => () => ({})});}async convertToBlob() {return blob('image/jpeg');}};
  w.ChatExportDilEvaluate = async d => render.evaluate(d, exec);
  // Like sandbox.js snapshot(): segments plus the text of other states when there are cards.
  w.ChatExportDilSnapshot = snapshot ? async d => (drawn.push(...Object.keys(d.images || {})), snapshot(d)) : async d => (drawn.push(...Object.keys(d.images || {})), {variants:render.segments(render.evaluate(d, exec)).some(s => s.kind === 'card') ? render.stateVariants(d, exec) : [], segments:render.segments(render.evaluate(d, exec)).map(s => {
    if (s.kind !== 'card') return s;
    // The card HTML the sandbox would rasterize must be well-formed XHTML.
    try {const doc = new w.DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${render.toHtml(s.tree)}</div>`, 'application/xml');if (doc.getElementsByTagName('parsererror').length) errors.push('card XHTML parse error');}
    catch (e) {errors.push('toHtml: ' + e.message);}
    return {...s, png:new Uint8Array([137, 80, 78, 71]).buffer, width:600, height:400};
  })});
  w.ChatExportAppBlockPreview = appPreview || (async () => ({png:new Uint8Array([137, 80, 78, 71]).buffer, width:600, height:400}));
  // The print page is a frame (another window): it says it is ready, then receives the export.
  // The tab's title while the print dialog is open (Chrome names the PDF after it), and after it closes.
  let printed = null, opened = null, printPage = null, titles = null;
  if (mode === 'pdf') w.ChatExportPrintFrame = url => {
    opened = url;const page = printPage = new JSDOM('', {url:'chrome-extension://x/print.html'}).window;
    page.postMessage = (data, origin) => {printed = {data, origin};titles = {printing:w.document.title};};
    setTimeout(() => w.dispatchEvent(new w.MessageEvent('message', {data:{type:'pdf:ready'}, origin:'chrome-extension://x', source:page})), 5);
    page.close = () => {printed = printed || {closed:true};};
    return page;
  };
  w.chrome = {runtime:{sendMessage:async m => {sent.push(m);
    // With searchImages, the background worker hands back image bytes for search images, as in Chrome.
    if (searchImages && m?.type === 'archive:image') return {data:'iVBORw0KGgo=', type:'image/png'};
    return (await message?.(m)) ?? {id:1};}, getManifest:() => JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json'), 'utf8')), getURL:p => 'chrome-extension://x/' + p}};
  const blobs = [];w.URL.createObjectURL = b => {blobs.push(b);return 'blob:https://chatgpt.com/t';};w.URL.revokeObjectURL = () => {};
  w.JSZip = class {file(name, data) {files.push({name, data});}async generateAsync() {return new w.Blob(['zip']);}};
  w.addEventListener('error', e => errors.push('window error: ' + e.message));
  // Panel settings (e.g. chatExportHtmlCards) as the page's localStorage holds them.
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  // fault: force a card fallback ('list', 'image', 'thumb', 'table', 'html' or 'png').
  if (fault) w.chatExportFault = fault;
  // The HTML form and the map choice, as the settings hold them.
  if (html) {w.localStorage.setItem('chatExportHtmlForm', html);w.localStorage.setItem('chatExportHtmlMap', maps ? '1' : '0');}
  w.ChatExportDilRender = render;
  w.eval(fs.readFileSync(path.join(root, 'extension/marked.min.js'), 'utf8'));w.eval(fs.readFileSync(path.join(root, 'extension/fast-text.js'), 'utf8'));w.eval(fs.readFileSync(path.join(root, 'extension/html-export.js'), 'utf8'));for (const file of ['settings.js', 'ui-kit.js', 'fast-content.js']) w.eval(fs.readFileSync(path.join(root, 'extension', file), 'utf8'));
  const s = w.document.querySelector('[data-archive-owned]').shadowRoot, status = () => s.getElementById('status').textContent;
  const idle = async () => {for (let i = 0; i < 2000 && s.getElementById('preview').disabled; i++) await new Promise(r => setTimeout(r, 5));};
  await idle();
  s.getElementById('kind').value = html ? 'html' : mode === 'pdf' ? 'pdf' : 'zip';s.getElementById('export').click();await new Promise(r => setTimeout(r, 20));await idle();
  if (mode === 'pdf') for (let i = 0; i < 400 && !printed; i++) await new Promise(r => setTimeout(r, 5));
  if (titles) {w.dispatchEvent(new w.MessageEvent('message', {data:{type:'pdf:done'}, origin:'chrome-extension://x', source:printPage}));titles.after = w.document.title;}
  const read = b => typeof b === 'string' ? Promise.resolve(b) : new Promise(r => {const f = new w.FileReader();f.onload = () => r(f.result);f.readAsText(b);});
  const out = new Map();
  for (const f of files) out.set(f.name, /\.(md|json|html|txt|csv)$/.test(f.name) ? await read(f.data) : f.data);
  const manifest = out.has('manifest.json') ? JSON.parse(out.get('manifest.json')) : {};
  const page = html === 'single' ? (blobs.length ? await read(blobs.at(-1)) : '') : out.get('conversation.html') || '';
  dom.window.close();
  return {pdf:printed?.data, pdfOrigin:printed?.origin, pdfTitles:titles, opened, files:out, html:page, filename:sent.find(m => m?.type === 'archive:download')?.filename, md:out.get('conversation.md') || '', manifest, warnings:manifest.warnings || [], errors, status:status(), requests, drawn};
}

module.exports = {runExport};

if (require.main === module) (async () => {
  const [rawPath, outDir] = process.argv.slice(2);
  const result = await runExport(JSON.parse(fs.readFileSync(rawPath, 'utf8')));
  fs.rmSync(outDir, {recursive:true, force:true});
  for (const [name, data] of result.files) {
    const p = path.join(outDir, name);fs.mkdirSync(path.dirname(p), {recursive:true});
    fs.writeFileSync(p, typeof data === 'string' ? data : '(binary placeholder)');
  }
  console.log(JSON.stringify({files:result.files.size, warnings:result.warnings, errors:result.errors, status:result.status}, null, 1));
})().catch(e => {console.error('HARNESS CRASH', e);process.exit(1);});
