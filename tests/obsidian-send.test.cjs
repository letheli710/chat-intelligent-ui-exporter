const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('../scripts/i18n-env.cjs');
const ob=require('../extension/obsidian-send.js');
// A folder handle kept in memory, with the File System Access calls writeJob uses.
function folder(name='vault'){const dirs=new Map(),files=new Map();
  return {name,dirs,files,
    async getDirectoryHandle(n,{create=false}={}){if(!dirs.has(n)){if(!create)throw Object.assign(Error('missing'),{name:'NotFoundError'});dirs.set(n,folder(n));}return dirs.get(n);},
    async getFileHandle(n){return {createWritable:async()=>({write:async blob=>files.set(n,blob),close:async()=>{}})};}};}
const at=(root,path)=>path.split('/').reduce((d,p,i,a)=>i===a.length-1?d.files.get(p):d.dirs.get(p),root);
// Both ends of a port: what one side posts, the other side's listeners receive.
function portPair(){const a={listeners:[],gone:[]},b={listeners:[],gone:[]};
  const end=(self,other)=>({postMessage:m=>other.listeners.forEach(f=>f(structuredClone(m))),onMessage:{addListener:f=>self.listeners.push(f)},onDisconnect:{addListener:f=>self.gone.push(f)}});
  return [end(a,b),end(b,a)];}

