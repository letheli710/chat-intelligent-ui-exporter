const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const {JSDOM}=require('../scripts/i18n-env.cjs');
const Settings=require('../extension/settings.js'),api=require('../extension/fast-text.js');
// chrome.storage.local and its onChanged, shared by every store made from it (the sidebar, the toolbar panel, the settings tab).
function fakeStorage(initial={}){const data={...initial},listeners=[];
  const fire=changes=>{if(Object.keys(changes).length)for(const l of listeners)l(changes,'local');};
  return {data,events:{addListener:l=>listeners.push(l)},area:{
    get:async()=>({...data}),
    set:async o=>{const c={};for(const [k,v] of Object.entries(o)){c[k]={oldValue:data[k],newValue:v};data[k]=v;}fire(c);},
    remove:async keys=>{const c={};for(const k of [].concat(keys))if(k in data){c[k]={oldValue:data[k]};delete data[k];}fire(c);}}};}
const page=(items={})=>{const m=new Map(Object.entries(items));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),has:k=>m.has(k)};};

test('settings move from the page\'s localStorage to chrome.storage.local once, then stay there',async()=>{
  const s=fakeStorage(),old=page({chatExportProfile:'obsidian',chatExportHtmlCards:'1',chatExportHtmlMap:'0',chatExportHtmlForm:'single'});
  const store=Settings.create({area:s.area,events:s.events,page:old});await store.ready;
  assert.equal(store.values.profile,'obsidian');assert.equal(store.values.proseHtml,'keep','the profile\'s default applies');
  assert.equal(store.values.htmlCards,true);assert.equal(store.values.htmlMap,false);assert.equal(store.values.htmlForm,'single');
  assert.deepEqual(s.data,{profile:'obsidian',htmlCards:true,htmlMap:false,htmlForm:'single'});
  assert.ok(!old.has('chatExportProfile')&&!old.has('chatExportHtmlCards'),'moved, so a reset does not bring them back');
  // Another ChatGPT origin still holding an old value does not override what is stored.
  const other=Settings.create({area:s.area,events:s.events,page:page({chatExportProfile:'generic'})});await other.ready;
  assert.equal(other.values.profile,'obsidian');
  // New settings start at their defaults (panel-spec section 4).
  for(const [k,v] of Object.entries({saveAs:false,exportKind:'zip',autoClose:false,fileName:'title-date',fileVersion:false,yaml:true,model:true,timestamps:false,sources:false,roleUser:'',roleAssistant:'ChatGPT',dockShow:true,dockPos:'input',uiFolder:false,language:'auto'}))
    assert.equal(store.values[k],v,k);
  // An empty role name is the language's own word.
  assert.equal(Settings.role(store.values,'user'),'我');assert.equal(Settings.role(store.values,'assistant'),'ChatGPT');
});

test('one change reaches every place at once; a reset goes back to the defaults',async()=>{
  const s=fakeStorage(),a=Settings.create({area:s.area,events:s.events}),b=Settings.create({area:s.area,events:s.events});await a.ready;await b.ready;
  const seen=[];b.onChange((v,changed,source)=>seen.push([changed.join(),source]));
  await a.set({saveAs:true});assert.equal(b.values.saveAs,true);assert.deepEqual(seen.at(-1),['saveAs','storage']);
  // Picking a profile resets the two options it sets; each can still be changed by hand afterwards.
  await a.set({htmlCards:true});await a.set({profile:'obsidian'});
  assert.equal(b.values.proseHtml,'keep');assert.equal(b.values.htmlCards,false);
  await b.set({proseHtml:'escape'});assert.equal(a.values.proseHtml,'escape');assert.equal(a.values.profile,'obsidian');
  // Values of the wrong kind are ignored.
  await a.set({exportKind:'docx',roleUser:42});assert.equal(b.values.exportKind,'zip');assert.equal(b.values.roleUser,'');
  await a.set({language:'xx'});assert.equal(b.values.language,'auto');await a.set({language:'ja'});assert.equal(b.values.language,'ja');
  await b.reset();assert.deepEqual(a.values,Settings.defaults);assert.deepEqual(s.data,{});
});

