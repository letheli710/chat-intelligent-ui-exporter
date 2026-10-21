// Exports fixture conversations as PDF offline and checks the result:
//   node scripts/pdf-check.cjs [fixture.raw.json | fixture folder ...] [--out dir] [--shots] [--keep-going]
// Each conversation goes through the real panel code (scripts/edge-harness.cjs, "导出 PDF"),
// with its cards and AppBlock previews drawn in headless Chrome by dil-render.js as in the
// sandbox page; other images are placeholders. The posted Markdown and images are laid out by
// extension/print.html (pdf-export.js) and printed with Chrome's own PDF printer, then read
// back with pdf.js:
//   - every line of the Markdown is in the PDF text (whitespace and Markdown marks ignored);
//   - every image loaded, each card is whole (its slices add up to its height, none taller
//     than a page) and the PDF draws exactly the images the page shows (Chrome did not cut one);
//   - the links match the Markdown's, and each is clickable in the PDF;
//   - fonts are embedded, Chinese text extracts as Chinese (no U+FFFD), a CJK font is used;
//   - the page count is close to the page's own estimate, and no page is blank.
// Without arguments every fixture under tests/fixtures/ is checked. Output (PDFs, reports,
// --shots page images) goes to tmp/pdf-check/ (gitignored). Exit code 1 when any check fails.
// Chrome: CHROME_PATH, or the usual install path on Windows, macOS and Linux.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), {pathToFileURL} = require('node:url');
const puppeteer = require('puppeteer-core');
const {marked} = require('marked');
const {runExport} = require('./edge-harness.cjs');
const render = require('../extension/dil-render.js'), pdfApi = require('../extension/pdf-export.js');
const root = path.join(__dirname, '..');

const chromePath = () => [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && fs.existsSync(p));

// tests/fixtures: raw conversations (*.raw.json), and folders of single exported messages
// (ui/msg-*.json records), each folder wrapped into one conversation.
function fixtures(args) {
  const list = [];
  const add = p => {
    const full = path.resolve(p);
    if (fs.statSync(full).isDirectory()) {
      const names = fs.readdirSync(full).sort();
      for (const f of names.filter(f => f.endsWith('.raw.json'))) list.push({label:f.replace(/\.raw\.json$/, ''), raw:() => JSON.parse(fs.readFileSync(path.join(full, f), 'utf8'))});
      for (const f of names.filter(f => f.endsWith('.pdf.json'))) add(path.join(full, f));
      if (names.some(f => /^msg-.*\.json$/.test(f))) list.push({label:path.basename(full), raw:() => recordsConversation(full)});
      for (const d of names) if (fs.statSync(path.join(full, d)).isDirectory()) add(path.join(full, d));
    // A payload a live export saved (scripts/live/receive.cjs): printed as it is.
    } else if (/\.pdf\.json$/.test(full)) list.push({label:path.basename(full).replace(/\.pdf\.json$/, ''), payload:() => JSON.parse(fs.readFileSync(full, 'utf8'))});
    else list.push({label:path.basename(full).replace(/\.raw\.json$|\.json$/, ''), raw:() => JSON.parse(fs.readFileSync(full, 'utf8'))});
  };
  if (args.length) args.forEach(add);
  else add(path.join(root, 'tests/fixtures'));
  return list;
}
function recordsConversation(dir) {
  const files = fs.readdirSync(dir).filter(f => /^msg-.*\.json$/.test(f)).sort(), mapping = {root:{id:'root', message:null, parent:null, children:[]}};
  let parent = 'root';
  files.forEach((f, i) => {
    const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), u = `u${i + 1}`, a = r.messageId || `a${i + 1}`;
    mapping[parent].children.push(u);
    mapping[u] = {id:u, parent, children:[a], message:{id:u, author:{role:'user'}, content:{content_type:'text', parts:[`（夹具 ${path.basename(dir)}：${f}）`]}, metadata:{}}};
    mapping[a] = {id:a, parent:u, children:[], message:{id:a, author:{role:'assistant'}, content:{content_type:'text', parts:[r.source || '']}, metadata:{model_dil_v2:r.dil, content_references:r.contentReferences || []}}};
    parent = a;
  });
  return {title:`夹具 ${path.basename(dir)}`, conversation_id:`fixture-${path.basename(dir)}`, current_node:parent, mapping};
}

