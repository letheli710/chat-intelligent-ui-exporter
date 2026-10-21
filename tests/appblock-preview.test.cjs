const {test}=require('./private-fixtures.cjs');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');
// AppBlocks from the user's Lab conversations: a WebGL surface placed directly in
// the reply (1dbeaff2) and a drawing canvas inside a card (cb311c64). Drawing
// itself needs a real browser (checked in Chrome); these tests cover the page
// handed to the AppBlock frame and how previews land in the Markdown.
const dir='tests/fixtures/lab-survey',load=id=>JSON.parse(fs.readFileSync(`${dir}/${fs.readdirSync(dir).find(f=>f.includes(id))}`,'utf8'));
const exec=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});

test('the AppBlock page gets the capture script first, Tailwind utilities and ChatGPT color variables',()=>{
  const j=load('1dbeaff2'),[block]=render.appBlocks(j.dil,j.contentReferences);
  const html=render.appBlockCaptureHtml(block,'n-1',{wait:900});
  const head=html.indexOf('<head>'),capture=html.indexOf('("n-1",900,700,1400)'),app=html.indexOf('getContext("webgl"');
  assert.ok(head>=0&&capture>head&&app>capture,'capture script runs before the app scripts');
  assert.match(html,/preserveDrawingBuffer:true/);
  const page=render.standaloneHtml(block);
  assert.match(page,/<style data-exporter="tailwind-lite">:root\{--viz-text:#0d0d0d;[^}]*--viz-series-2:#53b559/);
  assert.ok(page.includes('.gap-0\\.5{gap:0.125rem}')&&page.includes('.border-black\\/10{border-color:rgba(0,0,0,.1)}')&&page.includes('.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}'));
});
test('the sandbox frame sits in the viewport, transparent and click-through',()=>{
  const dom=new JSDOM('<html><body></body></html>');const client=render.sandboxClient(dom.window.document,'about:blank',{timeout:50});
  const frame=dom.window.document.querySelector('[data-archive-owned="dil-sandbox"]').style;
  assert.equal(frame.left,'0px');assert.equal(frame.opacity,'0');assert.equal(frame.pointerEvents,'none');
  assert.equal(typeof client.appblock,'function');client.close();dom.window.close();
});
async function exportZip(ids,preview){
  const list=ids.map(load),mapping={root:{parent:null,children:['u'],message:null},u:{parent:'root',children:[list[0].messageId],message:{id:'u',author:{role:'user'},content:{content_type:'text',parts:['做一个可交互的演示']}}}};
  list.forEach((j,i)=>{mapping[j.messageId]={parent:i?list[i-1].messageId:'u',children:list[i+1]?[list[i+1].messageId]:[],message:{id:j.messageId,author:{role:'assistant'},channel:'final',recipient:'all',content:{content_type:'text',parts:[j.source]},metadata:{model_dil_v2:j.dil,content_references:j.contentReferences}}};});
  const conversation={conversation_id:'chat',title:'lab',current_node:list.at(-1).messageId,mapping};
  const dom=new JSDOM('<div>x</div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window,files=[];
  w.fetch=async p=>p==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>conversation};
  w.ChatExportDilEvaluate=async dil=>render.evaluate(JSON.parse(JSON.stringify(dil)),exec);
  w.ChatExportDilSnapshot=async dil=>({segments:render.segments(render.evaluate(JSON.parse(JSON.stringify(dil)),exec)).map(s=>s.kind==='card'?{...s,png:new Uint8Array([1]).buffer,width:10,height:10}:s)});
  w.ChatExportAppBlockPreview=preview;
  w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=> 'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot,idle=async()=>{for(let i=0;i<300&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
  await idle();(s.getElementById('kind').value='zip',s.getElementById('export').click());await idle();
  const md=files.find(f=>f.name==='conversation.md')?.data||s.getElementById('status').textContent,manifest=JSON.parse(files.find(f=>f.name==='manifest.json')?.data||'{}');
  dom.window.close();return {md,files,manifest};
}
test('panel: each AppBlock gets its preview image above its link, also inside a folded card note',async()=>{
  const seen=[];
  const {md,files,manifest}=await exportZip(['1dbeaff2','cb311c64'],async b=>{seen.push(b.title);return {png:new Uint8Array([137,80,78,71]).buffer,width:686,height:645};});
  assert.deepEqual(seen.sort(),['Canvas 画板','三维曲面 · 交互式 WebGL 可视化']);
  assert.match(md,/^!\[嵌入应用预览：三维曲面 · 交互式 WebGL 可视化\]\(assets\/appblock-1dbeaff2-a00d-4c6f-a8c6-99df9462d8de-surface-sine-cosine-3d\.png\)\n\n> \[!chatgpt-appblock\] 三维曲面 · 交互式 WebGL 可视化：\[ui\/appblock-1dbeaff2/m);
  assert.match(md,/^> !\[嵌入应用预览：Canvas 画板\]\(assets\/appblock-cb311c64-8e94-4252-a5c0-bc1f09157907-drawing-canvas-v1\.png\)\n>\s*\n> > \[!chatgpt-appblock\] Canvas 画板：/m);
  const names=files.map(f=>f.name);assert.ok(names.includes('assets/appblock-1dbeaff2-a00d-4c6f-a8c6-99df9462d8de-surface-sine-cosine-3d.png'));
  assert.equal(manifest.assets.filter(a=>a.kind==='appblock-preview').length,2);
});
test('panel: a preview that fails keeps the link and says why',async()=>{
  const {md,manifest}=await exportZip(['1dbeaff2'],async()=>{throw Error('嵌入应用预览超时');});
  assert.doesNotMatch(md,/嵌入应用预览：/);assert.match(md,/^> \[!chatgpt-appblock\] 三维曲面/m);
  assert.ok(manifest.warnings.some(w=>/嵌入应用「三维曲面 · 交互式 WebGL 可视化」预览未生成（嵌入应用预览超时）/.test(w)));
});
