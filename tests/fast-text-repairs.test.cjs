require('../scripts/i18n-env.cjs');
const {test,readPrivate,needPrivate}=require('./private-fixtures.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const api=require('../extension/fast-text');
const SAMPLE='archive/Output - test 1/V0.5-1-项目分析撰写.md',sampleText=readPrivate(SAMPLE,'utf8'),privateSample=()=>needPrivate(sampleText,SAMPLE);
const record=text=>api.records([{id:'sample',author:{role:'assistant'},content:{content_type:'text',parts:[text]}}]).messages[0];
test('actual T01 inline pipe stays in one cell without losing backslashes',()=>{
 const line=privateSample().split('\n').find(s=>s.startsWith('| T01 |'));
 const m=record('| ID | 内容 | 值 |\n| --- | --- | --- |\n'+line);
 const literal=line.match(/`([^`]+)`/)[1];
 assert.ok(m.md.includes('<code>'+literal.replace('|','&#124;')+'</code>'));
 assert.equal(m.needsTableUI,true);
 assert.equal((m.md.split('\n')[2].match(/\|/g)||[]).length,4);
});
test('actual genui chart becomes readable structured data with UI metadata',()=>{
 const line=privateSample().split('\n').find(s=>s.includes('\uE200genui'));
 const m=record('before\n'+line+'\nafter');
 assert.doesNotMatch(m.md,/[\uE200-\uE2FF]/);
 assert.match(m.md,/不同日照情景下的每日发电量/);
 assert.match(m.md,/640/);assert.match(m.md,/1920/);
 assert.equal(m.needsUI,true);assert.match(m.md,/before[\s\S]*after/);
});
test('unavailable live values stay explicitly missing and request UI completion',()=>{
 const m=record('查看单日数据 Current selection unavailable.\nCurrent value unavailable.');
 assert.equal(m.needsUI,true);assert.doesNotMatch(m.md,/Current .* unavailable/);
 assert.match(m.md,/实时/);
});
test('literal code and math including pipes, unavailable words, and PUA are unchanged',()=>{
 const text='```python\nCurrent value unavailable.\nSolar \\\\| Battery\n\uE200genui\uE202{}\uE201\n```\n\n\\[x \\mid y\\]\n`Current value unavailable.`\n$\\text{Current value unavailable.}$';
 assert.equal(record(text).md,text);
});
test('raw code content beats transformed fallback preserving blank lines',()=>{
 const m=api.records([{id:'code',author:{role:'assistant'},content:{content_type:'code',text:'a\n\nb',language:'python'},metadata:{model_dil_v2:{fallbackMarkdown:'```python\na\nb\n```'}}}]).messages[0];
 assert.equal(m.md,'```python\na\n\nb\n```');
});
test('raw fenced program whitespace restored only for identical nonblank lines',()=>{
 const get=fallback=>api.records([{id:'code',author:{role:'assistant'},content:{content_type:'text',parts:['```python\na\n\nb\n```']},metadata:{model_dil_v2:{fallbackMarkdown:fallback}}}]).messages[0].md;
 assert.equal(get('introduction\n```python\na\nb\n```'),'introduction\n```python\na\n\nb\n```');
 assert.equal(get('```python\na\nc\n```'),'```python\na\nc\n```');
});
