require('../scripts/i18n-env.cjs');
const {test} = require('./private-fixtures.cjs');const assert = require('node:assert/strict');const fs = require('node:fs');
const {runExport} = require('../scripts/edge-harness.cjs');
// Profession-style conversations made on chatgpt.com on 2026-10-18 (fictional content,
// the account id is replaced). The prompts are in each conversation's first message.
const dir = 'tests/fixtures/pro-2026-10';
const load = n => JSON.parse(fs.readFileSync(`${dir}/PRO-${n}.raw.json`, 'utf8'));
const all = ['01','02','03','04','05','06','07','08','09','10','11'];

test('every profession case exports without errors', async () => {
  for (const n of all) {
    const r = await runExport(load(n));
    assert.deepEqual(r.errors, [], n);assert.match(r.md, /^---\ntitle: [\s\S]*?\n---\n\n# /, n);
    // PRO-07: the faked network cannot fetch search images through the background worker.
    assert.deepEqual(r.warnings.filter(w => !(n === '07' && /界面图片未下载/.test(w))), [], n);
  }
});
test('a file a card links and also names in its data is downloaded once', async () => {
  for (const [n, names] of [['01', ['bench.csv', 'bench.png']], ['11', ['hist_age.png', 'roc.png', 'report.xlsx', 'model.pkl', 'cleaned.csv']]]) {
    const r = await runExport(load(n)), files = [...r.files.keys()].filter(k => k.startsWith('files/'));
    assert.deepEqual(files.filter(f => /_$/.test(f)), [], n);
    for (const name of names) assert.ok(files.includes(`files/${name}`), `${n} ${name}`);
    assert.doesNotMatch(r.md, /代码生成的文件/, n);
    assert.equal(r.requests.filter(p => p.includes('/interpreter/download?')).length, r.manifest.assets.filter(a => a.kind === 'code-file').length, n);
  }
});
test('PRO-03: struck-out text in a redline keeps its strikethrough', async () => {
  const md = (await runExport(load('03'))).md;
  assert.match(md, /\| 2\.3 \| 每日按未付款项的 ~~1%~~ \*\*0\.03%\*\* 支付违约金/);
  assert.match(md, /以下采用 ~~删除线~~ 表示建议删除/);
  const render = require('../extension/dil-render');
  assert.match(render.toHtml({type:'text', props:{}, children:[{type:'strikethrough', props:{}, children:['旧']}]}), /<s>旧<\/s>/);
});
test('PRO-03/05/11: files the user attached are saved and linked above the prompt', async () => {
  for (const [n, name, path] of [['03', '软件开发合同（虚构）.pdf', 'files/软件开发合同_虚构_.pdf'], ['05', '梁B-1 荷载试验 #2.csv', 'files/梁B-1_荷载试验__2.csv'], ['11', 'cohort_synthetic.csv', 'files/cohort_synthetic.csv']]) {
    const r = await runExport(load(n));
    assert.ok(r.files.has(path), n);
    assert.ok(r.md.includes(`## 我\n\n附件：[${name}](${path})\n\n【PRO-${n}`), n);
    assert.equal(r.manifest.assets.filter(a => a.kind === 'attachment').length, 1, n);
  }
  // An uploaded picture is already shown as the picture; it is not listed again.
  assert.doesNotMatch((await runExport(load('02'))).md, /附件：/);
  // A failed download keeps the name and says so.
  const failed = await runExport(load('03'), {respond:p => p.includes('file_00000000666881f6bc0ce4d81ed1f4ab') ? {ok:false, status:403} : null});
  assert.match(failed.md, /附件：软件开发合同（虚构）\.pdf（未能下载）/);
  assert.ok(failed.warnings.some(w => /附件 软件开发合同（虚构）\.pdf 下载失败（HTTP 403）/.test(w)));
});
test('PRO-11: a scrollable DataFrame is saved as CSV with its first rows as a table', async () => {
  const csv = '﻿patient_id,age,note\nP1,30,"a, b"\nP2,31,x|y\n' + Array.from({length:20}, (_, i) => `P${i + 3},${40 + i},*n*`).join('\n') + '\n';
  const table = (p, w) => p.includes('files.example') && p.includes('f0a4820c8260e50823845266') ? {ok:true, status:200, headers:{get:() => 'text/csv'}, blob:async () => new w.Blob([csv], {type:'text/csv'})} : null;
  const r = await runExport(load('11'), {respond:table}), path = 'files/PRO-11_合成队列数据_5000_行_可滚动.csv';
  assert.ok(r.files.get(path).endsWith('P22,59,*n*\n'));
  assert.ok(r.md.includes(`**交互式数据表：PRO-11：合成队列数据（5000 行，可滚动）**（[完整 CSV](${path})，22 行 × 3 列，下面是前 10 行）\n\n| patient\\_id | age | note |\n| --- | --- | --- |\n| P1 | 30 | a, b |\n| P2 | 31 | x&#124;y |\n| P3 | 40 | \\*n\\* |`));
  assert.ok(r.md.indexOf('交互式数据表') < r.md.indexOf('PRO11开始'));
  assert.equal(r.md.match(/^\| P\d+ \|/gm).length, 10);
  const failed = await runExport(load('11'), {respond:p => p.startsWith('/backend-api/files') && p.includes('f0a4820c8260e50823845266') ? {ok:false, status:404} : null});
  assert.match(failed.md, /〔交互式数据表：PRO-11：合成队列数据（5000 行，可滚动）（未能下载）〕/);
});
test('PRO-07: a title ending in a newline gives a clean heading and file name', async () => {
  const raw = load('07');assert.equal(raw.title, '化工工艺教学 \n');
  const r = await runExport(raw), day = require('../extension/settings.js').day();
  assert.match(r.md, /^---\ntitle: "化工工艺教学"\n[\s\S]*?\n---\n\n# 化工工艺教学\n\n## 我/);
  assert.equal(r.filename, `化工工艺教学 - ${day}.zip`);
  assert.equal((await runExport(load('03'))).filename, `合同审查 റിപ്പോർ‍ട്ട് - ${day}.zip`);
});

test('PRO-11: charts a card shows from sandbox:/mnt/data are drawn into the card and downloaded once', async () => {
  const r = await runExport(load('11')), charts = ['hist_age.png', 'box_bmi.png', 'corr_heatmap.png', 'km_region.png'];
  for (const c of charts) {
    assert.ok(r.drawn.includes(`sandbox:/mnt/data/${c}`), c);
    assert.equal(r.requests.filter(p => p.includes('/interpreter/download') && p.endsWith(encodeURIComponent(`/mnt/data/${c}`))).length, 1, c);
    assert.ok(r.files.has(`files/${c}`), c);
  }
});
