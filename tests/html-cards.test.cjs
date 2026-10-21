// The "Markdown + HTML" option for picture-list cards: the HTML block must reach a Markdown
// viewer whole (markdown-it is the parser behind VS Code's preview), show the same words as
// the Markdown table, and fall back to the table whenever it cannot be trusted.
const test = require('./private-fixtures.cjs'), assert = require('node:assert/strict'), fs = require('node:fs');
const {JSDOM} = require('../scripts/i18n-env.cjs');
const MarkdownIt = require('markdown-it');
const render = require('../extension/dil-render');
const {runExport} = require('../scripts/edge-harness.cjs');
const mdit = new MarkdownIt({html:true});
const ch = c => String.fromCharCode(c);
const {DOMParser} = new JSDOM('').window;

// A synthetic picture-list card: one AsyncImage + bold title + body text per row.
function rawCard(rows, {head, foot} = {}) {
  const J = JSON.stringify;
  const code = `DIL.render(__dil.jsx(()=>__dil.jsx("box",{gap:3},${head ? head + ',' : ''}${rows.map((r, i) => `__dil.jsx("row",{gap:3},__dil.jsx(AsyncImage,{"__resolutionId":"r${i}"}),__dil.jsx("box",null,__dil.jsx("text",null,__dil.jsx("bold",null,${J(r.title ?? `标题${i}`)})),${r.jsx || `__dil.jsx("text",null,${J(r.body)})`}))`).join(',')}${foot ? ',' + foot : ''})))`;
  const componentResults = Object.fromEntries(rows.map((r, i) => [`r${i}`, {componentName:'AsyncImage', status:'resolved', state:{images:[{content_url:`https://cdn.example/${i}.jpg`, title:`pic${i}`}]}}]));
  const dil = {code, constants:{}, requiredComponents:['AsyncImage'], appData:{opGenui:{componentResults}}, fallbackMarkdown:'x'};
  return {conversation_id:'6ad0d397-0000-83e9-a872-c74862120096', title:'cards', current_node:'m', mapping:{m:{parent:null, children:[], message:{id:'m', author:{role:'assistant'}, content:{content_type:'text', parts:['x']}, metadata:{model_dil_v2:dil}}}}};
}
const exportCard = (rows, storage = {chatExportHtmlCards:'1'}, extra) => runExport(rawCard(rows, extra), {storage});

// What a Markdown viewer makes of the note: the HTML blocks, the pictures and each row's words.
function viewed(md) {
  const tokens = mdit.parse(md, {}), doc = new JSDOM(mdit.render(md)).window.document;
  const blocks = tokens.filter(t => t.type === 'html_block');
  const leaked = tokens.filter(t => t.type === 'inline' && /<\/?(div|img|a)[\s>/]/.test(t.content)).length + doc.querySelectorAll('pre code').length;
  const rows = [...doc.querySelectorAll('div[style*="display:flex"]')].map(r => r.lastElementChild.textContent);
  return {blocks, leaked, rows, images:doc.querySelectorAll('img').length, doc};
}
const squash = t => t.replace(/\s+/g, '');

const awkward = {
  'several lines': '第一行\n第二行',
  'a blank line': '第一段\n\n第二段',
  'indented lines': '    缩进四格\n\t制表符开头',
  'a lone carriage return': `回车${ch(13)}  ${ch(13)}之后`,
  'line and paragraph separators': `行${ch(0x2028)}分隔${ch(0x2029)}段`,
  'a control character': `空${ch(0)}字符${ch(7)}`,
  'table pipes': 'a | b | c',
  'prices': '$8.99 起，$8.98 特价',
  'backslashes': 'C:\\path\\to \\n 反斜杠',
  'markup characters': '*星* **双星** `反引号` ~~删除~~ ==高亮== %%注释%% [方括号] _下划线_',
  'HTML-looking text': 'a < b && c > d <div> <script>x</script> <!-- 注释 --> &amp; &#36;',
  'Markdown block syntax': '# 标题\n- 列表\n> 引用\n```js\nconst a=1;\n```\n---',
  'emoji': '☕️🍰 👨‍👩‍👧',
  'right-to-left text': 'مرحبا بالعالم שלום',
  'very long text': '长'.repeat(5000),
};

