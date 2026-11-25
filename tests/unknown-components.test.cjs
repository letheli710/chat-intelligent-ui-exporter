// Components ChatGPT may add after this renderer was written. Their words must reach the
// Markdown, the card image and the HTML export, and the export must say which ones it did not know.
// (Simulated on the real quiz card of 2026-11-24: radio renamed, or its text moved into a prop.)
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');
const exec=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const card=(body,constants={},states='')=>({constants,code:`DIL.render(__dil.jsx(()=>{const C=DIL.useConstants();${states}return ${body}},{}))`});
const tree=dil=>render.evaluate(dil,exec);
const md=dil=>render.toMarkdown(tree(dil));
const html=(dil,opts)=>render.toHtml(tree(dil),opts);
// Option values are selection keys ("0", "1", …), as in the real card; they are not text.
const quiz=option=>card(`__dil.jsx("card",null,__dil.jsx("text",{"weight":"semibold"},C["0"]),__dil.jsx("radio-group",{"direction":"col","value":"0"},${[1,2,3].map(i=>option(i,i-1)).join(',')}))`,{0:'1. 温度提高到 4 倍，方均根速率变为多少倍？',1:'A. 1 倍',2:'B. 2 倍',3:'C. 4 倍'});
const options=out=>out.split('\n').filter(l=>/^- \(/.test(l));

test('an unknown component inside a radio group keeps its option text',()=>{
  const dil=quiz((i,v)=>`__dil.jsx("choice-chip",{"value":"${v}"},C["${i}"])`);
  // The selected one is still marked, as for a radio, and the value is not printed.
  assert.deepEqual(options(md(dil)),['- (•) A. 1 倍','- ( ) B. 2 倍','- ( ) C. 4 倍']);
  // Drawn as radios (one selected), in the card image and as working radios in the HTML export.
  const picture=html(dil);assert.equal(picture.match(/class="rb[ "]/g).length,3);assert.equal(picture.match(/rb-dot/g).length,1);
  assert.equal(html(dil,{live:true}).match(/role="radio"/g).length,3);
});
test('an unknown component whose text is only in its props keeps that text everywhere',()=>{
  const dil=quiz((i,v)=>`__dil.jsx("choice",{"value":"${v}","label":C["${i}"]})`);
  assert.deepEqual(options(md(dil)),['- (•) A. 1 倍','- ( ) B. 2 倍','- ( ) C. 4 倍']);
  const picture=html(dil),live=html(dil,{live:true});
  for(const o of ['A. 1 倍','B. 2 倍','C. 4 倍']){assert.ok(picture.includes(o),`card image: ${o}`);assert.ok(live.includes(o),`HTML export: ${o}`);}
  assert.equal(picture.match(/class="rb[ "]/g).length,3);
});
test('a stat-like component shows its label and value, not its styling props',()=>{
  const dil=card('__dil.jsx("box",null,__dil.jsx("stat",{"label":C["0"],"value":4.14,"unit":"×10⁻²¹ J","color":"success","variant":"outline","size":"lg","icon":"zap","id":"ke","href":"https://example.com/x","trend":"up","onPress":()=>1}))',{0:'平均动能'});
  const out=md(dil);
  assert.match(out,/平均动能 · 4\.14 · ×10⁻²¹ J/);
  for(const style of ['success','outline','lg','zap','ke','example.com','up'])assert.ok(!out.includes(style),`style prop "${style}" leaked into\n${out}`);
  const picture=html(dil);assert.match(picture,/平均动能/);assert.match(picture,/4\.14/);
});
test('card markup with unknown components stays well-formed XHTML (the image is drawn from it)',()=>{
  const {JSDOM}=require('jsdom'),w=new JSDOM().window;
  const t=tree(card('__dil.jsx("Fragment",null,__dil.jsx("stat",{"label":"<b>&","items":["x < y","a & b"]}),__dil.jsx("table",null,__dil.jsx("table-row",null,__dil.jsx("table-cell",null,"a"),__dil.jsx("metric-cell",{"value":"12"})),__dil.jsx("summary-row",{"label":"合计 & 总数"})),__dil.jsx("text",null,"x",__dil.jsx("inline-tag",{"label":"新"})))'));
  const doc=new w.DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${render.toHtml(t)}</div>`,'application/xml');
  assert.equal(doc.getElementsByTagName('parsererror').length,0);
  const text=doc.documentElement.textContent;for(const s of ['<b>&','x < y','a & b','12','合计 & 总数','新'])assert.ok(text.includes(s),s);
});
test('words in other props are kept; colors, URLs and single code words are not',()=>{
  const out=md(card('__dil.jsx("hero-banner",{"headline":C["0"],"tagline":"Fast & safe","accent":"#ff8800","background":"rgb(1,2,3)","layout":"split","link":"https://x.example/a b","count":3})',{0:'春季学期课程表'}));
  assert.match(out,/春季学期课程表/);assert.match(out,/Fast & safe/);
  for(const no of ['#ff8800','rgb(','split','x.example'])assert.ok(!out.includes(no),`"${no}" in\n${out}`);
});
test('list props of an unknown component become text',()=>{
  const out=md(card('__dil.jsx("timeline",{"title":C["0"],"items":[{"label":"立项","date":"3 月"},{"label":"上线","date":"6 月"}],"tags":["物理","热学"]})',{0:'项目里程碑'}));
  for(const w of ['项目里程碑','立项','3 月','上线','6 月','物理','热学'])assert.ok(out.includes(w),`${w} in\n${out}`);
});
test('text that repeats the children is not written twice',()=>{
  const out=md(card('__dil.jsx("pill",{"label":C["0"]},C["0"])',{0:'进行中'}));
  assert.equal(out.match(/进行中/g).length,1,out);
});
test('unknown rows, cells and list items keep their text',()=>{
  const out=md(card('__dil.jsx("Fragment",null,__dil.jsx("table",null,__dil.jsx("table-row",null,__dil.jsx("table-cell",{"header":true},C["0"]),__dil.jsx("table-cell",{"header":true},C["1"])),__dil.jsx("table-row",null,__dil.jsx("table-cell",null,C["2"]),__dil.jsx("metric-cell",{"value":C["3"]})),__dil.jsx("summary-row",null,__dil.jsx("table-cell",null,C["4"]),__dil.jsx("table-cell",null,C["5"]))),__dil.jsx("list",null,__dil.jsx("list-item",null,C["6"]),__dil.jsx("check-item",{"label":C["7"]})))',{0:'项目',1:'金额',2:'房租',3:'3200',4:'合计',5:'5400',6:'第一项',7:'第二项'}));
  for(const w of ['房租','3200','合计','5400','第一项','第二项'])assert.ok(out.includes(w),`${w} in\n${out}`);
  assert.match(out,/\| 房租 \| 3200 \|/);assert.match(out,/\| 合计 \| 5400 \|/);assert.match(out,/- 第二项/);
});
test('known components render exactly as before',()=>{
  // Normal cards must not gain prop text: a slider's value, a select's options and a badge's color stay as they were.
  const dil=card('__dil.jsx("card",{"title":"hidden-prop"},__dil.jsx("title",{"size":"md"},C["0"]),__dil.jsx("badge",{"color":"success"},C["1"]),__dil.jsx("button",{"label":"x-label"},C["2"]),__dil.jsx("label",{"value":"y-value"},C["3"]))',{0:'标题',1:'完成',2:'提交',3:'备注'});
  const out=md(dil),picture=html(dil);
  for(const no of ['hidden-prop','x-label','y-value']){assert.ok(!out.includes(no),`${no} in Markdown`);assert.ok(!picture.includes(no),`${no} in image`);}
});
test('unknownComponents lists the names the renderer does not know, once each',()=>{
  const t=tree(card('__dil.jsx("Fragment",null,__dil.jsx("card",null,__dil.jsx("stat",{"label":"a"}),__dil.jsx("stat",{"label":"b"}),__dil.jsx("label",null,"c"),__dil.jsx("popover",null,__dil.jsx("popover-trigger",null,"d"),__dil.jsx("popover-content",null,"e"))),__dil.jsx("svg",null,__dil.jsx("animateMotion",null)),__dil.jsx("choice-chip",null,"f"))'));
  assert.deepEqual(render.unknownComponents(t),['choice-chip','stat']);
  assert.deepEqual(render.unknownComponents([t,t]),['choice-chip','stat']);
  assert.deepEqual(render.unknownComponents(null),[]);
});
test('a real GPT-6.2 card uses only known components',()=>{
  const fs=require('node:fs'),path=require('node:path');const dir=path.join(__dirname,'fixtures');let checked=0;
  const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);if(e.isDirectory())walk(f);else if(/^msg-.*\.json$/.test(e.name)){const j=JSON.parse(fs.readFileSync(f,'utf8'));if(!j.dil?.code)continue;
    let t;try{t=render.evaluate({...j.dil,contentReferences:j.contentReferences},exec);}catch{continue;}checked++;assert.deepEqual(render.unknownComponents(t),[],f);}}};
  walk(dir);assert.ok(checked>0,'fixtures with cards');
});
test('the export names the components it did not know',async()=>{
  const {runExport}=require('../scripts/edge-harness.cjs');
  const dil=quiz((i,v)=>`__dil.jsx("choice",{"value":"${v}","label":C["${i}"]})`);
  const raw={conversation_id:'chat',title:'quiz',current_node:'b',mapping:{
    a:{parent:null,children:['b'],message:{id:'a',author:{role:'user'},content:{content_type:'text',parts:['出一道题']}}},
    b:{parent:'a',children:[],message:{id:'b',author:{role:'assistant'},content:{content_type:'text',parts:['']},metadata:{model_dil_v2:{...dil,fallbackMarkdown:'quiz'}}}}}};
  const r=await runExport(raw);
  assert.deepEqual(r.errors,[]);
  assert.ok(r.warnings.some(w=>/^b: .*choice/.test(w)),r.warnings.join('\n'));
  assert.match(r.md,/B\. 2 倍/);
  const plain=await runExport(raw,{mode:'pdf'});assert.ok(plain.status.length>0);
  const ui=JSON.parse(r.files.get('ui/msg-b.json'));assert.deepEqual(ui.unknownComponents,['choice']);
});
