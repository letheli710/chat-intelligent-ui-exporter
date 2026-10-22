// The toolbar panel (popup.html) and the settings tab (options.html): the same settings
// component; the panel also shows the current chat with one export button.
(async () => {
  const S=globalThis.ChatExportSettings,UI=globalThis.ChatExportUI,I18n=globalThis.ChatExportI18n,t=I18n.t,icon=UI.icon,esc=UI.esc;
  const popup=document.body.dataset.page==='popup',body=document.body,repo='https://github.com/letheli710/chat-intelligent-ui-exporter';
  const store=S.open();await store.ready;
  // The page is drawn in the language picked; picking another draws it again.
  I18n.setLocale(store.values.language);document.documentElement.lang=I18n.tag;
  document.title=popup?'Chat & Intelligent UI Exporter for ChatGPT':t('panel.settingsTitle');
  document.head.insertAdjacentHTML('beforeend',`<style>${UI.css}${css()}</style>`);
  body.classList.add('cx');
  const scheme=matchMedia('(prefers-color-scheme: dark)'),theme=()=>body.classList.toggle('dark',scheme.matches);theme();scheme.addEventListener('change',theme);
  // The background and permissions change only when the extension is reloaded, the panel's files
  // whenever they change on disk: a different number means the extension was not reloaded.
  const loaded=chrome.runtime.getManifest().version,stale=loaded!==S.version;
  const ver=`<span class="xver${stale?' warn':''}" id="ver" tabindex="0" data-tip="${esc(stale?t('panel.staleTip',loaded,S.version):UI.TIPS.ver)}"><i></i>v${S.version}</span>`;
  const warn=`<div class="xwarn" id="warn" hidden><span id="warnText"></span><button class="xb ghost sm" id="warnBtn" type="button"></button></div>`;
  // 反馈 opens the Google Form (no e-mail address of ours is shown). Its first question is
  // filled in with the version, language, Chrome and system, so a report says where it broke.
  const browser=(navigator.userAgent.match(/Chrome\/(\d+)/)||[])[1],os=navigator.userAgentData?.platform||navigator.platform;
  const env=[`v${S.version}`,I18n.tag,browser&&`Chrome ${browser}`,os].filter(Boolean).join(' · ');
  const form=`https://docs.google.com/forms/d/e/1FAIpQLSemj8AaDckqB2NJ_tsb3VW2jG1AxM-NIrmKJMom8IXtjUYgaQ/viewform?usp=pp_url&entry.109250588=${encodeURIComponent(env)}`;
  const foot=`<div class="xft">${popup?`<a id="openTab" href="#">${icon('ext')}${esc(t('panel.openTab'))}</a>`:''}<span class="grow"></span><a href="${esc(form)}" target="_blank" rel="noopener">${esc(t('panel.feedback'))}</a><a href="${repo}" target="_blank" rel="noopener">GitHub</a></div>`;
  body.innerHTML=popup
    ?`<div class="xhd"><div class="logo">${icon('logo')}</div><b>Chat &amp; Intelligent UI Exporter for ChatGPT</b>${ver}</div>${warn}<div class="xhero" id="hero"></div><div class="xmsg" id="msg" role="status" hidden></div><div id="settings"></div>${foot}`
    :`<main class="opt"><div class="opth"><div class="logo">${icon('logo')}</div><h1>${esc(t('panel.settingsTitle'))}</h1>${ver}</div>${warn}<div class="xmsg" id="msg" role="status" hidden></div><div class="card" id="settings"></div>${foot}</main>`;
  const $=id=>document.getElementById(id);
  const say=(text,error=false)=>{const m=$('msg');m.hidden=!text;m.textContent=text||'';m.classList.toggle('err',error);};
  const warnWith=(text,button,action)=>{$('warn').hidden=false;$('warnText').innerHTML=text;$('warnBtn').textContent=button;$('warnBtn').onclick=action;};
  const bold=s=>`<b>${esc(s)}</b>`;
  if(stale)warnWith(t('panel.staleWarn',bold(loaded),bold(S.version)),t('panel.reloadExtension'),()=>chrome.runtime.reload());
  UI.attachTips(document,body);

  // The tab the panel was opened over, and its content script (added now if the tab predates the extension).
  let tab=null,summary=null;
  if(popup)[tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const chatTab=t=>/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(t?.url||'');
  async function call(message,target=tab){
    try{const r=await chrome.tabs.sendMessage(target.id,message);if(r!==undefined)return r;}catch{}
    await chrome.scripting.executeScript({target:{tabId:target.id},files:chrome.runtime.getManifest().content_scripts[0].js});
    return chrome.tabs.sendMessage(target.id,message);
  }
  // 导出原始 JSON from the settings tab goes to the ChatGPT tab used last.
  async function lastChatTab(){const tabs=await chrome.tabs.query({url:['https://chatgpt.com/*','https://chat.openai.com/*']});return tabs.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))[0]||null;}
  const actions={
    shortcut:()=>chrome.tabs.create({url:'chrome://extensions/shortcuts'}),
    // 笔记文件夹 → 更改…: obsidian.html keeps the folder, so the choice is made there.
    obsFolder:()=>chrome.tabs.create({url:chrome.runtime.getURL('obsidian.html?setup=1')}),
    reset:async()=>{await store.reset();say(t('panel.resetDone'));},
    raw:async()=>{const target=popup?(chatTab(tab)?tab:null):await lastChatTab();if(!target)return say(t('panel.needChat'),true);
      say(t('panel.rawRunning'));try{const r=await call({type:'panel:raw'},target);say(r?.status||r?.error||'',!!r?.error);}catch(e){say(e.message,true);}},
  };
  const panel=UI.mountSettings($('settings'),store,{action:name=>actions[name]?.(),help:topic=>chrome.tabs.create({url:chrome.runtime.getURL(`help.html#${topic}`)}),commands:()=>chrome.commands.getAll()},{open:popup?[]:UI.groups.map(g=>g.key)});
  const shown=I18n.locale;store.onChange((v,changed)=>{if(changed.includes('language')&&I18n.setLocale(v.language)!==shown)location.reload();});

  if(!popup)return;
  $('openTab').onclick=e=>{e.preventDefault();chrome.runtime.openOptionsPage();window.close();};
  const hero=$('hero');
  function drawHero(){
    if(!chatTab(tab)||summary?.page==='other'){
      hero.innerHTML=`<div class="xk">${esc(t('panel.thisTab'))}</div><div class="xt">${esc(t('panel.notChat'))}</div><div class="xm">${esc(t('panel.notChatHint'))}</div><div class="xbtns"><button class="xb ghost" id="openChat" type="button">${icon('ext')}${esc(t('panel.openChatGPT'))}</button></div>`;
      $('openChat').onclick=()=>{if(chatTab(tab))chrome.tabs.update(tab.id,{url:'https://chatgpt.com/'});else chrome.tabs.create({url:'https://chatgpt.com/'});window.close();};return;}
    const k=store.values.exportKind,meta=!summary?t('panel.reading'):summary.ok?[t('count.messages',summary.messages),summary.cards&&t('count.cards',summary.cards),summary.images&&t('count.images',summary.images)].filter(Boolean).join(' · '):summary.status;
    // When one HTML file would carry many pictures and files, that line is instead the suggestion to
    // use ZIP, which switches when clicked: still one line, so the buttons below do not move.
    const big=!!summary?.ok&&k==='html'&&store.values.htmlForm==='single'&&summary.files>S.bigHtmlFiles;
    // The chat's title, then what it holds and, at the end of that line, the export kind (the same
    // default as 导出 ▾ beside the input box and 默认导出 in the settings).
    hero.innerHTML=`<div class="xt" id="chatTitle"></div><div class="xm row"><span class="${summary&&!summary.ok?'bad':''}" id="chatMeta">${big?`<button class="warnlink" id="useFolder" type="button"></button>`:''}</span><select class="ksel" id="kindSel" aria-label="${esc(t('panel.kindLabel'))}" title="${esc(t('panel.kindTip'))}">${UI.kindOptions.map(([v])=>`<option value="${v}">${esc(S.kinds[v].name)}</option>`).join('')}</select></div><div class="xbtns">${k==='obsidian'
      // Obsidian: the pill 保存到 Obsidian | 打开 (打开: the note last saved from this chat).
      ?`<span class="opill two"><button class="xb pri" id="export" type="button">${icon('gem')}${esc(S.kinds[k].verb)}</button><button class="oopen" id="obsOpen" type="button" ${summary?.obsidianNote?'':'disabled'} title="${esc(summary?.obsidianNote?t('side.obsOpenTip'):t('panel.obsOpenFirst'))}">${icon('ext')}${esc(t('side.obsOpen'))}</button></span>`
      :`<button class="xb pri" id="export" type="button">${icon(UI.kindIcon[k])}${esc(S.kinds[k].verb)}</button>`}<button class="xb ghost" id="pick" type="button">${esc(t('panel.pick'))}</button></div>`;
    $('obsOpen')?.addEventListener('click',async()=>{try{await call({type:'panel:obsidianOpen'});window.close();}catch(e){say(e.message,true);}});
    $('chatTitle').textContent=summary?.title||tab.title||'ChatGPT';
    if(big){const b=$('useFolder');b.textContent=t('side.htmlBig');b.title=t('side.htmlBigTip',summary.files);b.onclick=()=>store.set({htmlForm:'folder'});}
    else $('chatMeta').textContent=meta;
    $('kindSel').value=k;$('kindSel').onchange=()=>store.set({exportKind:$('kindSel').value});
    $('export').disabled=!summary;
    $('export').onclick=async()=>{const kind=store.values.exportKind;$('export').disabled=true;
      say(kind==='pdf'?t('panel.pdfRunning'):kind==='obsidian'?t('panel.obsidianRunning'):t('panel.exportRunning'));
      try{const r=await call({type:'panel:export',kind});if(kind!=='pdf'||r?.error)say(r?.status||'',!!r?.error);}catch(e){say(e.message,true);}finally{if($('export'))$('export').disabled=false;}};
    $('pick').onclick=async()=>{try{await call({type:'panel:open'});window.close();}catch(e){say(e.message,true);}};
  }
  store.onChange((v,changed)=>{if(changed.includes('exportKind')||changed.includes('htmlForm'))drawHero();});
  drawHero();
  if(chatTab(tab))try{
    summary=await call({type:'panel:summary'});
    if(summary?.error){say(summary.error,true);summary=null;}
    // The page keeps the script it loaded with; after a reload of the extension it needs a refresh.
    else if(summary&&summary.version!==loaded&&!stale)warnWith(t('panel.pageStale',bold(summary.version),bold(loaded)),t('panel.reloadPage'),()=>{chrome.tabs.reload(tab.id);window.close();});
    drawHero();panel.refresh();
  }catch(e){say(t('panel.cannotConnect',e.message),true);}

  function css(){return `
html,body{margin:0}
body.cx{background:var(--surface)}
body[data-page=popup]{width:360px}
.xhd{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}
.xhd b{flex:1;font-size:15px;font-weight:600}
.xhero{margin:0 12px;padding:14px 14px 12px;border-radius:16px;background:var(--bg)}
.xk{font-size:11.5px;color:var(--muted);font-weight:500}
.xt{font-size:16px;font-weight:600;margin-top:2px;line-height:1.35;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xm{font-size:12px;color:var(--muted);margin-top:2px;white-space:pre-wrap}
.xm.bad,.xm .bad{color:color-mix(in srgb,var(--err) 70%,var(--text))}
.xm.row{display:flex;align-items:center;gap:8px}
.xm.row>span{flex:1;min-width:0}
.cx .warnlink{display:block;max-width:100%;border:0;background:none;padding:0;font:inherit;font-weight:600;color:color-mix(in srgb,var(--warn) 75%,var(--text));text-decoration:underline;text-underline-offset:3px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}
.cx .warnlink:hover{color:var(--text)}
.ksel{flex:none;font:inherit;font-size:12px;font-weight:500;color:var(--pri-deep);background:color-mix(in srgb,var(--pri) 12%,var(--surface));border:0;border-radius:999px;padding:4px 8px;cursor:pointer}
.ksel option{background:var(--surface);color:var(--text)}
.xbtns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.xsec{margin-top:6px}
.xft{display:flex;align-items:center;gap:14px;padding:12px 16px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);margin-top:10px}
.xft a{display:inline-flex;gap:4px;align-items:center;cursor:pointer;text-decoration:none;color:inherit}
.xft a:hover{color:var(--text)}
.xft .grow{flex:1}
.xft .ic{width:13px;height:13px}
body[data-page=options].cx{background:var(--bg)}
.opt{max-width:720px;margin:32px auto;padding:0 16px}
.opth{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.opth h1{flex:1;font-size:18px;font-weight:600;margin:0}
.opth .xver{background:var(--surface)}
.opt .card{background:var(--surface);border-radius:24px;padding:4px 0 10px;overflow:hidden}
.opt .xwarn,.opt .xmsg{margin:0 0 12px}
.opt .xft{border-top:0}
.opt select.fs{max-width:220px}
`;}
})();