test('awkward card text stays one whole HTML block with the same words as the table', async () => {
  for (const [name, body] of Object.entries(awkward)) {
    const [html, table] = await Promise.all([exportCard([{body}, {body:'第二项'}]), exportCard([{body}, {body:'第二项'}], {chatExportHtmlCards:'0'})]);
    assert.equal(html.manifest.cards[0].layout, 'html', `${name}: ${html.manifest.cards[0].fallback}`);
    const v = viewed(html.md);
    assert.equal(v.blocks.length, 1, `${name}: one HTML block`);
    assert.equal(v.leaked, 0, `${name}: no tag shown as text or code`);
    assert.equal(v.images, 2, name);
    assert.equal(v.rows.length, 2, name);
    // The words match the table's Markdown text (the table may itself break on a lone CR).
    const words = render.markdownText(render.pictureList(render.segments(render.evaluate(rawCard([{body}, {body:'第二项'}]).mapping.m.message.metadata.model_dil_v2, (c, s) => require('node:vm').runInNewContext(c, {...s}))).find(s => s.kind === 'card').tree)[0].md);
    assert.equal(squash(v.rows[0]), squash(words).replace(/[\x00-\x1f\x7f]/g, ''), name);
    assert.match(table.md, /^\| \| \|$/m, `${name}: the table is still written with the option off`);
  }
});

test('links, citations, code and badges become the allowed tags', async () => {
  const jsx = '__dil.jsx("text",null,"看 ",__dil.jsx("link",{href:"https://en.wikipedia.org/wiki/Foo_(bar)"},"词条")," 和 ",__dil.jsx("code",null,"a<b`c"),__dil.jsx("italic",null,"斜体"),__dil.jsx("badge",null,"新"),__dil.jsx("cite",{items:[{url:"https://s.example/?a=1&b=2",label:"S"}]}))';
  const r = await exportCard([{jsx}, {body:'第二项'}]);
  assert.equal(r.manifest.cards[0].layout, 'html', r.manifest.cards[0].fallback);
  const v = viewed(r.md), row = v.doc.querySelector('div[style*="display:flex"] > div');
  assert.equal(v.leaked, 0);
  assert.deepEqual([...row.querySelectorAll('a')].map(a => a.getAttribute('href')), ['https://en.wikipedia.org/wiki/Foo_%28bar%29', 'https://s.example/?a=1&b=2']);
  assert.equal(row.querySelector('code').textContent, 'a<b`c');
  assert.equal(row.querySelector('em').textContent, '斜体');
  assert.match(row.textContent, /［新］（S）$/);
});

