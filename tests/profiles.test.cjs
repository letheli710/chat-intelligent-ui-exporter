const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const {JSDOM}=require('../scripts/i18n-env.cjs');
const api=require('../extension/fast-text.js');
// Prose as in H06: raw <details> and <svg> written in the answer.
const prose=['Here is the picture:','','<details><summary>More</summary>','','<svg width="10" height="10"><circle r="4"/></svg>','','</details>','<!-- note -->','',
  'Code `<br>` and math $a<b$ stay; so do a < b and <https://example.com>.','','```html','<div>code</div>','```'].join('\n');
test('prose HTML is escaped only when asked, outside code, inline code and math',()=>{
  assert.equal(api.normalizeText(prose).md,prose,'kept as-is by default');
  const md=api.normalizeText(prose,{escapeHtml:true}).md;
  for(const tag of ['&lt;details>&lt;summary>More&lt;/summary>','&lt;svg width="10" height="10">&lt;circle r="4"/>&lt;/svg>','&lt;/details>','&lt;!-- note -->'])assert.ok(md.includes(tag),tag);
  for(const kept of ['`<br>`','$a<b$','a < b','<https://example.com>','```html\n<div>code</div>\n```'])assert.ok(md.includes(kept),kept);
  // Repaired table cells still get the exporter's own <code>.
  assert.match(api.normalizeText('| a |\n| --- |\n| `x|y` <b>z</b> |',{escapeHtml:true}).md,/<code>x&#124;y<\/code> &lt;b>z&lt;\/b>/);
  const {messages:[m]}=api.records([{id:'a',author:{role:'assistant'},content:{parts:[prose]}}]);
  assert.equal(m.md,prose);assert.match(m.mdEscaped,/&lt;svg/);
});
const ready=async s=>{for(let i=0;i<100&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
async function panel(storage={}){
  const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/c/h06',runScripts:'outside-only'}),w=dom.window;
  for(const [k,v] of Object.entries(storage))w.localStorage.setItem(k,v);
  const chat={title:'H06',current_node:'m',mapping:{m:{parent:null,children:[],message:{id:'m',author:{role:'assistant'},content:{parts:[prose]}}}}};
  w.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'t'}:chat});
  w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
  const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await ready(s);
  const preview=async()=>{s.getElementById('preview').click();await ready(s);return s.getElementById('output').value;};
  const pick=(id,value)=>{s.getElementById(id).value=value;s.getElementById(id).dispatchEvent(new w.Event('change'));};
  return {w,s,preview,pick,close:()=>dom.window.close()};
}
test('通用 Markdown is the default profile: HTML cards off, prose HTML escaped',async()=>{
  const p=await panel(),{s}=p;
  assert.equal(s.getElementById('profile').value,'generic');
  assert.deepEqual([...s.getElementById('profile').querySelectorAll('button')].map(o=>o.textContent),['通用','Obsidian']);
  assert.equal(s.getElementById('htmlCards').checked,false);assert.equal(s.getElementById('proseHtml').value,'escape');
  const md=await p.preview();
  assert.match(md,/&lt;details>&lt;summary>More&lt;\/summary>/);assert.match(md,/&lt;svg width="10"/);assert.doesNotMatch(md,/^<svg/m);
  assert.ok(md.includes('```html\n<div>code</div>\n```'),'code blocks are untouched');
  p.close();
});
test('Obsidian profile: prose HTML kept, HTML cards still off; options stay editable and are remembered',async()=>{
  let p=await panel(),{s,w}=p;
  p.pick('profile','obsidian');
  assert.equal(s.getElementById('htmlCards').checked,false);assert.equal(s.getElementById('proseHtml').value,'keep');
  assert.equal(w.localStorage.getItem('chatExportProfile'),'obsidian');assert.equal(w.localStorage.getItem('chatExportHtmlCards'),'0');assert.equal(w.localStorage.getItem('chatExportProseHtml'),'keep');
  // Turned on by hand, picture cards as HTML are remembered.
  s.getElementById('htmlCards').checked=true;s.getElementById('htmlCards').dispatchEvent(new w.Event('change'));assert.equal(w.localStorage.getItem('chatExportHtmlCards'),'1');
  assert.match(await p.preview(),/^<details><summary>More<\/summary>$/m);
  // Changed by hand, an option overrides the profile's default.
  p.pick('proseHtml','escape');assert.match(await p.preview(),/&lt;details>/);
  p.pick('profile','generic');assert.equal(s.getElementById('htmlCards').checked,false);assert.equal(w.localStorage.getItem('chatExportHtmlCards'),'0');
  p.close();
  // A new panel starts from what was remembered.
  p=await panel({chatExportProfile:'obsidian'});
  assert.equal(p.s.getElementById('profile').value,'obsidian');assert.equal(p.s.getElementById('htmlCards').checked,false);assert.equal(p.s.getElementById('proseHtml').value,'keep');
  p.close();
  p=await panel({chatExportProfile:'obsidian',chatExportHtmlCards:'0',chatExportProseHtml:'escape'});
  assert.equal(p.s.getElementById('htmlCards').checked,false);assert.match(await p.preview(),/&lt;svg/);
  p.close();
});
test('raw HTML in the prose of a message with cards is escaped in every profile (it goes through the DIL tree)',()=>{
  const render=require('../extension/dil-render.js'),vm=require('node:vm');
  const dil={code:'DIL.render(__dil.jsx(()=>__dil.jsx(__dil.Fragment,null,__dil.jsx("text",null,"see <svg width=\\"1\\"></svg> and <details>"),__dil.jsx("card",null,__dil.jsx("text",null,"card")))))',constants:{},requiredComponents:[]};
  const prose=render.segments(render.evaluate(dil,(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000}))).find(s=>s.kind!=='card');
  assert.equal(render.toMarkdown(prose.tree),'see \\<svg width="1">\\</svg> and \\<details>');
});
