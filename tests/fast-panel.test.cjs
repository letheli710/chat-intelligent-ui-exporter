const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const {JSDOM}=require('../scripts/i18n-env.cjs');
test('default fast panel loads unloaded history, selects messages, previews repeatedly without extra requests or scrolling',async()=>{
 const dom=new JSDOM('<div data-message-id="b">Visible answer</div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;let requests=0;
 const data={title:'Test',current_node:'b',mapping:{a:{parent:null,children:['b'],message:{id:'a',author:{role:'user'},content:{parts:['Unloaded history']}}},b:{parent:'a',children:[],message:{id:'b',author:{role:'assistant'},content:{parts:['Visible answer']}}}}};
 w.fetch=async path=>{requests++;return {ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test'}:data};};w.scrollTo=()=>assert.fail('must not scroll');
 w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
 const s=w.document.querySelector('[data-archive-owned]').shadowRoot;for(let i=0;i<30&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));
 assert.equal(s.querySelectorAll('#list input').length,2);s.getElementById('preview').click();await new Promise(r=>setTimeout(r,5));assert.match(s.getElementById('output').value,/Unloaded history/);
 s.querySelector('#list input').checked=false;s.getElementById('preview').click();await new Promise(r=>setTimeout(r,5));assert.doesNotMatch(s.getElementById('output').value,/Unloaded history/);assert.equal(requests,2);
 w.history.pushState({},'', '/c/other');s.getElementById('preview').click();await new Promise(r=>setTimeout(r,5));assert.match(s.getElementById('status').textContent,/切换对话/);dom.window.close();
});
test('ZIP download names the file by title and date, honours save-as, refuses a switched chat and survives re-injection',async()=>{
 const dom=new JSDOM('<div data-message-id="answer">source</div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;
 const files=[],downloads=[],idle=async s=>{for(let i=0;i<100&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
 w.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test'}:{title:'sample',current_node:'answer',mapping:{answer:{parent:null,children:[],message:{id:'answer',author:{role:'assistant'},content:{parts:['API original']}}}}}});
 w.chrome={runtime:{sendMessage:async m=>{downloads.push(m);return {id:1};}}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/test';w.URL.revokeObjectURL=()=>{};
 w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['archive']);}};
 w.localStorage.setItem('chatExport.uiFolder','true');w.localStorage.setItem('chatExport.htmlManifest','true');
 w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
 (s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);
 const manifest=JSON.parse(files.find(f=>f.name==='manifest.json').data);assert.ok(manifest.timings.readMs>=0);assert.deepEqual(manifest.messages,['answer']);
 assert.match(files.find(f=>f.name==='conversation.md').data,/API original/);
 assert.equal(downloads[0].filename,`sample - ${require('../extension/settings.js').day()}.zip`);assert.equal(downloads[0].saveAs,false);
 s.getElementById('saveAs').checked=true;s.getElementById('saveAs').dispatchEvent(new w.Event('change'));(s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);assert.equal(downloads[1].saveAs,true);
 w.history.pushState({},'','/c/other');(s.getElementById('kind').value='zip',s.getElementById('export').click());await idle(s);assert.match(s.getElementById('status').textContent,/切换对话/);assert.equal(downloads.length,2);
 // Chrome reloads an extension's isolated world without removing its old DOM.
 w.__fastTextPanel=undefined;w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));assert.equal(w.document.querySelectorAll('[data-archive-owned="fast-text"]').length,1);
 dom.window.close();
});
test('a chat ChatGPT keeps hidden in the page (display:none, 2026-11) is not the chat on screen',async()=>{
 // The page shows branch one; the API's current_node is branch two. After it, a hidden chat opened before, still answering.
 const dom=new JSDOM('<main><div data-chatgpt-search-message-ids="q b1">Branch one</div></main><div style="display:none"><div data-chatgpt-search-message-ids="other-q other-a">old chat</div><div data-talvt-turn-state="in_progress"></div><form data-chatgpt-composer=""><button aria-label="Stop"></button></form></div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;
 // jsdom draws nothing: what Chrome's checkVisibility() says for a display:none ancestor.
 w.Element.prototype.checkVisibility=function(){for(let n=this;n;n=n.parentElement)if(n.style?.display==='none')return false;return true;};
 const data={title:'Branches',current_node:'b2',mapping:{q:{parent:null,children:['b1','b2'],message:{id:'q',author:{role:'user'},content:{parts:['Question']}}},b1:{parent:'q',children:[],message:{id:'b1',author:{role:'assistant'},content:{parts:['Branch one']}}},b2:{parent:'q',children:[],message:{id:'b2',author:{role:'assistant'},content:{parts:['Branch two']}}}}};
 w.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test'}:data});
 w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));
 const s=w.document.querySelector('[data-archive-owned]').shadowRoot;for(let i=0;i<30&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));
 assert.doesNotMatch(s.getElementById('status').textContent,/回答|answer/i);assert.equal(s.querySelectorAll('#list input').length,2);
 s.getElementById('preview').click();await new Promise(r=>setTimeout(r,5));
 assert.match(s.getElementById('output').value,/Branch one/);assert.doesNotMatch(s.getElementById('output').value,/Branch two|old chat/);
 dom.window.close();
});
test('by default the ZIPs hold only what the user wants: manifest.json only with its own switch in 高级',async()=>{
 const run=async(kind,store={})=>{
  const dom=new JSDOM('<div data-message-id="answer">source</div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;
  const files=[],idle=async s=>{for(let i=0;i<100&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
  w.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test'}:{title:'sample',current_node:'answer',mapping:{answer:{parent:null,children:[],message:{id:'answer',author:{role:'assistant'},content:{parts:['API original']}}}}}});
  w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/test';w.URL.revokeObjectURL=()=>{};
  w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['archive']);}};
  // The HTML page itself is not under test here, only what goes into its ZIP.
  w.ChatExportHtml={build:async()=>({html:'<p>page</p>',files:[],stats:{}})};w.localStorage.setItem('chatExportHtmlForm','folder');
  for(const [k,v] of Object.entries(store))w.localStorage.setItem('chatExport.'+k,JSON.stringify(v));
  w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await idle(s);
  (s.getElementById('kind').value=kind,s.getElementById('export').click());await idle(s);
  dom.window.close();return files.map(f=>f.name);};
 // Markdown: 「Markdown 附带数据文件」; HTML (ZIP): 「HTML（ZIP）附带 manifest.json」. Each switch only touches its own format.
 assert.deepEqual(await run('zip'),['conversation.md']);
 assert.deepEqual(await run('zip',{uiFolder:true}),['conversation.md','manifest.json']);
 assert.deepEqual(await run('zip',{htmlManifest:true}),['conversation.md']);
 assert.deepEqual(await run('html'),['conversation.html']);
 assert.deepEqual(await run('html',{htmlManifest:true}),['conversation.html','manifest.json']);
 assert.deepEqual(await run('html',{uiFolder:true}),['conversation.html']);
});
const chat=(id,text)=>({title:id,current_node:'m-'+id,mapping:{['m-'+id]:{parent:null,children:[],message:{id:'m-'+id,author:{role:'assistant'},content:{parts:[text]}}}}});
const ready=async s=>{for(let i=0;i<100&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
test('shared links are read through the share endpoint; files use the conversation behind the link',async()=>{
 const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/share/abc-123',runScripts:'outside-only'}),w=dom.window;const paths=[];
 w.fetch=async path=>{paths.push(path);if(path==='/api/auth/session')return {ok:true,json:async()=>({accessToken:'t'})};
  if(path==='/backend-api/share/abc-123')return {ok:true,json:async()=>({...chat('abc-123','Shared answer ![图片](x)'),conversation_id:'abc-123',backing_conversation_id:'real-chat',mapping:{a:{parent:null,children:[],message:{id:'a',author:{role:'assistant'},content:{content_type:'multimodal_text',parts:['Shared answer',{asset_pointer:'file-service://file-IMG'}]}}}},current_node:'a'})};
  if(path.startsWith('/backend-api/files/download/'))return {ok:true,json:async()=>({download_url:'/backend-api/estuary/content?id=file-IMG'})};
  return {ok:true,blob:async()=>new w.Blob(['img'],{type:'image/png'})};};
 const files=[];w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
 w.JSZip=class{file(name,data){files.push({name,data});}async generateAsync(){return new w.Blob(['zip']);}};
 w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));const s=w.document.querySelector('[data-archive-owned]').shadowRoot;await ready(s);
 assert.equal(s.querySelectorAll('#list input').length,1,s.getElementById('status').textContent);
 (s.getElementById('kind').value='zip',s.getElementById('export').click());await ready(s);
 assert.ok(paths.includes('/backend-api/files/download/file-IMG?conversation_id=real-chat&inline=false'));
 assert.match(files.find(f=>f.name==='conversation.md').data,/Shared answer[\s\S]*assets\/file-IMG\.png/);
 assert.ok(!paths.some(p=>p.startsWith('/backend-api/conversation/')));
 dom.window.close();
});
test('switching chats re-reads the open panel once; a hidden panel waits until it is shown',async()=>{
 const dom=new JSDOM('<div></div>',{url:'https://chatgpt.com/c/one',runScripts:'outside-only'}),w=dom.window;const reads=[];
 w.fetch=async path=>{if(path==='/api/auth/session')return {ok:true,json:async()=>({accessToken:'t'})};const id=path.split('/').pop();reads.push(id);return {ok:true,json:async()=>chat(id,'Answer in '+id)};};
 w.eval(fs.readFileSync('extension/fast-text.js','utf8'));w.eval(fs.readFileSync('extension/settings.js','utf8'));w.eval(fs.readFileSync('extension/ui-kit.js','utf8'));w.eval(fs.readFileSync('extension/fast-content.js','utf8'));const host=w.document.querySelector('[data-archive-owned]'),s=host.shadowRoot;await ready(s);
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),label=()=>s.querySelector('#list label')?.textContent||'';
 assert.match(label(),/Answer in one/);
 w.history.pushState({},'','/c/two');await wait(1000);await ready(s);
 assert.match(label(),/Answer in two/);assert.deepEqual(reads,['one','two']);
 await wait(1000);assert.deepEqual(reads,['one','two'],'the same chat is not read again');
 host.hidden=true;w.history.pushState({},'','/c/three');await wait(1000);assert.deepEqual(reads,['one','two']);
 host.hidden=false;await wait(1000);await ready(s);assert.match(label(),/Answer in three/);
 dom.window.close();
});
test('a chat that changed since it was read is read again at export, and the status says so',async()=>{
 const dom=new JSDOM('<div data-message-id="b">Visible answer</div>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;let reads=0;
 const data={title:'Test',current_node:'b',mapping:{a:{parent:null,children:['b'],message:{id:'a',author:{role:'user'},content:{parts:['Question']}}},b:{parent:'a',children:[],message:{id:'b',author:{role:'assistant'},content:{parts:['Visible answer']}}}}};
 w.fetch=async path=>{if(path!=='/api/auth/session')reads++;return {ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test'}:data};};
 w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
 for(const f of ['fast-text.js','settings.js','ui-kit.js','fast-content.js'])w.eval(fs.readFileSync(`extension/${f}`,'utf8'));
 const s=w.document.querySelector('[data-archive-owned]').shadowRoot,ready=async()=>{for(let i=0;i<100&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
 await ready();assert.equal(reads,1);
 // A new answer appears on the page after the sidebar read the chat.
 w.document.body.insertAdjacentHTML('beforeend','<div data-message-id="c">New answer</div>');
 const seen=[];new w.MutationObserver(()=>seen.push(s.getElementById('status').textContent)).observe(s.getElementById('status'),{childList:true,characterData:true,subtree:true});
 s.getElementById('kind').value='md';s.getElementById('export').click();
 await new Promise(r=>setTimeout(r,30));await ready();
 assert.ok(seen.some(t=>/对话有新内容，正在重新读取/.test(t)),seen.join(' | '));
 assert.equal(reads,2,'read again by itself');assert.match(s.getElementById('status').textContent,/已读取 2 条正文/);
 dom.window.close();
});
// ChatGPT's page since 2026-10: no data-message-id, ids in data-chatgpt-search-message-ids, a bare "Stop" button, turn state attributes.
test('on the 2026-10 page a new answer is still noticed, and exporting while ChatGPT answers is refused',async()=>{
 const dom=new JSDOM('<div data-talvt-turn-state="complete"><div data-chatgpt-search-message-ids="b b">Visible answer</div></div><form data-chatgpt-composer=""></form>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;let reads=0;
 const data={title:'Test',current_node:'b',mapping:{a:{parent:null,children:['b'],message:{id:'a',author:{role:'user'},content:{parts:['Question']}}},b:{parent:'a',children:[],message:{id:'b',author:{role:'assistant'},content:{parts:['Visible answer']}}}}};
 w.fetch=async path=>{if(path!=='/api/auth/session')reads++;return {ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test'}:data};};
 w.chrome={runtime:{sendMessage:async()=>({id:1})}};w.URL.createObjectURL=()=>'blob:https://chatgpt.com/t';w.URL.revokeObjectURL=()=>{};
 for(const f of ['fast-text.js','settings.js','ui-kit.js','fast-content.js'])w.eval(fs.readFileSync(`extension/${f}`,'utf8'));
 const s=w.document.querySelector('[data-archive-owned]').shadowRoot,ready=async()=>{for(let i=0;i<100&&s.getElementById('preview').disabled;i++)await new Promise(r=>setTimeout(r,5));};
 await ready();assert.equal(reads,1);
 const form=w.document.querySelector('form');
 form.insertAdjacentHTML('beforeend','<button type="button" aria-label="Stop"></button>');
 s.getElementById('kind').value='md';s.getElementById('export').click();await new Promise(r=>setTimeout(r,30));await ready();
 assert.match(s.getElementById('status').textContent,/还在回答/,'stop button in the composer');
 form.replaceChildren();w.document.body.insertAdjacentHTML('beforeend','<div data-talvt-turn-state="in_progress"><div data-chatgpt-search-message-ids="c">New answer</div></div>');
 s.getElementById('export').click();await new Promise(r=>setTimeout(r,30));await ready();
 assert.match(s.getElementById('status').textContent,/还在回答/,'turn still being written');
 w.document.querySelector('[data-talvt-turn-state="in_progress"]').setAttribute('data-talvt-turn-state','complete');
 const seen=[];new w.MutationObserver(()=>seen.push(s.getElementById('status').textContent)).observe(s.getElementById('status'),{childList:true,characterData:true,subtree:true});
 s.getElementById('export').click();await new Promise(r=>setTimeout(r,30));await ready();
 assert.ok(seen.some(t=>/对话有新内容，正在重新读取/.test(t)),seen.join(' | '));
 assert.equal(reads,2,'read again by itself');
 dom.window.close();
});
test('a chat opened while ChatGPT is answering is read by itself once the answer is finished',async()=>{
 const dom=new JSDOM('<div data-talvt-turn-state="in_progress"><div data-chatgpt-search-message-ids="b">Visible answer</div></div><form data-chatgpt-composer=""><button type="button" aria-label="Stop"></button></form>',{url:'https://chatgpt.com/c/chat',runScripts:'outside-only'}),w=dom.window;let reads=0;
 const data={title:'Test',current_node:'b',mapping:{a:{parent:null,children:['b'],message:{id:'a',author:{role:'user'},content:{parts:['Question']}}},b:{parent:'a',children:[],message:{id:'b',author:{role:'assistant'},content:{parts:['Visible answer']}}}}};
 w.fetch=async path=>{if(path!=='/api/auth/session')reads++;return {ok:true,json:async()=>path==='/api/auth/session'?{accessToken:'test'}:data};};
 w.chrome={runtime:{sendMessage:async()=>({id:1})}};
 for(const f of ['fast-text.js','settings.js','ui-kit.js','fast-content.js'])w.eval(fs.readFileSync(`extension/${f}`,'utf8'));
 const s=w.document.querySelector('[data-archive-owned]').shadowRoot;
 await new Promise(r=>setTimeout(r,300));
 assert.equal(reads,0);assert.match(s.getElementById('status').textContent,/还在回答/);
 w.document.querySelector('form').replaceChildren();w.document.querySelector('[data-talvt-turn-state]').setAttribute('data-talvt-turn-state','complete');
 for(let i=0;i<60&&!/已读取/.test(s.getElementById('status').textContent);i++)await new Promise(r=>setTimeout(r,50));
 assert.equal(reads,1);assert.match(s.getElementById('status').textContent,/已读取 2 条正文/);
 dom.window.close();
});