test('a formula keeps the Markdown table, with the reason in manifest.json', async () => {
  for (const [jsx, reason] of [['__dil.jsx("text",null,"能量 ",__dil.jsx("math",{value:"E=mc^2"}))', /含公式/]]) {
    const r = await exportCard([{jsx}, {body:'第二项'}]);
    assert.equal(r.manifest.cards[0].layout, 'table');
    assert.match(r.manifest.cards[0].fallback, reason);
    assert.match(r.manifest.cards[0].fallback, /^HTML 未通过校验，改用表格/);
    assert.match(r.md, /^\| \[!\[pic0\]/m);assert.doesNotMatch(r.md, /<div/);
  }
});

test('a strikethrough, as a node or a lineThrough style, becomes <del> in both layouts', async () => {
  const jsx = '__dil.jsx("text",null,"特价 ",__dil.jsx("strike",null,"$10")),__dil.jsx("text",{lineThrough:true},"原价 $12")';
  const [html, table] = await Promise.all([exportCard([{jsx}, {body:'第二项'}]), exportCard([{jsx}, {body:'第二项'}], {chatExportHtmlCards:'0'})]);
  assert.equal(html.manifest.cards[0].layout, 'html', html.manifest.cards[0].fallback);
  const v = viewed(html.md);
  assert.equal(v.leaked, 0);
  assert.deepEqual([...v.doc.querySelectorAll('del')].map(d => d.textContent), ['$10', '原价 $12']);
  assert.match(table.md, /特价 ~~\\\$10~~<br>~~原价 \\\$12~~ \|$/m);
});

test('the fault switch "html" shows the table fallback on a real page', async () => {
  const r = await exportCard([{body:'x'}, {body:'y'}], {chatExportHtmlCards:'1', chatExportFault:'html'});
  assert.equal(r.manifest.cards[0].layout, 'table');
  assert.equal(r.manifest.cards[0].fallback, 'HTML 未通过校验，改用表格：测试：HTML 校验失败');
  assert.equal(r.files.has('assets/card-m-1-pic2.jpg'), true, 'the table uses the same thumbnails');
});

test('the validator rejects each way an HTML block can break', () => {
  const row = t => `<div style="display:flex"><a href="assets/a.jpg"><img src="assets/t.jpg" alt="x" width="160" height="120"/></a><div>${t}</div></div>`;
  const ok = `<div>\n${row('<strong>甲</strong><br/>乙')}\n</div>`;
  assert.equal(render.validateCardHtml(ok, ['**甲**\n\n乙'], DOMParser), null);
  const cases = [
    [`<p>\n${row('甲')}\n</p>`, /没有以 <div> 开头/],
    [`<div>\n${row('甲')}\n\n</div>`, /空行/],
    [`<div>\n${row('甲')}\n  \n</div>`, /空行/],
    [`<div>\n    ${row('甲')}\n</div>`, /缩进/],
    [`<div>\n\t${row('甲')}\n</div>`, /缩进/],
    [`<div>\n${row(`甲${ch(13)}`)}\n</div>`, /回车或空字符/],
    [`<div>\n${row('<br>甲')}\n</div>`, /不是合法的 XHTML/],
    [`<div>\n${row('甲 &nbsp;')}\n</div>`, /不是合法的 XHTML/],
    [`<div>\n${row('<script>甲</script>')}\n</div>`, /白名单外的标签 <script>/],
    [`<div>\n${row('<span>甲</span>')}\n</div>`, /白名单外的标签 <span>/],
    [`<div>\n${row('<em onclick="x">甲</em>')}\n</div>`, /白名单外的属性 onclick/],
    [`<div>\n${row('甲')}\n</div>`, /文字与 Markdown 文字不一致/, ['乙']],
    [`<div>\n${row('甲')}\n</div>`, /行数（1）与图片数（2）不一致/, ['甲', '乙']],
  ];
  for (const [html, reason, texts = ['甲']] of cases) assert.match(render.validateCardHtml(html, texts, DOMParser) || '', reason, html);
});

test('checking one card takes under 5 ms, also while other test files run', () => {
  const texts = Array.from({length:8}, (_, i) => `**店铺 ${i}**\n\n地址：某某路 ${i} 号 · 评分 4.${i} · 价格 \\$${i}0\n\n${'说明文字'.repeat(20)}`);
  const html = `<div>\n${texts.map((t, i) => `<div style="display:flex;gap:14px"><a href="assets/a${i}.jpg"><img src="assets/t${i}.jpg" alt="x" width="160" height="120"/></a><div><strong>店铺 ${i}</strong><br/>地址：某某路 ${i} 号 · 评分 4.${i} · 价格 &#36;${i}0<br/>${'说明文字'.repeat(20)}</div></div>`).join('\n')}\n</div>`;
  assert.equal(render.validateCardHtml(html, texts, DOMParser), null);
  // Warmed up, fastest of five batches: jsdom's parser is slower than Chrome's, and npm test runs
  // the test files side by side, which takes a check that needs under 2 ms alone to 3–5 ms.
  for (let i = 0; i < 20; i++) render.validateCardHtml(html, texts, DOMParser);
  const batches = Array.from({length:5}, () => {const started = performance.now();for (let i = 0; i < 20; i++) render.validateCardHtml(html, texts, DOMParser);return (performance.now() - started) / 20;}).sort((a, b) => a - b);
  assert.ok(batches[0] < 5, `${batches[0].toFixed(2)} ms per card`);
});

// HT-01…06 (batch 5): real picture-list cards. Their images sit in a box of their own and the
// text in a col, which only the loose recognition (HTML option on) accepts; with the option
// off they stay PNG exactly as before.
test('HT fixtures: HTML with the option on (loose recognition), PNG as before with it off', async () => {
  const dir = require('node:path').join(__dirname, 'fixtures/html-table-2026-10');
  const expected = {'HT-01':['html', 4], 'HT-02':['html', 4], 'HT-03':['html', 5], 'HT-04':['html', 4], 'HT-05':['table', 4, /含公式/], 'HT-06':['html', 3]};
  for (const [name, [layout, pictures, reason]] of Object.entries(expected)) {
    const raw = JSON.parse(fs.readFileSync(require('node:path').join(dir, `${name}.raw.json`), 'utf8'));
    for (const on of ['1', '0']) {
      const r = await runExport(raw, {storage:{chatExportHtmlCards:on}, searchImages:true}), v = viewed(r.md);
      assert.deepEqual([r.errors, r.warnings], [[], []], `${name} html=${on}`);
      assert.equal(v.leaked, 0, `${name} html=${on}`);
      const cards = r.manifest.cards.filter(c => c.layout !== 'png' || !c.fallback);
      if (on === '0') {assert.ok(r.manifest.cards.every(c => c.layout === 'png'), name);continue;}
      const card = r.manifest.cards.at(-1);
      assert.equal(card.layout, layout, `${name}: ${card.fallback}`);
      if (pictures) assert.equal(card.pictures, pictures, name);
      if (reason) assert.match(card.fallback, reason, name);
      if (layout === 'html') {assert.equal(v.blocks.length, 1, name);assert.equal(v.rows.length, pictures, name);}
      assert.ok(cards.length, name);
    }
  }
});

test('loose recognition: image in its own box and text in a col; a heading outside the rows becomes the header', () => {
  const img = src => ({type:'box', props:{width:'112px'}, children:[{type:'image', props:{src, alt:'p'}, children:[]}]});
  const text = t => ({type:'col', props:{}, children:[{type:'title', props:{}, children:[t]}, {type:'text', props:{}, children:[{type:'icon', props:{}, children:[]}, '说明']}]});
  const list = {type:'col', props:{}, children:[{type:'card', props:{}, children:[{type:'row', props:{}, children:[img('a'), text('甲')]}]}, {type:'card', props:{}, children:[{type:'row', props:{}, children:[img('b'), text('乙')]}]}]};
  assert.equal(render.pictureList(list), null, 'strict: unchanged');
  const items = render.pictureList(list, {loose:true});
  assert.deepEqual(items.map(i => [i.src, i.md, i.html]), [['a', '**甲**\n\n说明', '<strong>甲</strong><br/>说明'], ['b', '**乙**\n\n说明', '<strong>乙</strong><br/>说明']]);
  const headed = {...list, children:[{type:'title', props:{}, children:['标题']}, ...list.children, {type:'caption', props:{}, children:['注']}]};
  assert.equal(render.pictureList(headed), null, 'strict: unchanged');
  const withHeader = render.pictureList(headed, {loose:true});
  assert.equal(withHeader.length, 2);
  assert.deepEqual([withHeader.header, withHeader.footer], [{md:'**标题**', html:'<strong>标题</strong>', htmlError:null}, {md:'注', html:'注', htmlError:null}]);
  assert.equal(items.header, undefined, 'no header without text above the pictures');
  const between = {...list, children:[list.children[0], {type:'text', props:{}, children:['中间']}, list.children[1]]};
  assert.equal(render.pictureList(between, {loose:true}), null, 'text between picture rows keeps the PNG');
  const twoImages = {type:'row', props:{}, children:[img('a'), img('b'), text('甲')]};
  assert.equal(render.pictureList(twoImages, {loose:true}), null);
});

test('EDGE-09 (real picture list): HTML whole in markdown-it; with the option off the table is unchanged', async () => {
  const raw = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'fixtures/edge-2026-10/EDGE-09.raw.json'), 'utf8'));
  const [on, off] = await Promise.all(['1', '0'].map(v => runExport(raw, {storage:{chatExportHtmlCards:v}, searchImages:true})));
  const card = on.manifest.cards.find(c => c.pictures);
  assert.equal(card.layout, 'html', card.fallback);
  const v = viewed(on.md);
  assert.equal(v.leaked, 0);assert.equal(v.rows.length, 5);
  assert.equal(off.manifest.cards.find(c => c.pictures).layout, 'table');
  assert.match(off.md, /^\| \| \|\n\| --- \| --- \|\n\| \[!\[/m);
});

