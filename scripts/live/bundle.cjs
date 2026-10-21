// Builds the code that is pasted into a chatgpt.com tab to run this checkout's panel
// without reloading the installed extension (which loads another folder):
//   node scripts/live/bundle.cjs [outFile]
// The panel files run in the page with a small chrome.runtime stand-in. Cards and
// AppBlocks are still drawn by the installed extension's sandbox page (its
// dil-render.js; window.__liveExtId picks it, default the edge-loop checkout), unless
// window.__liveMainWorld is set before pasting. Downloads are
// kept in the page for receive.cjs to copy out; search images are fetched by the page.
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '../..');
const out = process.argv[2] || path.join(require('./paths.cjs').output, '_bundle.js');
const read = f => fs.readFileSync(path.join(root, 'extension', f), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const files = ['fast-text.js', 'dil-render.js', 'fast-content.js', 'html-export.js', 'marked.min.js', 'settings.js', 'ui-kit.js'].map(read);

function driver(manifest, files, jszip, sandboxJs) {
  // The installed extension's sandbox page draws the cards; its ID follows the folder it was
  // loaded from (fadldm… is ChatGPT Exporter-edge-loop/extension, fnojok… the main checkout's).
  const EXT = 'chrome-extension://' + (window.__liveExtId || 'fadldmnkmmganjicifgedcdfmbpehihl') + '/';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const runtime = {
    getManifest: () => manifest,
    getURL: p => EXT + p,
    sendMessage: async m => {
      if (m.type === 'archive:download') {window.__liveDownload = {filename:m.filename, blob:await (await fetch(m.url)).blob()};return {id:1};}
      if (m.type === 'archive:image') {
        try {
          const r = await fetch(m.url, {credentials:'omit'});if (!r.ok) return {error:'HTTP ' + r.status};
          const b = new Uint8Array(await r.arrayBuffer());let s = '';
          for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
          return {type:r.headers.get('content-type') || '', data:btoa(s)};
        } catch (e) {return {error:'live: page cannot fetch search image (' + e.message + ')'};}
      }
      return {error:'未知操作'};
    },
  };
  window.chrome = window.chrome || {};
  try {Object.defineProperty(window.chrome, 'runtime', {value:runtime, configurable:true, writable:true});} catch {window.chrome = {runtime};}
  // JSZip's UMD wrapper would register with a page AMD loader instead of the global.
  if (!window.JSZip) (0, eval)('(function(define,module,exports){' + jszip + '\n}).call(window)');
  // marked's UMD wrapper too; then the HTML export module.
  if (!window.marked?.Marked) (0, eval)('(function(define,module,exports){' + files[4] + '\n}).call(window)');
  (0, eval)(files[0]);(0, eval)(files[1]);(0, eval)(files[3]);(0, eval)(files[5]);(0, eval)(files[6]);
  if (window.__liveMainWorld) {
    // Evaluates in the page instead of the installed sandbox (for dil-render changes).
    (0, eval)(sandboxJs);const sb = window.ChatExportDilSandbox;
    window.ChatExportDilEvaluate = async d => {const r = sb.handle({dil:d});if (r.error) throw Error(r.error);return r.tree;};
    window.ChatExportDilSnapshot = async d => {const r = await sb.snapshot({dil:d});if (r.error) throw Error(r.error);return r;};
    window.ChatExportAppBlockPreview = b => window.ChatExportDilRender.appBlockPreview(b, document);
  }
  // Compiled now (only javascript_tool may eval) but started later, so the call that
  // pastes returns before the panel opens the extension's sandbox frame.
  const boot = (0, eval)('(() => {' + files[2] + '\n})');
  const panel = () => document.querySelector('[data-archive-owned="fast-text"]')?.shadowRoot;
  const live = window.__live = {version:manifest.version, phase:'loading', out:null};
  live.start = () => {setTimeout(() => (async () => {
    // The settings stay in this page (nothing is written to its localStorage, which the installed
    // extension may still move into its own settings). window.__liveProfile = 'obsidian' exports as
    // that profile; the ZIP keeps its ui/ folder for the checks.
    window.ChatExportSettingsMemory = {profile:window.__liveProfile || 'generic', proseHtml:window.__liveProfile === 'obsidian' ? 'keep' : 'escape', htmlCards:!!window.__liveHtmlCards, saveAs:false,
      htmlForm:window.__liveHtml === 'single' ? 'single' : 'folder', htmlMap:window.__liveHtmlMap !== false, uiFolder:true};
    boot();await sleep(300);
    const s = panel(), $ = id => s.getElementById(id), t0 = Date.now();
    while (Date.now() - t0 < 300000 && ($('export').disabled || /正在/.test($('status').textContent))) await sleep(300);
    live.loadStatus = $('status').textContent;live.phase = 'exporting';
    window.__liveDownload = null;
    // window.__liveHtml = 'single' | 'folder' clicks 下载 HTML in that form instead of the ZIP.
    // window.__livePdf clicks "导出 PDF" instead: the print frame is replaced by a hidden frame that takes the
    // payload (Markdown and images), which goes on the clipboard as JSON for receive.cjs, where
    // scripts/pdf-check.cjs prints it with this checkout's print.html.
    if (window.__livePdf) {
      const frame = Object.assign(document.createElement('iframe'), {hidden:true});document.body.append(frame);
      const tab = frame.contentWindow;
      tab.postMessage = data => {window.__liveDownload = {filename:data.documentTitle + '.pdf.json', pdf:data, blob:new Blob([data.md])};};tab.close = () => frame.remove();
      window.ChatExportPrintFrame = () => {delete window.ChatExportPrintFrame;setTimeout(() => window.dispatchEvent(new MessageEvent('message', {data:{type:'pdf:ready'}, origin:EXT.replace(/\/$/, ''), source:tab})), 50);return tab;};
      $('kind').value = 'pdf';$('export').click();
    } else if (window.__liveHtml) {
      $('kind').value = 'html';$('export').click();
    } else {$('kind').value = 'zip';$('export').click();}
    await sleep(500);
    const t1 = Date.now();
    while (!window.__liveDownload && Date.now() - t1 < 900000 && ($('export').disabled || Date.now() - t1 < 1500)) await sleep(300);
    const d = window.__liveDownload, status = $('status').textContent;
    const b64 = d ? await new Promise(r => {const f = new FileReader();f.onload = () => r(String(f.result).split(',')[1]);f.readAsDataURL(d.blob);}) : '';
    const toB64 = blob => new Promise(r => {const f = new FileReader();f.onload = () => r(String(f.result).split(',')[1]);f.readAsDataURL(blob);});
    const pdf = d?.pdf ? encodeURIComponent(JSON.stringify({...d.pdf, assets:await Promise.all(d.pdf.assets.map(async ({blob, ...a}) => ({...a, type:blob.type, b64:await toB64(blob)})))})) : undefined;
    live.out = JSON.stringify({live:1, version:manifest.version, url:location.pathname, filename:encodeURIComponent(d?.filename || ''), loadStatus:encodeURIComponent(live.loadStatus), status:encodeURIComponent(status), b64:pdf ? '' : b64, pdf});
    live.summary = {ok:!!d, kb:Math.round((d?.blob.size || 0) / 1024), status, seconds:Math.round((Date.now() - t0) / 1000)};
    live.phase = 'done';
  })().catch(e => {live.summary = {ok:false, error:String(e?.stack || e)};live.out = JSON.stringify({live:1, error:encodeURIComponent(String(e))});live.phase = 'done';}), 100);return 'started';};
  live.wait = async (ms = 25000) => {const t = Date.now();while (live.phase !== 'done' && Date.now() - t < ms) await sleep(250);return live.phase === 'done' ? live.summary : 'still ' + live.phase;};
  live.phase = 'ready';
}

const code = `(${driver})(${JSON.stringify(manifest)},${JSON.stringify(files)},${JSON.stringify(read('jszip.min.js'))},${JSON.stringify(read('sandbox.js'))});`;
fs.mkdirSync(path.dirname(out), {recursive:true});fs.writeFileSync(out, code);
console.log(`${out} ${manifest.version} ${Math.round(code.length / 1024)} KB`);
// Ready to paste into the loader box.
require('node:child_process').execFileSync('powershell', ['-NoProfile', '-Command', `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${out.replace(/'/g, "''")}')`]);
