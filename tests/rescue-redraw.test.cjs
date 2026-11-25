// 1.0.8: a card program that fails keeps what the server resolved (quizzes, search images)
// next to ChatGPT's fallback text, and card pictures that failed while the tab was in the
// background are drawn again once it is visible.
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');const {runExport}=require('../scripts/edge-harness.cjs');
const exec=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const results={
  e:{componentName:'Entity',status:'resolved',state:{value:'MIT OCW'}},
  q:{componentName:'LearningQuiz',status:'resolved',state:{title:'太阳能发电量',questions:[{prompt:'400 W 运行 2 小时产生多少电能？',options:[{value:'A',label:'8.0 kWh'},{value:'B',label:'0.8 kWh',feedback:'0.4 × 2 = 0.8 kWh。'}],correct_values:['B']}]}},
  i:{componentName:'AsyncImage',status:'resolved',state:{images:[{url:'https://p.example/1',content_url:'https://images.openai.com/one',title:'光伏板'}]}},
  f:{componentName:'AsyncImage',status:'failed',state:{}}};
const failing={code:'throw Error("boom")',constants:{},appData:{opGenui:{componentResults:results}}};
const chat=(dil,fallback='**太阳能发电量**\n\n[开始测验]')=>({conversation_id:'chat',title:'quiz',current_node:'b',mapping:{
  a:{parent:null,children:['b'],message:{id:'a',author:{role:'user'},content:{content_type:'text',parts:['出一道题']}}},
  b:{parent:'a',children:[],message:{id:'b',author:{role:'assistant'},content:{content_type:'text',parts:['']},metadata:{model_dil_v2:{...dil,fallbackMarkdown:fallback}}}}}});

test('rescued() builds quizzes and search images from the card data, without the program',()=>{
  const out=render.toMarkdown(render.rescued(failing).tree);
  assert.match(out,/1\. 400 W 运行 2 小时产生多少电能？/);assert.match(out,/B\. 0\.8 kWh/);assert.match(out,/0\.4 × 2 = 0\.8 kWh/);
  assert.match(out,/!\[光伏板\]\(https:\/\/images\.openai\.com\/one\)/);
  // Inline parts (entities) belong to sentences the program would write; they are not added alone.
  assert.doesNotMatch(out,/MIT OCW/);
  assert.ok(out.indexOf('400 W')<out.indexOf('光伏板'),'in the order of the card data');
  assert.equal(render.rescued({code:'x',appData:{opGenui:{componentResults:{e:results.e,f:results.f}}}}),null);
  assert.equal(render.rescued({code:'x'}),null);
  // What the fallback text already has is not added again (ChatGPT's fallback usually lists a LearningQuiz in full).
  assert.equal(render.rescued({...failing,fallbackMarkdown:['### 1. 400 W 运行 2 小时产生多少电能？','','- A. 8.0 kWh','- B. 0.8 kWh','','正确答案: B','解析: 0.4 × 2 = 0.8 kWh。','','![光伏板](https://images.openai.com/one)'].join('\n')}),null);
  // A fallback with the question alone still gets the whole question: options, answer and explanation.
  const alone=render.rescued({...failing,fallbackMarkdown:['### 1. 400 W 运行 2 小时产生多少电能？','','![光伏板](https://images.openai.com/one)'].join('\n')});
  const quiz=render.toMarkdown(alone.tree);
  assert.match(quiz,/400 W 运行 2 小时产生多少电能？/);assert.match(quiz,/B\. 0\.8 kWh/);assert.match(quiz,/答案：B。0\.4 × 2 = 0\.8 kWh/);
  assert.doesNotMatch(quiz,/光伏板/);
});
test('a program that fails after it rendered keeps what it rendered',()=>{
  const tree=render.evaluate({code:'DIL.render(__dil.jsx("text",null,"已渲染"));throw Error("late")'},exec);
  assert.equal(render.toMarkdown(tree),'已渲染');
  assert.throws(()=>render.evaluate({code:'throw Error("early")'},exec),/early/);
});
test('the export adds the rescued quiz after the fallback text, and says so',async()=>{
  const r=await runExport(chat(failing));
  assert.deepEqual(r.errors,[]);
  assert.match(r.md,/\*\*太阳能发电量\*\*\n\n\[开始测验\]/);
  assert.match(r.md,/400 W 运行 2 小时产生多少电能？/);assert.match(r.md,/答案：B/);
  assert.ok(r.md.indexOf('开始测验')<r.md.indexOf('400 W'),'after the fallback');
  assert.ok(r.warnings.some(w=>/^b: .*boom.*附在后面/.test(w)),r.warnings.join('\n'));
  assert.match(JSON.parse(r.files.get('ui/msg-b.json')).rescuedMarkdown,/400 W/);
  // Plain Markdown and the PDF get it too.
  const pdf=await runExport(chat(failing),{mode:'pdf'});assert.match(JSON.stringify(pdf.pdf),/400 W/);
});
test('with nothing to rescue the fallback text and the old warning stay',async()=>{
  const r=await runExport(chat({code:'throw Error("boom")',constants:{}},'只有降级文字'));
  assert.match(r.md,/只有降级文字/);
  assert.ok(r.warnings.some(w=>/^b: .*boom/.test(w)&&!/附在后面/.test(w)),r.warnings.join('\n'));
  assert.equal(JSON.parse(r.files.get('ui/msg-b.json')).rescuedMarkdown,null);
});
// The first drawing fails as in a background tab (no layout); later ones succeed.
const flaky=()=>{const calls={n:0};return {calls,snapshot:async d=>{calls.n++;const first=calls.n===1;
  return {variants:[],segments:render.segments(render.evaluate(d,exec)).map(s=>s.kind!=='card'?s:first?{...s,error:'layout'}:{...s,png:new Uint8Array([137,80,78,71]).buffer,width:600,height:400})};}};};