test('HT-03: the heading, badge and caption go in the same HTML block as the pictures', async () => {
  const raw = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'fixtures/html-table-2026-10/HT-03.raw.json'), 'utf8'));
  const r = await runExport(raw, {storage:{chatExportHtmlCards:'1'}, searchImages:true}), v = viewed(r.md);
  assert.equal(r.manifest.cards[0].layout, 'html', r.manifest.cards[0].fallback);
  assert.deepEqual([v.blocks.length, v.leaked, v.rows.length], [1, 0, 5]);
  const parts = [...v.doc.querySelector('div').children];
  assert.equal(parts.length, 7);
  assert.deepEqual(parts.map(p => p.querySelectorAll('img').length), [0, 1, 1, 1, 1, 1, 0]);
  assert.equal(parts[0].querySelector('strong').textContent, '☕ 小桥咖啡');
  assert.match(parts[0].textContent, /LITTLE BRIDGE COFFEE · 5 款精选饮品［美国 · USD］$/);
  assert.match(parts[6].textContent, /^注：小桥咖啡为虚构店铺/);
  assert.match(parts[5].textContent, /蜂蜜肉桂燕麦拿铁 · ［限时优惠］原价 \$6\.00 · 现价 \$4\.80/);
  assert.equal(parts[5].querySelector('del').textContent, '原价 $6.00', 'the old price is struck through');
  assert.doesNotMatch(r.md, /^\| /m, 'no table');
});