test('file names: title and date in the chosen order, a prefix, the version only when asked',()=>{
  const v=Settings.defaults,date=new Date(2026,9,19),title=' 化工工艺教学 \n';
  assert.equal(Settings.fileBase(v,{title,date}),'化工工艺教学 - 2026-10-19');
  assert.equal(Settings.fileBase({...v,fileName:'title'},{title,date}),'化工工艺教学');
  assert.equal(Settings.fileBase({...v,fileName:'date-title'},{title,date}),'2026-10-19 - 化工工艺教学');
  assert.equal(Settings.fileBase({...v,fileName:'prefix',filePrefix:'课程/笔记'},{title,date}),'课程_笔记 - 化工工艺教学');
  assert.equal(Settings.fileBase({...v,fileVersion:true},{title:'a:b?',date}),`a_b_ - 2026-10-19 - v${Settings.version}`);
  assert.equal(Settings.fileBase(v,{title:'...',date}),'ChatGPT - 2026-10-19');
});

test('Markdown settings: Obsidian properties with the model, timestamps and role names',()=>{
  const at=Date.UTC(2026,9,19,6,30)/1000,conversation={title:'标题 ',messages:[{id:'q',role:'user',md:'问',createTime:at},{id:'a',role:'assistant',md:'答',createTime:at+60,model:'gpt-6'},{id:'b',role:'assistant',md:'补充',model:'gpt-6'}],warnings:[]};
  const local=s=>{const d=new Date(s*1000),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;};
  assert.equal(api.markdown(conversation,['q','a'],'https://chatgpt.com/c/x'),'# 标题\n\n来源：https://chatgpt.com/c/x\n\n## 我\n\n问\n\n---\n\n## ChatGPT\n\n答\n','without options nothing changes');
  const md=api.markdown(conversation,['q','a','b'],'https://chatgpt.com/c/x',{yaml:true,model:true,timestamps:true,roles:{user:'Me',assistant:'GPT'},created:at});
  assert.equal(md,`---\ntitle: "标题"\nsource: "https://chatgpt.com/c/x"\ncreated: 2026-10-19T06:30:00.000Z\nmodel: "gpt-6"\ntags:\n  - chatgpt\n---\n\n# 标题\n\n## Me · ${local(at)}\n\n问\n\n---\n\n## GPT · ${local(at+60)}\n\n答\n\n补充\n`);
  assert.doesNotMatch(api.markdown(conversation,['a'],'u',{yaml:true,model:false}),/model:/);
  const {messages:[m]}=api.records([{id:'r',create_time:at,author:{role:'assistant'},metadata:{model_slug:'gpt-6'},content:{parts:['x']}}]);
  assert.equal(m.createTime,at);assert.equal(m.model,'gpt-6');
});

