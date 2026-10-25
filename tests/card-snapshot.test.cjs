const {test}=require('./private-fixtures.cjs');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');const text=require('../extension/fast-text');
let raw;const fixture=()=>raw??=JSON.parse(fs.readFileSync('tests/fixtures/dil-checkbox-longcard-appblock.raw.json','utf8'));
const [CHECK,LONG,RESOURCE]=['ab11004d-b6a8-47a5-a43e-f02ea863fb74','dc5b5b3e-e454-4de8-becf-a42ee48827e6','0a5e2ea3-32e8-4c78-a764-9aa0e9c66a11'];
const vmExecute=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const tree=id=>render.evaluate(text.parseTree(fixture()).messages.find(m=>m.id===id).dil,vmExecute);
const idle=async s=>{for(let i=0;i<300&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};

test('real fixture: prose outside the card stays Markdown, each card is its own segment',()=>{
  for(const [id,before,after] of [[CHECK,'复选开始','复选结束'],[LONG,'长卡开始','长卡结束'],[RESOURCE,'资源开始','资源结束']]){
    const parts=render.segments(tree(id));
    assert.deepEqual(parts.map(p=>p.kind),['md','card','md'],id);
    assert.equal(render.toMarkdown(parts[0].tree),before);assert.equal(render.toMarkdown(parts[2].tree),after);
  }
});
test('real fixture: card HTML is well-formed XHTML with layout props and every row',()=>{
  const parse=html=>new (new JSDOM('').window.DOMParser)().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${html}</div>`,'application/xml');
  const check=render.toHtml(render.segments(tree(CHECK))[1].tree),long=render.toHtml(render.segments(tree(LONG))[1].tree),res=render.toHtml(render.segments(tree(RESOURCE))[1].tree);
  for(const html of [check,long,res])assert.equal(parse(html).getElementsByTagName('parsererror').length,0,html);
  assert.match(check,/max-width:260px/);assert.match(check,/<span class="cb-box"><\/span><span>测试开关<\/span>/);assert.match(check,/当前值：<\/span><strong>关<\/strong>|当前值：<strong>关<\/strong>/);
  assert.equal(long.match(/行\d\d — 这是用于验证滚动截图的测试内容。/g).length,30);assert.match(long,/<hr class="hr"\/>/);assert.match(long,/padding:4px 0px/);
  assert.match(res,/图片未挂载/);assert.match(res,/<p class="t fs-sm c-secondary">图片未挂载<\/p>/);
  assert.doesNotMatch(render.toHtml({type:'text',props:{},children:['<script>&']}),/<script>/);
});
test('sandbox snapshot keeps text when a card cannot be rasterized',async()=>{
  const dom=new JSDOM('<body></body>');globalThis.ChatExportDilRender=render;delete require.cache[require.resolve('../extension/sandbox.js')];require('../extension/sandbox.js');
  const dil=text.parseTree(fixture()).messages.find(m=>m.id===CHECK).dil;
  const result=await globalThis.ChatExportDilSandbox.snapshot({dil},dom.window.document);
  assert.deepEqual(result.segments.map(s=>s.kind),['md','card','md']);assert.ok(result.segments[1].error);assert.equal(result.timings.cards,1);assert.ok(result.timings.totalMs>=0);assert.equal(dom.window.document.body.children.length,0);
});
test('panel: ZIP embeds one PNG per card with folded text, prose stays outside',async()=>{
  const conv={...fixture(),conversation_id:'6ad0d397-0000-83e9-a872-c74862120015'};// read here: a missing capture skips the test instead of failing inside the page
  const dom=new JSDOM(`<div data-message-id="${RESOURCE}">x</div>`,{url:'https://chatgpt.com/c/6ad0d397-0000-83e9-a872-c74862120015',runScripts:'outside-only'}),w=dom.window;
  const files=[];let snapshots=0;
  w.fetch=async path=>path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>conv};
  w.ChatExportDilEvaluate=async dil=>render.evaluate(dil,vmExecute);
  w.ChatExportDilSnapshot=async dil=>{snapshots++;return {segments:render.segments(render.evaluate(dil,vmExecute)).map(s=>s.kind==='card'?{...s,png:new Uint8Array([137,80,78,71]).buffer,width:300,height:120}:s)};};
  w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=> 'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);assert.equal(snapshots,3);
  s.getElementById('preview').click();await idle(s);assert.doesNotMatch(s.getElementById('output').value,/assets\/card-|\[!note\]/);assert.match(s.getElementById('output').value,/当前值：\*\*关\*\*/);
  (s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);
  const md=files.find(f=>f.name==='conversation.md').data,card=`assets/card-${CHECK}-1.png`;
  assert.ok(md.includes(`复选开始\n\n![交互卡片](${card})\n\n> [!note]- 卡片文字\n> - [ ] 测试开关\n>\n> 当前值：**关**\n\n复选结束`),md);
  assert.match(md,/> 行30 — 这是用于验证滚动截图的测试内容。/);assert.ok(files.some(f=>f.name===card));assert.equal(files.filter(f=>f.name.startsWith('assets/card-')).length,3);
  const manifest=JSON.parse(files.find(f=>f.name==='manifest.json').data);assert.equal(manifest.assets.find(a=>a.path===card).width,300);assert.equal(manifest.timings.render.uiMessages,3);assert.deepEqual(manifest.timings.render.messages.map(m=>m.id),[CHECK,LONG,RESOURCE]);assert.ok(manifest.timings.render.wallMs>=0);
  assert.match(s.getElementById('status').textContent,/3 张卡片图、1 个嵌入应用。/);
  dom.window.close();
});
test('panel: search images inside a card are downloaded once, drawn into the card and left out of its folded text',async()=>{
  const id='6ad0d397-0000-83e9-a872-c74862120099',url='https://cdn.example/fish.jpg';
  const dil={code:'DIL.render(__dil.jsx(()=>__dil.jsx("box",{border:true},__dil.jsx(AsyncImage,{"__resolutionId":"a"}),__dil.jsx("text",null,"西京烧银鳕鱼"))))',constants:{},requiredComponents:['AsyncImage'],
    appData:{opGenui:{componentResults:{a:{componentName:'AsyncImage',status:'resolved',state:{images:[{content_url:url,title:'Gindara\n– Shop [x]'}]}}}}},fallbackMarkdown:'西京烧银鳕鱼'};
  const chat={title:'fish',current_node:'m',mapping:{m:{parent:null,children:[],message:{id:'m',author:{role:'assistant'},content:{content_type:'text',parts:['x']},metadata:{model_dil_v2:dil}}}}};
  const dom=new JSDOM('<div></div>',{url:`https://chatgpt.com/c/${id}`,runScripts:'outside-only'}),w=dom.window;const files=[],sent=[];let imageFetches=0;
  w.fetch=async path=>{if(path===url){imageFetches++;return {ok:true,blob:async()=>new w.Blob(['jpeg'],{type:'image/jpeg'})};}return path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>chat};};
  w.createImageBitmap=async()=>({width:800,height:600,close(){}});
  w.OffscreenCanvas=class{constructor(a,b){this.size=[a,b];}getContext(){return {drawImage(){}};}async convertToBlob(){return new w.Blob(['small'],{type:'image/jpeg'});}};
  w.ChatExportDilEvaluate=async d=>render.evaluate(d,vmExecute);
  w.ChatExportDilSnapshot=async d=>{sent.push(d.images);return {segments:render.segments(render.evaluate(d,vmExecute)).map(s=>s.kind==='card'?{...s,png:new Uint8Array([137,80,78,71]).buffer,width:300,height:120}:s)};};
  w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
  assert.match(sent[0][url],/^data:image\/jpeg;base64,/);
  (s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);
  const md=files.find(f=>f.name==='conversation.md').data;
  assert.match(md,/!\[交互卡片\]\(assets\/card-m-1\.png\)\n\n> \[!note\]- 卡片文字\n> 西京烧银鳕鱼/);assert.doesNotMatch(md,/fish\.jpg|ui-m-1/);
  assert.ok(files.some(f=>f.name==='assets/ui-m-1.jpg'));assert.equal(imageFetches,1);
  dom.window.close();
});
test('card HTML draws a downloaded picture and keeps a placeholder otherwise; alt text stays on one line',()=>{
  const tree={type:'box',props:{},children:[{type:'image',props:{src:'https://a/1.jpg',alt:'one',width:'120px',ratio:'1:1'},children:[]},{type:'image',props:{src:'https://a/2.jpg',alt:'two'},children:[]}]};
  const html=render.toHtml(render.withImages(tree,{'https://a/1.jpg':'data:image/jpeg;base64,AAA'}));
  assert.match(html,/<img class="img-real" alt="" src="data:image\/jpeg;base64,AAA" style="width:120px;height:120px"\/>/);assert.match(html,/img-ph[\s\S]*two/);
  assert.equal(tree.children[0].props.data,undefined);
  assert.equal(render.toMarkdown({type:'image',props:{src:'https://a/1.jpg',alt:'Black Cod\n– Shop [x] | y'},children:[]}),'![Black Cod – Shop x y](https://a/1.jpg)');
});
test('panel: a row of search images becomes one strip image, with the originals in a folded list',async()=>{
  const dil={code:'DIL.render(__dil.jsx(()=>__dil.jsx(__dil.Fragment,null,__dil.jsx("text",null,"银鳕鱼"),__dil.jsx(AsyncImageGroup,{"__resolutionId":"g"}))))',constants:{},requiredComponents:['AsyncImageGroup'],
    appData:{opGenui:{componentResults:{g:{componentName:'AsyncImageGroup',status:'resolved',state:{images:[{content_url:'https://cdn.example/1.jpg',title:'Black Cod'},{content_url:'https://cdn.example/2.jpg',title:'Nobu'}]}}}}},fallbackMarkdown:'银鳕鱼'};
  const chat={title:'fish',current_node:'m',mapping:{m:{parent:null,children:[],message:{id:'m',author:{role:'assistant'},content:{content_type:'text',parts:['x']},metadata:{model_dil_v2:dil}}}}};
  const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/c/6ad0d397-0000-83e9-a872-c74862120098',runScripts:'outside-only'}),w=dom.window;const files=[],drawn=[];
  w.fetch=async path=>{if(path.startsWith('https://cdn.example/'))return {ok:true,blob:async()=>new w.Blob(['jpeg'],{type:'image/jpeg'})};return path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>chat};};
  w.createImageBitmap=async()=>({width:400,height:300,close(){}});
  w.OffscreenCanvas=class{constructor(a,b){this.size=[a,b];}getContext(){return {fillRect(){},drawImage:(...a)=>drawn.push(a.slice(1))};}async convertToBlob(){return new w.Blob(['strip'],{type:'image/jpeg'});}};
  w.ChatExportDilEvaluate=async d=>render.evaluate(d,vmExecute);
  w.ChatExportDilSnapshot=async d=>({segments:render.segments(render.evaluate(d,vmExecute))});
  w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
  (s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);
  const md=files.find(f=>f.name==='conversation.md').data;
  assert.ok(md.includes('银鳕鱼\n\n![搜索图片（2 张）](assets/strip-m-1.jpg)\n\n> [!note]- 原图（2 张）\n> - [Black Cod](assets/ui-m-1.jpg)\n> - [Nobu](assets/ui-m-2.jpg)'),md);
  assert.ok(files.some(f=>f.name==='assets/strip-m-1.jpg'));assert.ok(files.some(f=>f.name==='assets/ui-m-2.jpg'));
  assert.deepEqual(drawn.filter(a=>a[3]===200).map(a=>a[0]),[0,277]);
  dom.window.close();
});
test('panel: a map is copied from the page with its rating pins; without it on the page the place list stays and a warning says so',async()=>{
  const refs=[{type:'client_defined_widget',category:'map',data:{points:[{name:'Jmart',latitude:40.759,longitude:-73.829,entity:{rating:3}}]}}];
  const dil={code:'DIL.render(__dil.jsx(()=>__dil.jsx(__dil.Fragment,null,__dil.jsx("text",null,"去哪里买"),__dil.jsx("__chatgptClientDefinedWidget",{"invocationId":"w"}))))',constants:{},requiredComponents:[],clientDefinedWidgets:{w:{status:'resolved',refIndex:0}},appData:{},fallbackMarkdown:'去哪里买'};
  const chat={title:'fish',current_node:'m',mapping:{m:{parent:null,children:[],message:{id:'m',author:{role:'assistant'},content:{content_type:'text',parts:['x']},metadata:{model_dil_v2:dil,content_references:refs}}}}};
  const page='<div data-dil-message-id="m"><div class="mapboxgl-map"><canvas class="mapboxgl-canvas" width="768" height="400"></canvas><div class="mapboxgl-marker" style="transform: translate(100px, 50px) translate(-50%, -100%)"><span>3.0</span>\n<div>Jmart</div></div></div></div>';
  for(const onPage of [true,false]){
    const dom=new JSDOM(onPage?page:'<div></div>',{url:'https://chatgpt.com/c/6ad0d397-0000-83e9-a872-c74862120097',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;const files=[],labels=[],copied=[];let resized=0;
    w.addEventListener('resize',()=>resized++);
    w.fetch=async path=>path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>chat};
    w.chrome={runtime:{sendMessage:async()=>({id:1})}};
    const context=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:20}):k==='fillText'?s=>labels.push(s):k==='drawImage'?c=>copied.push(c):k==='getImageData'?(x,y,cw,ch)=>({data:new Uint8ClampedArray(cw*ch*4).fill(255)}):k in t?t[k]:()=>{},set:(t,k,v)=>(t[k]=v,true)});
    w.OffscreenCanvas=class{constructor(a,b){this.width=a;this.height=b;}getContext(){return context;}async convertToBlob(){return new w.Blob(['map'],{type:'image/jpeg'});}};
    w.ChatExportDilEvaluate=async d=>render.evaluate(d,vmExecute);
    w.ChatExportDilSnapshot=async d=>({segments:render.segments(render.evaluate(d,vmExecute))});
    w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
    w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
    w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
    const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
    s.getElementById('preview').click();await idle(s);assert.doesNotMatch(s.getElementById('output').value,/map:0|!\[地图/);
    (s.getElementById('kind').value='zip',s.getElementById('export').click());for(let i=0;i<100&&!files.length;i++)await new Promise(r=>setTimeout(r,20));
    const md=files.find(f=>f.name==='conversation.md').data;
    assert.match(md,/- \*\*Jmart\*\* · ★3/);
    if(onPage){assert.match(md,/📍 地图：1 个地点\n\n!\[地图：1 个地点\]\(assets\/map-m-1\.jpg\)\n\n- \*\*Jmart/);assert.ok(files.some(f=>f.name==='assets/map-m-1.jpg'));
      assert.equal(resized,1);assert.equal(copied[0],w.document.querySelector('canvas'));assert.ok(labels.includes('★3.0')&&labels.includes('Jmart')&&labels.some(l=>/Mapbox/.test(l)));}
    else{assert.doesNotMatch(md,/map:0|!\[地图/);assert.match(md,/m: 地图未能从页面截取（页面上没有找到这张地图）/);}
    dom.window.close();
  }
});
test('picture lists are recognized only when every image sits alone beside plain text',()=>{
  const img=src=>({type:'image',props:{src,alt:'pic '+src,width:'140px',ratio:'5:4'},children:[]});
  const texts=(t,d)=>({type:'box',props:{flex:'1'},children:[{type:'text',props:{},children:[{type:'bold',props:{},children:[t]}]},{type:'text',props:{},children:[d,{type:'cite',props:{items:[{url:'https://s.example/',label:'S'}]},children:[]}]}]});
  const row=(...k)=>({type:'row',props:{gap:3},children:k}),box=(...k)=>({type:'box',props:{gap:3},children:k});
  assert.deepEqual(render.pictureList(box(row(img('a'),texts('Otoro','最贵。')),{type:'divider',props:{},children:[]},row(img('b'),texts('Salmon','便宜。')))),
    [{src:'a',alt:'pic a',md:'**Otoro**\n\n最贵。（[S](https://s.example/)）',html:'<strong>Otoro</strong><br/>最贵。（<a href="https://s.example/">S</a>）',htmlError:null},
      {src:'b',alt:'pic b',md:'**Salmon**\n\n便宜。（[S](https://s.example/)）',html:'<strong>Salmon</strong><br/>便宜。（<a href="https://s.example/">S</a>）',htmlError:null}]);
  assert.equal(render.pictureList(box(row(img('a'),img('b'),texts('Two','x')))),null,'two images in one row');
  assert.equal(render.pictureList(box(row(img('a'),box(texts('T','x'),{type:'button',props:{},children:['Buy']})))),null,'a button');
  assert.equal(render.pictureList(box(row(img('a'),texts('T','x')),{type:'chart',props:{},children:[]})),null,'a chart beside the list');
  assert.equal(render.pictureList(box(img('a'),texts('T','x'))),null,'an image not in a row');
  assert.equal(render.pictureList(box(texts('T','x'))),null,'no image at all');
});
test('panel: a picture-list card becomes a table of thumbnails and text; every failure falls back to the PNG or the text',async()=>{
  const dil={code:'DIL.render(__dil.jsx(()=>__dil.jsx("box",{gap:3},__dil.jsx("row",{gap:3},__dil.jsx(AsyncImage,{"__resolutionId":"a"}),__dil.jsx("box",null,__dil.jsx("text",null,__dil.jsx("bold",null,"西京烧银鳕鱼")),__dil.jsx("text",null,"味噌腌制 | 烤制"))),__dil.jsx("row",{gap:3},__dil.jsx(AsyncImage,{"__resolutionId":"b"}),__dil.jsx("box",null,__dil.jsx("text",null,__dil.jsx("bold",null,"清蒸银鳕鱼")),__dil.jsx("text",null,"姜葱 $8.99 起，$8.98 特价"))))))',constants:{},requiredComponents:['AsyncImage'],
    appData:{opGenui:{componentResults:{a:{componentName:'AsyncImage',status:'resolved',state:{images:[{content_url:'https://cdn.example/a.jpg',title:'Saikyo'}]}},b:{componentName:'AsyncImage',status:'resolved',state:{images:[{content_url:'https://cdn.example/b.jpg',title:'Steamed'}]}}}}},fallbackMarkdown:'银鳕鱼'};
  const chat={title:'fish',current_node:'m',mapping:{m:{parent:null,children:[],message:{id:'m',author:{role:'assistant'},content:{content_type:'text',parts:['x']},metadata:{model_dil_v2:dil}}}}};
  // Every way the table can fail must still give a usable card: the PNG with its folded text,
  // or (when the PNG is missing too) the text alone. Faults are forced as on a real page.
  const cases=[
    {name:'ok',layout:'table'},
    {name:'missing picture',missing:true,layout:'png',reason:/1 张图片未下载/},
    {name:'undecodable picture',decode:true,layout:'png',reason:/缩略图生成失败/},
    {name:'recognizer',fault:'list',layout:'png'},
    {name:'download',fault:'image',layout:'png',reason:/测试：图片未下载/},
    {name:'thumbnail',fault:'thumb',layout:'png',reason:/缩略图生成失败：测试/},
    {name:'table',fault:'table',layout:'png',reason:/测试：表格生成失败/},
    {name:'table and png',fault:'png',layout:'text'},
    {name:'html option',html:true,layout:'html'},
    {name:'html option, thumbnail',html:true,fault:'thumb',layout:'png',reason:/缩略图生成失败：测试/},
    {name:'html option, table and png',html:true,fault:'png',layout:'text'}];
  for(const c of cases){
    const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/c/6ad0d397-0000-83e9-a872-c74862120096',runScripts:'outside-only'}),w=dom.window;const files=[];
    if(c.html)w.localStorage.setItem('chatExportHtmlCards','1');
    if(c.fault)w.chatExportFault=c.fault;
    if(c.fault==='png')w.chatExportFault='table',c.both=true;
    w.fetch=async path=>{if(path.startsWith('https://cdn.example/'))return !c.missing||path.endsWith('a.jpg')?{ok:true,blob:async()=>new w.Blob(['jpeg'],{type:'image/jpeg'})}:{ok:false,status:404};return path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>chat};};
    let decodes=0;w.createImageBitmap=async()=>{if(c.decode&&++decodes>2)throw Error('The source image could not be decoded.');return {width:800,height:600,close(){}};};
    w.OffscreenCanvas=class{getContext(){return {drawImage(){}};}async convertToBlob(){return new w.Blob(['small'],{type:'image/jpeg'});}};
    w.ChatExportDilEvaluate=async d=>render.evaluate(d,vmExecute);
    w.ChatExportDilSnapshot=async d=>({segments:render.segments(render.evaluate(d,vmExecute)).map(s=>s.kind==='card'&&!c.both?{...s,png:new Uint8Array([137,80,78,71]).buffer,width:300,height:120}:s)});
    w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
    w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
    w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
    const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
    (s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);
    const md=files.find(f=>f.name==='conversation.md')?.data,manifest=JSON.parse(files.find(f=>f.name==='manifest.json')?.data||'{}');
    assert.ok(md,`${c.name}: the export finished`);
    const [card]=manifest.cards;assert.equal(card.layout,c.layout,c.name);
    if(c.reason)assert.match(card.fallback,c.reason,c.name);
    assert.equal(s.getElementById('htmlCards').checked,!!c.html,`${c.name}: the option is remembered`);
    assert.match(s.getElementById('htmlCards').closest('.xrow').textContent,/图文卡片用 HTML Beta/,'the HTML option is marked Beta');
    if(c.layout==='html'){
      assert.ok(md.includes(['<div>','<div style="display:flex;gap:14px;align-items:flex-start;margin:10px 0"><a href="assets/ui-m-1.jpg"><img src="assets/card-m-1-pic1.jpg" alt="Saikyo" width="160" height="120" style="border-radius:8px;flex:none"/></a><div><strong>西京烧银鳕鱼</strong><br/>味噌腌制 | 烤制</div></div>',
        '<div style="display:flex;gap:14px;align-items:flex-start;margin:10px 0"><a href="assets/ui-m-2.jpg"><img src="assets/card-m-1-pic2.jpg" alt="Steamed" width="160" height="120" style="border-radius:8px;flex:none"/></a><div><strong>清蒸银鳕鱼</strong><br/>姜葱 &#36;8.99 起，&#36;8.98 特价</div></div>','</div>'].join('\n')),md);
      assert.ok(files.some(f=>f.name==='assets/card-m-1-pic2.jpg'));assert.doesNotMatch(md,/交互卡片|卡片文字|\| --- \|/);
    }else if(c.layout==='table'){
      assert.ok(md.includes(['| | |','| --- | --- |','| [![Saikyo](assets/card-m-1-pic1.jpg)](assets/ui-m-1.jpg) | **西京烧银鳕鱼**<br>味噌腌制 \\| 烤制 |','| [![Steamed](assets/card-m-1-pic2.jpg)](assets/ui-m-2.jpg) | **清蒸银鳕鱼**<br>姜葱 \\$8.99 起，\\$8.98 特价 |'].join('\n')),md);
      assert.ok(files.some(f=>f.name==='assets/card-m-1-pic2.jpg'));assert.ok(!files.some(f=>f.name==='assets/card-m-1.png'));assert.doesNotMatch(md,/交互卡片|卡片文字/);
    }else{
      assert.ok(!files.some(f=>/pic\d\.jpg$/.test(f.name)),`${c.name}: no half-made thumbnails`);assert.doesNotMatch(md,/pic1|\| --- \|/,c.name);
      if(c.layout==='png')assert.match(md,/!\[交互卡片\]\(assets\/card-m-1\.png\)\n\n> \[!note\]- 卡片文字\n> \*\*西京烧银鳕鱼\*\*/,c.name);
      else assert.match(md,/\*\*西京烧银鳕鱼\*\*[\s\S]*\*\*清蒸银鳕鱼\*\*/,c.name);
    }
    dom.window.close();
  }
});
test('a chart in a card with no size of its own is drawn whole, not cropped to 180px',()=>{
  const html=render.toHtml(render.withImages({type:'box',props:{},children:[{type:'image',props:{src:'sandbox:/mnt/data/roc.png',alt:'ROC'},children:[]}]},{'sandbox:/mnt/data/roc.png':'data:image/png;base64,AAA'}));
  assert.match(html,/<img class="img-real img-whole" alt="" src="data:image\/png;base64,AAA"\/>/);
  assert.match(render.CARD_CSS,/\.img-whole\{max-width:100%;height:auto\}/);
});
test('a search image with no result shows its fallback, as ChatGPT does',()=>{
  const dil={code:'DIL.render(__dil.jsx(()=>__dil.jsx("box",{"gap":1},__dil.jsx(AsyncImage,{"query":" ","fallback":__dil.jsx("text",{"color":"secondary"},"试验曲线见下方下载链接。")}))))',constants:{},requiredComponents:['AsyncImage']};
  const tree=render.evaluate(dil,vmExecute);
  assert.equal(render.toMarkdown(tree).trim(),'试验曲线见下方下载链接。');
  assert.match(render.toHtml(tree),/试验曲线见下方下载链接。/);
});