test('text above the pictures that HTML cannot carry keeps the PNG, never a table without it', async () => {
  const rows = [{body:'甲'}, {body:'乙'}];
  // A component outside the text whitelist: not a picture list at all.
  const button = await exportCard(rows, undefined, {head:'__dil.jsx("button",{label:"购买"},"购买")'});
  assert.deepEqual(button.manifest.cards.map(c => [c.layout, c.fallback]), [['png', undefined]]);
  // A formula has no allowed tag, and the table has no place for the heading.
  const formula = await exportCard(rows, undefined, {head:'__dil.jsx("text",null,"能量 ",__dil.jsx("math",{value:"E=mc^2"}))'});
  assert.equal(formula.manifest.cards[0].layout, 'png');
  assert.match(formula.manifest.cards[0].fallback, /^HTML 未通过校验，改用 PNG：图片上方的文字含公式/);
  assert.equal([...formula.files.keys()].some(k => /-pic\d\.jpg$/.test(k)), false, 'no unused thumbnails');
  // Plain text above and below: HTML, and with the option off the card stays a PNG as before.
  const extra = {head:'__dil.jsx("title",null,"店铺")', foot:'__dil.jsx("caption",null,"注：示例")'};
  const [on, off] = await Promise.all([exportCard(rows, undefined, extra), exportCard(rows, {chatExportHtmlCards:'0'}, extra)]);
  assert.equal(on.manifest.cards[0].layout, 'html', on.manifest.cards[0].fallback);
  assert.match(on.md, /^<div style="margin:0 0 6px"><strong>店铺<\/strong><\/div>$/m);
  assert.match(on.md, /注：示例<\/div>\n<\/div>/);
  assert.equal(off.manifest.cards[0].layout, 'png');
});

test('the validator checks the text above and below the pictures', () => {
  const row = '<div style="display:flex"><a href="assets/a.jpg"><img src="assets/t.jpg" alt="x" width="160" height="120"/></a><div>甲</div></div>';
  const block = (head, foot) => `<div>\n${[head, row, foot].filter(Boolean).join('\n')}\n</div>`;
  assert.equal(render.validateCardHtml(block('<div><strong>标题</strong></div>', '<div>注</div>'), ['甲'], DOMParser, {header:'**标题**', footer:'注'}), null);
  const cases = [
    [block('<div>标</div>', '<div>注</div>'), /图片上方文字的 HTML 与 Markdown 文字不一致/],
    [block('<div>标题</div>', '<div>注释</div>'), /图片下方文字的 HTML 与 Markdown 文字不一致/],
    [block(null, '<div>注</div>'), /HTML 缺少图片上方的文字/],
    [block('<div>标题</div>', null), /HTML 缺少图片下方的文字/],
  ];
  for (const [html, reason] of cases) assert.match(render.validateCardHtml(html, ['甲'], DOMParser, {header:'**标题**', footer:'注'}) || '', reason, html);
});

test('Markdown: a text, caption or title struck through by lineThrough reads as ~~…~~, line by line', () => {
  const md = render.toMarkdown({type:'box', props:{}, children:[
    {type:'text', props:{lineThrough:true}, children:['原价 $6.00']},
    {type:'caption', props:{lineThrough:true}, children:['第一行\n\n 第二行 ']},
    {type:'title', props:{lineThrough:true}, children:['旧标题']},
    {type:'text', props:{}, children:['不变']},
  ]});
  assert.equal(md, '~~原价 \\$6.00~~\n\n~~第一行~~\n\n ~~第二行~~ \n\n**~~旧标题~~**\n\n不变'.replace(/ \n/, '\n'));
});