const cardChat=()=>chat({code:'DIL.render(__dil.jsx("card",null,__dil.jsx("text",null,"能量守恒")))',constants:{}},'能量守恒');
test('cards that failed in a background tab are drawn again once the tab is visible',async()=>{
  const {calls,snapshot}=flaky();
  const r=await runExport(cardChat(),{snapshot,visible:true});
  assert.equal(calls.n,2);
  assert.ok(r.files.has('assets/card-b-1.png'),[...r.files.keys()].join(' '));
  assert.match(r.md,/\(assets\/card-b-1\.png\)/);
  assert.ok(!r.warnings.some(w=>/layout/.test(w)),r.warnings.join('\n'));
});
test('while the tab stays hidden the card keeps its text and the warning',async()=>{
  const {calls,snapshot}=flaky();
  const r=await runExport(cardChat(),{snapshot});
  assert.equal(calls.n,1);
  assert.ok(!r.files.has('assets/card-b-1.png'));
  assert.match(r.md,/能量守恒/);
  assert.ok(r.warnings.some(w=>/^b: .*layout/.test(w)),r.warnings.join('\n'));
});
test('a message whose whole drawing timed out is drawn again too',async()=>{
  let n=0;const snapshot=async d=>{if(++n===1)throw Error('timeout');return {variants:[],segments:render.segments(render.evaluate(d,exec)).map(s=>s.kind!=='card'?s:{...s,png:new Uint8Array([137,80,78,71]).buffer,width:600,height:400})};};
  const r=await runExport(cardChat(),{snapshot,visible:true});
  assert.equal(n,2);assert.ok(r.files.has('assets/card-b-1.png'));assert.deepEqual(r.warnings,[]);
  // A program that fails is not drawn again: it would fail the same way.
  let m=0;await runExport(chat(failing),{snapshot:async()=>{m++;throw Error('boom');},visible:true});assert.equal(m,1);
});
test('after a whole drawing timed out, a redraw that reads the other states keeps them without pictures',async()=>{
  let n=0;const snapshot=async d=>{if(++n===1)throw Error('timeout');
    return {variants:[{label:'展开',md:'折叠里的细节'}],segments:render.segments(render.evaluate(d,exec)).map(s=>s.kind!=='card'?s:{...s,error:'layout'})};};
  const r=await runExport(cardChat(),{snapshot,visible:true});
  assert.ok(n>=2,String(n));assert.match(r.md,/能量守恒/);assert.match(r.md,/折叠里的细节/);
  assert.ok(r.warnings.some(w=>/^b: 卡片图像生成失败（layout）/.test(w)),r.warnings.join('\n'));
});
test('a card that keeps failing is tried at most three more times',async()=>{
  let n=0;const snapshot=async d=>{n++;return {variants:[],segments:render.segments(render.evaluate(d,exec)).map(s=>s.kind!=='card'?s:{...s,error:'layout'})};};
  const r=await runExport(cardChat(),{snapshot,visible:true});
  assert.ok(n>=2&&n<=4,String(n));
  assert.ok(r.warnings.some(w=>/^b: .*layout/.test(w)),r.warnings.join('\n'));
});
// The quiz of the molecular-dynamics reply (GPT-6.2, 11-24): built in the code, so the fallback
// text has only its title, "/ 3 正确" and the button. Shortened to two questions.
const builtQuiz={constants:{},fallbackMarkdown:'温度越高，**平均动能**越大，压强也随之变化。\n\n## 🧪 实验小测验\n\n/ 2 正确\n\n[重新测试]',
  code:'const questions=[{q:"如果将温度从 200 K 提高到 800 K，方均根速率会变为原来的多少倍？",options:["1 倍","2 倍","4 倍","16 倍"],answer:1,why:"方均根速率与绝对温度的平方根成正比，因此 √(800/200) = 2。"},{q:"保持温度和容器大小不变，将粒子数量增加一倍，哪项基本保持不变？",options:["总动能","压强","平均动能"],answer:2,why:"平均动能由温度决定，与系统包含多少个粒子无直接关系。"}];\nthrow Error("boom");DIL.render(__dil.jsx("card",{"size":"md","className":"quiz-card"},__dil.jsx("title",null,"🧪 实验小测验"),`${score} / 2 正确`,__dil.jsx("button",{"variant":"secondary"},"重新测试")))'};
