const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');
const vmExecute=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const idle=async s=>{for(let i=0;i<400&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};

// A picture-list card (one image and some text per row) exported as a Markdown table, with the given row texts.
async function pictureTable(texts){
  const rows=texts.map((t,i)=>`__dil.jsx("row",null,__dil.jsx(AsyncImage,{"__resolutionId":"i${i}"}),__dil.jsx("text",null,${JSON.stringify(t)}))`).join(',');
  const results=Object.fromEntries(texts.map((t,i)=>[`i${i}`,{componentName:'AsyncImage',status:'resolved',state:{images:[{content_url:`https://cdn.example/${i}.jpg`,title:`P${i}`}]}}]));
  const dil={code:`DIL.render(__dil.jsx(()=>__dil.jsx("card",null,${rows})))`,constants:{},requiredComponents:['AsyncImage'],appData:{opGenui:{componentResults:results}},fallbackMarkdown:'x'};
  const chat={title:'t',current_node:'m',mapping:{m:{parent:null,children:[],message:{id:'m',author:{role:'assistant'},content:{content_type:'text',parts:['x']},metadata:{model_dil_v2:dil}}}}};
  const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/c/6ad0d397-0000-83e9-a872-c74862120096',runScripts:'outside-only'}),w=dom.window;const files=[];
  w.fetch=async path=>{if(String(path).startsWith('https://cdn.example/'))return {ok:true,blob:async()=>new w.Blob(['jpeg'],{type:'image/jpeg'})};return path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>chat};};
  w.createImageBitmap=async()=>({width:400,height:300,close(){}});
  w.OffscreenCanvas=class{constructor(a,b){this.size=[a,b];}getContext(){return {fillRect(){},drawImage(){}};}async convertToBlob(){return new w.Blob(['thumb'],{type:'image/jpeg'});}};
  w.ChatExportDilEvaluate=async d=>render.evaluate(d,vmExecute);
  w.ChatExportDilSnapshot=async d=>({segments:render.segments(render.evaluate(d,vmExecute)).map(s=>s.kind==='card'?{...s,png:new Uint8Array([137,80,78,71]).buffer,width:600,height:400}:s)});
  w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
  (s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);
  const md=files.find(f=>f.name==='conversation.md').data;dom.window.close();
  return md.split('\n').filter(l=>l.startsWith('| [!['));
}

test('a picture-list card row stays one table row when its text has a lone carriage return',async()=>{
  const rows=await pictureTable(['Black Cod\r  $28','Nobu\r\nMiso','Plain']);
  assert.equal(rows.length,3,rows.join('\n'));
  assert.match(rows[0],/\| Black Cod<br> {2}\\\$28 \|$/);
  assert.match(rows[1],/\| Nobu<br>Miso \|$/);
  assert.match(rows[2],/\| Plain \|$/);
  assert.ok(rows.every(r=>!r.includes('\r')),'no carriage return is left in a row');
});
