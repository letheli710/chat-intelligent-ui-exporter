// A made-up conversation for the README screenshots (scripts/readme-shots.cjs): a Markdown answer,
// then an Intelligent UI card with a segmented control, a slider and a table. Nothing in it is real.
const card = `
function __dilSafe(evaluate,failureValue){try{return evaluate()}catch{return failureValue}}
DIL.render(__dil.jsx(()=>{
  const [tier,setTier]=DIL.useState("comfort",{key:"tier"});
  const [days,setDays]=DIL.useState(3,{key:"days"});
  const rates={budget:{Hotel:70,Food:35,Transport:12,Temples:10},comfort:{Hotel:160,Food:60,Transport:18,Temples:15},luxury:{Hotel:420,Food:120,Transport:45,Temples:25}}[tier];
  const rows=Object.entries(rates).map(([name,perDay])=>({name,perDay,total:perDay*days}));
  const sum=rows.reduce((n,r)=>n+r.total,0);
  return __dil.jsx(__dil.Fragment,null,
    __dil.jsx("text",null,"Here is the budget as a card you can adjust:"),
    __dil.jsx("box",{"border":true,"radius":"2xl","padding":4,"gap":3},
      __dil.jsx("row",{"align":"center","justify":"between"},
        __dil.jsx("title",{"size":"lg"},"Kyoto trip budget"),
        __dil.jsx("badge",{"color":"success"},"Estimate")),
      __dil.jsx("segmented-control",{"block":true,"value":tier,"onChange":setTier,"options":[{"label":"Budget","value":"budget"},{"label":"Comfort","value":"comfort"},{"label":"Luxury","value":"luxury"}]}),
      __dil.jsx("row",{"align":"center","justify":"between"},
        __dil.jsx("text",{"color":"secondary"},"Days"),
        __dil.jsx("text",null,__dil.jsx("bold",null,String(days)))),
      __dil.jsx("slider",{"min":1,"max":7,"step":1,"value":days,"onChange":setDays}),
      __dil.jsx("table",null,
        __dil.jsx("table-row",{"header":true},
          __dil.jsx("table-cell",{"width":"40%"},__dil.jsx("text",null,"Item")),
          __dil.jsx("table-cell",{"align":"end"},__dil.jsx("text",null,"Per day")),
          __dil.jsx("table-cell",{"align":"end"},__dil.jsx("text",null,"Total"))),
        ...rows.map(r=>__dil.jsx("table-row",{"key":r.name},
          __dil.jsx("table-cell",null,__dil.jsx("text",null,r.name)),
          __dil.jsx("table-cell",{"align":"end"},__dil.jsx("text",null,"$"+r.perDay)),
          __dil.jsx("table-cell",{"align":"end"},__dil.jsx("text",null,"$"+r.total))))),
      __dil.jsx("divider",null),
      __dil.jsx("row",{"align":"center","justify":"between"},
        __dil.jsx("text",{"weight":"medium"},"Total for "+days+" days"),
        __dil.jsx("title",{"size":"md"},"$"+sum)),
      __dil.jsx("button",{"block":true,"variant":"outline","onClick":()=>GenUI.issueNewTurn("Make a packing list for "+days+" days in Kyoto.")},"Make a packing list")));
},{"key":"body:0"}));`;
const fallback = 'Here is the budget as a card you can adjust:\n\n# Kyoto trip budget\n\nBudget · Comfort · Luxury\n\nDays: 3\n\n| Item | Per day | Total |\n|---|---|---|\n| Hotel | $160 | $480 |\n| Food | $60 | $180 |\n| Transport | $18 | $54 |\n| Temples | $15 | $45 |\n\nTotal for 3 days: $759';
const answer = `Here is a relaxed three-day plan for Kyoto.

## Day by day

| Day | Morning | Afternoon | Evening |
|---|---|---|---|
| 1 | Fushimi Inari, early to beat the crowds | Tofuku-ji and the Kamo River walk | Pontocho alley for dinner |
| 2 | Arashiyama bamboo grove | Tenryu-ji garden, then the monkey park | Onsen in Arashiyama |
| 3 | Kinkaku-ji | Philosopher's Path to Ginkaku-ji | Gion at dusk |

**Tips**

- Get an ICOCA card for buses and trains.
- Temples open around 8:30; the first hour is the quietest.
- A day pass for city buses costs **¥700**.

> Spring and autumn are the busiest seasons; book hotels a month ahead.`;
const t = 1790000000;
const msg = (id, parent, role, content, metadata = {}) => ({id, parent, children:[], message:{id, author:{role}, create_time:t, content, metadata}});
const nodes = [
  msg('u1', null, 'user', {content_type:'text', parts:['Plan a relaxed 3-day trip to Kyoto.']}),
  msg('a1', 'u1', 'assistant', {content_type:'text', parts:[answer]}),
  msg('u2', 'a1', 'user', {content_type:'text', parts:['Show the budget as a card I can adjust.']}),
  msg('a2', 'u2', 'assistant', {content_type:'text', parts:['Here is the budget as a card you can adjust:\n\n<box border radius="2xl" padding={4} gap={3}>…</box>']},
    {model_dil_v2:{code:card, constants:{}, fallbackMarkdown:fallback, fallbackMarkdownVersion:1, appData:{}}}),
];
for (let i = 0; i + 1 < nodes.length; i++) nodes[i].children = [nodes[i + 1].id];
module.exports = {title:'Kyoto trip plan', conversation_id:'readme-demo', create_time:t, update_time:t, current_node:'a2', mapping:Object.fromEntries(nodes.map(n => [n.id, n]))};
