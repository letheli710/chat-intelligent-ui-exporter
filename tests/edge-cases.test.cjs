const {test} = require('./private-fixtures.cjs');const assert = require('node:assert/strict');const fs = require('node:fs');
const {JSDOM} = require('../scripts/i18n-env.cjs');const {marked} = require('marked');
const {runExport} = require('../scripts/edge-harness.cjs');
// Edge-case conversations made on chatgpt.com on 2026-10-17 (no private content; the
// account id is replaced). The prompts are in each conversation's first message.
const dir = 'tests/fixtures/edge-2026-10';
const load = n => JSON.parse(fs.readFileSync(`${dir}/EDGE-${n}.raw.json`, 'utf8'));
// The answer part of an export (the prompts repeat many of the same words).
const answer = md => md.slice(md.indexOf('## ChatGPT'));
// What a Markdown viewer shows for the export.
const rendered = md => {const doc = new JSDOM(marked.parse(md)).window.document;return {doc, text:doc.body.textContent};};

test('every edge case exports without errors', async () => {
  for (const n of ['01','02','03','04','05','06','07','08','09','10','11']) {
    const r = await runExport(load(n));
    assert.deepEqual(r.errors, [], n);assert.match(r.md, /^---\ntitle: [\s\S]*?\n---\n\n# /, n);
    // EDGE-09: the faked network has no map on the page and no real image bytes.
    assert.deepEqual(r.warnings.filter(w => !(n === '09' && /地图未能从页面截取|界面图片未下载/.test(w))), [], n);
  }
});
test('EDGE-02: card text shows its characters literally, not as Markdown or HTML', async () => {
  const md = answer((await runExport(load('02'))).md), {doc, text} = rendered(md);
  for (const literal of ['a|b|c', '*不是斜体*', '**init**', '`code`', '$5 和 $10', '<script>alert(1)</script>', '&amp;', '<!-- hi -->', '#不是标题'])
    assert.ok(text.includes(literal), `missing literal ${literal}`);
  assert.equal(doc.querySelectorAll('script').length, 0);
  // Obsidian reads "#word" as a tag and "$…$" as math; both stay escaped in the source.
  assert.match(md, /\\#不是标题/);assert.doesNotMatch(md, /(^|[^\\])\$5/m);
  // The four-backtick fenced block outside the card is code: nothing in it is escaped.
  assert.match(md, /````text\n```\n含&#x20;\na\|b\|c\n<script>alert\(1\)<\/script>\n<!-- hi -->\n```\n````/);
});
test('EDGE-10: files a card names only in its data are downloaded and linked', async () => {
  const r = await runExport(load('10')), md = answer(r.md);
  const names = ['测试_文件__1.csv', 'data.xlsx', 'trend.png', 'bundle.zip'];
  for (const n of names) assert.ok(r.files.has(`files/${n}`), n);
  assert.match(md, /\*\*代码生成的文件\*\*\n\n- \[测试 文件 \\#1\.csv\]\(files\/测试_文件__1\.csv\)\n- \[data\.xlsx\]\(files\/data\.xlsx\)\n- \[trend\.png\]\(files\/trend\.png\)\n- \[bundle\.zip\]\(files\/bundle\.zip\)\n*$/);
  // The answer's id is the message id the interpreter download accepts (checked on chatgpt.com).
  const asked = r.requests.filter(p => p.includes('/interpreter/download?')).map(decodeURIComponent);
  assert.equal(asked.length, 4);assert.ok(asked.every(p => p.includes('message_id=1a645264-e84b-4676-9615-838413b63407')));
  assert.ok(asked.some(p => p.endsWith('sandbox_path=/mnt/data/测试 文件 #1.csv')));
  assert.equal(r.manifest.assets.filter(a => a.kind === 'code-file').length, 4);
});
test('EDGE-02: a run without spaces breaks inside the card instead of overflowing', () => {
  // Checked in Chrome on the EDGE-02 card: content width 2121 px before, 700 px (the card) after.
  assert.match(require('../extension/dil-render').CARD_CSS, /\.dil-root \*\{[^}]*overflow-wrap:anywhere/);
});
test('EDGE-09/11: headings inside an answer sit below the per-message ## headings', async () => {
  for (const [n, heading] of [['09', '### ☕ 旧金山 Mission District 高评分咖啡馆 TOP 5'], ['11', '### 小猫整理文件夹']]) {
    const md = (await runExport(load(n))).md, inner = answer(md).split('\n').filter(l => /^#/.test(l) && !/^## (ChatGPT|我|未包含的非文字内容)$/.test(l));
    assert.ok(inner.includes(heading), n);assert.ok(inner.every(l => /^#{3,6} /.test(l)), `${n}: ${inner}`);
  }
  // Code and math blocks are not prose: a "# comment" in them stays as written.
  const text = require('../extension/fast-text');
  const md = text.markdown({title:'t', messages:[{id:'a', role:'assistant', md:'# 标题\n\n```python\n# 注释\n```\n\n$$\n# x\n$$\n\n###### 六级'}]}, ['a'], 'u');
  assert.match(md, /### 标题\n\n```python\n# 注释\n```\n\n\$\$\n# x\n\$\$\n\n###### 六级/);
});
test('small fixes: one section per answer, no tracking tags, tidy badges and code blocks', async () => {
  for (const n of ['01', '09', '10']) {
    const md = (await runExport(load(n))).md;
    // EDGE-09/10 answers arrive as a note, tool output and final text: still one section.
    assert.equal(md.match(/^## ChatGPT$/gm).length, 1, n);
    assert.doesNotMatch(md, /utm_source=chatgpt\.com/, n);assert.doesNotMatch(md, /［ /, n);
  }
  assert.match((await runExport(load('01'))).md, /> console\.log\(test\.value\);\n> ```/);
  assert.match((await runExport(load('09'))).md, /\(https:\/\/fivebestplaces\.com\/best-coffee-mission-sf\)/);
  // A tracking tag inside code (here in a card's quoted code block) is part of the code.
  const text = require('../extension/fast-text');
  const md = text.markdown({title:'t', messages:[{id:'a', role:'assistant', md:'[x](https://a.com/p?utm_source=chatgpt.com&q=1) [y](https://b.com?utm_source=chatgpt.com)\n\n> ```\n> https://c.com?utm_source=chatgpt.com\n> ```'}]}, ['a'], 'u');
  assert.match(md, /\[x\]\(https:\/\/a\.com\/p\?q=1\) \[y\]\(https:\/\/b\.com\)\n\n> ```\n> https:\/\/c\.com\?utm_source=chatgpt\.com\n> ```/);
});
test('EDGE-01/03/04: text shown only in another card state is exported, folded', async () => {
  const fold = md => md.slice(md.indexOf('> [!note]- 卡片在其他状态下的内容'));
  const e01 = (await runExport(load('01'), {storage:{'chatExport.uiFolder':'true'}})), e01md = fold(e01.md);
  assert.match(e01md, /> \*\*选择「控件」时\*\*\n>\n> \*\*控件标签内容\*\*/);
  assert.match(e01md, /> \*\*选择「数据」时\*\*\n>\n> \*\*数据标签内容\*\*/);
  assert.match(e01md, /> \*\*「expanded」切换为开时\*\*\n>\n> 这是展开后显示的虚构内容/);
  // A select echoing its other options is not content.
  assert.doesNotMatch(e01md, /下拉选择：Beta/);
  assert.match(fold((await runExport(load('03'))).md), /> \*\*「openB」切换为开时\*\*\n>\n> \*\*隐藏内容HIDDEN-03\*\*/);
  const e04 = fold((await runExport(load('04'))).md);
  assert.match(e04, /OFF-04/);assert.match(e04, /当前：甲/);assert.match(e04, /当前：丙/);
  // The default view's text is not repeated, and ui JSON keeps the list.
  assert.doesNotMatch(e04, /ON-04|平方 = 49/);
  const ui = JSON.parse([...e01.files].find(([n]) => /^ui\/msg-53ca8717/.test(n))[1]);
  assert.deepEqual(ui.variants.map(v => v.label).slice(0, 3), ['选择「控件」时', '选择「数据」时', '「expanded」切换为开时']);
  // A card whose other states add nothing gets no fold (EDGE-02 filters show subsets).
  assert.doesNotMatch((await runExport(load('02'))).md, /卡片在其他状态下的内容/);
});
test('EDGE-04: cards interleaved with prose keep order and default values', async () => {
  const md = answer((await runExport(load('04'))).md);
  const order = ['EDGE04开始', '```python', '$$', '默认开启的内容ON-04', '| 测试编号 |', '平方 = 49', '> EDGE-04 引用块测试', '当前：乙', 'EDGE04结束'].map(s => md.indexOf(s));
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), JSON.stringify(order));
});
test('EDGE-09: business ratings (server-resolved Rating) show in the card text and the card picture', async () => {
  const md = answer((await runExport(load('09'))).md);
  for (const [name, stars, slug] of [['Finjan Qahwa', '★4.7（66 条评价）', 'finjan-qahwa-san-francisco'], ['CoffeeShop', '★4.5（131 条评价）', 'coffeeshop-san-francisco-3'], ['temos coffee', '★4.5（240 条评价）', 'temos-coffee-san-francisco'], ['Abanico Coffee Roasters', '★4.6（115 条评价）', 'abanico-coffee-roasters-san-francisco'], ['Hedge Coffee', '★4.5（181 条评价）', 'hedge-coffee-san-francisco-3']])
    assert.ok(md.includes(`. ${name}\n>\n> ${stars}· [Yelp](https://www.yelp.com/biz/${slug}?`), name);
  const render = require('../extension/dil-render'), text = require('../extension/fast-text'), vm = require('node:vm');
  const m = text.parseTree(load('09')).messages.find(x => x.id === '95e20312-ede7-4827-94ad-a8806d6da6d5');
  const html = render.toHtml(render.evaluate(m.dil, (code, scope) => vm.runInNewContext(code, {...scope}, {timeout:1000})));
  assert.match(html, /<p class="t fs-sm">★4\.7（66 条评价）· <span class="link">Yelp<\/span><\/p>/);
  // Without a resolved result the bound data is only a type marker: nothing to show.
  const bare = {code:'DIL.render(__dil.jsx("box",null,__dil.jsx(Rating,{data:{$type:"business_rating"},__resolutionId:"x"})))', requiredComponents:['Rating']};
  assert.equal(render.toMarkdown(render.evaluate(bare, (code, scope) => vm.runInNewContext(code, {...scope}))), '');
});
