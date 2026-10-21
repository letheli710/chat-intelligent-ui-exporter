// Takes the export the page put on the clipboard (Ctrl+C in the loader box), saves and
// unpacks it, checks it, then puts the bundle back on the clipboard for the next tab:
//   node scripts/live/receive.cjs <label>
// Writes <output>/<version>/<label>/ (the archive, unpacked) and <label>.zip next to
// it, and appends the result to <output>/<version>/results.json.
const fs = require('node:fs'), path = require('node:path'), {execFileSync} = require('node:child_process');
const JSZip = require('../../extension/jszip.min.js');
const {check} = require('./check.cjs'), {output} = require('./paths.cjs');
// An HTML export (html-export.js): every local picture or link resolves to a saved file, and
// the cards, AppBlocks and maps are counted.
function checkHtml(dir) {
  const {JSDOM} = require('jsdom'), html = fs.readFileSync(path.join(dir, 'conversation.html'), 'utf8'), doc = new JSDOM(html).window.document, errors = [];
  for (const el of doc.querySelectorAll('[src],[href]')) {
    const ref = el.getAttribute('src') ?? el.getAttribute('href');
    if (!ref || /^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(ref)) continue;
    let p = ref;try {p = decodeURI(ref);} catch {}
    if (!fs.existsSync(path.join(dir, p))) errors.push(`broken link ${ref}`);
  }
  const data = JSON.parse(doc.getElementById('export-data')?.textContent || '{}');
  return {errors, warnings:[...doc.querySelectorAll('footer.notes li')].map(li => 'exporter: ' + li.textContent), cards:doc.querySelectorAll('.card-host').length, appBlocks:doc.querySelectorAll('iframe.ab-frame').length, maps:doc.querySelectorAll('figure.map').length, mapShots:doc.querySelectorAll('img.map-shot').length, images:doc.querySelectorAll('.md img,.user-images img').length, messages:(data.messages || []).length};
}
const ps = cmd => execFileSync('powershell', ['-NoProfile', '-Command', cmd], {encoding:'utf8', maxBuffer:1 << 30});

(async () => {
  const label = process.argv[2];if (!label) throw Error('usage: receive.cjs <label>');
  const raw = ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw').trim();
  let data;try {data = JSON.parse(raw);} catch {throw Error('clipboard does not hold an export (' + raw.slice(0, 60) + ')');}
  if (!data.live) throw Error('clipboard does not hold an export');
  const dec = s => decodeURIComponent(s || '');
  const round = path.join(output, data.version || 'unknown'), dir = path.join(round, label);
  const result = {label, url:data.url, version:data.version, filename:dec(data.filename), loadStatus:dec(data.loadStatus), status:dec(data.status), error:dec(data.error) || undefined};
  fs.rmSync(dir, {recursive:true, force:true});fs.mkdirSync(dir, {recursive:true});
  // A PDF export (window.__livePdf): the payload is saved and printed with this checkout's
  // print.html by pdf-check.cjs, which writes <label>.pdf and its report into the same folder.
  if (data.pdf) {
    const file = path.join(dir, label + '.pdf.json');fs.writeFileSync(file, dec(data.pdf));
    const out = (() => {try {return execFileSync(process.execPath, [path.join(__dirname, '../pdf-check.cjs'), file, '--out', dir, '--shots'], {encoding:'utf8', maxBuffer:1 << 26});} catch (e) {return String(e.stdout || e.message);}})();
    const report = (() => {try {return JSON.parse(fs.readFileSync(path.join(dir, label + '.report.json'), 'utf8')).result;} catch {return {errors:['pdf-check did not finish: ' + out.slice(-300)]};}})();
    Object.assign(result, {kb:Math.round(data.pdf.length / 1024), pdf:true, pages:report.pages, errors:report.errors, warnings:report.warnings});
  } else if (data.b64 && /\.html$/.test(result.filename)) {
    // A single-file HTML export: saved as is and checked for local references.
    const buf = Buffer.from(data.b64, 'base64');fs.writeFileSync(path.join(round, label + '.html'), buf);fs.writeFileSync(path.join(dir, 'conversation.html'), buf);
    Object.assign(result, {kb:Math.round(buf.length / 1024)}, checkHtml(dir));
  } else if (data.b64) {
    const buf = Buffer.from(data.b64, 'base64');fs.writeFileSync(path.join(round, label + '.zip'), buf);
    const zip = await JSZip.loadAsync(buf);
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      const target = path.join(dir, name);
      if (!target.startsWith(dir + path.sep)) throw Error('unsafe path in archive: ' + name);
      fs.mkdirSync(path.dirname(target), {recursive:true});fs.writeFileSync(target, await entry.async('nodebuffer'));
    }
    Object.assign(result, {kb:Math.round(buf.length / 1024)}, fs.existsSync(path.join(dir, 'conversation.html')) ? checkHtml(dir) : check(dir));
  } else result.errors = ['no archive was downloaded'];
  const resultsFile = path.join(round, 'results.json');
  const all = fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')).filter(r => r.label !== label) : [];
  all.push(result);fs.writeFileSync(resultsFile, JSON.stringify(all, null, 1));
  const bundle = path.join(output, '_bundle.js');
  if (fs.existsSync(bundle)) ps(`Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${bundle.replace(/'/g, "''")}')`);
  console.log(JSON.stringify({label, kb:result.kb, status:result.status, errors:result.errors, warnings:result.warnings?.length}, null, 1));
})().catch(e => {console.error(e.message);process.exit(1);});
