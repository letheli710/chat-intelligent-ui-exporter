const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('../scripts/i18n-env.cjs');
const api=require('../extension/fast-text');
const idle=async s=>{for(let i=0;i<200&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
const image={content_type:'image_asset_pointer',asset_pointer:'file-service://file-ABC123',width:640,height:480};
const dil={fallbackMarkdown:'计算器 fallback',code:'__dil.jsx("Card",{})',constants:{},appData:{product0:{image_url:'https://cdn.example/p.png',displayed_price:'$9'}}};
function conversation(){return {conversation_id:'chat',title:'sample',current_node:'b',mapping:{
  a:{parent:null,children:['b'],message:{id:'a',author:{role:'user'},content:{content_type:'multimodal_text',parts:[image,'看这张图']}}},
  b:{parent:'a',children:[],message:{id:'b',author:{role:'assistant'},content:{content_type:'text',parts:['raw']},metadata:{model_dil_v2:dil}}}}};}
test('image pointers become asset placeholders instead of page work, and DIL is kept on the record',()=>{
  assert.equal(api.fileIdOf('sediment://file_00ab'),'file_00ab');assert.equal(api.fileIdOf('https://x'),null);
  const result=api.parseTree(conversation());const [user,answer]=result.messages;
  assert.match(user.md,/!\[图片\]\(asset:file-ABC123\)/);assert.deepEqual(user.images,[{fileId:'file-ABC123',width:640,height:480}]);
  assert.equal(user.needsAssets,false);assert.deepEqual(result.warnings,[]);
  assert.equal(answer.dil,dil);assert.deepEqual(api.dilImageUrls(dil),['https://cdn.example/p.png']);
});
test('files download in parallel, falls back to the legacy route, and reports failures per file',async()=>{
  let active=0,peak=0;const calls=[];
  const fetch=async(path,options)=>{calls.push({path,options});active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;
    if(path==='/api/auth/session')return {ok:true,json:async()=>({accessToken:'t'})};
    if(path.startsWith('/backend-api/files/download/file-old'))return {ok:false,status:404};
    if(path.startsWith('/backend-api/files/download/file-bad'))return {ok:false,status:403};
    if(path.startsWith('/backend-api/files/'))return {ok:true,status:200,json:async()=>({download_url:'https://files.example/'+path.split('/')[3]})};
    return {ok:true,blob:async()=>({type:'image/jpeg'})};};
  const ids=['file-1','file-2','file-3','file-4','file-old','file-bad','file-1'];
  const result=await api.downloadFiles({ids,conversationId:'chat',fetch,concurrency:4});
  assert.equal(result.length,6);assert.ok(peak>1,'requests overlap');
  assert.equal(result.find(r=>r.fileId==='file-1').path,'assets/file-1.jpg');
  assert.ok(calls.some(c=>c.path==='/backend-api/files/file-old/download'));assert.ok(result.find(r=>r.fileId==='file-old').blob);
  assert.match(result.find(r=>r.fileId==='file-bad').error,/403/);
  assert.ok(calls.filter(c=>c.path.startsWith('https://')).every(c=>c.options.credentials==='omit'&&!c.options.headers));
});
test('ZIP is data-first: original images, ui JSON, raw debug export',async()=>{
  const dom=new JSDOM('<div data-message-id="b">source</div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;
  const files=[],downloads=[];const read=b=>new Promise(r=>{const f=new w.FileReader();f.onload=()=>r(f.result);f.readAsText(b);});
  w.fetch=async path=>{
    if(path==='/api/auth/session')return {ok:true,json:async()=>({accessToken:'t'})};
    if(path==='/backend-api/conversation/chat')return {ok:true,json:async()=>conversation()};
    if(path.startsWith('/backend-api/files/download/'))return {ok:true,json:async()=>({download_url:'/backend-api/estuary/content?id=file-ABC123'})};
    return {ok:true,blob:async()=>new w.Blob(['img'],{type:'image/png'})};};
  w.chrome={runtime:{sendMessage:async m=>{downloads.push(m);return {id:1};}}};w.URL.createObjectURL=b=>{downloads.blob=b;return 'blob:https://chatgpt.com/t';};w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.eval(fs.readFileSync('extension/fast-text.js','utf8'));// The ui/ folder (高级 → 附带界面数据) is checked here.
  w.localStorage.setItem('chatExport.uiFolder','true');w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
  assert.equal(s.getElementById('live'),null);assert.equal(s.getElementById('pick'),null);
  s.getElementById('preview').click();await idle(s);assert.match(s.getElementById('output').value,/〔图片：下载 ZIP 可获取原图〕/);
  (s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);
  const md=files.find(f=>f.name==='conversation.md').data;
  assert.match(md,/!\[图片\]\(assets\/file-ABC123\.png\)/);assert.match(md,/计算器 fallback/);assert.doesNotMatch(md,/chatgpt-ui/);
  assert.ok(files.some(f=>f.name==='assets/file-ABC123.png'));assert.ok(files.some(f=>f.name==='assets/ui-b-1.png'));
  const uiJson=JSON.parse(await read(files.find(f=>f.name==='ui/msg-b.json').data));
  assert.equal(uiJson.dil.code,dil.code);assert.equal(uiJson.localAssets['https://cdn.example/p.png'],'assets/ui-b-1.png');
  const manifest=JSON.parse(files.find(f=>f.name==='manifest.json').data);assert.deepEqual(manifest.assets.map(a=>a.kind).sort(),['original-image','ui-data','ui-image']);
  assert.equal(manifest.options,undefined);assert.equal(typeof manifest.visibility.hiddenDuringExport,'boolean');
  s.getElementById('raw').click();await idle(s);await new Promise(r=>setTimeout(r,20));
  assert.equal(downloads.at(-1).filename,`sample - ${require('../extension/settings.js').day()}.raw.json`);
  const raw=JSON.parse(await read(downloads.blob));assert.equal(raw.mapping.b.message.metadata.model_dil_v2.code,dil.code);assert.ok(!JSON.stringify(raw).includes('Bearer'));
  dom.window.close();
});