test('names Chrome refuses are cleaned: format characters, ~, .lnk, cut emoji (user report, 2026-10-20)',()=>{
  // The chat title that failed: Malayalam with the invisible zero-width joiner (U+200D).
  const title='合同审查 റിപ്പോർ‍ട്ട് - 2026-10-20';
  assert.equal(ob.safeSegment(title),'合同审查 റിപ്പോർട്ട് - 2026-10-20');
  assert.equal(ob.safeSegment('a​‌‮﻿b\u0007'),'ab');assert.equal(ob.safeSegment('👨‍👩‍👧 家'),'👨👩👧 家');
  assert.equal(ob.safeSegment('备份~旧版'),'备份～旧版');assert.equal(ob.safeSegment('link.lnk'),'link.lnk_');assert.equal(ob.safeSegment('x.local'),'x.local_');
  const cut=ob.safeSegment('😀'.repeat(100));assert.equal(Array.from(cut).length,90);assert.ok(!/[\ud800-\udfff]/.test(cut.replace(/😀/g,'')),'no half emoji');
});
test('if Chrome still refuses the folder name, a plainer one is used and the note is written',async()=>{
  const vault=folder(),dir=vault.getDirectoryHandle.bind(vault);
  vault.getDirectoryHandle=async(n,o)=>{if(/♪/.test(n))throw Object.assign(Error('Name is not allowed.'),{name:'TypeError'});return dir(n,o);};
  const r=await ob.writeJob(vault,'',{meta:{title:'歌 ♪ 2026'},md:'# 歌 ♪ 2026',files:[]});
  assert.equal(r.name,'歌 _ 2026');assert.equal(await at(vault,'歌 _ 2026/歌 _ 2026.md').text(),'# 歌 ♪ 2026');
});
test('names are safe on Windows; paths cannot leave the chosen folder',()=>{
  assert.equal(ob.safeSegment('a:b/c?. '),'a_b_c_');assert.equal(ob.safeSegment('CON'),'_CON');assert.equal(ob.safeSegment('  ',"ChatGPT"),'ChatGPT');
  assert.equal(ob.safeSegment('x'.repeat(120)).length,90);
  assert.deepEqual(ob.safePath('../..\\Inbox//ChatGPT/./'),['Inbox','ChatGPT']);assert.deepEqual(ob.safePath('assets/card-1.png'),['assets','card-1.png']);
  // A folder inside the vault: the note is opened by name; the vault itself: by vault and path.
  assert.equal(ob.obsidianUrl('a b'),'obsidian://open?file=a%20b');
  assert.equal(ob.obsidianUrl('a b','My Vault','a b/a b.md'),'obsidian://open?vault=My%20Vault&file=a%20b%2Fa%20b.md');
});
test('a long note and files larger than one chunk arrive whole and in order',async()=>{
  const [send,receive]=portPair(),take=ob.receiver();let job=null;receive.onMessage.addListener(m=>{job=take(m)||job;});
  const big=new Uint8Array(ob.CHUNK+12345).map((_,i)=>i%251),md='长'.repeat(200000);
  await ob.sendJob(send,{meta:{title:'T'},md,files:[{path:'assets/big.png',blob:new Blob([big],{type:'image/png'})},{path:'ui/x.json',blob:new Blob(['{}'])},{path:'skip',blob:null}]});
  assert.equal(job.md,md);assert.deepEqual(job.files.map(f=>[f.path,f.blob.size,f.blob.type]),[['assets/big.png',big.length,'image/png'],['ui/x.json',2,'']]);
  assert.deepEqual(new Uint8Array(await job.files[0].blob.arrayBuffer()),big);
});
test('a file that did not arrive whole is refused, not written short',()=>{
  const take=ob.receiver();take({type:'meta',meta:{},md:'',files:[{path:'a.png',type:'image/png',size:10}]});take({type:'chunk',index:0,data:btoa('12345')});
  assert.throws(()=>take({type:'end'}),/没有收全：a\.png/);
});
test('the note and its files land in <folder>/<title>/ as in the ZIP; a second send gets its own folder',async()=>{
  const vault=folder(),job={meta:{title:'化工: 工艺?'},md:'![图](assets/a.png)',files:[{path:'assets/a.png',blob:new Blob(['png'])},{path:'ui/msg-1.json',blob:new Blob(['{}'])}]};
  const first=await ob.writeJob(vault,'Inbox/ChatGPT',job);
  assert.equal(first.notePath,'Inbox/ChatGPT/化工_ 工艺_/化工_ 工艺_.md');assert.equal(first.files,2);assert.deepEqual(first.renamed,[]);
  assert.equal(await at(vault,first.notePath).text(),'![图](assets/a.png)');assert.equal(await at(vault,'Inbox/ChatGPT/化工_ 工艺_/assets/a.png').text(),'png');
  const second=await ob.writeJob(vault,'Inbox/ChatGPT',job);assert.equal(second.name,'化工_ 工艺_ 2');
  const sneaky=await ob.writeJob(vault,'',{meta:{title:'x'},md:'',files:[{path:'../../evil.txt',blob:new Blob(['e'])}]});
  assert.deepEqual(sneaky.renamed,['../../evil.txt → evil.txt']);assert.equal(await at(vault,'x/evil.txt').text(),'e');assert.equal(vault.files.size,0);
});
test('with Obsidian as the export kind, 保存到 Obsidian streams the ZIP\'s Markdown and original images to the relay tab',async()=>{
  const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;
  w.fetch=async path=>{if(path==='/api/auth/session')return {ok:true,json:async()=>({accessToken:'t'})};
    if(path.startsWith('/backend-api/conversation/'))return {ok:true,json:async()=>({title:'带图对话',current_node:'a',mapping:{a:{parent:null,children:[],message:{id:'a',author:{role:'assistant'},content:{content_type:'multimodal_text',parts:['看图',{asset_pointer:'file-service://file-IMG'}]}}}}})};
    if(path.startsWith('/backend-api/files/download/'))return {ok:true,json:async()=>({download_url:'/backend-api/estuary/content?id=file-IMG'})};
    return {ok:true,blob:async()=>new w.Blob(['img-bytes'],{type:'image/png'})};};
  const connect=[],opened=[];
  w.chrome={runtime:{sendMessage:async m=>{opened.push(m);return {id:7};},onConnect:{addListener:f=>connect.push(f)}}};
  // jsdom's Blob has no arrayBuffer(); Chrome's does.
  w.Blob.prototype.arrayBuffer??=function(){return new Promise(ok=>{const r=new w.FileReader();r.onload=()=>ok(r.result);r.readAsArrayBuffer(this);});};
  if(!w.crypto.randomUUID)w.crypto.randomUUID=()=>'12345678-aaaa-bbbb-cccc-1234567890ab';
  w.localStorage.setItem('chatExport.exportKind',JSON.stringify('obsidian'));
  for(const f of ['fast-text.js','settings.js','ui-kit.js','obsidian-send.js','fast-content.js'])w.eval(fs.readFileSync(`extension/${f}`,'utf8'));
  const s=w.document.querySelector('[data-archive-owned="fast-text"]').shadowRoot;for(let i=0;i<100&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));
  // The sidebar's 导出 is the pill 保存 | 打开; 打开 waits for a saved note.
  assert.equal(s.getElementById('export').textContent,'保存');assert.equal(s.getElementById('export').title,'保存到 Obsidian');assert.ok(!s.getElementById('obsOpen').hidden);assert.ok(s.getElementById('obsOpen').disabled);
  assert.equal(s.getElementById('obsOpen').parentElement,s.getElementById('export').parentElement);
  s.getElementById('export').click();for(let i=0;i<100&&!opened.length;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(opened[0].type,'obsidian:open',s.getElementById('status').textContent);
  // The relay tab connects back with the job id; a port with another name is ignored.
  const [panelEnd,relayEnd]=portPair(),take=ob.receiver();let job=null;
  relayEnd.onMessage.addListener(m=>{job=take(m)||job;if(job&&m.type==='end')relayEnd.postMessage({type:'received'});});
  connect.forEach(f=>f({...panelEnd,name:'obsidian:other'}));connect.forEach(f=>f({...panelEnd,name:`obsidian:${opened[0].job}`}));
  for(let i=0;i<100&&!job;i++)await new Promise(r=>setTimeout(r,5));for(let i=0;i<100&&s.getElementById('export').disabled;i++)await new Promise(r=>setTimeout(r,5));
  assert.ok(job,s.getElementById('status').textContent);assert.match(job.meta.title,/^带图对话/);assert.match(job.md,/看图/);
  const image=job.files.find(f=>/\.png$/.test(f.path));assert.ok(image,JSON.stringify(job.files.map(f=>f.path)));assert.ok(job.md.includes(`](${image.path})`));
  assert.equal(await image.blob.text(),'img-bytes');assert.match(s.getElementById('status').textContent,/正在写进 Obsidian/);
  // Written: the panel says where; 打开 turns on and remembers the note for this chat.
  relayEnd.postMessage({type:'written',path:'01_Inbox/带图对话/带图对话.md',url:'obsidian://open?file=%E5%B8%A6'});
  assert.ok(s.getElementById('status').textContent.includes('已保存到 01_Inbox / 带图对话 / 带图对话.md'));assert.equal(s.getElementById('obsOpen').disabled,false);
  assert.deepEqual(JSON.parse(w.localStorage.getItem('chatExportObsidianNotes')),{chat:'obsidian://open?file=%E5%B8%A6'});
  // 设置 → Obsidian → 笔记文件夹 → 更改… opens the relay page on its own, without a job.
  s.getElementById('obsFolder').click();await new Promise(r=>setTimeout(r,5));assert.equal(opened.at(-1).type,'obsidian:setup');
  dom.window.close();
});
test('saved note links move from the page\'s localStorage to chrome.storage.local once, and new ones are kept there',async()=>{
  const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;
  w.fetch=async path=>{if(path==='/api/auth/session')return {ok:true,json:async()=>({accessToken:'t'})};
    return {ok:true,json:async()=>({title:'对话',current_node:'a',mapping:{a:{parent:null,children:[],message:{id:'a',author:{role:'assistant'},content:{content_type:'text',parts:['答']}}}}})};};
  // chrome.storage.local as Chrome keeps it; another tab saved a link for "other" meanwhile.
  const stored={chatExportObsidianNotes:{other:'obsidian://open?file=other'}},changed=[];
  const area={get:async k=>JSON.parse(JSON.stringify(k==null?stored:k in stored?{[k]:stored[k]}:{})),set:async o=>{Object.assign(stored,JSON.parse(JSON.stringify(o)));},remove:async ks=>{for(const k of [].concat(ks))delete stored[k];}};
  w.chrome={runtime:{sendMessage:async()=>({}),onConnect:{addListener(){}}},storage:{local:area,onChanged:{addListener:f=>changed.push(f)}}};
  w.localStorage.setItem('chatExportObsidianNotes',JSON.stringify({chat:'obsidian://open?file=old'}));
  w.localStorage.setItem('chatExport.exportKind',JSON.stringify('obsidian'));
  for(const f of ['fast-text.js','settings.js','ui-kit.js','obsidian-send.js','fast-content.js'])w.eval(fs.readFileSync(`extension/${f}`,'utf8'));
  const s=w.document.querySelector('[data-archive-owned="fast-text"]').shadowRoot;
  for(let i=0;i<100&&s.getElementById('obsOpen').disabled;i++)await new Promise(r=>setTimeout(r,5));
  // The old link opens this chat's note, now from extension storage; the page no longer holds it.
  assert.equal(s.getElementById('obsOpen').disabled,false);assert.equal(w.localStorage.getItem('chatExportObsidianNotes'),null);
  assert.deepEqual(stored.chatExportObsidianNotes,{other:'obsidian://open?file=other',chat:'obsidian://open?file=old'});
  // A link removed in another tab turns 打开 off here too.
  stored.chatExportObsidianNotes={};changed.forEach(f=>f({chatExportObsidianNotes:{newValue:{}}},'local'));
  assert.equal(s.getElementById('obsOpen').disabled,true);
  dom.window.close();
});
test('extension files hold no characters Chrome refuses to load ("isn\'t UTF-8 encoded")',()=>{
  // Noncharacters (U+FDD0–U+FDEF, U+FFFE, U+FFFF) and lone surrogates make Chrome refuse the whole
  // extension; write them as \u escapes in source instead.
  for(const f of fs.readdirSync('extension').filter(f=>/\.(js|html|json|css)$/.test(f))){
    const s=fs.readFileSync(`extension/${f}`,'utf8');
    const bad=[...s].map(c=>c.codePointAt(0)).find(p=>(p>=0xfdd0&&p<=0xfdef)||(p&0xfffe)===0xfffe||(p>=0xd800&&p<=0xdfff)||p===0xfffd);
    assert.equal(bad,undefined,`${f} has U+${bad?.toString(16)}`);
  }
});