// What the PDF text should contain, one entry per Markdown line (table rows per cell).
const ENTITIES = {lt:'<', gt:'>', amp:'&', quot:'"', apos:"'", nbsp:' '};
const decode = s => s.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (x, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e] ?? x);
const texText = (s, block) => decode(pdfApi.texHtml(s, block).replace(/<[^>]+>/g, ''));
// Whitespace and Markdown marks are left out on both sides: the check is about text getting lost.
// So are zero-width and format characters, and emoji: Chrome draws a ZWJ sequence (a family emoji) as
// one glyph without text behind it, and a variation selector has no glyph of its own.
// (Character ranges are built from code points, so the source holds no invisible characters.)
const ranges = (...pairs) => pairs.map(([a, b]) => `${String.fromCodePoint(a)}-${String.fromCodePoint(b)}`).join('');
const INVISIBLE = new RegExp(`[${ranges([0x1, 0x1f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0xfeff, 0xfeff], [0xfe00, 0xfe0f], [0x1f3fb, 0x1f3ff], [0xe0020, 0xe007f])}]|\\p{Extended_Pictographic}|\\0`, 'gu');
const norm = s => s.normalize('NFKC').replace(/[\s*_~`\\⁄]/g, '').replace(INVISIBLE, '');
// Right-to-left and shaping scripts (Arabic, Hebrew, Indic, Thai, Mongolian…) come out of the PDF
// in drawing order, often as presentation forms: for those runs only the characters are compared.
const COMPLEX = new RegExp(`[${ranges([0x590, 0x8ff], [0x900, 0xdff], [0xe00, 0xeff], [0x1000, 0x109f], [0x1780, 0x18af], [0xfb1d, 0xfdff], [0xfe70, 0xfefc])}]+`, 'gu');
// true, false, or "partial": a shaping-script run of which Chrome left only some characters in
// the text layer (conjuncts such as स्ते are drawn as one glyph without text behind it).
function found(text, all, chars) {
  const n = norm(text), runs = n.match(COMPLEX);
  if (!runs) return all.includes(n);
  if (!n.split(COMPLEX).every(part => !part || all.includes(part))) return false;
  const letters = [...runs.join('')], kept = letters.filter(c => chars.has(c)).length;
  return kept === letters.length || (kept >= letters.length / 2 ? 'partial' : false);
}
function inlineMath(text) {
  let out = '';
  for (let i = 0; i < text.length;) {
    if ((text[i] === '$' && text[i - 1] !== '\\') || text.startsWith('\\(', i)) {const m = pdfApi.MATH_INLINE.exec(text.slice(i));if (m) {out += texText(m[1] ?? m[2] ?? m[3]);i += m[0].length;continue;}}
    out += text[i++];
  }
  return out;
}
function expectedUnits(md) {
  const units = [];let fence = null, role = 'head', math = null;
  md.split('\n').forEach((line, n) => {
    const at = n + 1, inner = line.replace(/^(?:[ \t]*>[ \t]?)+/, '');
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(inner);
    if (fence) {if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !inner.trim().slice(open[1].length).trim()) fence = null;else if (inner.trim()) units.push({at, text:inner});return;}
    if (open) {fence = open[1];return;}
    const section = /^## (我|ChatGPT|未包含的非文字内容)\s*$/.exec(line);
    if (section) {role = section[1] === '我' ? 'user' : 'assistant';units.push({at, text:section[1]});return;}
    if (role !== 'user') {
      if (math !== null) {if (/^\s*(?:\$\$|\\\])\s*$/.test(inner)) {units.push({at, text:texText(math, true)});math = null;} else math += `\n${inner}`;return;}
      if (/^\s*(?:\$\$|\\\[)\s*$/.test(inner)) {math = '';return;}
      const one = /^\s*(?:\$\$([\s\S]+)\$\$|\\\[([\s\S]+)\\\])\s*$/.exec(inner);
      if (one) {units.push({at, text:texText(one[1] ?? one[2], true)});return;}
    }
    // The card text's own title: the text lies over the card image without it.
    if (/^\s*\[!note\][+-]?\s*卡片文字\s*$/.test(inner)) return;
    let t = pdfApi.protectTablePipes(inner, {math:role !== 'user'});
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(t) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(t)) return;
    t = t.replace(/^\s*\[!([\w-]+)\][+-]?\s*/, (x, type) => t.replace(x, '').trim() ? '' : type).replace(/^#{1,6}\s+/, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '');
    const cells = /^\s*\|.*\|\s*$/.test(t) ? t.trim().slice(1, -1).split(/(?<!\\)\|/) : [t];
    for (let c of cells) {
      // Code spans stay literal (`C[C@H](N)` is no link); pipes kept inside spans come back last,
      // after formulas are converted as the print page converts them.
      const code = [];c = c.replace(/(`+)([\s\S]+?)\1/g, (x, f, body) => `\u0002${code.push(body) - 1}\u0002`);
      c = c.replace(/!\[(?:\\.|[^\]\\])*\]\([^)]*\)/g, '').replace(/\[((?:\\.|[^\]\\])*)\]\((?:<[^>]*>|[^)\s]*)(?:\s+"[^"]*")?\)/g, '$1').replace(/<(https?:\/\/[^>\s]+)>/g, '$1').replace(/<br\s*\/?>|<\/?su[pb]>/gi, ' ');
      if (role !== 'user') c = inlineMath(c);
      // An escaped character is literal: "\&lt;" shows "&lt;", "&lt;" shows "<".
      c = decode(c.replace(/\\([!-/:-@[-`{-~])/g, (x, ch) => `\u0002${code.push(ch) - 1}\u0002`)).replace(/\u0002(\d+)\u0002/g, (x, i) => code[i]).split(String.fromCharCode(1)).join('|');
      if (norm(c)) units.push({at, text:c});
    }
  });
  return units;
}
// External links as a Markdown viewer finds them (marked without the formula extension).
function markdownLinks(md) {
  const found = [];
  marked.walkTokens(marked.lexer(md), t => {if (t.type === 'link' && /^(?:https?:|mailto:)/i.test(t.href)) found.push(t.href);});
  return found;
}

async function main() {
  const args = process.argv.slice(2), flag = f => {const i = args.indexOf(f);if (i < 0) return false;args.splice(i, 1);return true;};
  const option = f => {const i = args.indexOf(f);if (i < 0) return null;const v = args[i + 1];args.splice(i, 2);return v;};
  const shots = flag('--shots'), keepGoing = flag('--keep-going'), out = path.resolve(option('--out') || path.join(root, 'tmp/pdf-check'));
  const list = fixtures(args);
  const executablePath = chromePath();if (!executablePath) throw Error('Chrome not found: set CHROME_PATH');
  fs.mkdirSync(out, {recursive:true});
  const browser = await puppeteer.launch({executablePath, headless:true, args:['--allow-file-access-from-files']});
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const server = shots ? await pdfServer() : null;
  const results = [];
  try {
    // The sandbox's work (cards and AppBlock previews), on a blank page with dil-render.js.
    const cardPage = await browser.newPage();
    await cardPage.goto(pathToFileURL(path.join(root, 'extension/sandbox.html')).href);
    const placeholder = await cardPage.evaluate(() => {const c = document.createElement('canvas');c.width = 480;c.height = 320;const g = c.getContext('2d');g.fillStyle = '#dfe3e8';g.fillRect(0, 0, 480, 320);g.fillStyle = '#7a8594';g.font = '28px system-ui';g.textAlign = 'center';g.fillText('图片占位（离线检查）', 240, 170);return c.toDataURL('image/png');});
    const placeholderBytes = Buffer.from(placeholder.split(',')[1], 'base64');
    const toBuffer = b64 => {const b = Buffer.from(b64, 'base64');return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);};
    const snapshot = async dil => {
      const images = Object.fromEntries(Object.keys(dil.images || {}).map(k => [k, placeholder]));
      const r = await cardPage.evaluate(async d => {
        const b64 = buf => {let s = '';const a = new Uint8Array(buf);for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));return btoa(s);};
        const r = await ChatExportDilSandbox.snapshot({dil:d});
        if (r.error) return r;
        for (const s of r.segments) if (s.png) s.png = b64(s.png);
        return r;
      }, {...dil, images});
      if (r.error) throw Error(r.error);
      for (const s of r.segments) if (s.png) s.png = toBuffer(s.png);
      return r;
    };
    const appPreview = async block => {
      const r = await cardPage.evaluate(async b => {
        const r = await ChatExportDilRender.appBlockPreview(b, document);let s = '';const a = new Uint8Array(r.png);
        for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
        return {...r, png:btoa(s)};
      }, {id:block.id, title:block.title, content:block.content});
      return {...r, png:toBuffer(r.png)};
    };
    // Every image the panel downloads (originals, search images, code files) is the placeholder.
    // Search images, which the background worker fetches, are the placeholder too.
    const message = m => m.type === 'archive:image' ? {type:'image/png', data:placeholderBytes.toString('base64')} : null;
    // Data tables and attachments that are not images get a small CSV instead.
    let textIds = [];
    const respond = (url, w) => {
      if (/^\/api\/|^\/backend-api\//.test(url)) return null;
      const text = textIds.some(id => url.includes(id)), body = text ? 'A,B\n占位,1\n' : placeholderBytes, type = text ? 'text/csv' : 'image/png';
      return {ok:true, status:200, headers:{get:() => type}, json:async () => ({}), text:async () => text ? body : '', blob:async () => new w.Blob([body], {type})};
    };
    const nonImageIds = raw => {
      const ids = [];
      (function walk(v) {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) return v.forEach(walk);
        if (v.type === 'table' && typeof v.file_id === 'string') ids.push(v.file_id);
        if (Array.isArray(v.attachments)) for (const a of v.attachments) if (typeof a?.id === 'string' && !/^image\//.test(a.mime_type || '')) ids.push(a.id);
        Object.values(v).forEach(walk);
      })(raw);
      return ids;
    };
    const printPage = await browser.newPage();
    for (const fixture of list) {
      const started = Date.now(), result = {label:fixture.label, errors:[], warnings:[]};results.push(result);
      try {
        const raw = fixture.raw?.();textIds = raw ? nonImageIds(raw) : [];
        const exported = fixture.payload ? {pdf:fixture.payload(), errors:[]} : await runExport(raw, {mode:'pdf', snapshot, appPreview, respond, message});
        if (exported.errors.length) result.errors.push(...exported.errors.map(e => `export: ${e}`));
        const payload = exported.pdf;
        if (!payload?.md) {result.errors.push(`no PDF payload (${exported.status})`);continue;}
        // Images jsdom's stand-in canvas made (picture-list thumbnails) are a few bytes, no image: the placeholder stands in.
        const assets = await Promise.all(payload.assets.map(async a => {
          if (a.b64) return a;
          const bytes = Buffer.from(await blobBytes(a.blob)), fake = bytes.length <= 8;
          return {path:a.path, width:a.width, height:a.height, kind:a.kind, type:fake ? 'image/png' : a.blob.type, b64:(fake ? placeholderBytes : bytes).toString('base64')};
        }));
        await printPage.goto(pathToFileURL(path.join(root, 'extension/print.html')).href);
        const report = await printPage.evaluate(async p => {
          const assets = p.assets.map(a => ({...a, blob:new Blob([Uint8Array.from(atob(a.b64), c => c.charCodeAt(0))], {type:a.type})}));
          const r = await ChatExportPdf.render({...p, assets}, document);
          r.shown = [...document.querySelectorAll('#pdf-doc img')].map(img => ({path:img.dataset.path, height:img.getBoundingClientRect().height}));
          return r;
        }, {...payload, assets});
        const pdf = await printPage.pdf({preferCSSPageSize:true, printBackground:false, timeout:180000});
        fs.writeFileSync(path.join(out, `${fixture.label}.pdf`), pdf);fs.writeFileSync(path.join(out, `${fixture.label}.md`), payload.md);
        const read = await readPdf(pdfjs, pdf);
        fs.writeFileSync(path.join(out, `${fixture.label}.txt`), read.pages.map((p, i) => `=== page ${i + 1} ===\n${p.text}`).join('\n'));
        Object.assign(result, verify(payload, report, read));
        result.pages = read.pages.length;result.estimate = report.pagesEstimate;result.kb = Math.round(pdf.length / 1024);result.cards = report.cards.length;
        result.slices = report.cards.reduce((n, c) => n + c.slices.length, 0);result.links = report.links.length;result.seconds = (Date.now() - started) / 1000;
        fs.writeFileSync(path.join(out, `${fixture.label}.report.json`), JSON.stringify({result, report, fonts:read.fonts}, null, 1));
        if (shots) await pageShots(browser, server, pdf, path.join(out, fixture.label));
      } catch (e) {result.errors.push(`crash: ${e?.stack || e}`);}
      console.log(`${result.errors.length ? 'FAIL' : 'ok  '} ${fixture.label.padEnd(36)} ${result.pages ?? '-'} pages, ${result.cards ?? '-'} cards (${result.slices ?? '-'} images), ${result.links ?? '-'} links${result.errors.length ? `\n  ${result.errors.slice(0, 12).join('\n  ')}${result.errors.length > 12 ? `\n  … ${result.errors.length - 12} more` : ''}` : ''}`);
      if (result.errors.length && !keepGoing && list.length > 1 && process.env.PDF_CHECK_STOP) break;
    }
  } finally {await browser.close();server?.close();}
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  const failed = results.filter(r => r.errors.length);
  console.log(`${results.length} conversations, ${failed.length} with errors, ${results.reduce((n, r) => n + r.errors.length, 0)} errors. Output: ${out}`);
  process.exitCode = failed.length ? 1 : 0;
}
// jsdom's Blob has no arrayBuffer(); its FileReader does the reading.
function blobBytes(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then(b => new Uint8Array(b));
  const {JSDOM} = require('./i18n-env.cjs'), w = new JSDOM('').window;
  return new Promise((ok, fail) => {const f = new w.FileReader();f.onload = () => ok(new Uint8Array(f.result));f.onerror = () => fail(f.error);f.readAsArrayBuffer(blob);});
}

async function readPdf(pdfjs, bytes) {
  const doc = await pdfjs.getDocument({data:new Uint8Array(bytes), fontExtraProperties:true, verbosity:0}).promise, pages = [], fonts = new Map();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i), view = page.getViewport({scale:1}), ops = await page.getOperatorList(), text = await page.getTextContent();
    // The page number sits in the bottom margin.
    const items = text.items.filter(t => t.str && t.transform[5] > pdfApi.PAGE.bottom * 72 / 25.4 - 4);
    for (const t of text.items) if (!fonts.has(t.fontName)) {try {const f = page.commonObjs.get(t.fontName);fonts.set(t.fontName, {name:f.name, embedded:!f.missingFile});} catch {fonts.set(t.fontName, {name:t.fontName, embedded:null});}}
    const links = (await page.getAnnotations()).filter(a => a.subtype === 'Link' && a.url).map(a => a.url);
    pages.push({width:view.width, height:view.height, text:items.map(t => t.str).join(''), images:ops.fnArray.filter(f => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject).length, links});
  }
  await doc.cleanup?.();
  return {pages, fonts:[...fonts.values()]};
}

function verify(payload, report, read) {
  const errors = [], warnings = [], all = norm(read.pages.map(p => p.text).join(''));
  // Text: every line of the Markdown.
  const units = expectedUnits(payload.md), chars = new Set(all), seen = units.map(u => found(u.text, all, chars)), missing = units.filter((u, i) => !seen[i]);
  const partial = units.filter((u, i) => seen[i] === 'partial');
  if (partial.length) warnings.push(`${partial.length} lines in Indic or other shaping scripts are drawn, but Chrome kept only part of their letters in the text layer (e.g. md line ${partial[0].at})`);
  for (const u of missing.slice(0, 20)) errors.push(`text missing (md line ${u.at}): ${u.text.trim().slice(0, 90)}`);
  if (missing.length > 20) errors.push(`… text missing on ${missing.length} lines in all`);
  // Chinese: extracted as Chinese characters, with a CJK font, all fonts embedded.
  const cjk = s => (s.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length, wanted = cjk(units.filter(u => !missing.includes(u)).map(u => norm(u.text)).join(''));
  if (cjk(all) < wanted) errors.push(`Chinese characters: PDF has ${cjk(all)}, Markdown ${wanted}`);
  if (/\ufffd/.test(all)) errors.push('U+FFFD (replacement character) in the PDF text');
  // Kangxi radicals (U+2F00 for 一) in the text layer cannot be found by a search for the character.
  const RADICAL = new RegExp(`[${ranges([0x2e80, 0x2fdf])}]`, 'g'), radicals = s => (s.match(RADICAL) || []).length;
  if (radicals(read.pages.map(p => p.text).join('')) > radicals(payload.md)) errors.push(`Kangxi/CJK radical characters in the PDF text (${radicals(read.pages.map(p => p.text).join(''))}); search would miss them`);
  if (/[\ue000-\uf8ff]/.test(all.replace(/[\ue200-\ue202]/g, ''))) warnings.push('private-use characters in the PDF text');
  for (const f of read.fonts) if (f.embedded === false) errors.push(`font not embedded: ${f.name}`);
  if (wanted && !read.fonts.some(f => /YaHei|PingFang|Hiragino|CJK|SimSun|NSimSun|DengXian|Han ?Sans|Heiti|SimHei|Noto ?Sans ?SC|STHeiti|Songti/i.test(f.name || ''))) errors.push(`no CJK font in the PDF: ${read.fonts.map(f => f.name).join(', ')}`);
  // Images: all loaded; cards whole and no taller than a page; the PDF draws what the page shows.
  for (const i of report.images) if (!i.ok) errors.push(`image did not load: ${i.path}`);
  for (const c of report.cards) {
    if (c.error) errors.push(`card ${c.path}: ${c.error}`);
    else if (c.slices.reduce((a, b) => a + b, 0) !== c.height) errors.push(`card ${c.path}: slices add up to ${c.slices.reduce((a, b) => a + b, 0)} of ${c.height} px`);
  }
  for (const s of report.shown) if (s.height > pdfApi.contentHeight + 1) errors.push(`image taller than a page (${Math.round(s.height)} px): ${s.path}`);
  const drawn = read.pages.reduce((n, p) => n + p.images, 0);
  if (drawn !== report.shown.length) errors.push(`PDF draws ${drawn} images, the page shows ${report.shown.length}`);
  const cardRefs = [...payload.md.matchAll(/!\[[^\]]*\]\((assets\/(?:card-|appblock-)[^)\s]+\.png)\)/g)].map(m => m[1]);
  for (const ref of cardRefs) if (!report.cards.some(c => c.path === ref)) errors.push(`card image not placed: ${ref}`);
  // Links: the Markdown's external links, each one clickable in the PDF.
  const mdLinks = markdownLinks(payload.md), pdfLinks = new Set(read.pages.flatMap(p => p.links));
  if (report.links.length !== mdLinks.length) errors.push(`links: page has ${report.links.length}, Markdown ${mdLinks.length}`);
  const sameUrl = u => {try {return new URL(u).href;} catch {return u;}};
  const notClickable = [...new Set(report.links.map(sameUrl))].filter(u => ![...pdfLinks].some(p => sameUrl(p) === u));
  for (const u of notClickable.slice(0, 10)) errors.push(`link not clickable in the PDF: ${u}`);
  // Pages: close to the estimate, none blank.
  const n = read.pages.length, est = report.pagesEstimate;
  if (n > Math.ceil(est * 1.6) + 2 || n < Math.floor(est * 0.6)) errors.push(`page count ${n} far from the estimate ${est}`);
  read.pages.forEach((p, i) => {if (!p.text.trim() && !p.images) errors.push(`page ${i + 1} is blank`);});
  for (const t of report.tables) if (!t.fits) warnings.push(`table with ${t.columns} columns is still wider than a landscape page`);
  return {errors, warnings, units:units.length, landscape:read.pages.filter(p => p.width > p.height).length};
}

// --shots: pdf.js in the browser draws each page to a PNG (served over http, since module
// scripts do not load from file://).
async function pdfServer() {
  const dist = path.dirname(require.resolve('pdfjs-dist/package.json'));let current = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/doc.pdf') {res.writeHead(200, {'content-type':'application/pdf'});return res.end(current);}
    if (req.url === '/') {res.writeHead(200, {'content-type':'text/html'});return res.end('<!doctype html><body style="margin:0"><script type="module">import * as pdfjs from "/pdfjs/build/pdf.mjs";pdfjs.GlobalWorkerOptions.workerSrc="/pdfjs/build/pdf.worker.mjs";window.pdfjs=pdfjs;window.ready=true;</script>');}
    const file = path.join(dist, decodeURIComponent(req.url.replace(/^\/pdfjs\//, '')));
    if (!req.url.startsWith('/pdfjs/') || !file.startsWith(dist) || !fs.existsSync(file)) {res.writeHead(404);return res.end();}
    res.writeHead(200, {'content-type':file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  server.use = bytes => {current = bytes;};server.url = `http://127.0.0.1:${server.address().port}`;
  return server;
}
async function pageShots(browser, server, pdf, dir) {
  server.use(pdf);fs.rmSync(dir, {recursive:true, force:true});fs.mkdirSync(dir, {recursive:true});
  const page = await browser.newPage();
  try {
    await page.goto(server.url + '/');await page.waitForFunction('window.ready');
    const count = await page.evaluate(async () => {window.doc = await pdfjs.getDocument({url:'/doc.pdf'}).promise;return doc.numPages;});
    for (let i = 1; i <= count; i++) {
      const data = await page.evaluate(async n => {const p = await doc.getPage(n), v = p.getViewport({scale:1.4}), c = document.createElement('canvas');c.width = v.width;c.height = v.height;
        await p.render({canvasContext:c.getContext('2d'), viewport:v}).promise;return c.toDataURL('image/png').split(',')[1];}, i);
      fs.writeFileSync(path.join(dir, `page-${String(i).padStart(2, '0')}.png`), Buffer.from(data, 'base64'));
    }
  } finally {await page.close();}
}

module.exports = {expectedUnits, markdownLinks, norm, recordsConversation};
if (require.main === module) main().catch(e => {console.error(e);process.exit(1);});
