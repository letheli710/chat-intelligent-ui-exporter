require('../scripts/i18n-env.cjs');
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');
const render=require('../extension/dil-render');const api=require('../extension/fast-text');
// Formats found by surveying 68 real conversations (Oct 2026). Shapes copy the
// real componentResults / content_references; values are shortened.
const exec=(code,scope)=>vm.runInNewContext(code,{...scope},{timeout:1000});
const run=(body,{results={},required=[],refs=[],widgets={}}={})=>render.evaluate({code:`DIL.render(__dil.jsx(()=>${body}))`,constants:{},appData:{opGenui:{componentResults:results}},requiredComponents:required,clientDefinedWidgets:widgets,contentReferences:refs},exec);
const md=tree=>render.segments(tree).map(s=>render.toMarkdown(s.tree)).join('\n\n');

test('Entity keeps the name in the sentence',()=>{
  const tree=run(`__dil.jsx("text",null,"课程来自 ",__dil.jsx(Entity,{"category":"organization","value":"MIT OCW","__resolutionId":"e1"}),"。")`,{results:{e1:{componentName:'Entity',status:'resolved',state:{value:'MIT OpenCourseWare (OCW)'}}},required:['Entity']});
  assert.equal(md(tree),'课程来自 MIT OpenCourseWare (OCW)。');
});
test('AsyncImage and AsyncImageGroup become Markdown images of their resolved content URLs',()=>{
  const results={a:{componentName:'AsyncImage',status:'resolved',state:{images:[{url:'https://ocw.mit.edu/x',content_url:'https://images.openai.com/one',title:'Lecture'}]}},
    g:{componentName:'AsyncImageGroup',status:'resolved',state:{images:[{url:'https://p/1',content_url:'https://images.openai.com/g1'},{url:'https://p/2',content_url:'https://images.openai.com/g2'}]}},
    f:{componentName:'AsyncImage',status:'failed',state:{}}};
  const tree=run(`__dil.jsx(__dil.Fragment,null,__dil.jsx(AsyncImage,{"query":"chalkboard","__resolutionId":"a"}),__dil.jsx(AsyncImageGroup,{"query":"boards","__resolutionId":"g"}),__dil.jsx(AsyncImage,{"query":"x","__resolutionId":"f"}))`,{results,required:['AsyncImage','AsyncImageGroup']});
  const segs=render.segments(tree);assert.ok(segs.every(s=>s.kind==='md'));
  assert.equal(md(tree),'![Lecture](https://images.openai.com/one)\n\n![boards|200](https://images.openai.com/g1) ![boards|200](https://images.openai.com/g2)');
  // Only content URLs are downloaded, never the web pages the images came from.
  assert.deepEqual(api.dilImageUrls({appData:{opGenui:{componentResults:results}}}).sort(),['https://images.openai.com/g1','https://images.openai.com/g2','https://images.openai.com/one']);
});
test('file and memory citations, quizzes and unknown widgets keep readable text',()=>{
  const results={fc:{componentName:'FileCite',status:'resolved',state:{file_name:'Lab06v5.doc'}},mc:{componentName:'MemoryCite',status:'resolved',state:{}},
    q:{componentName:'LearningQuiz',status:'resolved',state:{questions:[{prompt:'400 W 运行 2 小时产生多少电能？',options:[{value:'A',label:'8.0 kWh'},{value:'B',label:'0.8 kWh',feedback:'0.4 × 2 = 0.8 kWh。'}],correct_values:['B']}]}}};
  const tree=run(`__dil.jsx(__dil.Fragment,null,__dil.jsx("text",null,"见实验讲义",__dil.jsx(FileCite,{"ref":"turn0file0","__resolutionId":"fc"}),__dil.jsx(MemoryCite,{"__resolutionId":"mc"}),"。"),__dil.jsx(LearningQuiz,{"title":"太阳能发电量计算","__resolutionId":"q"}),__dil.jsx(JobsWidget,{"role_summary":"2027 年平台工程实习","__resolutionId":"j"}))`,{results,required:['FileCite','MemoryCite','LearningQuiz','JobsWidget']});
  const out=md(tree);
  assert.match(out,/^见实验讲义（文件：Lab06v5\.doc）。$/m);
  assert.match(out,/\*\*太阳能发电量计算\*\*\n\n1\. 400 W 运行 2 小时产生多少电能？\n\n- \( \) A\. 8\.0 kWh\n- \( \) B\. 0\.8 kWh\n\n答案：B。0\.4 × 2 = 0\.8 kWh。/);
  assert.match(out,/〔JobsWidget：2027 年平台工程实习〕/);
  assert.equal(render.segments(tree).filter(s=>s.kind==='card').length,1);
});
test('form controls are visible in cards and readable in Markdown',()=>{
  const tree=run(`__dil.jsx("box",{"border":true},__dil.jsx("form",{"gap":2},__dil.jsx("label",null,"平均电流 (mA)"),__dil.jsx("input",{"value":"","placeholder":"输入答案"}),__dil.jsx("textarea",{"rows":4,"placeholder":"写下推导"}),__dil.jsx("row",null,__dil.jsx("favicon",{"url":"https://studentaid.gov"}),__dil.jsx("spacer",null),__dil.jsx("pressable",null,__dil.jsx("text",null,"提交")))))`);
  const html=render.toHtml(tree);
  assert.match(html,/<span class="input">输入答案<\/span><span class="input input-area">写下推导<\/span>/);assert.match(html,/<div style="flex:1 1 auto"><\/div>/);
  assert.match(md(tree),/平均电流 \(mA\)［输入框：输入答案］［输入框：写下推导］/);assert.match(md(tree),/提交/);
});
test('learning blocks keep their formula and description',()=>{
  const refs=[{type:'client_defined_widget',category:'learning_block',data:{content:'I = \\frac{V}{R}',content_type:'canonical_formula',widget_type:'learning_viz'},matched_text:"Explains voltage, current, and resistance in Ohms law.\n\n初始值:\n- voltage: 12"}];
  const tree=run(`__dil.jsx(__dil.Fragment,null,__dil.jsx("text",null,"欧姆定律："),__dil.jsx("__chatgptClientDefinedWidget",{"invocationId":"w1"}))`,{refs,widgets:{w1:{status:'resolved',refIndex:0}}});
  assert.equal(md(tree),'欧姆定律：\n\n$$\nI = \\frac{V}{R}\n$$\n\nExplains voltage, current, and resistance in Ohms law.');
});
test('plain-text replies resolve old citation markers into source links',()=>{
  const text='没有得到 EA 认可。\uE200cite\uE202turn0search0\uE201 两者不同。\uE200cite\uE202turn0search0\uE202turn0search5\uE201';
  const refs=[{type:'grouped_webpages',matched_text:'\uE200cite\uE202turn0search0\uE201',items:[{title:'Privacy',url:'https://r5flowstate.org/privacy/?utm_source=chatgpt.com',attribution:'R5Flowstate'}]},
    {type:'grouped_webpages',matched_text:'\uE200cite\uE202turn0search0\uE202turn0search5\uE201',items:[{url:'https://a.example/(x)',attribution:'A'},{url:'https://b.example/',title:'B'}]},
    {type:'sources_footnote',matched_text:' ',sources:[]},{type:'hidden',matched_text:'',start_idx:0,end_idx:0}];
  const [m]=api.records([{id:'a',author:{role:'assistant'},content:{content_type:'text',parts:[text]},metadata:{content_references:refs}}]).messages;
  assert.equal(m.md,'没有得到 EA 认可。（[R5Flowstate](https://r5flowstate.org/privacy/?utm_source=chatgpt.com)） 两者不同。（[A](https://a.example/%28x%29)、[B](https://b.example/)）');
});
test('search images are fetched through the extension, other hosts through the page',async()=>{
  const seen=[],png=new Uint8Array([0x89,0x50,0x4e,0x47,13,10,26,10]);
  const files=await api.downloadUrls({urls:['https://images.openai.com/a','https://cdn.example/b.png'],fetch:async u=>{seen.push(['page',u]);return {ok:true,headers:{get:()=>'image/png'},blob:async()=>new Blob([png],{type:'image/png'})};},fetchImage:async u=>{seen.push(['ext',u]);return new Blob([png]);},prefix:'assets/ui-m-'});
  assert.deepEqual(seen,[['ext','https://images.openai.com/a'],['page','https://cdn.example/b.png']]);
  assert.deepEqual(files.map(f=>f.path),['assets/ui-m-1.png','assets/ui-m-2.png']);
});
test('map widgets become a map picture marker, then a place list with category, rating, address and links',()=>{
  const point=(name,extra={})=>({name,category:'Seafood market',address:'1 Main St, Queens, NY',description:'Live lobster tanks.',latitude:40.75,longitude:-73.87,entity:{name,rating:4.5,rating_scale:5,review_count:120,price_str:'$$',website_url:'https://shop.example/',provider_url:'https://www.yelp.com/biz/x',...extra}});
  const refs=[{type:'hidden'},{type:'client_defined_widget',category:'map',data:{fill:true,min_height:300,points:[point('Fish Market'),point('Jmart',{website_url:null,rating:3,review_count:null,price_str:null})]}}];
  const tree=run(`__dil.jsx(__dil.Fragment,null,__dil.jsx("text",null,"附近："),__dil.jsx("__chatgptClientDefinedWidget",{"invocationId":"m1"}))`,{refs,widgets:{m1:{status:'resolved',refIndex:1}}});
  const segs=render.segments(tree);assert.deepEqual(segs.map(s=>s.kind),['md']);
  assert.equal(md(tree),['附近：','','📍 地图：2 个地点','','![地图：2 个地点](map:1)','',
    '- **[Fish Market](https://shop.example/)** · Seafood market · ★4.5（120 条评价）',
    '  1 Main St, Queens, NY · [地图](https://www.google.com/maps/search/?api=1&query=40.75,-73.87)',
    '  Live lobster tanks.',
    '- **[Jmart](https://www.yelp.com/biz/x)** · Seafood market · ★3',
    '  1 Main St, Queens, NY · [地图](https://www.google.com/maps/search/?api=1&query=40.75,-73.87)',
    '  Live lobster tanks.'].join('\n'));
  assert.deepEqual(render.appBlocks({clientDefinedWidgets:{m1:{refIndex:1}}},refs),[]);
});
