const {test} = require('./private-fixtures.cjs');const assert = require('node:assert/strict');const fs = require('node:fs');const vm = require('node:vm');
const {JSDOM} = require('../scripts/i18n-env.cjs');
const render = require('../extension/dil-render');
const {runExport} = require('../scripts/edge-harness.cjs');
const {checkFixture, fixtures, missingLines, exerciseCard} = require('../scripts/html-check.cjs');
// The whole-conversation HTML export (html-export.js), checked offline with the real panel code.
const load = n => JSON.parse(fs.readFileSync(`tests/fixtures/edge-2026-10/EDGE-${n}.raw.json`, 'utf8'));
const page = html => new JSDOM(html).window.document;
const exec = (code, scope) => vm.runInNewContext(code, {...scope}, {timeout:3000});

test('html-check passes on a spread of fixtures (cards, AppBlocks, map, lab cards)', async () => {
  for (const name of ['EDGE-01', 'EDGE-04', 'EDGE-05', 'EDGE-09', 'PRO-09', 'lab-survey']) {
    const r = await checkFixture(fixtures().find(f => f.name === name));
    assert.deepEqual(r.errors, [], name);
  }
});
test('the check notices missing text, and a card whose controls do nothing', async () => {
  const md = '# T\n\n来源：https://chatgpt.com/c/x\n\n## ChatGPT\n\n第一行文字\n\n| 甲 | 乙 |\n| --- | --- |\n| 一 | $x^2$ |';
  assert.deepEqual(missingLines(md, 'T 来源：https://chatgpt.com/c/x ChatGPT 第一行文字 甲 乙 一 x^2'), []);
  assert.equal(missingLines(md, 'T 来源：https://chatgpt.com/c/x ChatGPT 甲 乙 一 x^2').length, 1);
  assert.equal(missingLines(md, 'T 来源：https://chatgpt.com/c/x ChatGPT 第一行文字 甲 乙 一').length, 1);
  const dead = {code:'DIL.render(__dil.jsx("card",null,__dil.jsx("button",{"onClick":()=>{}},"无效按钮")))'};
  const runtime = render.source();
  assert.equal((await exerciseCard(runtime, {frame:0, card:0, dil:dead})).ok, false);
  const broken = await exerciseCard(runtime, {frame:0, card:0, dil:{code:'throw Error("坏程序")'}});
  assert.match(broken.error, /坏程序/);
});
test('EDGE-01: the live card starts at its default state and its tab bar switches the content', async () => {
  const r = await runExport(load('01'), {html:'single'}), doc = page(r.html);
  const host = doc.querySelector('.card-host'), data = JSON.parse(doc.getElementById('export-data').textContent);
  assert.match(host.querySelector('.card-static').textContent, /总览标签内容/);
  const dom = new JSDOM('<!doctype html><body><div id="root"></div>', {runScripts:'outside-only'}), w = dom.window, posted = [];
  w.eval(JSON.parse(doc.getElementById('dil-runtime').textContent));
  const m = data.messages[host.dataset.msg];
  w.ChatExportDilRender.mountLive({frame:0, card:0, dil:m.dil, images:m.images, blocks:m.blocks}, w.document, {postMessage:d => posted.push(d)});
  const root = w.document.getElementById('root');
  assert.match(root.textContent, /总览标签内容/);
  [...root.querySelectorAll('button.seg-opt')].find(b => b.textContent === '控件').click();
  await new Promise(r => setTimeout(r, 0));
  assert.match(root.textContent, /控件标签内容/);assert.doesNotMatch(root.textContent, /总览标签内容/);
  // The change is posted for the message's other cards; the slider keeps working too.
  assert.ok(posted.some(p => p.type === 'dil:state' && p.key === 'tab' && p.value === 'controls'));
  const slider = root.querySelector('input[type=range]');slider.value = '20';slider.dispatchEvent(new w.Event('input', {bubbles:true}));
  await new Promise(r => setTimeout(r, 0));
  assert.match(root.textContent, /滑块值：20/);
  assert.equal(root.querySelector('input[type=range]'), slider, 'the slider being dragged is kept, not rebuilt');
  w.close();
});
test('the two forms show the same page; the folder links its files, the single file inlines them', async () => {
  const raw = load('10'), [folder, single] = [await runExport(raw, {html:'folder'}), await runExport(raw, {html:'single'})];
  const text = d => {d.querySelectorAll('script,.meta').forEach(n => n.remove());return d.body.textContent;};
  assert.equal(text(page(folder.html)), text(page(single.html)));
  assert.match(folder.filename, /\.html\.zip$/);assert.match(single.filename, / - \d{4}-\d{2}-\d{2}\.html$/);
  assert.ok(folder.files.has('conversation.html'));assert.ok([...folder.files.keys()].some(k => k.startsWith('files/')));
  assert.doesNotMatch(single.html, /(?:src|href)="(?:assets|files)\//);
  assert.match(single.html, /href="data:[^"]+" download="data\.xlsx"/);
  assert.doesNotMatch(folder.html, /src="data:image\/png[^"]*" alt="[^"]*" loading/, 'prose pictures are files in the folder form');
});
test('EDGE-05: each AppBlock runs in a sandboxed srcdoc frame that reports its height', async () => {
  const doc = page((await runExport(load('05'), {html:'single'})).html), frames = [...doc.querySelectorAll('figure.appblock iframe.ab-frame')];
  assert.equal(frames.length, 3);
  for (const f of frames) {
    assert.equal(f.getAttribute('sandbox'), 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
    assert.match(f.getAttribute('srcdoc'), /ab:size/);assert.match(f.getAttribute('srcdoc'), /tailwind-lite/);
  }
  assert.match(doc.querySelector('figure.appblock figcaption').textContent, /嵌入应用：应用A · 旋转动画/);
  assert.equal(doc.querySelectorAll('img.ab-poster').length, 3, 'previews kept for printing');
});
test('EDGE-09: the map keeps its places for the draggable map, the place list stays text', async () => {
  const doc = page((await runExport(load('09'), {html:'single'})).html), data = JSON.parse(doc.getElementById('export-data').textContent);
  assert.equal(doc.querySelectorAll('figure.map').length, 1);
  assert.equal(data.maps, true);assert.equal(data.mapPlaces[0].length, 5);
  assert.ok(data.mapPlaces[0].every(p => typeof p.lat === 'number' && typeof p.lng === 'number' && p.name));
  assert.match(doc.querySelector('figure.map').textContent, /OpenStreetMap/);
  assert.match(doc.body.textContent, /Finjan Qahwa/);
  assert.equal(doc.querySelector('figure.map .map-load').textContent, '联网查看可拖动地图');
  const off = page((await runExport(load('09'), {html:'single', maps:false})).html);
  assert.equal(JSON.parse(off.getElementById('export-data').textContent).maps, false);
  assert.equal(off.querySelector('figure.map .map-load'), null, 'with the option off the page never goes online');
});
test('EDGE-09: the page asks for no tile until the map button is clicked, and falls back to the picture', async () => {
  const html = (await runExport(load('09'), {html:'single'})).html.replace('"maps":true', '"maps":true,"mapTimeout":60');
  const dom = new JSDOM(html, {runScripts:'dangerously'}), d = dom.window.document, tick = ms => new Promise(r => setTimeout(r, ms));
  const figure = d.querySelector('figure.map'), button = figure.querySelector('.map-load'), tiles = () => figure.querySelectorAll('.map-tiles img');
  assert.equal(tiles().length, 0, 'no network request when the page opens');
  // First tile fails: back to the picture at once, with a note and a retry.
  button.click();assert.ok(tiles().length > 0);assert.equal(button.textContent, '正在连接地图服务……');
  tiles()[0].dispatchEvent(new dom.window.Event('error'));
  assert.equal(figure.querySelector('.map-live'), null);assert.ok(!figure.classList.contains('map-online'));
  assert.equal(button.textContent, '重试联网地图');assert.match(figure.querySelector('.map-note').textContent, /地图服务连不上/);
  // No tile at all (a connection that hangs): the watchdog gives up (60 ms here, 4 s in a real page).
  button.click();await tick(120);
  assert.equal(figure.querySelector('.map-live'), null);assert.match(figure.querySelector('.map-note').textContent, /没有加载出地图图块/);
  // Tiles arrive: the map replaces the picture, and the same button returns to it.
  button.click();tiles()[0].dispatchEvent(new dom.window.Event('load'));
  assert.ok(figure.classList.contains('map-online'));assert.equal(button.textContent, '返回截图');assert.equal(figure.querySelector('.map-note').textContent, '');
  await tick(120);assert.ok(figure.querySelector('.map-live'), 'the watchdog is off once a tile has loaded');
  button.click();
  assert.equal(figure.querySelector('.map-live'), null);assert.ok(!figure.classList.contains('map-online'));assert.equal(button.textContent, '联网查看可拖动地图');
  dom.window.close();
});
test('formulas become MathML with their source kept; unreadable input is left to the caller', () => {
  const m = render.mathml(String.raw`\frac{a}{b}+\sum_{i=1}^{n} x_i`, true);
  assert.match(m, /^<math display="block"><semantics>/);assert.match(m, /<mfrac><mi>a<\/mi><mi>b<\/mi><\/mfrac>/);assert.match(m, /<munderover><mo largeop="true">∑<\/mo>/);
  assert.match(m, /<annotation encoding="application\/x-tex">\\frac\{a\}\{b\}\+\\sum_\{i=1\}\^\{n\} x_i<\/annotation>/);
  assert.match(render.mathml(String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`), /<mtable><mtr><mtd><mn>1<\/mn><\/mtd><mtd><mn>2<\/mn><\/mtd><\/mtr><mtr>/);
  assert.match(render.mathml(String.raw`a \rightarrow b`), /<mo>→<\/mo>/);
  assert.equal(render.mathml('a}b'), null);
});
test('prose HTML kept as is loses scripts, event attributes and script URLs; SVG stays', () => {
  const {sanitize} = require('../extension/html-export');
  const doc = new JSDOM('').window.document;
  const out = sanitize('<p onclick="x()">a<script>alert(1)</script><a href="javascript:alert(1)">b</a><iframe src="https://e.x"></iframe><svg viewBox="0 0 1 1"><circle r="1" onload="x()"/></svg><x-slot data-k="fake"></x-slot><img src="https://e.x/a.png"></p>', doc, 'real');
  assert.doesNotMatch(out, /<script|alert|onclick|onload|javascript:|<iframe|x-slot/);
  assert.match(out, /<svg viewBox="0 0 1 1"><circle r="1"><\/circle><\/svg>/);assert.match(out, /<img src="https:\/\/e\.x\/a\.png">/);
  // The frame leaves a notice in its place; the link keeps its text, marked, pointing at the explanation.
  assert.match(out, /<details class="fx-box"><summary>Removed: &lt;iframe&gt; — embedded page<\/summary>/);
  assert.match(out, /<a class="fx-inline" title="Removed: link address\.[^"]*" href="https:\/\/github\.com\/letheli710\/chat-intelligent-ui-exporter\/blob\/main\/docs\/html-filter\.md#links"[^>]*>b<\/a>/);
});
test('removed content that showed on the page leaves an English notice linking to its section; invisible parts go silently', () => {
  const {sanitize} = require('../extension/html-export');
  const doc = new JSDOM('').window.document;
  const notices = {iframe:'embedded-pages', object:'embedded-pages', embed:'embedded-pages', video:'media', audio:'media', canvas:'canvas', form:'forms', button:'forms', select:'forms', textarea:'forms', dialog:'forms'};
  for (const [tag, key] of Object.entries(notices)) {
    const out = sanitize(`<p>before</p>${tag === 'embed' ? '<embed src="CONTENT-OF-TAG.swf">' : `<${tag}>CONTENT-OF-TAG</${tag}>`}<p>after</p>`, doc, 'real');
    assert.match(out, new RegExp(`<summary>Removed: &lt;${tag}&gt; — [^<]+</summary><div class="why">[^<]+<a href="[^"]+#${key}" target="_blank" rel="noopener noreferrer">Learn more →</a>`), tag);
    assert.match(out, /<p>before<\/p>[\s\S]*<p>after<\/p>/, tag);assert.doesNotMatch(out, /CONTENT-OF-TAG/, tag);
  }
  for (const tag of ['script', 'style', 'template', 'noscript']) assert.equal(sanitize(`<p>a</p><${tag}>x</${tag}><p>b</p>`, doc, 'real'), '<p>a</p><p>b</p>', tag);
  // Inside SVG nothing is added, so the picture keeps its shape.
  assert.doesNotMatch(sanitize('<svg><title>t</title><a href="javascript:x()"><text>s</text></a></svg>', doc, 'real'), /fx-|Removed/);
  // Every section a notice links to is a heading in docs/html-filter.md (GitHub makes the anchor from it).
  const anchors = [...fs.readFileSync('docs/html-filter.md', 'utf8').matchAll(/^## (.+)$/gm)].map(m => m[1].toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-'));
  for (const key of [...new Set(Object.values(notices)), 'links']) assert.ok(anchors.includes(key), key);
});
test('a code block keeps its own copy button and no "Removed" notice; a button written in the chat is still removed', async () => {
  const say = (id, role, text, parent, child) => ({parent, children:child ? [child] : [], message:{id, author:{role}, channel:'final', recipient:'all', content:{content_type:'text', parts:[text]}}});
  const raw = {conversation_id:'code', title:'code', current_node:'a', mapping:{u:say('u', 'user', 'print it', null, 'a'),
    a:say('a', 'assistant', 'Here:\n\n```python\nprint("hi")\n```\n\n<button>Click</button>', 'u', null)}};
  const html = (await runExport(raw, {html:'single', storage:{chatExportProseHtml:'keep'}})).html;
  const d = page(html), block = d.querySelector('.codeblock');
  assert.ok(block.querySelector('.code-head button.copy')?.textContent);
  assert.equal(block.querySelector('.fx-box'), null);
  assert.equal(d.querySelectorAll('.fx-box').length, 1, 'the chat\'s own <button> leaves its notice');
  assert.equal(d.querySelectorAll('button.copy').length, 1);
});
test('script URLs hidden by tabs, line breaks or control characters are removed too', () => {
  const {sanitize} = require('../extension/html-export');
  const doc = new JSDOM('').window.document;
  // Browsers read every one of these hrefs as a script URL.
  const hidden = ['java&#9;script:x()', 'java&#10;script:x()', 'java&#13;script:x()', 'java\tscript:x()', ' &#1;javascript:x()', 'jav&#x09;ascript:x()', 'JaVa&#9;ScRiPt:x()', 'vb&#9;script:x()', 'da&#9;ta:text/html,x'];
  for (const href of hidden) {
    const out = sanitize(`<a href="${href}">a</a><svg><a href="${href}"><text>b</text></a><a xlink:href="${href}"><text>c</text></a><use href="${href}"></use></svg>`, doc, 'real');
    // Only the explanation link is left, on the HTML link; the SVG ones lose theirs.
    assert.doesNotMatch(out.replace(/href="https:\/\/github\.com\/letheli710\/chat-intelligent-ui-exporter\/blob\/main\/docs\/html-filter\.md#links"/, ''), /href/, href);
    assert.match(out, /^<a class="fx-inline"/, href);
  }
  // Ordinary links, local files and inline pictures are kept as they were.
  const kept = sanitize('<a href="https://e.x/a">a</a><a href="files/a.csv">b</a><a href="#n">c</a><img src="data:image/png;base64,AA=="><svg><a href="https://e.x/b"><text>d</text></a></svg>', doc, 'real');
  assert.match(kept, /href="https:\/\/e\.x\/a"/);assert.match(kept, /href="files\/a\.csv"/);assert.match(kept, /href="#n"/);assert.match(kept, /src="data:image\/png;base64,AA=="/);assert.match(kept, /href="https:\/\/e\.x\/b"/);
});
test('toHtml without options is unchanged by the live mode; live controls carry handler numbers', () => {
  const dil = {code:'const [v,setV]=DIL.useState(3,{key:"v"});DIL.render(__dil.jsx("card",null,__dil.jsx("slider",{"min":0,"max":10,"value":v,"onChange":setV}),__dil.jsx("link",{"href":"https://a.example/?utm_source=chatgpt.com"},"链接")))'};
  const tree = render.evaluate(dil, exec);
  assert.equal(render.toHtml(tree), '<div class="card"><div class="slider"><div class="slider-track"></div><div class="slider-fill" style="width:30.00%"></div><div class="slider-thumb" style="left:30.00%"></div></div><span class="link">链接</span></div>');
  const live = {handlers:[], refs:[], get:(k, d) => d, set() {}};
  const html = render.toHtml(render.evaluate(dil, exec, {live}), {live:true});
  assert.match(html, /<input type="range" class="slider-input" min="0" max="10" step="1" value="3" data-on="0"/);
  assert.match(html, /<a class="link" href="https:\/\/a\.example\/" target="_blank" rel="noopener noreferrer">链接<\/a>/);
  assert.equal(typeof live.handlers[0], 'function');
});
test('the panel offers the HTML export, remembers its form and the background accepts .html', () => {
  const kit = require('../extension/ui-kit.js'), settings = require('../extension/settings.js'), background = fs.readFileSync('extension/background.js', 'utf8');
  const rows = kit.groups.flatMap(g => g.rows);
  // One file is the default and comes first; its ⓘ opens help.html#html-form, which the background allows.
  const form = rows.find(r => r.key === 'htmlForm');
  assert.deepEqual(form.options, [['single', '单文件'], ['folder', 'ZIP']]);assert.equal(settings.defaults.htmlForm, 'single');
  assert.equal(form.tip, 'htmlForm');assert.equal(form.help, 'html-form');assert.match(background, /'html-form'\]\.includes\(message\.topic\)/);
  assert.match(fs.readFileSync('extension/help.html', 'utf8'), /<section id="html-form">/);
  assert.equal(rows.find(r => r.key === 'htmlMap').tip, 'map');assert.equal(settings.legacy.htmlForm.key, 'chatExportHtmlForm');
  // The words (language files, then i18n.js) load before every script that shows them.
  const scripts = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8')).content_scripts[0].js;
  assert.deepEqual(scripts.slice(0, 11), [...['en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'pt_BR', 'fr', 'de', 'ru'].map(l => `locales/${l}.js`), 'i18n.js']);
  assert.deepEqual(scripts.slice(11, 16), ['jszip.min.js', 'marked.min.js', 'fast-text.js', 'dil-render.js', 'html-export.js']);
  assert.match(background, /\(zip\|md\|json\|html\)/);
});
