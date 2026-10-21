// Checks the whole-conversation HTML export against the Markdown export of the same
// conversation, offline, with the real panel code in jsdom (scripts/edge-harness.cjs):
//   node scripts/html-check.cjs [--out <dir>] [name filter…]
// For every fixture (tests/fixtures: edge, pro, lab-*, mainlab) and both forms it checks that
//  - every line of text in the Markdown export appears in the HTML page (Markdown syntax and
//    the card-control descriptions the Markdown writes, such as 滑块：65（0–100）, aside);
//  - every local picture or file the page references is in the folder ZIP, and the single
//    file references none (everything is a data: URL);
//  - every card of the Markdown export is a card in the page, runs from its default state in
//    the page's own runtime, and changes when one of its controls is used;
//  - every AppBlock has a frame (on the page, or inside the card that holds it);
//  - the single file and the folder form show the same text and the same elements.
// With --out, each export is written there (<name>.html and <name>/conversation.html …).
const fs = require('node:fs'), path = require('node:path');
const {JSDOM} = require('./i18n-env.cjs'), {marked} = require('marked');
const {runExport} = require('./edge-harness.cjs');
const root = path.join(__dirname, '..');
// The harness fakes every download; --out writes a 1×1 PNG for each binary file.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// A conversation for the lab fixtures, which are single messages (ui/msg-*.json of a ZIP).
function labConversation(dir) {
  const items = fs.readdirSync(dir).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const mapping = {root:{id:'root', parent:null, children:['u'], message:null}};
  mapping.u = {id:'u', parent:'root', children:[], message:{id:'u', author:{role:'user'}, content:{content_type:'text', parts:[`（实验室消息合集：${path.basename(dir)}）`]}, metadata:{}}};
  let parent = 'u';
  for (const j of items) {
    const id = j.messageId;mapping[parent].children = [id];
    mapping[id] = {id, parent, children:[], message:{id, author:{role:'assistant'}, channel:'final', recipient:'all', content:{content_type:'text', parts:[j.source || '']}, metadata:{model_dil_v2:j.dil, content_references:j.contentReferences || []}}};
    parent = id;
  }
  return {title:path.basename(dir), conversation_id:`lab-${path.basename(dir)}`, current_node:parent, mapping};
}
function fixtures() {
  const out = [];
  for (const d of ['edge-2026-10', 'pro-2026-10']) for (const f of fs.readdirSync(path.join(root, 'tests/fixtures', d)).sort()) out.push({name:f.replace(/\.raw\.json$/, ''), raw:() => JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures', d, f), 'utf8'))});
  out.push({name:'dil-checkbox-longcard-appblock', raw:() => JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/dil-checkbox-longcard-appblock.raw.json'), 'utf8'))});
  for (const d of ['lab-energy', 'lab-survey', 'mainlab']) out.push({name:d, raw:() => labConversation(path.join(root, 'tests/fixtures', d))});
  return out;
}

const norm = s => String(s).replace(/[ ​ ]/g, ' ').replace(/\s+/g, ' ').trim();
const decode = html => new JSDOM(`<body>${html}`).window.document.body.textContent;
// The text a reader sees on the page: scripts (the page's data) and frames left out.
function pageText(doc) {
  const body = doc.body.cloneNode(true);
  body.querySelectorAll('script,template').forEach(n => n.remove());
  return norm(body.textContent);
}

// The pieces of one Markdown line that must appear on the page.
function chunks(line, role, cols = 0) {
  let l = line.replace(/^(?:\s*>)+\s?/, '').trim();
  if (!l || /^(`{3,}|~{3,})/.test(l) || /^\|?\s*:?-{3,}/.test(l) || /^(-{3,}|\*{3,})$/.test(l) || /^\$\$$/.test(l)) return [];
  // Export bookkeeping that the page shows differently: card pictures and their folded text
  // titles, AppBlock pointers (a frame on the page), the search-image strip and its list.
  if (/^\[!note\]-? (卡片文字|原图（\d+ 张）)/.test(l)) return [];
  const appblock = /^\[!chatgpt-appblock\]-? (.*?)：\[/.exec(l);if (appblock) return [norm(appblock[1])];
  l = l.replace(/^\[![\w-]+\][+-]?\s*/, '');
  if (role === 'user') return [norm(l.replace(/^附件：\[((?:\\.|[^\]\\])*)\]\([^)]*\)/, (x, n) => n.replace(/\\(.)/g, '$1')).replace(/^!\[[^\]]*\]\([^)]*\)$/, ''))].filter(c => c.length > 1);
  l = l.replace(/^#{1,6}\s+/, '').replace(/^(?:[-*+]|\d+\.)\s+(?:\[[ x]\]\s+)?/, '');
  // Table cells as GFM (marked) splits them: a pipe after an odd number of backslashes is part
  // of the cell; cells past the header's count are dropped.
  let cells = [l];
  if (/^\|.*\|$/.test(l)) {cells = [];let cell = '';for (let i = 1; i < l.length - 1; i++) {if (l[i] === '|' && !(/(\\+)$/.exec(l.slice(1, i))?.[1].length % 2)) {cells.push(cell);cell = '';} else cell += l[i];}cells.push(cell);cells = cells.slice(0, cols || cells.length).map(c => c.replace(/\\\|/g, '|'));}
  const parts = [], SEP = '\u0001', keep = [];
  for (let cell of cells) {
    // Code spans first, so nothing inside them reads as a link or a formula.
    cell = cell.replace(/(`+)(.+?)\1/g, x => `\u0002${keep.push(x) - 1}\u0002`);
    // Formulas are compared by their source, which the page keeps in an annotation; link texts
    // on their own (a citation shows as a chip with the others listed under it); pictures and
    // pointers to AppBlocks are not text.
    cell = cell.replace(/\$\$([^$]+)\$\$|\\\((.+?)\\\)|(?<![\\$])\$(?!\s)((?:\\.|[^\\$])+?)(?<!\s)\$(?!\d)/g, (x, a, b, c) => {parts.push(norm(a ?? b ?? c));return SEP;});
    cell = cell.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\((?:assets\/[^)]+\.(?:png|jpe?g|webp|gif)|ui\/appblock-[^)]+)\)/g, ' ');
    cell = cell.replace(/\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/g, (x, t) => `${SEP}[${t}](#)${SEP}`).replace(/<br>/g, SEP);
    cell = cell.replace(/\u0002(\d+)\u0002/g, (x, i) => keep[i]);
    const text = decode(marked.parseInline(cell));
    // A card row joins its parts with " · "; card controls are written as descriptions.
    // A tab bar's options ("选项：A / B", the last part of a row) may hold " · " themselves.
    const split = piece => {const parts = piece.split(' · '), at = parts.findIndex(p => /^\s*选项：/.test(p));return at < 0 ? parts : [...parts.slice(0, at), parts.slice(at).join(' · ')];};
    for (const piece of text.split(SEP)) for (let part of split(piece)) {
      part = norm(part);
      if (/^滑块：/.test(part)) continue;
      let options = false;
      part = part.replace(/^选项：/, () => {options = true;return '';}).replace(/^下拉选择：/, '').replace(/^\((?:•| )\) /, '').replace(/［输入框：[^］]*］/g, ' ').replace(/[［］]/g, ' ').replace(/^〔图示：|〕$/g, '');
      for (const t of options ? part.split(' / ') : [part]) {const c = norm(t).replace(/^[（()）、，,；;\s]+|[（()）、，,；;\s]+$/g, '');if (c.length > 1 && c !== '〔图示') parts.push(c);}
    }
  }
  return parts;
}
const chunksCount = header => {let n = 1;for (let i = 1; i < header.length - 1; i++) if (header[i] === '|' && !(/(\\+)$/.exec(header.slice(1, i))?.[1].length % 2)) n++;return n;};
function missingLines(md, text) {
  const missing = [];let role = null, fence = false, cols = 0, previous = '';
  // The Obsidian properties repeat the title and the source, which the page shows in its header.
  for (const line of md.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n')) {
    // A table's column count comes from its header row (the row before the --- row).
    const row = line.replace(/^(?:\s*>)+\s?/, '').trim(), isRow = /^\|.*\|$/.test(row);
    if (!isRow) cols = 0;else if (/^\|[\s:|-]+\|$/.test(row) && /^\|.*\|$/.test(previous)) cols = chunksCount(previous);
    previous = row;
    if (/^## 我$/.test(line)) {role = 'user';if (!text.includes('我')) missing.push(line);continue;}
    if (/^## (ChatGPT|未包含的非文字内容)$/.test(line)) {role = 'assistant';if (!text.includes(line.slice(3))) missing.push(line);continue;}
    if (/^# /.test(line) && !role) {if (!text.includes(norm(line.slice(2)))) missing.push(line);continue;}
    if (/^来源：/.test(line) && !role) {if (!text.includes(norm(line))) missing.push(line);continue;}
    const bare = line.replace(/^(?:\s*>)+\s?/, '');
    if (/^\s*(`{3,}|~{3,})/.test(bare) || /^\s*\$\$\s*$/.test(bare)) {fence = !fence;continue;}
    const pieces = fence ? [norm(bare)].filter(p => p.length > 1) : chunks(line, role, cols);
    for (const p of pieces) if (!text.includes(p)) {missing.push(`${line.slice(0, 120)}  ⟵ 缺少「${p.slice(0, 60)}」`);break;}
  }
  return missing;
}

// Runs one card in jsdom with the runtime the page carries, then uses its controls one by one
// until one of them changes what the card shows.
async function exerciseCard(runtime, init) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {runScripts:'outside-only', pretendToBeVisual:true}), w = dom.window;
  const posted = [];const tick = () => new Promise(r => setTimeout(r, 0));
  try {
    w.eval(runtime);
    w.ChatExportDilRender.mountLive(init, w.document, {postMessage:d => posted.push(d)});
    await tick();
    const error = posted.find(p => p.type === 'dil:error');
    if (error || !posted.some(p => p.type === 'dil:ready')) return {error:error?.message || 'no ready message'};
    const rootEl = w.document.getElementById('root'), frames = rootEl.querySelectorAll('iframe.ab-frame').length;
    const controls = [...rootEl.querySelectorAll('[data-on]')];
    if (!controls.length) return {ok:true, controls:0, frames, text:rootEl.textContent};
    // The body, not just the card: a copy or send button answers with a short notice.
    const before = () => [w.document.body.textContent, rootEl.innerHTML];
    const order = el => el.matches('.seg-opt,select,.rb-live') ? 0 : el.matches('input[type=range],.cb-live') ? 1 : el.matches('.pressable') ? 2 : 3;
    for (const el of controls.sort((a, b) => order(a) - order(b)).slice(0, 16)) {
      const [text, html] = before();
      const live = rootEl.querySelector(`[data-on="${el.dataset.on}"]${el.dataset.value ? `[data-value='${el.dataset.value.replace(/'/g, "\\'")}']` : ''}`) || el;
      if (live.matches('.seg-opt.on,.rb-live[aria-checked=true]')) continue;
      if (live.tagName === 'SELECT') {if (live.options.length < 2) continue;live.selectedIndex = (live.selectedIndex + 1) % live.options.length;live.dispatchEvent(new w.Event('change', {bubbles:true}));}
      else if (live.type === 'range') {live.value = String(Number(live.value) >= Number(live.max) ? live.min : live.max);live.dispatchEvent(new w.Event('input', {bubbles:true}));}
      else if (live.tagName === 'INPUT' || live.tagName === 'TEXTAREA') {live.value = 'html-check';live.dispatchEvent(new w.Event('input', {bubbles:true}));}
      else live.click();
      await tick();await tick();
      const [t2, h2] = before();
      if (t2 !== text || h2 !== html) return {ok:true, controls:controls.length, frames, changed:t2 !== text ? 'text' : 'markup', by:live.className || live.tagName, text};
    }
    return {ok:false, controls:controls.length, frames, error:'no control changed the card'};
  } catch (e) {return {error:String(e?.stack || e)};}
  finally {w.close();}
}

// Elements and text with data: URLs and local paths set aside, for comparing the two forms.
function shape(doc) {
  doc.querySelectorAll('header.top .meta').forEach(n => n.remove()); // the export time
  const tags = [...doc.body.querySelectorAll('*')].map(e => e.localName).join(',');
  return {text:pageText(doc), tags};
}

async function checkFixture(fx, {out} = {}) {
  const raw = fx.raw(), errors = [], info = {};
  const zip = await runExport(raw);
  if (zip.errors.length) errors.push(...zip.errors.map(e => `markdown export: ${e}`));
  const forms = {};
  for (const form of ['folder', 'single']) {
    const r = await runExport(raw, {html:form});
    if (r.errors.length) errors.push(...r.errors.map(e => `${form}: ${e}`));
    if (!r.html) {errors.push(`${form}: no HTML (${r.status})`);continue;}
    forms[form] = r;
  }
  if (!forms.folder || !forms.single) return {name:fx.name, errors, info};
  const docs = Object.fromEntries(Object.entries(forms).map(([k, r]) => [k, new JSDOM(r.html).window.document]));
  const doc = docs.folder, text = pageText(doc);
  // 1. Every line of the Markdown export.
  for (const m of missingLines(zip.md, text)) errors.push(`text missing: ${m}`);
  // 2. Assets.
  const refs = d => [...d.querySelectorAll('[src],[href]')].map(e => e.getAttribute('src') ?? e.getAttribute('href')).filter(Boolean);
  const files = new Set([...forms.folder.files.keys()]);
  for (const ref of refs(docs.folder)) if (!/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(ref)) {let p = ref;try {p = decodeURI(ref);} catch {}if (!files.has(p)) errors.push(`folder: missing file ${ref}`);}
  for (const f of files) if (!['conversation.html', 'manifest.json'].includes(f) && !refs(docs.folder).some(r => r === f || (() => {try {return decodeURI(r) === f;} catch {return false;}})())) errors.push(`folder: file not linked from the page ${f}`);
  for (const ref of refs(docs.single)) if (!/^(?:data:|https?:|mailto:|#)/i.test(ref)) errors.push(`single: local reference ${ref}`);
  for (const ref of refs(docs.single)) if (/^data:/.test(ref) && !/^data:[\w.+-]+\/[\w.+-]+(;[\w=-]+)*(;base64)?,/.test(ref)) errors.push(`single: malformed data URL ${ref.slice(0, 40)}`);
  // 3. Cards.
  const hosts = [...doc.querySelectorAll('.card-host')], expected = (zip.manifest.cards || []).length;
  info.cards = hosts.length;
  if (hosts.length !== expected) errors.push(`cards: page has ${hosts.length}, Markdown export has ${expected}`);
  const data = JSON.parse(doc.getElementById('export-data').textContent), runtime = JSON.parse(doc.getElementById('dil-runtime').textContent);
  let inCardFrames = 0;info.interactive = 0;info.static = 0;
  for (const [n, host] of hosts.entries()) {
    const message = data.messages[Number(host.dataset.msg)] || {};
    if (!message.dil) {errors.push(`card ${n + 1}: no program in the page data`);continue;}
    if (!host.querySelector('.card-static .dil-root')?.textContent.trim() && !host.querySelector('.card-static svg,.card-static img')) errors.push(`card ${n + 1}: static copy is empty`);
    const result = await exerciseCard(runtime, {frame:n, card:Number(host.dataset.card), dil:message.dil, images:message.images, blocks:message.blocks});
    if (result.error) errors.push(`card ${n + 1}: ${result.error.slice(0, 300)}`);
    else {
      inCardFrames += result.frames;
      if (result.controls) info.interactive++;else info.static++;
      // The live card starts where the page's static copy is: the same text.
      const staticText = norm(host.querySelector('.card-static').textContent);
      if (result.controls === 0 && norm(result.text) !== staticText) errors.push(`card ${n + 1}: live card differs from the static copy`);
    }
  }
  if (!doc.getElementById('export-data') || !data.boot?.includes('mountLive')) errors.push('page: card frame bootstrap missing');
  // 4. AppBlocks.
  const expectedBlocks = (zip.manifest.assets || []).filter(a => a.kind === 'appblock').length, pageFrames = doc.querySelectorAll('figure.appblock iframe.ab-frame[srcdoc]').length;
  const cardBlocks = data.messages.reduce((t, m) => t + Object.keys(m.blocks || {}).length, 0);
  info.appBlocks = pageFrames + cardBlocks;
  if (pageFrames + cardBlocks < expectedBlocks) errors.push(`appblocks: ${pageFrames} frames on the page + ${cardBlocks} in cards, Markdown export has ${expectedBlocks}`);
  if (cardBlocks > inCardFrames) info.cardBlocksHidden = cardBlocks - inCardFrames;
  for (const f of doc.querySelectorAll('iframe.ab-frame')) if (!/<\/?(html|body|script|div|canvas|svg)/i.test(f.getAttribute('srcdoc') || '')) errors.push('appblock: empty frame');
  // 5. Both forms alike.
  const [a, b] = [shape(docs.folder), shape(docs.single)];
  if (a.text !== b.text) errors.push('forms: text differs between folder and single file');
  if (a.tags !== b.tags) errors.push('forms: elements differ between folder and single file');
  info.maps = doc.querySelectorAll('figure.map').length;
  info.kb = Math.round(forms.single.html.length / 1024);
  if (out) {
    fs.mkdirSync(out, {recursive:true});
    fs.writeFileSync(path.join(out, `${fx.name}.html`), forms.single.html);
    const dir = path.join(out, fx.name);fs.rmSync(dir, {recursive:true, force:true});
    for (const [name, value] of forms.folder.files) {const p = path.join(dir, name);fs.mkdirSync(path.dirname(p), {recursive:true});fs.writeFileSync(p, typeof value === 'string' ? value : PIXEL);}
  }
  return {name:fx.name, errors, info};
}

module.exports = {checkFixture, fixtures, missingLines, exerciseCard, labConversation};

if (require.main === module) (async () => {
  const args = process.argv.slice(2), outAt = args.indexOf('--out'), out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
  const list = fixtures().filter(f => !args.length || args.some(a => f.name.includes(a)));
  let total = 0;
  for (const fx of list) {
    const r = await checkFixture(fx, {out});
    total += r.errors.length;
    console.log(`${r.errors.length ? '✖' : '✔'} ${r.name} ${JSON.stringify(r.info)}`);
    for (const e of r.errors.slice(0, 25)) console.log(`    ${e}`);
    if (r.errors.length > 25) console.log(`    … ${r.errors.length - 25} more`);
  }
  console.log(`${list.length} conversations, ${total} errors`);
  process.exit(total ? 1 : 0);
})().catch(e => {console.error('HTML CHECK CRASH', e);process.exit(1);});
