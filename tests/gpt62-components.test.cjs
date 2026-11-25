// Components and props GPT-6.2 started to write (seen 2026-11-24, none of them in the GPT-6
// fixtures). The cards below are cut down from real GPT-6.2 answers ("组件交互测试",
// "绘制水循环示意图", a budget card whose expanded section holds a formula and code).
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');require('../scripts/i18n-env.cjs');
const render=require('../extension/dil-render');
const exec=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
// A card from its body: C["n"] are the constants, S(...) a state with its key.
const card=(body,constants={},states='')=>({constants,code:`DIL.render(__dil.jsx(()=>{const C=DIL.useConstants();${states}return ${body}},{}))`});
const tree=dil=>render.evaluate(dil,exec);
const md=dil=>render.toMarkdown(tree(dil));
const html=dil=>render.toHtml(tree(dil));

test('date-picker keeps its date in Markdown and in the card image',()=>{
  const dil=card('__dil.jsx("box",null,__dil.jsx("label",null,C["0"]),__dil.jsx("date-picker",{"block":true,"value":date,"onChange":setDate,"clearable":true}))',{0:'日期选择 Date Picker'},'const [date,setDate]=DIL.useState("2026-11-24",{key:"date"});');
  assert.match(md(dil),/日期选择 Date Picker\s*［日期：2026-11-24］/);
  assert.match(html(dil),/<span class="select date"[^>]*>.*2026-11-24.*<\/span>/);
  // A range, and an empty picker that shows its placeholder.
  assert.match(md(card('__dil.jsx("date-picker",{"value":{"start":"2026-12-01","end":"2026-12-05"}})')),/2026-12-01 – 2026-12-05/);
  assert.match(md(card('__dil.jsx("date-picker",{"value":null,"placeholder":"选择日期"})')),/［日期：选择日期］/);
});
test('date-picker in the HTML export is a working date input',()=>{
  const live={handlers:[],refs:[],get:(k,v)=>v,set:()=>{}};
  const t=render.evaluate(card('__dil.jsx("date-picker",{"value":date,"onChange":setDate})',{},'const [date,setDate]=DIL.useState("2026-11-24",{key:"date"});'),exec,{live});
  assert.match(render.toHtml(t,{live:true}),/<input type="date" class="input date-input" value="2026-11-24" data-on="0"\/>/);
});
test('box size draws the legend dot as a square',()=>{
  const out=html(card('__dil.jsx("row",{"align":"center","gap":1},__dil.jsx("box",{"background":"#1479ce","size":"10px","radius":"full"}),__dil.jsx("caption",null,C["0"]))',{0:'水分迁移'}));
  assert.match(out,/<div class="box"[^>]*style="[^"]*width:10px;height:10px[^"]*background:#1479ce/);
  // A number is pixels, as for width and height; a card's size="md" is not a length.
  assert.match(html(card('__dil.jsx("box",{"size":12,"background":"#000"})')),/width:12px;height:12px/);
  assert.doesNotMatch(html(card('__dil.jsx("card",{"size":"md"},C["0"])',{0:'x'})),/width/);
});
test('carousel shows its items side by side at their width, not stacked',()=>{
  const item=n=>`__dil.jsx("carousel-item",{"width":"200px","gap":2},__dil.jsx("text",null,__dil.jsx("bold",null,C["${n}"])))`;
  const out=html(card(`__dil.jsx("carousel",{"activeIndex":0,"showArrows":true,"visibleItems":2},${item(0)},${item(1)},${item(2)})`,{0:'Architecture',1:'Technology',2:'Nature'}));
  assert.match(out,/^<div class="carousel"[^>]*>(<div class="carousel-item" style="width:200px;gap:8px">.*?<\/div>){3}<\/div>$/);
  assert.match(md(card(`__dil.jsx("carousel",null,${item(0)},${item(1)})`,{0:'Architecture',1:'Technology'})),/Architecture[\s\S]*Technology/);
});
test('flow is a grid whose items span columns and keep their ratio',()=>{
  const out=html(card('__dil.jsx("flow",{"columns":3,"gap":2},__dil.jsx("flow-item",{"span":2,"aspectRatio":"2:1","background":"surface-secondary","radius":"lg","align":"center","justify":"center"},__dil.jsx("text",null,C["0"])),__dil.jsx("flow-item",{"background":"surface-tertiary"},__dil.jsx("text",null,C["1"])))',{0:'Bento 大区块',1:'小区块 A'}));
  assert.match(out,/^<div class="grid flow" style="gap:8px;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)">/);
  assert.match(out,/<div class="grid-item" style="[^"]*grid-column:span 2;aspect-ratio:2\/1[^"]*">/);
  assert.match(out,/<div class="grid-item" style="background:#f3f3f3">/);
});
test('underline and highlighted text are drawn as such; Markdown keeps the words',()=>{
  const dil=card('__dil.jsx("box",null,__dil.jsx("text",null,__dil.jsx("underline",null,C["0"])),__dil.jsx("text",{"highlight":true},C["1"]))',{0:'下划线',1:'高亮文本'});
  assert.match(html(dil),/<u>下划线<\/u>/);assert.match(html(dil),/<mark>高亮文本<\/mark>/);
  assert.equal(md(dil),'下划线\n\n高亮文本');
});
test('slider marks (tick labels under the slider) are kept',()=>{
  const dil=card('__dil.jsx("slider",{"min":3,"max":10,"step":1,"value":5,"marks":C["0"]})',{0:[{value:3,label:'3天'},{value:5,label:'5天'},{value:7,label:'7天'},{value:10,label:'10天'}]});
  assert.equal(md(dil),'滑块：5（3–10）· 3天 / 5天 / 7天 / 10天');
  const out=html(dil);
  assert.match(out,/<div class="slider-marks"><span style="left:0\.00%;transform:none">3天<\/span><span style="left:28\.57%[^"]*">5天<\/span><span style="left:57\.14%[^"]*">7天<\/span><span style="left:100\.00%;transform:translateX\(-100%\)">10天<\/span><\/div>/);
  const live={handlers:[],refs:[],get:(k,v)=>v,set:()=>{}};
  assert.match(render.toHtml(render.evaluate(dil,exec,{live}),{live:true}),/<input type="range"[^>]*\/><div class="slider-marks">/);
});
test('a table cell spanning columns keeps the next cell in its own column',()=>{
  const cell=(x,p='null')=>`__dil.jsx("table-cell",${p},C["${x}"])`;
  const dil=card(`__dil.jsx("table",null,__dil.jsx("table-row",null,${cell(0,'{"header":true}')},${cell(1,'{"header":true}')},${cell(2,'{"header":true}')},${cell(3,'{"header":true}')}),__dil.jsx("table-row",null,${cell(4)},${cell(5)},${cell(6)},${cell(7)}),__dil.jsx("table-row",null,${cell(8,'{"colSpan":3}')},${cell(9,'{"align":"end"}')}))`,
    {0:'项目',1:'单价',2:'数量',3:'小计',4:'住宿',5:'¥14,000',6:'4 晚',7:'¥56,000',8:'总计',9:'¥134,750'});
  assert.match(md(dil),/\n\| 总计 \|  \|  \| ¥134,750 \|$/);
  assert.match(html(dil),/<td colspan="3">.*?总计.*?<\/td><td style="text-align:right">/);
});
test('other states: a long dropdown does not use up the tries, and each control keeps its own options',()=>{
  // From a GPT-6.2 city table: a country dropdown with many options comes before a chart-mode
  // switch; the switch's other mode (with its own caption) was never tried. Two dropdowns both
  // start at "all", and the country state was tried with the climate options.
  const countries=Array.from({length:20},(_,i)=>`{"label":"国${i}","value":"c${i}"}`).join(',');
  const dil=card(`__dil.jsx("box",null,__dil.jsx("select",{"value":country,"onChange":setCountry,"options":[{"label":"全部国家","value":"all"},${countries}]}),__dil.jsx("select",{"value":climate,"onChange":setClimate,"options":[{"label":"全部气候","value":"all"},{"label":"温带","value":"temperate"}]}),__dil.jsx("segmented-control",{"value":mode,"onChange":setMode,"options":[{"label":"分布","value":"hist"},{"label":"排名","value":"rank"}]}),__dil.jsx("text",null,"国家 "+country+" · 气候 "+climate),mode==="hist"?__dil.jsx("caption",null,C["0"]):__dil.jsx("caption",null,C["1"]))`,
    {0:'GDP 分布直方图。',1:'当前筛选结果中 GDP 最高的 10 座城市。'},'const [country,setCountry]=DIL.useState("all",{key:"country"});const [climate,setClimate]=DIL.useState("all",{key:"climate"});const [mode,setMode]=DIL.useState("hist",{key:"mode"});');
  const v=render.stateVariants(dil,exec);
  assert.ok(v.some(x=>x.key==='mode'&&/GDP 最高的 10 座城市/.test(x.md)),'the chart mode is tried');
  assert.ok(v.some(x=>x.key==='climate'&&x.value==='temperate'));
  assert.ok(!v.some(x=>x.key==='country'&&x.value==='temperate'),'country is not tried with the climate options');
});
test('other states: two dropdowns at the same value with inline handlers each get their own options',()=>{
  const dil=card('__dil.jsx("box",null,__dil.jsx("select",{"value":country,"onChange":(v)=>{setCountry(v)},"options":[{"label":"全部国家","value":"all"},{"label":"美国","value":"us"}]}),__dil.jsx("select",{"value":climate,"onChange":(v)=>{setClimate(v)},"options":[{"label":"全部气候","value":"all"},{"label":"温带","value":"temperate"}]}),__dil.jsx("text",null,"国家 "+country+" · 气候 "+climate))',
    {},'const [country,setCountry]=DIL.useState("all",{key:"country"});const [climate,setClimate]=DIL.useState("all",{key:"climate"});');
  assert.deepEqual(render.stateVariants(dil,exec).map(v=>`${v.key}=${v.value}`),['country=us','climate=temperate']);
});
test('other states keep a block formula and a code block whole',()=>{
  // The expanded section repeats lines the code and the formulas share ("$$", ");"), which
  // line-by-line de-duplication used to drop, turning "[b](c)" into a link and breaking the code.
  const dil=card('__dil.jsx("box",null,__dil.jsx("text",null,C["0"]),open?__dil.jsx("box",null,__dil.jsx("math",{"block":true,"value":C["1"]}),__dil.jsx("math",{"block":true,"value":C["2"]}),__dil.jsx("code-block",{"language":"js","value":C["3"]})):null)',
    {0:'总是显示',1:'T=N[H(D-1)+DV+F](1+r)',2:'x=1',3:'f(\n  1\n);\ng(\n  2\n);'},'const [open]=DIL.useState(false,{key:"open"});');
  const [v]=render.stateVariants(dil,exec);
  assert.equal(v.md,'$$\nT=N[H(D-1)+DV+F](1+r)\n$$\n\n$$\nx=1\n$$\n\n```js\nf(\n  1\n);\ng(\n  2\n);\n```');
});
test('other states: changed table rows stay a table under the header',()=>{
  const row=(a,b)=>`__dil.jsx("table-row",null,__dil.jsx("table-cell",null,${a}),__dil.jsx("table-cell",null,${b}))`;
  const dil=card(`__dil.jsx("table",null,__dil.jsx("table-row",null,__dil.jsx("table-cell",{"header":true},C["0"]),__dil.jsx("table-cell",{"header":true},C["1"])),${row('C["2"]','C["3"]')},${row('C["4"]','tier==="a"?C["5"]:C["6"]')})`,
    {0:'项目',1:'小计',2:'交通',3:'¥6,000',4:'住宿',5:'¥18,000',6:'¥56,000'},'const [tier]=DIL.useState("a",{key:"tier"});');
  const t=render.evaluate(dil,exec);assert.match(render.toMarkdown(t),/\| 住宿 \| ¥18,000 \|/);
  // No control offers another value for "tier" here, so make one: a select bound to it.
  const withSelect=card(dil.code.slice(dil.code.indexOf('return ')+7,dil.code.lastIndexOf('},{}))')).replace(/^__dil\.jsx\("table"/,'__dil.jsx("box",null,__dil.jsx("select",{"value":tier,"options":[{"label":"A","value":"a"},{"label":"B","value":"b"}]}),__dil.jsx("table"')+')',dil.constants,'const [tier]=DIL.useState("a",{key:"tier"});');
  const [v]=render.stateVariants(withSelect,exec);
  assert.equal(v.md,'| 项目 | 小计 |\n| --- | --- |\n| 住宿 | ¥56,000 |');
});
test('other states: a table without a header row still shows a change in its first row',()=>{
  // With no header cell the first row is written as the header; when only that row changes it must not be lost.
  const dil=card('__dil.jsx("box",null,__dil.jsx("select",{"value":plan,"options":[{"label":"A","value":"a"},{"label":"B","value":"b"}]}),__dil.jsx("table",null,__dil.jsx("table-row",null,__dil.jsx("table-cell",null,C["0"]),__dil.jsx("table-cell",null,plan==="a"?C["1"]:C["2"])),__dil.jsx("table-row",null,__dil.jsx("table-cell",null,C["3"]),__dil.jsx("table-cell",null,C["4"]))))',
    {0:'每日负载',1:'0.36 kWh',2:'0.48 kWh',3:'续航',4:'3 天'},'const [plan]=DIL.useState("a",{key:"plan"});');
  const [v]=render.stateVariants(dil,exec);
  assert.equal(v.md,'| 每日负载 | 0.48 kWh |\n| --- | --- |');
});
