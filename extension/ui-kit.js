// The look and the settings rows shared by the sidebar (in the page's Shadow DOM), the toolbar
// panel and the settings tab: Material 3 shapes in the Morandi palette (design/panel-spec.md 8.4).
// The settings are drawn once; a change updates only the control, its row and the group's
// summary line, so the panel neither jumps to the top nor loses focus.
(root => {
  const S=root.ChatExportSettings||(typeof module!=='undefined'?require('./settings.js'):null);
  const I18n=root.ChatExportI18n||(typeof module!=='undefined'?require('./i18n.js'):null),t=I18n.t;
  const ICONS={
    list:'<path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>',
    chev:'<path d="m6 9 6 6 6-6"/>',
    archive:'<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    file:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    code:'<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    printer:'<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    gem:'<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
    gear:'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    refresh:'<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    ext:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    check:'<path d="M20 6 9 17l-5-5"/>',
    back:'<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    eye:'<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
    stop:'<rect x="6" y="6" width="12" height="12" rx="1"/>',
    logo:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>',
    alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  };
  const icon=(name,cls='ic')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||''}</svg>`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const kindIcon={md:'file',zip:'archive',html:'code',pdf:'printer',obsidian:'gem'};
  // The words are looked up when the settings are drawn, in the language picked then.
  const TIPS={};
  for(const k of ['saveAs','profile','prose','cards','map','fver','yaml','pending','ui','shortcut','obs','ver','language'])Object.defineProperty(TIPS,k,{enumerable:true,get:()=>t(`tip.${k}`)});
  // An ⓘ with help also opens the explanation page (help.html#<help>) on click or Enter.
  const info=(key,help)=>`<span class="info" tabindex="0" role="${help?'button':'img'}" aria-label="${esc(TIPS[key])}${help?esc(t('set.helpHint')):''}" data-tip="${esc(TIPS[key])}"${help?` data-help="${help}"`:''}>${icon('info')}</span>`;
  const onOff=(on,off)=>(v,ctx,own)=>own?t(on):t(off||'set.off');
  const kindLabel=k=>t(`kind.${k}.option`);
  const profileName=v=>v.profile==='obsidian'?'Obsidian':t('set.profile.generic');
  const languageName=v=>v.language==='auto'?t('set.language.auto',I18n.NAMES[I18n.match(root.chrome?.i18n?.getUILanguage?.()||root.navigator?.language)]):I18n.NAMES[v.language];

  // Each row: the setting's name, then what it is set to now. What a setting does goes in ⓘ.
  const kindOptions=()=>['md','zip','html','pdf','obsidian'].map(k=>[k,kindLabel(k)]);
  const groups=()=>[
    {key:'def',title:t('set.def'),summary:v=>`${kindLabel(v.exportKind)} · ${profileName(v)}`,rows:[
      {key:'exportKind',label:t('set.exportKind'),value:v=>kindLabel(v.exportKind),control:'select',options:kindOptions()},
      {key:'profile',label:t('set.profile'),tip:'profile',value:profileName,control:'seg',options:[['generic',t('set.profile.genericShort')],['obsidian','Obsidian']]},
      {key:'htmlForm',label:t('set.htmlForm'),value:v=>v.htmlForm==='single'?t('set.htmlForm.single'):t('set.htmlForm.folder'),control:'seg',options:[['folder','ZIP'],['single',t('set.htmlForm.singleShort')]]},
      {key:'htmlMap',label:t('set.htmlMap'),tip:'map',value:onOff('set.on','set.htmlMap.off'),control:'switch'},
      {key:'autoClose',label:t('set.autoClose'),value:onOff('set.on'),control:'switch'},
      // In each language with "Language" after it, so a page in a language one cannot read still shows where to change it.
      {key:'language',label:t('set.language')==='Language'?'Language':`${t('set.language')} · Language`,tip:'language',value:languageName,control:'select',options:[['auto',t('set.language.autoShort')],...I18n.LOCALES.map(l=>[l,I18n.NAMES[l]])]},
    ]},
    {key:'name',title:t('set.name'),summary:v=>`${S.fileNames[v.fileName]}${v.fileVersion?t('set.name.withVersion'):''}`,rows:[
      {key:'fileName',label:t('set.fileName'),value:(v,ctx)=>t('set.fileName.example',ctx.example(v)),mono:true,wrap:true,control:'select',options:Object.entries(S.fileNames)},
      {key:'filePrefix',label:t('set.filePrefix'),dep:true,hidden:v=>v.fileName!=='prefix',control:'text',width:120},
      {key:'fileVersion',label:t('set.fileVersion'),tip:'fver',value:v=>v.fileVersion?t('set.fileVersion.on',S.version):t('set.off'),control:'switch'},
    ]},
    {key:'md',title:t('set.md'),summary:v=>t('set.md.summary',['yaml','model','timestamps','sources'].filter(k=>v[k]).length,v.proseHtml==='keep'?t('set.proseHtml.keepShort'):t('set.proseHtml.escapeShort')),rows:[
      {key:'yaml',label:t('set.yaml'),tip:'yaml',value:onOff('set.yaml.on','set.yaml.off'),control:'switch'},
      {key:'model',label:t('set.model'),dep:true,dim:v=>!v.yaml,value:onOff('set.model.on'),control:'switch'},
      {key:'proseHtml',label:t('set.proseHtml'),tip:'prose',help:'prose-html',value:v=>v.proseHtml==='keep'?t('set.proseHtml.keep'):t('set.proseHtml.escape'),control:'seg',options:[['escape',t('set.proseHtml.escapeShort')],['keep',t('set.proseHtml.keepShort')]]},
      {key:'htmlCards',label:t('set.htmlCards'),beta:true,tip:'cards',help:'html-cards',value:onOff('set.htmlCards.on','set.htmlCards.off'),control:'switch'},
      {key:'timestamps',label:t('set.timestamps'),value:onOff('set.timestamps.on'),control:'switch'},
      {key:'sources',label:t('set.sources'),tip:'pending',value:onOff('set.sources.on'),control:'switch'},
      {key:'roles',label:t('set.roles'),control:'roles'},
    ]},
    {key:'obs',title:'Obsidian',summary:v=>v.obsidianFolder?t('set.obs.summary',v.obsidianFolder):t('set.obs.none'),rows:[
      {key:'obsFolder',label:t('set.obsFolder'),tip:'obs',value:v=>v.obsidianFolder?`${v.obsidianFolder} /`:t('set.obsFolder.none'),chip:v=>!!v.obsidianFolder,control:'button',text:t('set.obsFolder.button')},
    ]},
    {key:'btns',title:t('set.btns'),summary:v=>v.dockShow?t('set.btns.shown',v.dockPos==='corner'?t('set.dockPos.corner'):t('set.dockPos.input')):t('set.btns.hidden'),rows:[
      {key:'dockShow',label:t('set.dockShow'),value:onOff('set.dockShow.on','set.dockShow.off'),control:'switch'},
      {key:'dockPos',label:t('set.dockPos'),dep:true,dim:v=>!v.dockShow,value:v=>v.dockPos==='corner'?t('set.dockPos.corner'):t('set.dockPos.input'),control:'seg',options:[['input',t('set.dockPos.inputShort')],['corner',t('set.dockPos.cornerShort')]]},
      {key:'shortcut',label:t('set.shortcut'),tip:'shortcut',value:()=>t('set.shortcut.value'),control:'button',text:t('set.shortcut.button')},
    ]},
    {key:'adv',title:t('set.adv'),summary:v=>v.uiFolder?t('set.adv.uiOn'):t('set.adv.summary'),rows:[
      {key:'uiFolder',label:t('set.uiFolder'),tip:'ui',value:onOff('set.uiFolder.on'),control:'switch'},
      {key:'raw',label:t('set.raw'),value:()=>t('set.raw.value'),control:'button',text:t('set.raw.button')},
      {key:'reset',label:t('set.reset'),value:()=>t('set.reset.value'),control:'button',text:t('set.reset.button')},
    ]},
  ];
  // Obsidian writes into its 笔记文件夹, not 下载: the row is greyed out and says so while it is the kind.
  const saveRow=()=>({key:'saveAs',label:t('set.saveAs'),tip:'saveAs',dim:v=>v.exportKind==='obsidian',value:(v,ctx,own)=>v.exportKind==='obsidian'?t('set.saveAs.obsidian'):own?t('set.saveAs.on'):t('set.saveAs.off'),control:'switch'});

  // A segmented choice behaves like a form control: .value, and a change event when picked.
  function segControl(doc,row){
    const el=doc.createElement('span');el.className='seg2';el.id=row.key;el.setAttribute('role','radiogroup');el.setAttribute('aria-label',row.label);
    el.innerHTML=row.options.map(([v,l])=>`<button type="button" data-v="${esc(v)}" aria-pressed="false">${esc(l)}</button>`).join('');
    let value=row.options[0][0];
    Object.defineProperty(el,'value',{get:()=>value,set:v=>{value=v;for(const b of el.querySelectorAll('button')){const on=b.dataset.v===v;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));}}});
    el.addEventListener('click',e=>{const b=e.target.closest('button[data-v]');if(!b||b.disabled)return;el.value=b.dataset.v;el.dispatchEvent(new (doc.defaultView.Event)('change',{bubbles:true}));});
    return el;
  }
  function control(doc,row,ctx){
    if(row.control==='switch'){const el=doc.createElement('input');el.type='checkbox';el.className='tg';el.id=row.key;el.setAttribute('role','switch');el.setAttribute('aria-label',row.label);return el;}
    if(row.control==='seg')return segControl(doc,row);
    if(row.control==='select'){const el=doc.createElement('select');el.className='fs';el.id=row.key;el.setAttribute('aria-label',row.label);el.innerHTML=row.options.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');return el;}
    if(row.control==='text'){const el=doc.createElement('input');el.className='rn';el.id=row.key;el.maxLength=40;el.style.width=(row.width||84)+'px';el.setAttribute('aria-label',row.label);return el;}
    if(row.control==='roles'){const el=doc.createElement('span');el.className='roles';el.innerHTML=`<input class="rn" id="roleUser" maxlength="40" style="width:64px" placeholder="${esc(t('md.roleUser'))}" aria-label="${esc(t('set.roles.user'))}"><input class="rn" id="roleAssistant" maxlength="40" style="width:84px" placeholder="ChatGPT" aria-label="${esc(t('set.roles.assistant'))}">`;return el;}
    const el=doc.createElement('button');el.type='button';el.className='xlink';el.id=row.key;el.textContent=row.text;return el;
  }
  function rowElement(doc,row,ctx){
    const el=doc.createElement('div');el.className=`xrow${row.dep?' dep':''}`;el.dataset.row=row.key;
    el.innerHTML=`<div class="lab"><b>${esc(row.label)}${row.beta?' <span class="beta">Beta</span>':''}${row.tip?info(row.tip,row.help):''}</b>${row.value?`<span class="val${row.mono?' mono':''}${row.wrap?' wrap':''}"></span>`:''}</div>`;
    el.append(control(doc,row,ctx));return el;
  }

  // Draws the settings into container and keeps them in step with the store.
  // ctx.action(name) runs the shortcut, raw and reset buttons. The example file name has a fixed title
  // (set.exampleTitle), so it shows the format at one length; the real name is under the sidebar's 导出.
  // open: the groups shown open at first (the settings tab opens them all).
  function mountSettings(container,store,ctx={},{open=[],save=true}={}){
    const doc=container.ownerDocument,c={example:v=>exampleName(v),...ctx},rows=new Map(),heads=[];
    const wrap=doc.createElement('div');wrap.className='xset';
    const addRow=(row,parent)=>{const el=rowElement(doc,row,c);rows.set(row.key,{row,el});parent.append(el);};
    if(save){const sec=doc.createElement('div');sec.className='xsec';addRow(saveRow(),sec);wrap.append(sec);}
    const gh=doc.createElement('div');gh.className='xgh';gh.textContent=t('set.heading');wrap.append(gh);
    for(const g of groups()){
      const acc=doc.createElement('div');acc.className='acc';acc.dataset.group=g.key;
      acc.innerHTML=`<div class="xrow link acch" role="button" tabindex="0" aria-expanded="false"><div class="lab"><b>${esc(g.title)}</b><span class="val"></span></div>${icon('chev','go')}</div><div class="accb" hidden></div>`;
      const body=acc.querySelector('.accb');for(const row of g.rows)addRow(row,body);
      heads.push({g,acc});wrap.append(acc);
    }
    container.append(wrap);
    const setOpen=(key,on)=>{const h=heads.find(x=>x.g.key===key);if(!h)return;h.acc.classList.toggle('open',on);h.acc.querySelector('.accb').hidden=!on;h.acc.querySelector('.acch').setAttribute('aria-expanded',String(on));};
    open.forEach(k=>setOpen(k,true));
    wrap.addEventListener('click',e=>{const help=e.target.closest('[data-help]');if(help){c.help?.(help.dataset.help);return;}
      const head=e.target.closest('.acch');if(head){const k=head.parentElement.dataset.group;setOpen(k,!head.parentElement.classList.contains('open'));return;}
      const b=e.target.closest('button.xlink');if(b)c.action?.(b.id,b);});
    wrap.addEventListener('keydown',e=>{const help=e.target.closest?.('[data-help]');if(help&&(e.key==='Enter'||e.key===' ')){e.preventDefault();c.help?.(help.dataset.help);return;}
      const head=e.target.closest?.('.acch');if(head&&(e.key==='Enter'||e.key===' ')){e.preventDefault();head.click();}});
    wrap.addEventListener('change',e=>{const el=e.target;if(!el.id)return;
      if(el.classList.contains('tg'))store.set({[el.id]:el.checked});
      else if(el.id in S.defaults)store.set({[el.id]:el.id==='roleUser'||el.id==='roleAssistant'||el.id==='filePrefix'?el.value.trim()||S.defaults[el.id]:el.value});},true);
    function refresh(v=store.values){
      for(const {row,el} of rows.values()){
        const input=el.querySelector(`#${row.key}`);
        if(row.control==='switch'){input.checked=!!v[row.key];input.setAttribute('aria-checked',String(!!v[row.key]));}
        else if(row.control==='seg'||row.control==='select')input.value=v[row.key];
        else if(row.control==='text'){if(doc.activeElement!==input&&container.getRootNode().activeElement!==input)input.value=v[row.key];}
        else if(row.control==='roles')for(const k of ['roleUser','roleAssistant']){const i=el.querySelector('#'+k);if(container.getRootNode().activeElement!==i)i.value=v[k];}
        const val=el.querySelector('.val');if(val&&row.value){val.textContent=row.value(v,c,v[row.key]);if(row.chip)val.classList.toggle('chip',!!row.chip(v));}
        el.classList.toggle('dim',!!row.dim?.(v));el.hidden=!!row.hidden?.(v);
        for(const i of el.querySelectorAll('input,select,.seg2 button'))i.disabled=!!row.dim?.(v);
      }
      for(const {g,acc} of heads)acc.querySelector('.acch .val').textContent=g.summary(v);
    }
    refresh();const off=store.onChange(v=>refresh(v));
    return {el:wrap,refresh,setOpen,destroy:()=>{off();wrap.remove();}};
  }
  function exampleName(v){const ext={md:'md',zip:'zip',html:v.htmlForm==='single'?'html':'html.zip',pdf:'pdf',obsidian:'md'}[v.exportKind];return `${S.fileBase(v,{title:t('set.exampleTitle')})}.${ext}`;}

  // ⓘ: a box floating over the page on hover or keyboard focus; nothing below it moves.
  function attachTips(scope,parent){
    const doc=parent.ownerDocument,box=doc.createElement('div');box.className='tipbox';box.setAttribute('role','tooltip');parent.append(box);
    const show=el=>{box.textContent=el.dataset.tip;box.classList.add('show');const r=el.getBoundingClientRect(),w=doc.defaultView,tw=box.offsetWidth,th=box.offsetHeight;
      const x=Math.min(Math.max(8,r.left+r.width/2-tw/2),w.innerWidth-tw-8);let y=r.top-th-8;if(y<8)y=r.bottom+8;box.style.left=x+'px';box.style.top=y+'px';};
    const hide=()=>box.classList.remove('show');
    scope.addEventListener('mouseover',e=>{const el=e.target.closest?.('[data-tip]');if(el)show(el);});
    scope.addEventListener('mouseout',e=>{const el=e.target.closest?.('[data-tip]');if(el&&!el.contains(e.relatedTarget))hide();});
    scope.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-tip]');if(el)show(el);});
    scope.addEventListener('focusout',hide);
    return box;
  }

  const css=()=>`
.cx{--pri:#7D8F80;--acc:#A68A85;--tint:#D9CFC1;--bg:#F3F0EB;--surface:#fff;--text:#4A4A48;--onpri:#fff;
  --muted:color-mix(in srgb,var(--text) 58%,var(--bg));--line:color-mix(in srgb,var(--text) 13%,transparent);--pri-deep:color-mix(in srgb,var(--pri) 72%,#000);
  --warn:#f0a500;--err:#e5484d;--ok:#3f9f6a;
  color:var(--text);font:13.5px/1.45 Roboto,"Segoe UI",${I18n.cjkFonts()},system-ui,sans-serif;-webkit-font-smoothing:antialiased;text-align:left}
.cx.dark{--bg:color-mix(in srgb,#7D8F80 5%,#141518);--surface:color-mix(in srgb,#7D8F80 6%,#1d1f23);--text:#e8e9ec;--tint:color-mix(in srgb,#7D8F80 26%,#1d1f23);--line:rgba(255,255,255,.1);--pri-deep:color-mix(in srgb,var(--pri) 55%,#fff)}
.cx *,.cx *::before,.cx *::after{box-sizing:border-box}
.cx button,.cx select,.cx input{font:inherit;color:inherit}
.cx button{cursor:pointer}
.cx [hidden]{display:none!important}
.cx .ic{width:16px;height:16px;flex:none}
.cx .logo{width:26px;height:26px;border-radius:50%;background:var(--pri);color:var(--onpri);display:grid;place-items:center;flex:none}
.cx .logo .ic{width:16px;height:16px}
.cx .ib{width:32px;height:32px;border-radius:50%;border:0;background:transparent;display:grid;place-items:center;color:var(--text);flex:none}
.cx .ib:hover{background:color-mix(in srgb,var(--text) 8%,transparent)}
.cx .ib:disabled{opacity:.4;cursor:default}
.cx .xver{display:inline-flex;align-items:center;gap:6px;font:600 12px/1 ui-monospace,Consolas,monospace;padding:6px 10px;border-radius:999px;background:var(--bg);color:var(--text);cursor:help;white-space:nowrap}
.cx .xver i{width:7px;height:7px;border-radius:50%;background:var(--ok)}
.cx .xver.warn{background:color-mix(in srgb,var(--warn) 22%,var(--surface))}
.cx .xver.warn i{background:#d08a00}
.cx .xwarn{margin:0 12px 10px;padding:9px 11px;border-radius:12px;background:color-mix(in srgb,var(--warn) 16%,var(--surface));border:1px solid color-mix(in srgb,var(--warn) 55%,transparent);font-size:12px;display:flex;gap:8px;align-items:center}
.cx .xwarn span{flex:1}
.cx .xb{border:0;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:600;display:inline-flex;gap:6px;align-items:center;justify-content:center;white-space:nowrap}
.cx .xb.pri{background:var(--pri);color:var(--onpri);flex:1}
.cx .xb.pri:hover{filter:brightness(1.06)}
.cx .xb.ghost{background:transparent;color:var(--pri-deep);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--text) 22%,transparent)}
.cx .xb.ghost:hover{background:color-mix(in srgb,var(--text) 5%,transparent)}
.cx .xb.sm{padding:6px 12px;font-size:12.5px}
.cx .xb:disabled{opacity:.5;cursor:default;filter:none}
.cx .opill{display:inline-flex;align-items:stretch;min-width:0;border-radius:999px}
.cx .xbtns .opill{flex:1}
.cx .opill.two>.xb.pri,.cx .opill.two>#export{border-radius:999px 0 0 999px}
.cx .oopen{border:0;border-left:1px solid color-mix(in srgb,var(--onpri) 40%,transparent);border-radius:0 999px 999px 0;background:color-mix(in srgb,var(--pri) 16%,var(--surface));color:var(--pri-deep);font-size:13px;font-weight:600;padding:9px 12px;display:inline-flex;gap:6px;align-items:center;white-space:nowrap;cursor:pointer}
.cx .oopen:hover:not(:disabled){filter:brightness(.97)}
.cx .oopen:disabled{color:var(--muted);cursor:default}
.cx .oopen .ic{width:14px;height:14px}
/* A path (where a note is saved) in a grey box, so it reads as a place, not as prose. */
.cx .chip{display:inline;-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:1px 7px;border-radius:6px;background:color-mix(in srgb,var(--text) 8%,transparent);color:var(--text);font-weight:500;overflow-wrap:anywhere;line-height:1.6}
/* A saved note's path opens the note in Obsidian. */
.cx .chip.link{cursor:pointer;text-decoration:none}
.cx .chip.link:hover{background:color-mix(in srgb,var(--pri) 22%,transparent);text-decoration:underline}
.cx .xgh{font-size:12px;font-weight:600;color:var(--pri-deep);padding:18px 16px 2px}
.cx .xrow{display:flex;align-items:center;gap:12px;padding:9px 16px;min-height:50px}
.cx .xrow .lab{flex:1;min-width:0}
.cx .xrow .lab b{display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:500}
.cx .xrow .lab>span{display:block;font-size:12px;color:var(--muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cx .xrow .lab>span.mono{font-family:ui-monospace,Consolas,monospace;font-size:11.5px}
.xrow .lab>span.wrap{white-space:normal;overflow-wrap:anywhere}
.cx .xrow .lab>span.chip{display:inline-block;max-width:100%;box-sizing:border-box;color:var(--text);margin-top:3px;font-size:12px}
.cx .xrow.link{cursor:pointer;user-select:none}
.cx .xrow.link:hover{background:color-mix(in srgb,var(--text) 4%,transparent)}
.cx .xrow.link:focus-visible{outline:2px solid var(--pri);outline-offset:-2px}
.cx .xrow .go{width:16px;height:16px;color:var(--muted);transform:rotate(-90deg);transition:transform .18s;flex:none}
.cx .xrow.dep{padding-left:30px}
.cx .xrow.dim{opacity:.45}
.cx .xrow>.tg,.cx .xrow>select,.cx .xrow>input,.cx .xrow>.seg2,.cx .xrow>.roles,.cx .xrow>.xlink{flex:none}
.cx .acc.open{background:var(--bg);margin:2px 8px;border-radius:14px}
.cx .acc.open>.acch{padding-left:8px;padding-right:8px;background:transparent}
.cx .acc.open>.acch .go{transform:rotate(0)}
.cx .acc.open .accb{padding-bottom:6px}
.cx .acc.open .accb .xrow{padding-left:8px;padding-right:8px;min-height:44px;padding-top:7px;padding-bottom:7px}
.cx .acc.open .accb .xrow.dep{padding-left:22px}
.cx .accb .xrow .lab b{font-size:13px}
.cx .tg{appearance:none;-webkit-appearance:none;margin:0;width:40px;height:24px;border-radius:12px;background:color-mix(in srgb,var(--text) 10%,var(--surface));border:2px solid color-mix(in srgb,var(--text) 45%,transparent);position:relative;flex:none;cursor:pointer;transition:background .15s}
.cx .tg::after{content:"";position:absolute;left:4px;top:4px;width:12px;height:12px;border-radius:50%;background:color-mix(in srgb,var(--text) 55%,transparent);transition:left .15s,width .15s,height .15s,top .15s}
.cx .tg:checked{background:var(--pri);border-color:var(--pri)}
.cx .tg:checked::after{left:18px;top:2px;width:16px;height:16px;background:#fff}
.cx .tg:focus-visible,.cx .seg2 button:focus-visible,.cx select:focus-visible,.cx .xb:focus-visible,.cx .ib:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.cx .tg:disabled{cursor:default}
.cx .seg2{display:inline-flex;background:var(--line);border-radius:999px;padding:2px}
.cx .seg2 button{border:0;background:none;border-radius:999px;padding:4px 10px;font-size:12px;color:var(--muted);white-space:nowrap}
.cx .seg2 button.on{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.15)}
.cx select.fs,.cx input.rn{font-size:12px;border:1px solid color-mix(in srgb,var(--text) 30%,transparent);border-radius:6px;background:var(--surface);color:var(--text);padding:5px 6px}
.cx select.fs{max-width:150px}
.cx .roles{display:flex;gap:6px}
.cx .xlink{border:0;background:none;color:var(--pri-deep);font-weight:600;font-size:12.5px;padding:6px 10px;border-radius:999px}
.cx .xlink:hover{background:color-mix(in srgb,var(--pri) 10%,transparent)}
.cx .beta{font-size:10px;font-weight:800;letter-spacing:.03em;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--warn) 22%,var(--surface));color:#9a6500;border:1px solid color-mix(in srgb,var(--warn) 55%,transparent);line-height:15px}
.cx.dark .beta{color:#ffcf6b}
.cx .info{cursor:help;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;color:var(--muted)}
.cx .info .ic{width:14px;height:14px}
.cx .info:hover,.cx .info:focus-visible{color:var(--pri);outline:none}
.cx .info[data-help]{cursor:pointer}
.tipbox{position:fixed;z-index:2147483647;left:0;top:0;max-width:280px;background:#2d2b28;color:#f6f4f0;font:12px/1.6 Roboto,"Segoe UI",${I18n.cjkFonts()},system-ui,sans-serif;padding:8px 11px;border-radius:9px;box-shadow:0 8px 24px rgba(0,0,0,.28);pointer-events:none;opacity:0;transform:translateY(3px);transition:opacity .12s,transform .12s}
.tipbox.show{opacity:1;transform:none}
.cx .xmsg{margin:10px 12px 0;padding:8px 11px;border-radius:12px;background:color-mix(in srgb,var(--pri) 12%,var(--surface));font-size:12px;white-space:pre-wrap}
.cx .xmsg.err{background:color-mix(in srgb,var(--err) 11%,var(--surface))}
`;
  // The sidebar and the two buttons beside ChatGPT's input box (both in the page's Shadow DOM).
  const pageCss=`
:host{all:initial}
.sb{position:fixed;top:0;right:0;bottom:0;width:372px;max-width:100vw;z-index:2147483646;background:var(--bg);border-left:1px solid var(--line);box-shadow:-8px 0 32px rgba(0,0,0,.12);display:flex;flex-direction:column;overflow:hidden}
.sbh{display:flex;align-items:center;gap:6px;padding:14px 10px 12px 16px;background:var(--tint);flex:none}
.sbh .ht{flex:1;min-width:0;display:flex;align-items:center;gap:8px}
.sbh b{font-size:15px;font-weight:600;white-space:nowrap}
.vpill{display:inline-block;font:700 11px/1 ui-monospace,Consolas,monospace;padding:4px 7px;border-radius:999px;background:var(--surface);color:var(--text)}
.view{display:flex;flex-direction:column;flex:1;min-height:0}
.sbf{display:flex;gap:6px;flex-wrap:wrap;padding:12px 14px 10px;flex:none}
.fchip{border:1px solid color-mix(in srgb,var(--text) 28%,transparent);background:transparent;border-radius:8px;padding:3px 10px;font-size:12px;color:var(--text)}
.fchip:hover{background:color-mix(in srgb,var(--text) 5%,transparent)}
.fchip.on{background:color-mix(in srgb,var(--pri) 20%,var(--surface));border-color:transparent;font-weight:600}
.fchip:disabled{opacity:.45;cursor:default}
#list{flex:1;overflow:auto;padding:0 10px 10px;display:flex;flex-direction:column;gap:6px;overscroll-behavior:contain}
.smsg{display:flex;align-items:flex-start;gap:8px;padding:10px;border-radius:16px;background:var(--surface);cursor:pointer;transition:opacity .15s}
.smsg:has(input:not(:checked)){opacity:.5}
.smsg input{appearance:none;-webkit-appearance:none;margin:2px 0 0;width:16px;height:16px;border-radius:3px;border:2px solid color-mix(in srgb,var(--text) 45%,transparent);flex:none;display:grid;place-items:center;cursor:pointer}
.smsg input:checked{background:var(--pri);border-color:var(--pri)}
.smsg input:checked::after{content:"";width:8px;height:4px;border:2px solid #fff;border-top:0;border-right:0;transform:translateY(-1px) rotate(-45deg)}
.smsg input:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.mbody{flex:1;min-width:0}
.mtop{display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap}
.role{font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:5px;background:var(--tint)}
.role.a{background:color-mix(in srgb,var(--acc) 22%,var(--surface))}
.bdg{font-size:10.5px;color:var(--muted);background:var(--line);border-radius:5px;padding:0 6px;white-space:nowrap}
.time{margin-left:auto;font-size:11px;color:var(--muted)}
.mtx{font-size:12.5px;line-height:1.55;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.empty{padding:24px 16px;color:var(--muted);font-size:12.5px;text-align:center}
.sbfoot{flex:none;padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;background:var(--tint)}
.stx{display:flex;gap:8px;align-items:flex-start;border-radius:12px;padding:8px 10px;font-size:12.5px;background:color-mix(in srgb,var(--surface) 70%,transparent)}
.stx:has(#status:empty){display:none}
#status{flex:1;min-width:0;white-space:pre-wrap;line-height:1.5;max-height:9em;overflow:auto}
.stx.warn{background:color-mix(in srgb,var(--warn) 16%,var(--surface))}
.stx.err{background:color-mix(in srgb,var(--err) 11%,var(--surface))}
#stop{border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:2px 9px;font-size:12px;display:inline-flex;gap:4px;align-items:center}
#stop .ic{width:12px;height:12px}
#stop:disabled{display:none}
.sbrow{display:flex;align-items:center;gap:8px}
#count{font-size:12px;color:var(--muted);flex:1;min-width:0;white-space:nowrap}
#kind{width:112px;flex:none;font-size:12.5px;border:1px solid color-mix(in srgb,var(--text) 30%,transparent);border-radius:6px;background:transparent;color:var(--text);padding:6px}
#kind option{background:var(--surface)}
#export{border:0;background:var(--pri);color:var(--onpri);border-radius:999px;padding:9px 16px;font-weight:600;font-size:13px;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
#export:hover{filter:brightness(1.06)}
#export:disabled,#kind:disabled{opacity:.5;cursor:default}
#exportPill{width:124px;flex:none}
#exportPill>#export{flex:1;justify-content:center;padding-left:10px;padding-right:10px}
#exportPill>.oopen{padding-left:10px;padding-right:12px}
#exportPill.tight>.oopen span{display:none}
.ftl{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);min-width:0}
.ftl .fname{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right;font-family:ui-monospace,Consolas,monospace;font-size:11px}
.lnk{border:0;background:none;color:var(--pri-deep);display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:2px;font-weight:600}
.lnk .ic{width:14px;height:14px}
.lnk:disabled{opacity:.45;cursor:default}
#output{width:100%;height:120px;border:0;border-radius:12px;background:var(--surface);color:var(--text);font:11.5px/1.5 ui-monospace,Consolas,monospace;padding:8px;resize:vertical}
.setview{flex:1;min-height:0;overflow:auto;background:var(--surface)}
.setview .xgh:first-of-type{padding-top:10px}
.dock{position:fixed;z-index:2147483645;display:flex;flex-direction:column;gap:6px;min-width:132px;align-items:stretch}
.dock.narrow{min-width:0}
.dock.narrow .spl .main span,.dock.narrow .spl .main small{display:none}
.spl{display:flex;position:relative;border-radius:999px;background:color-mix(in srgb,var(--pri) 16%,var(--surface));box-shadow:0 1px 3px rgba(0,0,0,.2),0 2px 6px rgba(0,0,0,.08);color:var(--text)}
.spl>button{border:0;background:transparent;font-size:12.5px;font-weight:600;color:inherit;display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;white-space:nowrap}
.spl>button:focus-visible{outline:2px solid var(--pri);outline-offset:2px}
.spl .main{flex:1;min-width:0}
.spl .main small{font-size:11px;font-weight:500;opacity:.8;margin-left:auto;white-space:nowrap}
.spl .arr{border-left:1px solid color-mix(in srgb,var(--text) 14%,transparent);padding:9px 9px;border-radius:0 999px 999px 0}
.spl .arr .ic{width:14px;height:14px}
.spl.pri{background:var(--pri);color:var(--onpri)}
.spl.pri .arr{border-left-color:color-mix(in srgb,var(--onpri) 30%,transparent)}
.spl.pri>.oopen{background:transparent;color:inherit;border-radius:0;border-left:1px solid color-mix(in srgb,var(--onpri) 30%,transparent);padding:9px 10px;font-size:12.5px}
.spl.pri>.oopen:disabled{color:inherit;opacity:.5}
.dock.narrow .spl .oopen span{display:none}
.dock.busy .spl{opacity:.55;pointer-events:none}
.menu{position:absolute;bottom:calc(100% + 6px);right:0;min-width:224px;background:var(--surface);color:var(--text);border-radius:6px;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:8px 0;font-weight:400;font-size:13px}
.mi{display:flex;align-items:center;gap:8px;padding:9px 14px;cursor:pointer;white-space:nowrap;border:0;background:none;width:100%;text-align:left;color:inherit;font-size:13px}
.mi:hover,.mi:focus-visible{background:var(--line);outline:none}
.mi small{color:var(--muted);font-size:11.5px}
.mi .ok{margin-left:auto;color:var(--pri);visibility:hidden}
.mi.on .ok{visibility:visible}
.mi.soon{color:var(--muted);cursor:not-allowed}
.mi.soon:hover{background:none}
.soonTag{font-style:normal;font-size:10px;font-weight:600;color:var(--muted);background:var(--line);border-radius:5px;padding:0 5px;margin-left:auto}
.msep{height:1px;background:var(--line);margin:4px 0}
.mlab{font-size:11px;color:var(--muted);padding:4px 14px 2px}
.mfoot{font:11px ui-monospace,Consolas,monospace;color:var(--muted);padding:6px 14px 2px}
.toast{position:fixed;z-index:2147483645;background:var(--text);color:var(--bg);font-size:12.5px;padding:8px 12px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.2);max-width:320px;white-space:pre-wrap;opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s;pointer-events:none}
.toast.show{opacity:1;transform:none}
.toast .chip{background:color-mix(in srgb,var(--bg) 22%,transparent);color:inherit}
`;
  const api={icon,esc,TIPS,get groups(){return groups();},get saveRow(){return saveRow();},get kindOptions(){return kindOptions();},kindIcon,mountSettings,attachTips,exampleName,get css(){return css();},pageCss};
  root.ChatExportUI=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
