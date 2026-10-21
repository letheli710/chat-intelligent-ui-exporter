const {test}=require('./private-fixtures.cjs');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {JSDOM}=require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');
// Real messages from the user's Lab test conversations (0.8.11 exports, ui/msg-*.json).
const dir='tests/fixtures/lab-survey',files=()=>fs.readdirSync(dir).sort();
const load=id=>JSON.parse(fs.readFileSync(`${dir}/${files().find(f=>f.includes(id))}`,'utf8'));
const exec=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const segs=id=>{const j=load(id);return render.segments(render.evaluate({...j.dil,contentReferences:j.contentReferences},exec));};
const mdOf=id=>segs(id).map(s=>render.toMarkdown(s.tree)).join('\n\n');

test('links keep the text written between their tags; entities keep their names',()=>{
  const md=mdOf('33dd0c10');
  assert.match(md,/\| \[6\.002 — Circuits and Electronics\]\(https:\/\/ocw\.mit\.edu\/courses\/6-002-circuits-and-electronics-spring-2007\/\) \| KVL/);
  assert.doesNotMatch(md,/\| \[ocw\.mit\.edu\]\(/);
  assert.match(md,/（\[[^\]]+\]\(https:\/\/[^)]+\)(、\[[^\]]+\]\(https:\/\/[^)]+\))*）/);
});
test('search images inside a card keep their own size instead of filling the row',()=>{
  const html=segs('33dd0c10').filter(s=>s.kind==='card').map(s=>render.toHtml(s.tree)).join('');
  const sizes=[...html.matchAll(/<div class="img img-ph" style="width:(\d+)px;height:(\d+)px">/g)].map(m=>[+m[1],+m[2]]);
  assert.ok(sizes.length&&sizes.every(([w,h])=>w<200&&Math.abs(h-w*3/4)<=1),JSON.stringify(sizes));
  assert.doesNotMatch(html,/<div class="img">图片：/);
  const parser=new (new JSDOM('').window.DOMParser)();
  assert.equal(parser.parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${html}</div>`,'application/xml').getElementsByTagName('parsererror').length,0);
});
test('search images at the top level are Markdown images; a learning block keeps its formula',()=>{
  assert.match(mdOf('288141d9'),/^!\[[^\]]*Breadboards[^\]]*\]\(https:\/\/images\.openai\.com\/static-rsc-4\/[^)]+\)$/m);
  const pendulum=mdOf('4004045c');
  assert.match(pendulum,/^\$\$\nT \\approx 2\\pi\\sqrt\{\\frac\{L\}\{g\}\}\n\$\$$/m);
  assert.match(pendulum,/^Shows an ideal pendulum swinging/m);assert.doesNotMatch(pendulum,/嵌入应用/);
});
test('the panel warns when the loaded extension is older than the injected panel',async()=>{
  const dom=new JSDOM('<div>x</div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;
  const conversation={conversation_id:'chat',title:'t',current_node:'a',mapping:{root:{parent:null,children:['a'],message:null},a:{parent:'root',children:[],message:{id:'a',author:{role:'user'},content:{content_type:'text',parts:['hi']}}}}};
  w.fetch=async p=>p==='/api/auth/session'?{ok:true,json:async()=>({accessToken:'t'})}:{ok:true,json:async()=>conversation};
  w.chrome={runtime:{sendMessage:async()=>({}),getManifest:()=>({version:'0.8.10'})}};w.ChatExportDilRender=render;
  w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot;
  for(let i=0;i<300&&!/已读取/.test(s.getElementById('status').textContent);i++)await new Promise(r=>setTimeout(r,5));
  assert.match(s.getElementById('status').textContent,/插件后台仍是 0\.8\.10，面板是 \d+\.\d+\.\d+：请在 chrome:\/\/extensions 点击本插件的“重新加载”/);
  dom.window.close();
});