test('text written in the program comes back: questions, their options and explanations',()=>{
  const r=render.rescued(builtQuiz);assert.equal(r.tree,null);
  assert.deepEqual(r.words,['如果将温度从 200 K 提高到 800 K，方均根速率会变为原来的多少倍？','1 倍','2 倍','4 倍','16 倍','方均根速率与绝对温度的平方根成正比，因此 √(800/200) = 2。',
    '保持温度和容器大小不变，将粒子数量增加一倍，哪项基本保持不变？','总动能','压强','平均动能','平均动能由温度决定，与系统包含多少个粒子无直接关系。']);
});
test('only words are read from the code: no property names, styles or non-text properties',()=>{
  const r=render.rescued({fallbackMarkdown:'',code:'__dil.jsx("box",{"background":"rgba(0,0,0,.1)","padding":"12px 16px","className":"a b","id":"一号","subjectCategory":"solar energy"},"这是一段正文，说明实验的目的和步骤。",__dil.jsx("text",{"title":"Long English title here"},"x"))'});
  assert.deepEqual(r.words,['这是一段正文，说明实验的目的和步骤。','Long English title here']);
  // A fallback that writes "|" as an entity still counts as having the text.
  assert.equal(render.rescued({fallbackMarkdown:'## 01 &#124; 太阳能是如何转化为电能的？',code:'x("01 | 太阳能是如何转化为电能的？")'}),null);
});
test('the export folds what the fallback leaves out under it',async()=>{
  const r=await runExport(chat(builtQuiz,builtQuiz.fallbackMarkdown));
  assert.deepEqual(r.errors,[]);
  assert.match(r.md,/\[重新测试\]\n\n> \[!note\]- 卡片没能画出来，以下是上文里没有的卡片内容\n> - 如果将温度从 200 K/);
  assert.match(r.md,/> - 16 倍\n/);
  assert.ok(r.warnings.some(w=>/^b: .*boom.*附在后面/.test(w)),r.warnings.join('\n'));
});
// Review fixes before the 1.0.8 release.
test('recovery never stops reading: malformed character codes are replaced, not thrown',async()=>{
  const BS=String.fromCharCode(92);
  assert.doesNotThrow(()=>render.rescued({code:'x("a")',fallbackMarkdown:'a &#99999999; &#x110000; b'}));
  assert.doesNotThrow(()=>render.rescued({code:`x("${BS}u{110000}文字说明内容")`,fallbackMarkdown:''}));
  // An unclosed \u{ is read as the letter u and the scan goes on.
  assert.deepEqual(render.rescued({code:`x("${BS}u{12");y("这是一段后面的正文内容。")`,fallbackMarkdown:''}).words,['这是一段后面的正文内容。']);
  const r=await runExport(chat({code:'throw Error("boom")',constants:{}},'降级文字 &#99999999; 还在'));
  assert.deepEqual(r.errors,[]);assert.match(r.md,/降级文字 &#99999999; 还在/);
  assert.ok(r.warnings.some(w=>/^b: .*boom/.test(w)),r.warnings.join('\n'));
});
test('a message whose drawing keeps failing as a whole says its pictures are missing',async()=>{
  const snapshot=async()=>{throw Error('timeout');};
  for(const visible of [true,false]){
    const r=await runExport(cardChat(),{snapshot,visible});
    assert.ok(!r.files.has('assets/card-b-1.png'));assert.match(r.md,/能量守恒/);
    assert.ok(r.warnings.some(w=>/^b: 卡片图像生成失败（timeout）/.test(w)),r.warnings.join('\n'));
  }
  // Only exports with card pictures say it; a message with no cards says nothing.
  const plain=await runExport(chat({code:'DIL.render(__dil.jsx("text",null,"只有文字"))',constants:{}},'只有文字'),{snapshot,visible:true});
  assert.deepEqual(plain.warnings,[]);
  const html=await runExport(cardChat(),{snapshot,html:'single'});
  assert.ok(!html.warnings.some(w=>/卡片图像生成失败/.test(w)),html.warnings.join('\n'));
});
test('every picture any try drew is kept',async()=>{
  // Two cards: the first try draws only A, the next only B; both end up in the archive.
  const ab={code:'DIL.render(__dil.jsx(__dil.Fragment,null,__dil.jsx("card",null,__dil.jsx("text",null,"甲卡片")),__dil.jsx("text",null,"中间的文字"),__dil.jsx("card",null,__dil.jsx("text",null,"乙卡片"))))',constants:{}};
  let n=0;const snapshot=async d=>{n++;let k=0;return {variants:[],segments:render.segments(render.evaluate(d,exec)).map(s=>{if(s.kind!=='card')return s;k++;
    return (n===1?k===1:k===2)?{...s,png:new Uint8Array([137,80,78,71]).buffer,width:600,height:400}:{...s,error:'layout'};})};};
  const r=await runExport(chat(ab,'甲卡片 乙卡片'),{snapshot,visible:true});
  assert.equal(n,2);
  assert.ok(r.files.has('assets/card-b-1.png')&&r.files.has('assets/card-b-2.png'),[...r.files.keys()].join(' '));
  assert.deepEqual(r.warnings,[]);
});
test('a cleared date stays a date input in the HTML export',()=>{
  const live={handlers:[],refs:[],get:(k,v)=>v,set:()=>{}};
  const tree=render.evaluate({code:'const [d,setD]=DIL.useState("",{key:"d"});DIL.render(__dil.jsx("date-picker",{"value":d,"onChange":setD}))'},exec,{live});
  assert.match(render.toHtml(tree,{live:true}),/<input type="date" class="input date-input" value="" data-on="0"\/>/);
});
// Second review before the 1.0.8 release.
const shapes={code:'DIL.render(__dil.jsx("card",null,__dil.jsx("box",{"background":"#e33","width":"40px","height":"40px"}),__dil.jsx("box",{"background":"#33e","width":"40px","height":"40px"})))',constants:{}};
test('a card with no text at all keeps its picture and its working card',async()=>{
  const z=await runExport(chat(shapes,'（图形）'));
  assert.ok(z.files.has('assets/card-b-1.png'),[...z.files.keys()].join(' '));
  assert.match(z.md,/!\[[^\]]*\]\(assets\/card-b-1\.png\)/);assert.deepEqual(z.warnings,[]);
  const h=await runExport(chat(shapes,'（图形）'),{html:'single'});
  assert.match(h.html,/#e33/);assert.doesNotMatch(h.html,/（图形）/);
  // With no picture either, nothing would be left: ChatGPT's fallback text stands in, and the note says why.
  const none=await runExport(chat(shapes,'（图形）'),{snapshot:async()=>{throw Error('timeout');}});
  assert.match(none.md,/（图形）/);assert.ok(none.warnings.some(w=>/^b: 卡片图像生成失败（timeout）/.test(w)),none.warnings.join('\n'));
});
test('a redraw never gives one card another card\'s picture',async()=>{
  // The program orders its cards differently each run: A, B, then B, A. Each run draws one of them.
  let run=0;const swap={code:'const first=DIL.useConstants().flip?"乙":"甲",second=first==="甲"?"乙":"甲";DIL.render(__dil.jsx(__dil.Fragment,null,__dil.jsx("card",null,__dil.jsx("text",null,"卡片"+first)),__dil.jsx("text",null,"中间的文字"),__dil.jsx("card",null,__dil.jsx("text",null,"卡片"+second))))',constants:{}};
  const snapshot=async d=>{run++;const t=render.evaluate({...d,constants:{flip:run>1}},exec);let k=0;
    return {variants:[],segments:render.segments(t).map(s=>{if(s.kind!=='card')return s;k++;return (run===1?k===1:k===2)?{...s,png:new Uint8Array([137,80,78,71]).buffer,width:600,height:400}:{...s,error:'layout'};})};};
  const r=await runExport(chat(swap,'卡片甲 卡片乙'),{snapshot,visible:true});
  assert.deepEqual([...r.files.keys()].filter(f=>f.startsWith('assets/card-')),['assets/card-b-1.png']);
  // The one picture sits with card A, the card it shows; card B keeps its text and is reported.
  assert.match(r.md,/card-b-1\.png\)\n\n> \[!note\]- 卡片文字\n> 卡片甲/);assert.match(r.md,/\n卡片乙\n/);
  assert.ok(r.warnings.some(w=>/^b: 卡片图像生成失败（layout）/.test(w)),r.warnings.join('\n'));
});
test('when only the pictures fail, the HTML export keeps the working cards',async()=>{
  const date={code:'const [d,setD]=DIL.useState("2026-11-24",{key:"d"});DIL.render(__dil.jsx("card",null,__dil.jsx("date-picker",{"value":d,"onChange":setD})))',constants:{}};
  const snapshot=async()=>{throw Error('timeout');};
  const h=await runExport(chat(date,'日期'),{html:'single',snapshot});
  assert.match(h.html,/type="date"/);
  const z=await runExport(chat(date,'日期'),{snapshot});
  assert.match(z.md,/2026-11-24/);assert.ok(z.warnings.some(w=>/^b: 卡片图像生成失败（timeout）/.test(w)),z.warnings.join('\n'));
});
test('several cards without pictures in one message make one note',async()=>{
  const two={code:'DIL.render(__dil.jsx(__dil.Fragment,null,__dil.jsx("card",null,__dil.jsx("text",null,"第一张")),__dil.jsx("text",null,"中间的文字"),__dil.jsx("card",null,__dil.jsx("text",null,"第二张"))))',constants:{}};
  const r=await runExport(chat(two,'x'),{snapshot:async d=>({variants:[],segments:render.segments(render.evaluate(d,exec)).map(s=>s.kind==='card'?{...s,error:'layout'}:s)})});
  assert.deepEqual(r.warnings.filter(w=>/^b: /.test(w)),['b: 2 张卡片图像生成失败（layout），已保留文字']);
  assert.match(r.md,/第一张/);assert.match(r.md,/第二张/);
});
test('a quiz listed with its options but not its explanation gets the answer line',()=>{
  const r=render.rescued({...failing,fallbackMarkdown:['### 1. 400 W 运行 2 小时产生多少电能？','','- A. 8.0 kWh','- B. 0.8 kWh','','![光伏板](https://images.openai.com/one)'].join('\n')});
  // Named by the option's text, not its letter: the fallback may letter the options in another order.
  assert.equal(render.toMarkdown(r.tree),'400 W 运行 2 小时产生多少电能？\n\n答案：0.8 kWh。0.4 × 2 = 0.8 kWh。');
  assert.equal(render.rescued({...failing,fallbackMarkdown:['### 1. 400 W 运行 2 小时产生多少电能？','- A. 8.0 kWh','- B. 0.8 kWh','正确答案: B','解析: 0.4 × 2 = 0.8 kWh。','![光伏板](https://images.openai.com/one)'].join('\n')}),null);
});