function settingsPage(s=fakeStorage()){
  const dom=new JSDOM('<!doctype html><body><div id="box"></div></body>',{runScripts:'outside-only'}),w=dom.window;
  w.chrome={storage:{local:s.area,onChanged:s.events}};
  for(const f of ['settings.js','ui-kit.js'])w.eval(fs.readFileSync(`extension/${f}`,'utf8'));
  return {w,s,dom};
}
test('settings rows change in place: same elements, focus kept, values and summaries updated; ⓘ floats',async()=>{
  const {w,s}=settingsPage(),store=w.ChatExportSettings.open();await store.ready;
  const box=w.document.getElementById('box'),panel=w.ChatExportUI.mountSettings(box,store,{});
  const sw=box.querySelector('#saveAs'),row=sw.closest('.xrow'),wrap=panel.el;
  assert.equal(row.querySelector('.val').textContent,'关 · 自动存到「下载」文件夹');
  sw.focus();sw.click();await new Promise(r=>setTimeout(r));
  assert.equal(s.data.saveAs,true);assert.equal(box.querySelector('#saveAs'),sw,'not drawn again');assert.equal(w.document.activeElement,sw,'focus stays');
  assert.equal(row.querySelector('.val').textContent,'开 · 弹出「另存为」，从上次的文件夹开始');assert.equal(panel.el,wrap);
  // A group opens in place under its header; several can be open.
  const head=box.querySelector('[data-group="name"] .acch');head.click();box.querySelector('[data-group="md"] .acch').click();
  assert.equal(box.querySelectorAll('.acc.open').length,2);assert.equal(head.getAttribute('aria-expanded'),'true');
  assert.equal(box.querySelector('[data-row="fileName"] .val').textContent,`示例：对话标题 - ${w.ChatExportSettings.day()}.zip`);
  assert.ok(box.querySelector('[data-row="filePrefix"]').hidden,'the prefix shows only for its format');
  const fmt=box.querySelector('#fileName');fmt.value='prefix';fmt.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r));
  assert.ok(!box.querySelector('[data-row="filePrefix"]').hidden);assert.equal(box.querySelector('[data-group="name"] .acch .val').textContent,'前缀 - 标题');
  // A change made elsewhere (the toolbar panel) shows here too; the model row greys out with the properties.
  const other=w.ChatExportSettings.open();await other.ready;await other.set({yaml:false});
  assert.equal(box.querySelector('#yaml').checked,false);assert.ok(box.querySelector('[data-row="model"]').classList.contains('dim'));assert.ok(box.querySelector('#model').disabled);
  assert.match(box.querySelector('[data-group="md"] .acch .val').textContent,/^1 项开 · 特殊标签转成文字$/);
  // The Beta tag, and the explanation behind ⓘ in a floating box (nothing in the rows moves).
  assert.match(box.querySelector('#htmlCards').closest('.xrow').textContent,/图文卡片用 HTML Beta/);
  const tip=w.ChatExportUI.attachTips(box,w.document.body),info=box.querySelector('[data-row="htmlCards"] .info');
  const before=box.innerHTML;info.dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));
  assert.ok(tip.classList.contains('show'));assert.match(tip.textContent,/左图右文/);assert.equal(box.innerHTML,before);assert.equal(tip.parentElement,w.document.body);
  // The segmented choice: picking Obsidian resets prose HTML to keep.
  box.querySelector('#profile button[data-v="obsidian"]').click();await new Promise(r=>setTimeout(r));
  assert.equal(s.data.profile,'obsidian');assert.equal(box.querySelector('#proseHtml').value,'keep');
  assert.equal(box.querySelector('#proseHtml button[data-v="keep"]').getAttribute('aria-pressed'),'true');
});

