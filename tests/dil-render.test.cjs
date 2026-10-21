const {test}=require('./private-fixtures.cjs');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');const text=require('../extension/fast-text');
// Real ChatGPT export (no private content): checkbox card, 30-row {#each} card, AppBlock behind a checkbox.
let raw;const fixture=()=>raw??=JSON.parse(fs.readFileSync('tests/fixtures/dil-checkbox-longcard-appblock.raw.json','utf8'));
const [CHECK,LONG,RESOURCE]=['ab11004d-b6a8-47a5-a43e-f02ea863fb74','dc5b5b3e-e454-4de8-becf-a42ee48827e6','0a5e2ea3-32e8-4c78-a764-9aa0e9c66a11'];
const vmExecute=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const byId=id=>text.parseTree(fixture()).messages.find(m=>m.id===id);
const staticMd=id=>render.toMarkdown(render.evaluate(byId(id).dil,vmExecute),{widget:i=>`[widget ${i}]`});

test('real fixture: records keep DIL source, compiled program and content_references',()=>{
  const m=byId(RESOURCE);
  assert.match(m.dilSource,/\{@body const \[showImage,setShowImage\] = DIL\.useState\(false\)\}/);
  assert.match(m.dil.code,/__dil\.jsx/);assert.equal(m.contentReferences[0].data.widget_type,'app_block');
  assert.deepEqual(text.parseTree(fixture()).messages.filter(x=>x.dil).map(x=>x.id),[CHECK,LONG,RESOURCE]);
});
test('real fixture: static render recovers what fallbackMarkdown omits',()=>{
  const check=staticMd(CHECK);
  assert.match(byId(CHECK).dil.fallbackMarkdown,/当前值：\n/);assert.match(check,/- \[ \] 测试开关/);assert.match(check,/当前值：\*\*关\*\*/);
  const long=staticMd(LONG),rows=long.match(/^行\d{2} — 这是用于验证滚动截图的测试内容。$/gm);
  assert.doesNotMatch(byId(LONG).dil.fallbackMarkdown,/行01/);assert.equal(rows.length,30);assert.equal(rows[0].slice(0,3),'行01');assert.equal(rows[29].slice(0,3),'行30');
  assert.match(long,/^长卡开始[\s\S]*\*\*长卡片完整性实验\*\*[\s\S]*---\n\n\*\*长卡片终点 END30\*\*\n\n- \[ \] 仅本地测试开关\n\n长卡结束$/);
  const resource=staticMd(RESOURCE);assert.match(resource,/- \[ \] 显示公开测试图\n\n图片未挂载\n\n资源结束$/);assert.doesNotMatch(resource,/widget/);
});
test('unknown hooks and components degrade to their text instead of failing',()=>{
  const dil={code:'DIL.render(__dil.jsx(()=>{const v=DIL.useSomethingNew(1);return __dil.jsx("fancyGauge",{onTick:()=>1},__dil.jsx("text",null,DIL.useConstants()["0"]))},{}))',constants:{0:'仪表文字'}};
  assert.equal(render.toMarkdown(render.evaluate(dil,vmExecute)),'仪表文字');
  assert.throws(()=>render.evaluate({code:'1'},vmExecute),/DIL\.render/);assert.throws(()=>render.evaluate({},vmExecute),/code/);
});
test('real fixture: AppBlock resolves through clientDefinedWidgets and becomes standalone HTML',()=>{
  const m=byId(RESOURCE),[block]=render.appBlocks(m.dil,m.contentReferences);
  assert.deepEqual({id:block.id,invocationId:block.invocationId,title:block.title},{id:'python-resource-test',invocationId:'4d8758fb-7904-59ac-a835-385a3a9ddab7',title:'公开测试图'});
  const html=render.standaloneHtml(block);assert.match(html,/^<!doctype html>[\s\S]*<title>公开测试图<\/title>[\s\S]*python-logo\.png[\s\S]*<\/html>\n$/);
  assert.deepEqual(render.appBlocks(byId(CHECK).dil,[]),[]);
});
test('sandbox page handler executes code with Function and reports errors',()=>{
  globalThis.ChatExportDilRender=render;require('../extension/sandbox.js');
  const ok=globalThis.ChatExportDilSandbox.handle({dil:byId(CHECK).dil});assert.match(render.toMarkdown(ok.tree),/当前值：\*\*关\*\*/);
  assert.match(globalThis.ChatExportDilSandbox.handle({dil:{code:'throw Error("boom")'}}).error,/boom/);
});
test('panel: default ZIP uses static render, exports AppBlock HTML and complete ui JSON',async()=>{
  const conv=fixture();// read here: a missing capture skips the test instead of failing inside the page
  const dom=new JSDOM(`<div data-message-id="${RESOURCE}">x</div>`,{url:'https://chatgpt.com/c/6ad0d397-212c-83e9-a872-c74862120015',runScripts:'outside-only'}),w=dom.window;
  const files=[],downloads=[];const read=b=>new Promise(r=>{const f=new w.FileReader();f.onload=()=>r(f.result);f.readAsText(b);});
  w.fetch=async path=>path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>conv};
  w.ChatExportDilEvaluate=async dil=>render.evaluate(dil,vmExecute);
  w.chrome={runtime:{sendMessage:async m=>{downloads.push(m);return {id:1};}}};w.URL.createObjectURL=()=> 'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));// The ui/ folder (高级 → 附带界面数据) is checked here.
  w.localStorage.setItem('chatExport.uiFolder','true');w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot;for(let i=0;i<200&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));
  s.getElementById('preview').click();for(let i=0;i<200&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));
  const preview=s.getElementById('output').value;assert.match(preview,/行30 — /);assert.match(preview,/当前值：\*\*关\*\*/);assert.doesNotMatch(preview,/Current selection unavailable|\u0000/);
  (s.getElementById('kind').value='zip',s.getElementById('export').click());for(let i=0;i<200&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));
  const md=files.find(f=>f.name==='conversation.md').data,html=`ui/appblock-${RESOURCE}-python-resource-test.html`;
  assert.match(md,/行01 — [\s\S]*行30 — /);assert.ok(md.includes(`默认状态未显示的嵌入应用「公开测试图」：[${html}](${html})`));
  assert.match(await read(files.find(f=>f.name===html).data),/python-logo\.png/);
  const ui=JSON.parse(await read(files.find(f=>f.name===`ui/msg-${RESOURCE}.json`).data));
  assert.match(ui.source,/<AppBlock title="公开测试图"/);assert.equal(ui.contentReferences[0].data.app_block_id,'python-resource-test');
  assert.match(ui.staticMarkdown,/图片未挂载/);assert.equal(ui.renderError,null);assert.deepEqual(ui.appBlocks.map(b=>b.path),[html]);assert.match(ui.dil.code,/__dil\.jsx/);
  assert.match(s.getElementById('status').textContent,/3 份界面数据、0 张卡片图、1 个嵌入应用。/);
  dom.window.close();
});
