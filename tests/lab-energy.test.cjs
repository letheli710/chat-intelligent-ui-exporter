const {test}=require('./private-fixtures.cjs');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');const api=require('../extension/fast-text');
// Real messages from a non-private lab conversation covering uploads, generated
// images, web search, code interpreter, a writing block and a card (ui/msg-*.json).
const dir='tests/fixtures/lab-energy',files=()=>fs.readdirSync(dir).sort();
const load=id=>JSON.parse(fs.readFileSync(`${dir}/${files().find(f=>f.includes(id))}`,'utf8'));
const exec=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const segs=id=>{const j=load(id);return render.segments(render.evaluate({...j.dil,contentReferences:j.contentReferences},exec));};
const mdOf=id=>segs(id).map(s=>render.toMarkdown(s.tree)).join('\n\n');

test('search answers keep inline links and citations resolved from componentResults',()=>{
  const md=mdOf('bcdadeb4');
  assert.match(md,/均可在 \[Monster Energy 美国官方网站\]\(https:\/\/www\.monsterenergy\.com\/en-us\/energy-drinks\/zero-sugar\/ultra-strawberry-dreams\/\?gad=1&utm_source=chatgpt\.com\) 核实。（\[Monster Ultra Zero-Sugar Energy Drinks\]\(https:\/\/www\.monsterenergy\.com\/[^)]+\)、\[Monster Energy Company\]\(https:\/\/investors\.monsterbevcorp\.com\/[^)]+\)）/);
  assert.match(md,/首次上市日。（\[The Impulsive Buy\]\(https:\/\/www\.theimpulsivebuy\.com\/[^)]+\)）/);
  assert.match(md,/\| 12 fl oz（约 355 mL） \| 110 mg \| （\[Target\]\(https:\/\/[^)]+\)） \|/);
  assert.doesNotMatch(md,/内部内容标记|核实。\s*$/m);
  const cite=render.toHtml({type:'text',props:{},children:['x',{type:'cite',props:{items:[{url:'https://a',label:'A'},{url:'https://b',label:'B'}]},children:[]}]});
  assert.match(cite,/<span class="cite">A \+1<\/span>/);
});
test('link and citation pages are not downloaded as UI images',()=>{
  const urls=api.dilImageUrls(load('bcdadeb4').dil);
  assert.ok(urls.every(u=>!/monsterenergy\.com|monsterbevcorp|theimpulsivebuy|prnewswire/.test(u)),urls.join('\n'));
});
test('writing blocks (the document view replacing Canvas) export as their Markdown',()=>{
  const md=mdOf('7627cd17');
  assert.doesNotMatch(md,/嵌入应用/);
  assert.match(md,/^# 能量饮料与学习效率\n\n## 一、能量饮料如何影响学习？/m);
  assert.match(md,/^\| 学习方式 \| 短期效果 \| 潜在问题 \|\n\|---\|---\|---\|\n\| 饮用能量饮料 \|/m);
  assert.equal(segs('7627cd17').filter(s=>s.kind==='card').length,0);
});
test('code-interpreter file links keep their sandbox target and draw as links in cards',()=>{
  const card=segs('b29947c1').filter(s=>s.kind==='card')[1];
  assert.match(render.toMarkdown(card.tree),/\*\*\[下载 caffeine\.csv\]\(sandbox:\/mnt\/data\/caffeine\.csv\)\*\*/);
  assert.match(render.toHtml(card.tree),/<span class="link">下载 caffeine\.csv<\/span>/);
});
test('a card table without header cells uses its first row as the header',()=>{
  const card=segs('ee029808').find(s=>s.kind==='card');
  assert.match(render.toMarkdown(card.tree),/\| 时间 \| 剩余比例 \| 剩余量 \|\n\| --- \| --- \| ---: \|\n\| 0h \| 100\.0% \| 150\.0 mg \|\n\| 5h \| 50\.0% \| 75\.0 mg \|/);
  assert.match(render.toMarkdown(card.tree),/\$\$\nC\(t\)=C_0\\cdot\(1\/2\)\^\{t\/5\}\n\$\$/);
});
// Tool messages shaped like the lab conversation's (image_gen and python).
const toolMessages=()=>[
  {id:'u1',author:{role:'user'},content:{content_type:'text',parts:['画一张图']}},
  {id:'g1',author:{role:'tool',name:'t2uay3k.sj1i4kz'},recipient:'all',content:{content_type:'multimodal_text',parts:[{content_type:'image_asset_pointer',asset_pointer:'sediment://file_gen1',width:1254,height:1254}]},metadata:{image_gen_title:'Cozy Pink Energy Study Desk'}},
  {id:'g2',author:{role:'tool',name:'t2uay3k.sj1i4kz'},recipient:'all',content:{content_type:'multimodal_text',parts:[{content_type:'image_asset_pointer',asset_pointer:'sediment://file_gen1'},'Model caption: ...']},metadata:{is_visually_hidden_from_conversation:true}},
  {id:'x1',author:{role:'tool',name:'container.exec'},recipient:'all',content:{content_type:'execution_output',text:'---\nname: spreadsheets'},metadata:{aggregate_result:{messages:[]}}},
  {id:'p1',author:{role:'tool',name:'python'},recipient:'all',content:{content_type:'execution_output',text:'<<ImageDisplayed>>'},metadata:{ada_visualizations:[{type:'chart',file_id:'file_spec',title:'Simulated Daily Caffeine Intake (Seed 42)'}],aggregate_result:{messages:[{message_type:'image',image_url:'sediment://file_plot1',width:790,height:440},{message_type:'stream'}]}}}
];
test('generated images and code plots are exported; tool plumbing and hidden copies are not',()=>{
  const {messages}=api.records(toolMessages());
  assert.deepEqual(messages.map(m=>[m.id,m.role]),[['u1','user'],['g1','assistant'],['p1','assistant']]);
  assert.equal(messages[1].md,'![生成图片：Cozy Pink Energy Study Desk](asset:file_gen1)');
  assert.equal(messages[2].md,'![代码运行图表：Simulated Daily Caffeine Intake (Seed 42)](asset:file_plot1)');
  assert.deepEqual(messages[2].images.map(i=>i.fileId),['file_plot1']);
});
test('panel end to end: generated image, plot and sandbox CSV land in the ZIP',async()=>{
  const code=load('b29947c1'),mapping={root:{parent:null,children:['u1'],message:null}},list=[...toolMessages(),{id:code.messageId,author:{role:'assistant'},channel:'final',recipient:'all',content:{content_type:'text',parts:[code.source]},metadata:{model_dil_v2:code.dil,content_references:code.contentReferences}}];
  list.forEach((m,i)=>{mapping[m.id]={parent:i?list[i-1].id:'root',children:list[i+1]?[list[i+1].id]:[],message:m};});
  const conversation={conversation_id:'chat',title:'lab',current_node:code.messageId,mapping},requested=[];
  const dom=new JSDOM(`<div data-message-id="${code.messageId}">x</div>`,{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window,zipped=[];
  const json=body=>({ok:true,status:200,json:async()=>body}),blob=type=>({ok:true,status:200,headers:{get:()=>type},blob:async()=>new w.Blob(['x'],{type})});
  w.fetch=async path=>{requested.push(path);
    if(path==='/api/auth/session')return json({accessToken:'t'});
    if(path.startsWith('/backend-api/conversation/chat/interpreter/download'))return json({download_url:`https://files.example/${new URL(path,'https://chatgpt.com').searchParams.get('sandbox_path').split('/').pop()}`});
    if(path.startsWith('/backend-api/conversation/'))return json(conversation);
    if(path.startsWith('/backend-api/files/download/'))return json({download_url:`https://files.example/${path.split('/')[4].split('?')[0]}.png`});
    if(path.startsWith('https://files.example/'))return blob(path.endsWith('.csv')?'text/csv':'image/png');
    return {ok:false,status:404,json:async()=>({})};};
  w.ChatExportDilEvaluate=async dil=>render.evaluate(JSON.parse(JSON.stringify(dil)),exec);
  w.ChatExportDilSnapshot=async dil=>({segments:render.segments(render.evaluate(JSON.parse(JSON.stringify(dil)),exec)).map(s=>s.kind==='card'?{...s,png:new Uint8Array([137,80,78,71]).buffer,width:10,height:10}:s)});
  w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=> 'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){zipped.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
  w.ChatExportDilRender=render;w.eval(fs.readFileSync('extension/fast-text.js','utf8'));// The ui/ folder (高级 → 附带界面数据) is checked here.
  w.localStorage.setItem('chatExport.uiFolder','true');w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot,idle=async()=>{for(let i=0;i<300&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
  await idle();(s.getElementById('kind').value='zip',s.getElementById('export').click());await idle();
  const md=zipped.find(f=>f.name==='conversation.md')?.data||s.getElementById('status').textContent,names=zipped.map(f=>f.name);
  assert.match(md,/!\[生成图片：Cozy Pink Energy Study Desk\]\(assets\/file_gen1\.png\)/);
  assert.match(md,/!\[代码运行图表：Simulated Daily Caffeine Intake \(Seed 42\)\]\(assets\/file_plot1\.png\)/);
  assert.match(md,/\[下载 caffeine\.csv\]\(files\/caffeine\.csv\)/);assert.doesNotMatch(md,/sandbox:/);
  // The reply has cards, so it points at its UI data; the data itself is always saved.
  assert.doesNotMatch(md,/chatgpt-ui/);assert.ok(names.includes(`ui/msg-${code.messageId}.json`));
  assert.ok(names.includes('files/caffeine.csv')&&names.includes('files/caffeine_week.png')&&names.includes('assets/file_gen1.png'),names.join(','));
  assert.ok(requested.some(p=>p.includes(`interpreter/download?message_id=${code.messageId}&sandbox_path=%2Fmnt%2Fdata%2Fcaffeine.csv`)));
  dom.window.close();
});
test('card formulas render as readable math, not LaTeX source; known icons are drawn',()=>{
  const html=render.toHtml(segs('ee029808').find(s=>s.kind==='card').tree);
  assert.match(html,/C\(t\)=C<sub>0<\/sub>·\(1\/2\)<sup>t\/5<\/sup>/);assert.doesNotMatch(html,/\\cdot|\^\{/);
  // Icons are Lucide's vector shapes (coffee: a cup with steam lines; clock: a circle and hands).
  assert.match(html,/<span class="icon c-secondary icon-lg"><svg[^>]*viewBox="0 0 24 24"[^>]*><path d="M10 2v2"\/>/);assert.match(html,/<span class="icon[^"]*"><svg [^>]*><circle cx="12" cy="12" r="10"\/><path d="M12 6v6l4 2"\/><\/svg><\/span>/);
  const m=v=>render.toHtml({type:'math',props:{value:v},children:[]});
  assert.match(m('\\frac{a+1}{2}\\times\\mathrm{kWh} \\le x_{i}^2'),/<sup>a\+1<\/sup>⁄<sub>2<\/sub>×kWh ≤ x<sub>i<\/sub><sup>2<\/sup>/);
  assert.match(m('a<b & \\alpha'),/a&lt;b &amp; α/);
});
test('downloaded files without a content type are named by their header',async()=>{
  const png=new Uint8Array([0x89,0x50,0x4e,0x47,13,10,26,10,0,0,0,13]);
  const fetch=async path=>path==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:path.startsWith('/backend-api/')?{ok:true,status:200,json:async()=>({download_url:'https://files.example/x'})}:{ok:true,status:200,headers:{get:()=>null},blob:async()=>new Blob([png])};
  const [file]=await api.downloadFiles({ids:['file_plot1'],conversationId:'c',fetch});
  assert.equal(file.path,'assets/file_plot1.png');
});