// The page as the manifest's content scripts leave it: buttons beside the input box, the sidebar closed.
async function residentPage({stored={},url='https://chatgpt.com/c/chat'}={}){
  const dom=new JSDOM('<form><div id="prompt-textarea"></div></form><div data-message-id="b">answer</div>',{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  const s=fakeStorage(stored),downloads=[];let listener=null;
  const data={title:'Sample',create_time:1790000000,current_node:'b',mapping:{a:{parent:null,children:['b'],message:{id:'a',create_time:1790000000,author:{role:'user'},content:{parts:['Question']}}},b:{parent:'a',children:[],message:{id:'b',create_time:1790000060,author:{role:'assistant'},metadata:{model_slug:'gpt-6'},content:{parts:['Answer']}}}}};
  w.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'t'}:data});
  w.chrome={storage:{local:s.area,onChanged:s.events},runtime:{id:'ext',getManifest:()=>({version:Settings.version}),getURL:p=>'chrome-extension://ext/'+p,
    sendMessage:async m=>{downloads.push(m);return {id:1};},onMessage:{addListener:l=>{listener=l;}}}};
  w.URL.createObjectURL=()=>'blob:https://chatgpt.com/x';w.URL.revokeObjectURL=()=>{};
  for(const f of ['fast-text.js','settings.js','ui-kit.js','resident.js','fast-content.js'])w.eval(fs.readFileSync(`extension/${f}`,'utf8'));
  const ask=m=>new Promise(r=>{const sync=listener(m,{id:'ext'},r);if(sync!==true&&m.type!=='panel:open'&&m.type!=='panel:toggle')r(undefined);});
  const host=w.document.querySelector('[data-archive-owned="fast-text"]'),dock=w.document.querySelector('[data-archive-owned="fast-text-dock"]');
  await new Promise(r=>setTimeout(r,20));
  return {w,s,host,dock,ask,downloads,close:()=>dom.window.close()};
}
test('on chatgpt.com the buttons are there, the sidebar opens from them, and nothing is read before it is needed',async()=>{
  const p=await residentPage(),{host,dock,w}=p,d=dock.shadowRoot;
  assert.ok(host.hidden,'the sidebar starts closed');assert.ok(!dock.hidden,'the buttons show');
  assert.equal(d.getElementById('dExport').textContent,'导出完整归档');assert.equal(d.querySelector('.vtag'),null,'no version under the buttons (the user, 2026-10-20)');assert.match(d.querySelector('.mfoot').textContent,new RegExp(`v${Settings.version.replace(/\./g,'\\.')}$`));
  assert.equal(host.shadowRoot.querySelectorAll('#list input').length,0,'not read yet');
  // The export menu switches the default. Obsidian turns 「导出」 into the pill 保存到 Obsidian | 打开
  // (打开 off until this chat has a saved note), here and in the sidebar.
  d.querySelector('[data-kind="md"]').click();await new Promise(r=>setTimeout(r));
  assert.equal(p.s.data.exportKind,'md');assert.equal(d.getElementById('dExport').textContent,'导出仅文字');assert.equal(d.querySelector('.mi.soon'),null);assert.ok(d.getElementById('dOpen').hidden);
  d.querySelector('[data-kind="obsidian"]').click();await new Promise(r=>setTimeout(r));
  assert.equal(p.s.data.exportKind,'obsidian');assert.equal(d.getElementById('dExport').textContent,'保存');assert.equal(d.getElementById('dExport').title,'保存到 Obsidian');assert.ok(!d.getElementById('dOpen').hidden);assert.ok(d.getElementById('dOpen').disabled);
  assert.equal(host.shadowRoot.getElementById('export').textContent,'保存');assert.ok(!host.shadowRoot.getElementById('obsOpen').hidden);
  d.querySelector('[data-kind="md"]').click();await new Promise(r=>setTimeout(r));assert.ok(d.getElementById('dOpen').hidden);assert.equal(host.shadowRoot.getElementById('export').textContent,'导出');
  // Opened from 选择, the sidebar reads the chat; a quick selection keeps only the answers.
  d.getElementById('dSelect').click();assert.ok(!host.hidden);
  const s=host.shadowRoot;for(let i=0;i<100&&!s.querySelectorAll('#list input').length;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(s.querySelectorAll('#list input').length,2);assert.equal(s.getElementById('count').textContent,'已选 2 / 2');
  assert.match(s.querySelector('#list .smsg').textContent,/^我Question$|^我.*Question/);
  d.querySelector('[data-preset="answers"]').click();await new Promise(r=>setTimeout(r,20));
  assert.equal(s.getElementById('count').textContent,'已选 1 / 2');
  // 在输入框旁显示按钮 off hides them.
  await p.ask({type:'panel:open'});const other=Settings.create({area:p.s.area,events:p.s.events});await other.ready;await other.set({dockShow:false});
  assert.ok(dock.hidden);p.close();
});
test('the toolbar panel reads the chat\'s summary and exports through the page, closed sidebar or not',async()=>{
  const p=await residentPage({stored:{autoClose:true,fileName:'title'}});
  const summary=await p.ask({type:'panel:summary'});
  assert.deepEqual({...summary,status:undefined},{version:Settings.version,page:'chat',ok:true,title:'Sample',messages:2,cards:0,images:0,obsidianNote:false,selected:2,status:undefined});
  const r=await p.ask({type:'panel:export',kind:'md'});
  assert.equal(r.error,false,r.status);const sent=p.downloads.find(m=>m.type==='archive:download');assert.equal(sent.filename,'Sample.md');assert.equal(sent.saveAs,false);
  // With the sidebar open, 导出后自动关闭侧边栏 closes it after the export.
  await p.ask({type:'panel:open'});assert.ok(!p.host.hidden);
  const s=p.host.shadowRoot;s.getElementById('kind').value='md';s.getElementById('export').click();
  for(let i=0;i<100&&!p.host.hidden;i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(p.host.hidden,'closed after the export');assert.equal(p.downloads.filter(m=>m.type==='archive:download').length,2);
  p.close();
  const home=await residentPage({url:'https://chatgpt.com/'});
  assert.deepEqual(JSON.parse(JSON.stringify(await home.ask({type:'panel:summary'}))),{version:Settings.version,page:'other'});home.close();
});
test('the ⓘ of 折叠块等特殊标签 and 图文卡片用 HTML open their explanation; the others only show a tip',async()=>{
  const {w}=settingsPage(),store=w.ChatExportSettings.open();await store.ready;const opened=[];
  const box=w.document.getElementById('box');w.ChatExportUI.mountSettings(box,store,{help:topic=>opened.push(topic)});
  box.querySelector('[data-row="proseHtml"] .info').click();
  box.querySelector('[data-row="htmlCards"] .info').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  box.querySelector('[data-row="htmlMap"] .info').click();
  assert.deepEqual(opened,['prose-html','html-cards']);
  assert.equal(box.querySelector('[data-row="proseHtml"] .info').getAttribute('role'),'button');assert.equal(box.querySelector('[data-row="htmlMap"] .info').getAttribute('role'),'img');
  // The page has a section for each, and the background opens only those.
  const help=fs.readFileSync('extension/help.html','utf8'),background=fs.readFileSync('extension/background.js','utf8');
  for(const topic of opened){assert.match(help,new RegExp(`<section id="${topic}">`));assert.ok(background.includes(`'${topic}'`),topic);}
  for(const s of ['settings.js','ui-kit.js','help.js'])assert.match(help,new RegExp(`<script src="${s}"></script>`));
});
test('侧边栏快捷键 shows the key Chrome bound, says when there is none, and when it sits on the toolbar-panel row',async()=>{
  const {w}=settingsPage(),store=w.ChatExportSettings.open();await store.ready;const t=w.ChatExportI18n.t;
  let commands=[{name:'_execute_action',shortcut:''},{name:'toggle-sidebar',shortcut:'Ctrl+Shift+Y'}];
  let asked=0;const box=w.document.getElementById('box'),panel=w.ChatExportUI.mountSettings(box,store,{commands:async()=>{asked++;return commands;}});
  // Asked only once its group is open, and again each time it opens.
  const shown=async()=>{panel.setOpen('btns',false);panel.setOpen('btns',true);await new Promise(r=>setTimeout(r,0));return box.querySelector('[data-row="shortcut"] .val').textContent;};
  await new Promise(r=>setTimeout(r,0));assert.equal(asked,0);
  assert.equal(await shown(),t('set.shortcut.value','Ctrl+Shift+Y'));
  // Chrome left it empty (not a first install, or the keys were taken).
  commands=[{name:'_execute_action',shortcut:''},{name:'toggle-sidebar',shortcut:''}];
  assert.equal(await shown(),t('set.shortcut.none'));
  // The key was put on Chrome's own row, which opens the toolbar panel.
  commands=[{name:'_execute_action',shortcut:'Alt+Shift+E'},{name:'toggle-sidebar',shortcut:''}];
  assert.equal(await shown(),t('set.shortcut.onAction','Alt+Shift+E'));assert.match(await shown(),/Alt\+Shift\+E/);
  // The background answers the sidebar's question with Chrome's list.
  assert.match(fs.readFileSync('extension/background.js','utf8'),/'commands:get'[^\n]*chrome\.commands\.getAll\(\)/);
});
test('the toolbar panel and the settings tab are extension pages; the manifest keeps the panel on ChatGPT',()=>{
  const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
  assert.equal(m.action.default_popup,'popup.html');assert.equal(m.options_page,'options.html');
  assert.deepEqual(m.content_scripts[0].matches,['https://chatgpt.com/*','https://chat.openai.com/*']);
  assert.deepEqual(m.content_scripts[0].js.slice(-4),['settings.js','ui-kit.js','resident.js','fast-content.js']);
  assert.equal(m.commands['toggle-sidebar'].suggested_key.default,'Alt+Shift+E');
  for(const f of ['popup.html','options.html']){const html=fs.readFileSync(`extension/${f}`,'utf8');for(const s of ['settings.js','ui-kit.js','panel-page.js'])assert.match(html,new RegExp(`<script src="${s}"></script>`));}
  for(const f of m.content_scripts[0].js)assert.ok(fs.existsSync(`extension/${f}`),f);
});
test('a page opened with Obsidian already the kind shows the pill and 选择 still opens the sidebar',async()=>{
  const p=await residentPage({stored:{exportKind:'obsidian'}}),d=p.dock.shadowRoot,errors=[];p.w.addEventListener('error',e=>errors.push(e.message));
  assert.equal(d.getElementById('dExport').textContent,'保存');assert.ok(!d.getElementById('dOpen').hidden);
  d.getElementById('dSelect').click();assert.ok(!p.host.hidden,'选择 opens the sidebar');
  const s=p.host.shadowRoot;for(let i=0;i<100&&!s.querySelectorAll('#list input').length;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(s.querySelectorAll('#list input').length,2,s.getElementById('status').textContent);assert.deepEqual(errors,[]);
  p.close();
});
