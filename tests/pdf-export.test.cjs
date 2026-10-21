const {test} = require('./private-fixtures.cjs');const assert = require('node:assert/strict');const fs = require('node:fs');
const {JSDOM} = require('../scripts/i18n-env.cjs');const {execFileSync} = require('node:child_process');
const pdf = require('../extension/pdf-export.js');require('../extension/dil-render.js');
const {runExport} = require('../scripts/edge-harness.cjs');
const {expectedUnits, markdownLinks} = require('../scripts/pdf-check.cjs');
const edge = n => JSON.parse(fs.readFileSync(`tests/fixtures/edge-2026-10/EDGE-${n}.raw.json`, 'utf8'));
const html = (md, options) => new JSDOM(pdf.markdownHtml(md, options)).window.document.body;

test('the document splits into its messages; "## " lines inside code stay code', () => {
  const doc = pdf.splitDocument('# 标题\n\n来源：https://chatgpt.com/c/x\n\n## 我\n\n问\n\n---\n\n## ChatGPT\n\n```md\n## 我\n```\n\n答\n\n## 未包含的非文字内容\n\n- 提示\n');
  assert.equal(doc.title, '标题');assert.equal(doc.source, 'https://chatgpt.com/c/x');
  assert.deepEqual(doc.sections.map(s => [s.role, s.md]), [['user', '问'], ['assistant', '```md\n## 我\n```\n\n答'], ['notes', '- 提示']]);
});
test('HTML in the text shows as text, as on the ChatGPT page; the exporter\'s <br> stays a break', () => {
  const body = html('<svg onload="x()"><script>alert(1)</script></svg> a<br>b\n\n<img src=x onerror=alert(1)>');
  assert.equal(body.querySelectorAll('svg,script,img').length, 0);assert.match(body.textContent, /<svg onload="x\(\)">/);
  assert.equal(body.querySelectorAll('br').length, 1);
});
test('formulas become readable text in answers; prompts keep their dollars and line breaks', () => {
  const body = html('能量 $E=mc^2$，价格 $5 和 $6\n\n$$\n\\frac{a}{b}\n$$');
  assert.equal(body.querySelectorAll('.math').length, 2);assert.match(body.querySelector('.math').innerHTML, /E=mc<sup>2<\/sup>/);
  assert.match(body.textContent, /价格 \$5 和 \$6/);
  const prompt = html('含 $HOME 和 $x$\n第二行', {math:false, breaks:true});
  assert.equal(prompt.querySelectorAll('.math').length, 0);assert.equal(prompt.querySelectorAll('br').length, 1);
});
test('formula environments, alignment and symbols the card converter lacks read as text', () => {
  const text = (s, block) => pdf.texHtml(s, block).replace(/<br>/g, '\n').replace(/<[^>]+>/g, '');
  assert.equal(text(String.raw`\begin{aligned} a &= b \\ &= \boxed{c} \end{aligned}`, true), 'a  = b\n= c');
  assert.equal(text(String.raw`x \in \mathbb{R}^n, \langle x | y \rangle, \|A\|_2, \infty`), 'x ∈ ℝn, ⟨ x | y ⟩, ‖A‖2, ∞');
});
test('links to the web stay links; links to archive files keep only their text', () => {
  const body = html('[网页](https://example.com/a) [文件](files/a.csv) <https://b.example/> ![图](assets/x.png) ![缺](assets/none.png)', {resolve:p => p === 'assets/x.png' ? {url:'blob:x', asset:{kind:'original-image'}} : null});
  assert.deepEqual([...body.querySelectorAll('a')].map(a => a.href), ['https://example.com/a', 'https://b.example/']);
  assert.equal(body.querySelector('.local-link').textContent, '文件');
  assert.equal(body.querySelector('img').getAttribute('src'), 'blob:x');assert.match(body.querySelector('.missing').textContent, /图片未下载：缺/);
});
test('long code wraps instead of scrolling; wide tables get a landscape page', () => {
  assert.match(pdf.PRINT_CSS, /\.md pre\{[^}]*white-space:pre-wrap[^}]*overflow-wrap:anywhere/);
  assert.match(pdf.PRINT_CSS, /@page wide\{size:A4 landscape\}/);assert.match(pdf.PRINT_CSS, /\.table-wrap\.wide\{page:wide/);
  assert.match(pdf.PRINT_CSS, /print-color-adjust:exact/);
  // A margin box of our own on the top and bottom edges keeps Chrome's header and footer off the page.
  assert.ok(pdf.PRINT_CSS.includes('@top-center{content:""}'));assert.ok(pdf.PRINT_CSS.includes('@bottom-center{content:counter(page)'));
});
test('"导出 PDF" posts the ZIP\'s Markdown and images to its hidden print frame', async () => {
  // The PDF keeps the plain 来源 line, as the ZIP does with the Obsidian properties off.
  const r = await runExport(edge('01'), {mode:'pdf'}), zip = await runExport(edge('01'), {storage:{'chatExport.yaml':'false'}});
  assert.deepEqual(r.errors, []);assert.equal(r.opened, 'chrome-extension://x/print.html');assert.equal(r.pdfOrigin, 'chrome-extension://x');
  assert.equal(r.pdf.type, 'pdf:document');assert.equal(r.pdf.documentTitle, `组件测试卡 - ${require('../extension/settings.js').day()}`, 'the default PDF file name is the title and the date');
  // Chrome names the PDF after the tab: the tab carries that name while the dialog is open, then gets its title back.
  assert.deepEqual(r.pdfTitles, {printing:r.pdf.documentTitle, after:'组件测试卡'});
  assert.equal(r.pdf.md, zip.md);
  assert.ok(r.pdf.assets.length && r.pdf.assets.every(a => /\.(png|jpe?g|gif|webp|svg)$/.test(a.path) && a.blob), 'images only');
  assert.ok(r.pdf.assets.some(a => a.kind === 'card-image'));
});
test('print page: messages, opened callouts and links (jsdom; image slicing needs a browser)', async () => {
  const r = await runExport(edge('01'), {mode:'pdf'});
  // jsdom loads no images and cannot parse @page margin boxes; neither matters here.
  const {VirtualConsole} = require('../scripts/i18n-env.cjs'), dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {url:'file:///print.html', virtualConsole:new VirtualConsole()}), doc = dom.window.document;
  Object.defineProperty(dom.window.HTMLImageElement.prototype, 'complete', {get:() => true});
  const report = await pdf.render({...r.pdf, assets:r.pdf.assets.map(a => ({...a, blob:null, url:'blob:' + a.path}))}, doc);
  assert.equal(doc.querySelectorAll('section.msg.user').length, 1);assert.equal(doc.querySelectorAll('section.msg.assistant').length, 1);
  assert.equal(doc.querySelectorAll('blockquote').length, 0, 'every callout is open');
  // The card text stays as invisible text right after the card image, not as a second box.
  assert.equal(doc.querySelectorAll('.callout.card-text').length, 0);
  assert.match(doc.querySelector('.card + .card-text-layer').textContent, /全组件测试卡/);
  assert.match(pdf.PRINT_CSS, /\.card-text-layer\{[^}]*color:transparent/);
  assert.ok(doc.querySelector('.card img.card-img'));
  assert.equal(report.links.length, markdownLinks(r.pdf.md).length);
  assert.equal(doc.title, r.pdf.documentTitle);
});
test('a picture-list table (empty header, thumbnail | text) is laid out as a picture list', () => {
  const dom = new JSDOM('<div class="md"></div>'), md = dom.window.document.querySelector('.md');
  md.innerHTML = pdf.markdownHtml('| | |\n| --- | --- |\n| [![蕨](assets/t1.jpg)](assets/o1.jpg) | **月雾蕨**<br>光照需求：明亮散射光 |\n| [![龟背](assets/t2.jpg)](assets/o2.jpg) | **蜜桃龟背** |', {resolve:p => ({url:'blob:' + p, asset:{kind:'card-thumb'}})});
  pdf.wrapBlocks(md);
  assert.equal(md.querySelectorAll('table').length, 0);assert.equal(md.querySelectorAll('.pic-list .pic-row').length, 2);
  assert.equal(md.querySelector('.pic-row img.pic-thumb').getAttribute('src'), 'blob:assets/t1.jpg');
  assert.match(md.querySelector('.pic-row .pic-text').textContent, /月雾蕨光照需求：明亮散射光/);
});
test('HT-01: a card image with width="100%" fills its 124px column instead of spilling over the text', () => {
  const vm = require('node:vm'), render = require('../extension/dil-render.js'), text = require('../extension/fast-text.js');
  const m = text.parseTree(JSON.parse(fs.readFileSync('tests/fixtures/pdf-layout/HT-01.raw.json', 'utf8'))).messages.find(x => x.dil);
  const card = render.segments(render.evaluate({...m.dil, contentReferences:m.contentReferences}, (c, s) => vm.runInNewContext(c, {...s}))).find(s => s.kind === 'card');
  const html = render.toHtml(card.tree);
  assert.doesNotMatch(html, /width:124px;min-width:124px"><div class="img img-ph" style="width:180px/);
  assert.match(html, /width:124px;min-width:124px"><div class="img img-ph" style="width:100%;max-width:100%;height:auto;aspect-ratio:1\/1/);
});
test('pdf-check reads every Markdown line, table cells one by one, formulas as their text', () => {
  const units = expectedUnits('# T\n\n## ChatGPT\n\n| a | b |\n| --- | --- |\n| [x](https://e/) | \\*y\\* |\n\n> [!note]- 卡片文字\n> 正文 $\\alpha$\n\n```js\nlet a = 1;\n```\n\n![图](assets/a.png)').map(u => u.text.trim());
  assert.deepEqual(units, ['T', 'ChatGPT', 'a', 'b', 'x', '*y*', '正文 α', 'let a = 1;']);
});
test('the print page is a web-accessible extension page; permissions are the panel redesign\'s', () => {
  const m = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
  assert.ok(m.web_accessible_resources[0].resources.includes('print.html'));
  // storage: the settings shared by the sidebar, the toolbar panel and the settings tab; the ChatGPT hosts as the content scripts.
  assert.deepEqual(m.permissions, ['activeTab', 'scripting', 'downloads', 'storage']);assert.deepEqual(m.host_permissions, ['https://images.openai.com/*', 'https://chatgpt.com/*', 'https://chat.openai.com/*']);
  const page = fs.readFileSync('extension/print.html', 'utf8');
  for (const s of ['marked.umd.js', 'dil-render.js', 'pdf-export.js']) {assert.match(page, new RegExp(`<script src="${s}"></script>`));assert.ok(fs.existsSync(`extension/${s}`));}
  assert.doesNotMatch(page, /<script>(?!<)/, 'no inline script (extension pages forbid it)');
});
// Prints a real PDF with headless Chrome and reads it back (skipped without Chrome).
test('pdf-check: EDGE-10 prints with all text, links and images', {timeout:180000}, t => {
  const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
  if (!chrome) return t.skip('Chrome not found');
  if (!fs.existsSync('tests/fixtures/edge-2026-10/EDGE-10.raw.json')) return t.skip('缺少本地私有夹具：tests/fixtures/edge-2026-10/EDGE-10.raw.json');
  const out = execFileSync(process.execPath, ['scripts/pdf-check.cjs', 'tests/fixtures/edge-2026-10/EDGE-10.raw.json', '--out', 'tmp/pdf-test'], {encoding:'utf8', env:{...process.env, CHROME_PATH:chrome}});
  assert.match(out, /^ok {3}EDGE-10/m);assert.match(out, /0 with errors, 0 errors/);
});
