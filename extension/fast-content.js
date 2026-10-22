(function mount(again={}){
  const version='0.11.37';
  // On chatgpt.com the manifest keeps this script in every tab (resident.js says so): the two
  // buttons beside the input box are always there and open the sidebar. Injected by hand (tests,
  // the live bundle) the sidebar opens at once, and injecting it again shows or hides it.
  // again: drawn anew in another language ({language, open, view}: open, the sidebar was open there).
  const resident=!!globalThis.ChatExportResident;
  if(globalThis.__fastTextPanel?.dataset.version===version&&globalThis.__fastTextPanel.isConnected){if(!resident)globalThis.__fastTextPanel.hidden=!globalThis.__fastTextPanel.hidden;return;}
  globalThis.__fastTextPanel?.remove();
  // Reloading the extension resets its isolated world but can leave the old
  // panel DOM behind. Remove it before creating the current panel.
  document.querySelectorAll('[data-archive-owned="fast-text"],[data-archive-owned="fast-text-dock"]').forEach(n=>n.remove());
  const dilRender=globalThis.ChatExportDilRender,api=globalThis.FastTextExporter,Settings=globalThis.ChatExportSettings,UI=globalThis.ChatExportUI,I18n=globalThis.ChatExportI18n,t=I18n.t,icon=UI.icon,esc=UI.esc;
  // One set of settings with the toolbar panel and the settings tab (chrome.storage.local, settings.js).
  const settings=Settings.open(),cfg=()=>settings.values;
  // Drawn in the language of the settings read so far; once they are read, a different one draws it again.
  I18n.setLocale(again.language||cfg().language);const shown=I18n.locale;
  const host=document.createElement('div');host.dataset.archiveOwned='fast-text';host.dataset.version=version;host.hidden=resident&&!again.open;
  globalThis.__fastTextPanel=host;document.documentElement.append(host);
  const ui=host.attachShadow({mode:'open'});
  // The sidebar's list is narrow: each kind's short name there (kind.*.side); the settings list has the full one.
  const kindSelect=UI.kindOptions.map(([v])=>`<option value="${v}">${esc(t(`kind.${v}.side`))}</option>`).join('');
  // The sidebar: pick messages, export them; ⚙ shows the same settings as the toolbar panel.
  ui.innerHTML=`<style>${UI.css}${UI.pageCss}:host([hidden]){display:none!important}</style><div class="cx sb" id="sb" lang="${I18n.tag}">
<div class="sbh"><button class="ib" id="back" title="${esc(t('side.back'))}" hidden>${icon('back')}</button><div class="logo" id="logo">${icon('logo')}</div><div class="ht"><b id="sbTitle">${esc(t('side.title'))}</b><span class="vpill" data-tip="${esc(UI.TIPS.ver)}">v${version}</span></div><button class="ib" id="reload" title="${esc(t('side.reload'))}">${icon('refresh')}</button><button class="ib" id="gear" title="${esc(t('side.settings'))}">${icon('gear')}</button><button class="ib" id="close" title="${esc(t('side.close'))}">${icon('x')}</button></div>
<div class="view" id="listView"><div class="sbf"><button class="fchip" id="all">${esc(t('side.all'))}</button><button class="fchip" id="mine">${esc(t('side.mine'))}</button><button class="fchip" id="answers">${esc(t('side.answers'))}</button><button class="fchip" id="invert">${esc(t('side.invert'))}</button><button class="fchip" id="none">${esc(t('side.none'))}</button></div>
<div id="list"></div>
<div class="sbfoot"><div class="stx" id="stx"><div id="status" role="status" aria-live="polite"></div><button id="stop" disabled title="${esc(t('side.stopTip'))}">${icon('stop')}${esc(t('side.stop'))}</button></div><textarea id="output" hidden readonly aria-label="${esc(t('side.previewLabel'))}"></textarea>
<div class="sbrow"><span id="count">${esc(t('side.count',0,0))}</span><select id="kind" aria-label="${esc(t('side.kind'))}">${kindSelect}</select><span class="opill" id="exportPill"><button id="export">${esc(t('side.export'))}</button><button class="oopen" id="obsOpen" hidden title="${esc(t('side.obsOpenTip'))}" aria-label="${esc(t('side.obsOpen'))}">${icon('ext')}<span>${esc(t('side.obsOpen'))}</span></button></span><button class="ib" id="gear2" title="${esc(t('side.settings'))}">${icon('gear')}</button></div>
<div class="ftl"><button class="lnk" id="preview">${icon('eye')}<span>${esc(t('side.preview'))}</span></button><span class="fname" id="fname"></span><button class="lnk" id="useFolder" hidden>${esc(t('side.useFolder'))}</button></div></div></div>
<div class="view setview" id="setView" hidden></div></div>`;
  const $=id=>ui.getElementById(id),route=()=>location.origin+location.pathname,seconds=ms=>(ms/1000).toFixed(2);
  let state=null,busyFlag=false,generation=0,controller,readRoute=null;
  const htmlCards=()=>cfg().htmlCards,escapeProseHtml=()=>cfg().proseHtml==='escape';
  // A saved chat (/c/id) or a shared link (/share/id), which has its own read endpoint.
  const target=()=>{const share=location.pathname.match(/\/share\/([^/]+)/)?.[1];return share?{id:share,share:true}:{id:location.pathname.match(/\/c\/([^/]+)/)?.[1],share:false};};
  const lastMessage=()=>[...document.querySelectorAll('[data-message-id]')].filter(n=>!n.closest('[hidden],[aria-hidden="true"]')).at(-1)?.getAttribute('data-message-id');
  const streaming=()=>document.querySelector('[data-testid="stop-button"],button[aria-label="Stop streaming"],button[aria-label="Stop generating"],button[aria-label="停止生成"]');
  function busy(value){busyFlag=value;for(const id of ['reload','all','mine','answers','invert','none','preview','export','kind','raw','gear','gear2'])$(id).disabled=value;placeDock();if(!value&&host.hidden&&resident&&$('status').textContent)toast($('status').textContent);$('stop').disabled=!value;ui.querySelectorAll('#list input').forEach(n=>n.disabled=value);if(!value)relocalize();}
  function assertCurrent(){if(!state)throw Error(t('err.notRead'));if(state.url!==route())throw Error(t('err.switched'));if(streaming())throw Error(t('err.streaming'));const leaf=lastMessage();if(leaf&&state.leaf&&leaf!==state.leaf&&!state.messages.some(m=>m.id===leaf))throw Object.assign(Error(t('err.branchChanged')),{reread:true});controller?.signal.throwIfAborted();}
  function ids(){return [...ui.querySelectorAll('#list input:checked')].map(n=>n.dataset.messageId);}
  async function load(){controller?.abort();controller=new AbortController();const current=++generation,url=route(),leaf=lastMessage(),where=target();readRoute=url;state=null;obsidianState();busy(true);$('list').replaceChildren();$('output').hidden=true;$('status').textContent=t('status.reading');const start=performance.now(),sandbox=startSandbox();try{
    if(!where.id)throw Error(t('err.openChat'));
    if(streaming())throw Error(t('err.streaming'));
    const data=await api.loadConversation({...where,leafId:leaf,fetch:window.fetch.bind(window),signal:controller.signal,onProgress:p=>$('status').textContent=t('status.readingHistory',p.messages)});
    if(current!==generation||url!==route())throw Error(t('err.switchedWhileReading'));
    state={...data,url,leaf,conversationId:where.share?data.conversationId:where.id,timings:{readMs:performance.now()-start}};
    state.timings.render=await renderStatic(data.messages,sandbox);state.timings.renderMs=performance.now()-start-state.timings.readMs;
    $('list').append(...data.messages.map(messageRow));if(pending){pick(pending);pending=null;}else for(const id of chips)$(id).classList.toggle('on',id==='all');counted();syncSettings();
    $('status').textContent=t('status.read',data.messages.length,seconds(state.timings.readMs))+staleNotice();
  }catch(e){if(current===generation){fail(e.message);counted();}}finally{sandbox?.client.close();if(current===generation)busy(false);}}
  // Created before the conversation is read so the sandbox page, fonts and
  // canvas are ready by the time the cards are drawn.
  function startSandbox(){if(!dilRender||globalThis.ChatExportDilEvaluate)return null;try{
    const client=dilRender.sandboxClient(document,chrome.runtime.getURL('sandbox.html'));
    return {client,warm:client.warmup().catch(e=>({error:e.message}))};
  }catch{return null;}}
  // Executes each message's compiled UI program in the sandbox page at its
  // default state, recovering text that fallbackMarkdown omits ({#each}, values).
  async function renderStatic(messages,sandbox){const started=performance.now(),targets=messages.filter(m=>m.dil?.code),round=v=>Math.round(v);
    if(!targets.length||!dilRender)return {uiMessages:targets.length};
    $('status').textContent=t('status.rendering',targets.length);
    const client=sandbox?.client,evaluate=globalThis.ChatExportDilEvaluate||client,snapshot=globalThis.ChatExportDilSnapshot||client?.snapshot,preview=globalThis.ChatExportAppBlockPreview||client?.appblock,toMd=tree=>dilRender.toMarkdown(tree,{widget:id=>`\u0000APPBLOCK:${id}\u0000`});
    // All messages go to the sandbox at once; cards within a message are also drawn in parallel.
    await Promise.all(targets.map(async m=>{const sent=performance.now();
      // Widgets (code blocks, charts) resolve from the message's content references.
      const dil={...m.dil,contentReferences:m.contentReferences};
      // Cards are drawn to PNG in the sandbox; if that fails, text alone is kept.
      // Their search images are downloaded first (the sandbox cannot fetch them) and drawn in.
      const cards=(async()=>{try{try{dil.images=await pictures(m);}catch(e){if(e?.name==='AbortError')throw e;}const result=await snapshot(dil);m.segments=result.segments.map(s=>({kind:s.kind,tree:s.tree,md:toMd(s.tree),png:s.png,width:s.width,height:s.height,error:s.error,list:s.kind==='card'?pictureListOf(s.tree):null,looseList:s.kind==='card'?pictureListOf(s.tree,true):null}));m.staticMd=m.segments.map(s=>s.md).filter(Boolean).join('\n\n');m.variants=result.variants||[];m.renderTimings={...result.timings,roundTripMs:round(performance.now()-sent)};}
      catch{try{m.staticMd=toMd(await evaluate(dil));}catch(e){m.renderError=e.message;}}})();
      // Each AppBlock runs briefly in its own sandboxed frame and is drawn to a preview PNG.
      const shots=Promise.all((preview?dilRender.appBlocks(m.dil,m.contentReferences):[]).map(async b=>{const t=performance.now();try{return [b.invocationId,{...await preview(b),ms:round(performance.now()-t)}];}catch(e){return [b.invocationId,{error:e.message,ms:round(performance.now()-t)}];}}));
      const [,previews]=await Promise.all([cards,shots]);m.appPreviews=Object.fromEntries(previews);
      if(previews.length&&m.renderTimings)m.renderTimings.appBlocks=previews.map(([id,p])=>({id,ms:p.ms,...(p.error?{error:p.error}:{width:p.width,height:p.height})}));
    }));
    return {uiMessages:targets.length,wallMs:round(performance.now()-started),sandboxLoadMs:client?.stats.loadMs??null,warmup:sandbox?await sandbox.warm:null,
      messages:targets.map(m=>({id:m.id,...(m.renderTimings||{}),...(m.renderError?{error:m.renderError}:{})}))};}
  const safeName=id=>String(id).replace(/[^\w-]/g,'_');
  const uiImageUrls=m=>api.dilImageUrls(m.dil);
  // Maps are copied from the page, where ChatGPT has already drawn them (Mapbox, WebGL).
  // A resize makes every map redraw; the pixels are read in the next frame, before the
  // browser clears them, and the rating pins (page elements over the map) are drawn back on.
  const mapLink=/!\[[^\]]*\]\(map:(\d+)\)/g;
  async function captureMaps(m,assets,warnings,html=false){
    const order=[...new Set([...m.md.matchAll(mapLink)].map(x=>x[1]))];if(!order.length)return;
    const canvases=[...document.querySelectorAll(`[data-dil-message-id="${String(m.id).replace(/["\\]/g,'\\$&')}"] canvas.mapboxgl-canvas`)];
    const shots=canvases.length?await mapShots(canvases):[],paths=new Map();let n=0;
    for(const [k,index] of order.entries()){const blob=shots[k];
      if(blob){const path=`assets/map-${safeName(m.id)}-${++n}.jpg`;assets.push({path,blob,messageId:m.id,kind:'map-image'});paths.set(index,path);}
      else warnings.push(`${m.id}: ${t('warn.mapNotCaptured',canvases.length?t('warn.mapNotDrawn'):t('warn.mapNotFound'))}`);}
    // The HTML export keeps the map:<refIndex> links and draws the map itself, over this picture.
    if(html){m.mapImages=Object.fromEntries(paths);return;}
    m.md=m.md.replace(mapLink,(x,index)=>paths.has(index)?x.replace(`map:${index}`,paths.get(index)):'').replace(/\n{3,}/g,'\n\n');}
  async function mapShots(canvases){
    const copy=c=>{try{const out=new OffscreenCanvas(c.width,c.height),g=out.getContext('2d');g.drawImage(c,0,0);
      // A map that has not been drawn reads back as transparent.
      const d=g.getImageData(0,0,c.width,c.height).data;let seen=0;for(let i=3;i<d.length&&seen<50;i+=4*101)if(d[i])seen++;return seen>=50?out:null;}catch{return null;}};
    window.dispatchEvent(new Event('resize'));
    // A background tab may never run the frame; then whatever is on the canvases is used.
    const copies=await new Promise(done=>{let finished=false;const finish=()=>{if(!finished){finished=true;done(canvases.map(copy));}};requestAnimationFrame(finish);setTimeout(finish,1500);});
    return Promise.all(copies.map(async(out,i)=>{if(!out)return null;drawPins(out,canvases[i]);return out.convertToBlob({type:'image/jpeg',quality:.9});}));}
  function drawPins(out,canvas){
    const host=canvas.closest('.mapboxgl-map'),g=out.getContext('2d'),S=out.width/(canvas.getBoundingClientRect().width||out.width);
    const pill=(x,y,w,h)=>{g.beginPath();g.roundRect?g.roundRect(x,y,w,h,h/2):g.rect(x,y,w,h);};
    g.textAlign='center';g.textBaseline='middle';
    for(const marker of host?.querySelectorAll('.mapboxgl-marker')||[]){
      const at=/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(marker.style.transform||'');if(!at)continue;
      const lines=String(marker.innerText??marker.textContent).split('\n').map(s=>s.trim()).filter(Boolean),rating=/^\d+(\.\d+)?$/.test(lines[0]||'')?lines.shift():'';
      const x=Number(at[1])*S,y=Number(at[2])*S,label=rating?`★${rating}`:'●',name=(lines[0]||'').length>22?lines[0].slice(0,21)+'…':lines[0]||'';
      g.font=`600 ${12*S}px system-ui,sans-serif`;const w=g.measureText(label).width+16*S,h=22*S,cy=y-h/2-4*S;
      g.fillStyle='rgba(0,0,0,.2)';pill(x-w/2,cy-h/2+2*S,w,h);g.fill();g.fillStyle='#fff';pill(x-w/2,cy-h/2,w,h);g.fill();g.fillStyle='#0d0d0d';g.fillText(label,x,cy);
      if(name){g.font=`500 ${11*S}px system-ui,sans-serif`;g.lineWidth=3*S;g.strokeStyle='rgba(255,255,255,.95)';g.strokeText(name,x,cy+h/2+10*S);g.fillStyle='#333';g.fillText(name,x,cy+h/2+10*S);}}
    const credit='© Mapbox © OpenStreetMap';g.font=`${10*S}px system-ui,sans-serif`;const cw=g.measureText(credit).width+10*S;
    g.fillStyle='rgba(255,255,255,.85)';g.fillRect(out.width-cw,out.height-16*S,cw,16*S);g.fillStyle='#555';g.textAlign='right';g.fillText(credit,out.width-5*S,out.height-8*S);}
  // Downloads a message's UI images once (kept for the ZIP) and returns small copies to draw into cards.
  async function pictures(m){
    const urls=uiImageUrls(m),charts=cardSandboxPaths(m).filter(p=>/\.(?:png|jpe?g|gif|webp)$/i.test(p)),drawn={};m.smallImages=new Map();
    // Charts the code interpreter wrote and a card shows (src "sandbox:/mnt/data/a.png") are drawn
    // in too; the ZIP saves these same downloads as code files.
    const [ui,files]=await Promise.all([urls.length?api.downloadUrls({urls,fetch:window.fetch.bind(window),fetchImage,signal:controller.signal,prefix:`assets/ui-${safeName(m.id)}-`}):[],
      charts.length&&state?.conversationId?api.downloadSandboxFiles({items:charts.map(path=>({messageId:m.id,path})),conversationId:state.conversationId,fetch:window.fetch.bind(window),signal:controller.signal}):[]]);
    if(urls.length)m.uiImages=ui;m.cardFiles=files.filter(f=>f.blob);
    // The small copies are kept too: table thumbnails are cut from them instead of decoding the originals again.
    await Promise.all([...ui.filter(i=>i.blob).map(i=>[i.url,i.blob,400]),...m.cardFiles.map(f=>['sandbox:'+f.path,f.blob,900])].map(async([url,blob,max])=>{try{const small=await thumbnail(blob,max);m.smallImages.set(url,small);drawn[url]=await dataUrl(small);}catch{}}));
    // Search images drawn in the card leave the card's text; charts stay there at full size.
    m.drawnImages=new Set(Object.keys(drawn).filter(u=>!u.startsWith('sandbox:')));return drawn;}
  async function thumbnail(blob,max=400){
    const bitmap=await createImageBitmap(blob),k=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
    const canvas=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*k)),Math.max(1,Math.round(bitmap.height*k)));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
    return canvas.convertToBlob({type:'image/jpeg',quality:.85});}
  const dataUrl=blob=>new Promise((ok,fail)=>{const reader=new FileReader();reader.onload=()=>ok(reader.result);reader.onerror=()=>fail(reader.error);reader.readAsDataURL(blob);});
  // A row of search images ("|200" thumbnails, which only Obsidian sizes) becomes one strip image
  // that every Markdown viewer shows small; the originals stay listed in a folded note.
  async function stripGalleries(m,images,assets){let n=0;const lines=m.md.split('\n'),gallery=/!\[([^\]]*)\|200\]\((assets\/[^)\s]+)\)/g;
    for(let i=0;i<lines.length;i++){const found=[...lines[i].matchAll(gallery)];
      if(found.length<2||lines[i].replace(gallery,'').trim())continue;
      let sheet=null;try{sheet=await stripImage(found.map(f=>images.find(x=>x.path===f[2])?.blob).filter(Boolean));}catch{}
      if(!sheet)continue;
      const path=`assets/strip-${safeName(m.id)}-${++n}.jpg`;assets.push({path,blob:sheet,messageId:m.id,kind:'image-strip'});
      lines[i]=`![${t('md.searchImages',found.length)}](${path})\n\n> [!note]- ${t('md.originals',found.length)}\n${found.map(f=>`> - [${f[1].trim()||t('md.image')}](${f[2]})`).join('\n')}`;}
    m.md=lines.join('\n');}
  async function stripImage(blobs,{height=200,width=1000,gap=10}={}){
    const bitmaps=(await Promise.all(blobs.map(b=>createImageBitmap(b).catch(()=>null)))).filter(Boolean);if(bitmaps.length<2)return null;
    const rows=[[]];let x=0;
    for(const bitmap of bitmaps){const w=Math.min(width,Math.round(bitmap.width*height/bitmap.height));if(rows.at(-1).length&&x+w>width){rows.push([]);x=0;}rows.at(-1).push({bitmap,w});x+=w+gap;}
    const W=Math.max(...rows.map(r=>r.reduce((s,t)=>s+t.w,0)+gap*(r.length-1))),H=rows.length*height+gap*(rows.length-1);
    const canvas=new OffscreenCanvas(W,H),g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);
    rows.forEach((r,y)=>{let left=0;for(const t of r){g.drawImage(t.bitmap,left,y*(height+gap),t.w,height);left+=t.w+gap;}});
    bitmaps.forEach(b=>b.close?.());return canvas.convertToBlob({type:'image/jpeg',quality:.85});}
  // A picture-list card (each image alone beside its text) becomes a Markdown table: a small
  // thumbnail linking to the original, then the text, which stays editable. The thumbnails are
  // real 240×180 files, so every Markdown viewer shows them the same size. If any picture is
  // missing or cannot be shrunk, it throws the reason and the card falls back to the PNG below.
  // Nothing is added to the archive until the whole table is ready.
  // With the panel's HTML option on, the same pictures and text are laid out side by side in HTML
  // instead (closer to ChatGPT, but only viewers that show HTML, such as Obsidian, display it).
  async function pictureTable(m,s,n,assets,html){
    if(fault('image'))throw Error(t('fault.image'));
    const originals=s.list.map(i=>(m.uiImages||[]).find(x=>x.url===i.src&&x.blob)),missing=originals.filter(o=>!o).length;
    if(missing)throw Error(t('card.imagesMissing',missing));
    const thumbs=await Promise.all(originals.map(o=>coverThumb(m.smallImages?.get(o.url)||o.blob))).catch(e=>{throw Error(t('card.thumbFailed',e?.message||e));});
    // A lone \r is a line break to Markdown parsers too, and would end the table row.
    const cell=t=>t.replace(/\|/g,'\\|').replace(/\\?\$/g,'\\$').split(/\r\n?|\n/).filter(l=>l.trim()).join('<br>'),files=[];
    const rows=s.list.map((item,k)=>{const path=`assets/card-${safeName(m.id)}-${n}-pic${k+1}.jpg`,alt=item.alt.replace(/[[\]|\r\n]/g,' ').trim();files.push({path,blob:thumbs[k],messageId:m.id,width:240,height:180,kind:'card-thumb'});
      return `| [![${alt}](${path})](${originals[k].path}) | ${cell(item.md)} |`;});
    if(fault('table'))throw Error(t('fault.table'));
    const table=['| | |','| --- | --- |',...rows].join('\n'),{header,footer}=s.list;
    if(!html){assets.push(...files);return {md:table,layout:'table'};}
    // The HTML is used only if it passes the checks; otherwise the same pictures go in the table.
    let block,problem;
    try{block=pictureHtml(m,s,files,originals);problem=fault('html')?t('fault.html'):dilRender.validateCardHtml(block,s.list.map(i=>i.md),DOMParser,{header:header?.md,footer:footer?.md});}catch(e){problem=e?.message||String(e);}
    // The table has no place for the text above or below the pictures: rather than drop it, the card stays a PNG.
    if(problem&&(header||footer))throw Error(t('card.htmlToPng',problem));
    assets.push(...files);
    return problem?{md:table,layout:'table',fallback:t('card.htmlToTable',problem)}:{md:block,layout:'html'};}
  // The HTML layout: one line per picture inside one <div>, with no blank or indented line, since
  // a Markdown viewer ends an HTML block at a blank line and shows an indented one as code.
  // The text beside each picture comes from the card tree (pictureList), not from its Markdown;
  // text above or below the pictures (a heading, a caption) gets a <div> of its own before or after them.
  const htmlAttr=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]).replace(/\$/g,'&#36;');
  function pictureHtml(m,s,files,originals){
    const rows=s.list.map((item,k)=>{if(item.html==null)throw Error(item.htmlError||t('card.noHtmlText'));
      return `<div style="display:flex;gap:14px;align-items:flex-start;margin:10px 0"><a href="${htmlAttr(originals[k].path)}"><img src="${htmlAttr(files[k].path)}" alt="${htmlAttr(item.alt.replace(/[[\]|\r\n]/g,' ').trim())}" width="160" height="120" style="border-radius:8px;flex:none"/></a><div>${item.html}</div></div>`;});
    const part=(p,where,style)=>{if(!p)return [];if(p.html==null)throw Error(t(`card.${where}NoHtml`,p.htmlError||t('card.noHtml')));return [`<div style="${style}">${p.html}</div>`];};
    return `<div>\n${[...part(s.list.header,'above','margin:0 0 6px'),...rows,...part(s.list.footer,'below','margin:6px 0 0;color:#666;font-size:.9em')].join('\n')}\n</div>`;}
  async function coverThumb(blob,width=240,height=180){
    if(fault('thumb'))throw Error(t('fault.thumb'));
    const bitmap=await createImageBitmap(blob),k=Math.max(width/bitmap.width,height/bitmap.height),w=bitmap.width*k,h=bitmap.height*k;
    const canvas=new OffscreenCanvas(width,height);canvas.getContext('2d').drawImage(bitmap,(width-w)/2,(height-h)/2,w,h);bitmap.close?.();
    return canvas.convertToBlob({type:'image/jpeg',quality:.85});}
  // Fault switch for checking the fallbacks on a real page: in the ChatGPT tab's console run
  // localStorage.chatExportFault='list'|'image'|'thumb'|'table'|'html'|'png', export, then removeItem.
  const fault=stage=>{try{return localStorage.getItem('chatExportFault')===stage;}catch{return false;}};
  // loose: the wider recognition (image in its own box, list in a col) used only with the HTML option.
  const pictureListOf=(tree,loose=false)=>{try{if(fault('list'))throw Error('fault');return dilRender.pictureList?.(tree,{loose})||null;}catch{return null;}};
  // Each card becomes an image, with its text folded underneath (searchable, not duplicated on screen).
  // Pictures already drawn in the card are left out of the folded text.
  // Every card's outcome (table, png or text, and why a table fell back) goes into manifest.json.
  async function cardMarkdown(m,assets,warnings,cards,pdf){let n=0;const parts=[];for(const s of m.segments)parts.push(await (async()=>{
    let fallback;
    const html=htmlCards()&&!pdf,list=s.kind==='card'?(s.list||(html?s.looseList:null)):null;
    if(list){try{const out=await pictureTable(m,{...s,list},n+1,assets,html);cards.push({messageId:m.id,card:++n,layout:out.layout,pictures:list.length,...(out.fallback?{fallback:out.fallback}:{})});return out.md;}catch(e){fallback=e?.message||String(e);}}
    if(s.kind!=='card'||!s.png||fault('png')){if(s.kind==='card'){cards.push({messageId:m.id,card:null,layout:'text',fallback});if(s.error)warnings.push(`${m.id}: ${t('warn.cardImageFailed',s.error)}`);}return s.md;}
    cards.push({messageId:m.id,card:n+1,layout:'png',fallback});
    const path=`assets/card-${safeName(m.id)}-${++n}.png`;
    assets.push({path,blob:new Blob([s.png],{type:'image/png'}),messageId:m.id,width:s.width,height:s.height,kind:'card-image'});
    const words=s.md.replace(/!\[[^\]]*\]\(([^)\s]+)\) ?/g,(x,u)=>m.drawnImages?.has(u)?'':x).replace(/\n{3,}/g,'\n\n').trim();
    const text=words?`\n\n> [!note]- ${t('md.cardText')}\n${words.split('\n').map(l=>l?`> ${l}`:'>').join('\n')}`:'';
    return `![${t('md.card')}](${path})${text}`;
  })());return parts.filter(Boolean).join('\n\n');}
  const blocksOf=m=>dilRender&&m.dil?dilRender.appBlocks(m.dil,m.contentReferences):[];
  // Text the cards show only in another state, folded under the answer (card images show the default state).
  function withVariants(m,md){if(!m.variants?.length)return md;const titles=new Map(blocksOf(m).map(b=>[b.invocationId,b.title]));
    const body=m.variants.map(v=>`**${v.label}**\n\n${v.md.replace(I18n.pattern('dil.appToken','g'),(x,id)=>t('md.appNamed',titles.get(id)||id))}`).join('\n\n');
    return `${md}\n\n> [!note]- ${t('md.variants')}\n${body.split('\n').map(l=>l?`> ${l}`:'>').join('\n')}`;}
  const widgetToken=/\u0000APPBLOCK:([^\u0000]*)\u0000/g,sandboxLink=/\]\((sandbox:\/[^)\s]+)\)/g;
  // A card can name files only in its data ({url:"sandbox:/mnt/data/…"}), with no link in the text.
  // In the source the same path also sits in Markdown links, "(sandbox:/mnt/data/a.csv)": an
  // unmatched ")" ends the path, while "report (1).csv" keeps its own parentheses.
  const cardSandboxPaths=m=>m.dil?[...new Set([...`${m.dilSource||''}\n${JSON.stringify(m.dil.constants||{})}`.matchAll(/sandbox:(\/mnt\/data\/(?:[^"'`\n\\()\]<>]|\([^()"'`\n\\]*\))+)/g)].map(x=>x[1].trim()))]:[];
  // The panel is injected from the files on disk at every click, but the background worker and
  // permissions only change when the extension is reloaded; a version mismatch means it was not.
  function staleNotice(){let loaded=null;try{loaded=chrome.runtime.getManifest?.().version;}catch{}return loaded&&loaded!==version?`\n⚠ ${t('status.stale',loaded,version)}`:'';}
  // Search images (images.openai.com) are fetched by the background worker, which may cross origins.
  async function fetchImage(url){const r=await send({type:'archive:image',url});const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));return new Blob([bytes],{type:r.type});}
  async function send(message){const response=await chrome.runtime.sendMessage(message);if(response?.error)throw Error(response.error);return response;}
  // Recorded in the manifest so an export shows whether the tab went to the background.
  let hiddenDuringExport=false;document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')hiddenDuringExport=true;});
  async function build(zip,mode){const html=mode==='html',pdf=mode==='pdf';assertCurrent();const selected=ids();if(!selected.length)throw Error(t('err.selectOne'));hiddenDuringExport=document.visibilityState==='hidden';const started=performance.now(),messages=[],assets=[],warnings=[],cards=[];
    for(const original of state.messages){if(!selected.includes(original.id))continue;
      // The PDF uses the cards as the ZIP does (picture lists as their stable table, never as HTML) and shows prose HTML as text, as the page does.
      const md=original.staticMd?(zip&&original.segments?(html?htmlSegments(original):await cardMarkdown(original,assets,warnings,cards,pdf)):original.staticMd):escapeProseHtml()||pdf?original.mdEscaped??original.md:original.md;
      if(original.dil?.code&&!original.staticMd&&original.renderError)warnings.push(`${original.id}: ${t('warn.renderFailed',original.renderError)}`);
      messages.push({...original,md:withVariants(original,md).replace(/!\[[^\]]*\]\(assets\/(?!card-)[^)]+\)/g,'')});
    }
    if(zip)await attachData(messages,assets,warnings,html);
    // Only the text: what the ZIP would hold is named where it was.
    else for(const m of messages)m.md=m.md.replace(mapLink,'').replace(/\[((?:\\.|[^\]\\])*)\]\(attachment:[\w-]+\)/g,(_,name)=>t('md.attachmentInZip',name)).replace(/\[([^\]]*)\]\(datatable:[\w-]+\)/g,(_,label)=>t('md.tableInZip',label)).replace(/!\[[^\]]*\]\(asset:[\w-]+\)/g,()=>t('md.imageInZip')).replace(/\[([^\]]*)\]\(sandbox:\/[^)\s]+\)/g,(_,name)=>t('md.codeFileInZip',name)).replace(widgetToken,(_,id)=>t('md.appInZip',blocksOf(m).find(b=>b.invocationId===id)?.title||id));
    const data={...state,messages,warnings:[...new Set([...state.warnings.filter(w=>selected.some(id=>w.startsWith(`${id}:`))),...warnings])]};
    // The PDF reads its sections by the plain source line and role headings, so the Markdown settings stay out of it.
    const v=cfg(),md=api.markdown(data,selected,state.url,pdf?{}:{yaml:v.yaml,model:v.model,timestamps:v.timestamps,roles:{user:Settings.role(v,'user'),assistant:Settings.role(v,'assistant')},created:state.raw?.create_time??state.messages[0]?.createTime});state.timings.prepareMs=performance.now()-started;
    return {md,assets,warnings:data.warnings,messages:selected,cards,items:messages};
  }
  // Data-first archive: original images via the files API and Intelligent UI
  // data as stored on the message, all in parallel and without the page.
  async function attachData(messages,assets,warnings,html=false){
    const signal=controller.signal,request=window.fetch.bind(window),safe=id=>String(id).replace(/[^\w-]/g,'_');
    const fileIds=messages.flatMap(m=>(m.images||[]).map(i=>i.fileId));
    if(fileIds.length)$('status').textContent=t('status.downloadingImages',fileIds.length);
    const conversationId=state.conversationId;
    // Files the code interpreter wrote, linked as sandbox:/mnt/data/... in the answer.
    const linkedItems=conversationId?messages.flatMap(m=>[...new Set([...m.md.matchAll(sandboxLink)].map(x=>x[1]))].map(link=>({messageId:m.id,link,path:decodeURIComponent(link.slice(8))}))):[];
    const cardItems=conversationId?messages.filter(m=>m.dil).flatMap(m=>cardSandboxPaths(m)
      .filter(path=>!linkedItems.some(x=>x.messageId===m.id&&x.path===path)).map(path=>({messageId:m.id,path,card:true}))):[];
    const sandboxItems=[...linkedItems,...cardItems];
    const attachmentIds=messages.flatMap(m=>[...(m.attachments||[]),...(m.tables||[])].map(a=>a.fileId));
    const [files,uiData,codeFiles,attached]=await Promise.all([
      api.downloadFiles({ids:fileIds,conversationId,fetch:request,signal,onProgress:p=>$('status').textContent=t('status.downloadingProgress',p.done,p.total)}),
      Promise.all(messages.filter(m=>m.dil).map(async m=>({m,images:m.uiImages||await api.downloadUrls({urls:uiImageUrls(m),fetch:request,fetchImage,signal,prefix:`assets/ui-${safe(m.id)}-`})}))),
      api.downloadSandboxFiles({items:sandboxItems,conversationId,fetch:request,signal,cached:new Map(messages.flatMap(m=>(m.cardFiles||[]).map(f=>[`${m.id}\n${f.path}`,f.blob])))}),
      api.downloadFiles({ids:attachmentIds,conversationId,fetch:request,signal})
    ]);
    // Attachments keep the name the user gave them, beside the code files.
    const taken=new Set(codeFiles.filter(f=>f.blob).map(f=>f.localPath)),attachedById=new Map(attached.map(f=>[f.fileId,f]));
    for(const m of messages)for(const a of m.attachments||[]){const f=attachedById.get(a.fileId),link=`](attachment:${a.fileId})`;
      if(!f?.blob){warnings.push(`${m.id}: ${t('warn.attachmentFailed',a.name,f?.error||t('err.unknown'))}`);m.md=m.md.replace(/\[((?:\\.|[^\]\\])*)\]\(attachment:([\w-]+)\)/g,(x,text,id)=>id===a.fileId?t('md.notDownloaded',text):x);continue;}
      // Named like code files, so the link needs no escaping ("#2" would read as a heading link).
      // Letters and digits of every script are kept (Cyrillic, kana, Hangul as well as Chinese).
      let name=a.name.replace(/[^\p{L}\p{N}_.\-]/gu,'_')||'attachment',n=1,path=`files/${name}`;
      while(taken.has(path))path=`files/${name.replace(/(\.[^.]*)?$/,x=>`-${++n}${x}`)}`;
      if(!f.localPath){f.localPath=path;taken.add(path);assets.push({path,blob:f.blob,messageId:m.id,kind:'attachment'});}
      m.md=m.md.split(link).join(`](${f.localPath})`);}
    // A scrollable DataFrame: the whole CSV is saved, its first rows shown as a table.
    for(const m of messages)for(const table of m.tables||[]){const f=attachedById.get(table.fileId),label=t('md.dataTable',table.title),token=`[${label}](datatable:${table.fileId})`;
      if(!f?.blob){warnings.push(`${m.id}: ${t('warn.tableFailed',table.title,f?.error||t('err.unknown'))}`);m.md=m.md.split(token).join(t('md.tableNotDownloaded',label));continue;}
      let name=`${table.title.replace(/[^\p{L}\p{N}_.\-]/gu,'_').replace(/_+/g,'_').replace(/^_|_$/g,'')||'table'}.csv`,n=1,path=`files/${name}`;
      while(taken.has(path))path=`files/${name.replace(/(\.[^.]*)?$/,x=>`-${++n}${x}`)}`;
      taken.add(path);assets.push({path,blob:f.blob,messageId:m.id,kind:'data-table'});
      const preview=api.csvTable(await f.blob.text(),10);
      m.md=m.md.split(token).join(`**${label}**${t('md.tableLinks',`[${t('md.fullCsv')}](${path})${preview.rows?t('md.tableSize',I18n.number(preview.rows),preview.cols)+(preview.rows>10?t('md.tableFirstRows'):''):''}`)}${preview.md?`\n\n${preview.md}`:''}`);}
    const cardLinks=new Map();
    for(const f of codeFiles){const m=messages.find(x=>x.id===f.messageId),item=sandboxItems.find(x=>x.messageId===f.messageId&&x.path===f.path);
      if(f.blob)assets.push({path:f.localPath,blob:f.blob,messageId:f.messageId,kind:'code-file'});else warnings.push(`${f.messageId}: ${t(item.card?'warn.cardCodeFileFailed':'warn.codeFileFailed',f.path,f.error)}`);
      if(!f.blob)continue;
      if(!item.card){m.md=m.md.split(`](${item.link})`).join(`](${f.localPath})`);continue;}
      const name=(f.path.split('/').pop()||'file').replace(/[\\`*_[\]<&#$]/g,'\\$&');
      cardLinks.set(m,[...(cardLinks.get(m)||[]),`- [${name}](${f.localPath})`]);}
    for(const [m,links] of cardLinks)m.md+=`\n\n**${t('md.codeFiles')}**\n\n${links.join('\n')}`;
    const byId=new Map(files.map(f=>[f.fileId,f]));
    for(const f of files)if(f.blob)assets.push({path:f.path,blob:f.blob,messageId:messages.find(m=>(m.images||[]).some(i=>i.fileId===f.fileId))?.id,kind:'original-image'});
    for(const m of messages)m.md=m.md.replace(/!\[([^\]]*)\]\(asset:([\w-]+)\)/g,(_,alt,id)=>{const f=byId.get(id);if(f?.blob)return `![${alt}](${f.path})`;warnings.push(`${m.id}: ${t('warn.imageFailed',id,f?.error||t('err.unknown'))}`);return t('md.imageFailed',id);});
    for(const {m,images} of uiData){
      const path=`ui/msg-${safe(m.id)}.json`,localAssets={};
      for(const image of images){if(image.blob){localAssets[image.url]=image.path;assets.push({path:image.path,blob:image.blob,messageId:m.id,kind:'ui-image'});m.md=m.md.split(`](${image.url})`).join(`](${image.path})`);}else warnings.push(`${m.id}: ${t('warn.uiImageFailed',image.error)}`);}
      if(!html)await stripGalleries(m,images,assets);await captureMaps(m,assets,warnings,html);
      const blocks=blocksOf(m).map(b=>({...b,path:`ui/appblock-${safe(m.id)}-${safe(b.id)}.html`})),linked=new Set();
      for(const b of blocks)assets.push({path:b.path,blob:new Blob([dilRender.standaloneHtml(b)],{type:'text/html'}),messageId:m.id,kind:'appblock'});
      // The preview image goes above the link; inside a folded card note each new line keeps the quote prefix.
      m.md=m.md.replace(/^([> ]*)(.*?)\u0000APPBLOCK:([^\u0000]*)\u0000/gm,(_,quote,before,id)=>{const b=blocks.find(x=>x.invocationId===id);if(!b)return `${quote}${before}${t('md.appMissing',id)}`;linked.add(b.path);
        const shot=m.appPreviews?.[id],lines=[];
        if(shot?.png){const png=b.path.replace(/^ui\//,'assets/').replace(/\.html$/,'.png');assets.push({path:png,blob:new Blob([shot.png],{type:'image/png'}),messageId:m.id,width:shot.width,height:shot.height,kind:'appblock-preview'});lines.push(`![${t('md.appPreview',b.title)}](${png})`,'');}
        else if(shot?.error)warnings.push(`${m.id}: ${t('warn.appPreviewFailed',b.title,shot.error)}`);
        lines.push(`> [!chatgpt-appblock] ${t('md.appLink',b.title,`[${b.path}](${b.path})`)}`);
        return `${quote}${before}${lines.join(`\n${quote}`)}`;});
      // AppBlocks hidden in the default state (e.g. behind a checkbox) are still listed.
      const hidden=blocks.filter(b=>!linked.has(b.path)).map(b=>`\n> - ${t('md.hiddenApp',b.title,`[${b.path}](${b.path})`)}`).join('');
      const record={messageId:m.id,format:'model_dil_v2',source:m.dilSource,staticMarkdown:m.staticMd??null,variants:m.variants||[],renderError:m.renderError??null,appBlocks:blocks.map(({id,invocationId,title,path})=>({id,invocationId,title,path})),localAssets,dil:m.dil,contentReferences:m.contentReferences};
      // The raw interface data is for developers (高级 → 附带界面数据).
      if(cfg().uiFolder)assets.push({path,blob:new Blob([JSON.stringify(record,null,2)],{type:'application/json'}),messageId:m.id,kind:'ui-data'});
      // Replies that compiled to plain prose need no pointer in the note; their JSON is still saved.
      // The raw data stays in ui/ (listed in manifest.json) without a pointer in every reply.
      if(hidden)m.md+=`\n\n> [!chatgpt-appblock]- ${t('md.hiddenApps')}${hidden}\n`;
    }
  }
  // A title can end in a newline or spaces ("化工工艺教学 \n"); Windows also drops trailing dots.
  // 整段对话导出为 HTML: the archive pass above, then html-export.js lays out the page. Card
  // segments stay tokens, which the page replaces with working cards.
  const htmlSegments=m=>m.segments.map((s,i)=>s.kind==='card'?`\u0000CARD:${i}\u0000`:s.md).filter(Boolean).join('\n\n');
  async function htmlBlob(result){const form=cfg().htmlForm,exporter=globalThis.ChatExportHtml;
    if(!exporter)throw Error(t('err.htmlModule'));
    $('status').textContent=t('status.buildingHtml');
    const out=await exporter.build({title:state.title,url:state.url,version,form,roles:{user:Settings.role(cfg(),'user'),assistant:Settings.role(cfg(),'assistant')},maps:cfg().htmlMap,items:result.items,assets:result.assets,warnings:result.warnings,exportedAt:new Date().toISOString()});
    result.htmlStats=out.stats;
    if(form==='single')return new Blob([out.html],{type:'text/html;charset=utf-8'});
    const zip=new JSZip();zip.file('conversation.html',out.html);for(const f of out.files)zip.file(f.path,f.blob);
    zip.file('manifest.json',JSON.stringify({version,format:'html',form,source:state.url,messages:result.messages,warnings:result.warnings,html:out.stats,assets:out.files.map(f=>f.path),exportedAt:new Date().toISOString()},null,2));
    return zip.generateAsync({type:'blob'});}
  // 文件名 settings: title and date in the chosen order, the version at the end only when asked.
  function filename(ext){return `${Settings.fileBase(cfg(),{title:state.title})}.${ext}`;}
  async function run(mode,deliver){if(busyFlag)return;controller=new AbortController();busy(true);const started=performance.now();let done=false;try{await settings.ready;
    const result=await build(mode==='zip'||mode==='html'||mode==='pdf'||mode==='obsidian',mode);if(mode!=='html'){$('output').value=result.md;if(mode==='preview')$('output').hidden=false;}
    if(mode==='pdf'||mode==='obsidian'){assertCurrent();await deliver(result);}
    else if(mode!=='preview'){let blob;if(mode==='html')blob=await htmlBlob(result);else if(mode==='zip'){
      const zip=new JSZip();zip.file('conversation.md',result.md);for(const asset of result.assets)zip.file(asset.path,asset.blob);
      const manifest={version,loadedVersion:(()=>{try{return chrome.runtime.getManifest?.().version??null;}catch{return null;}})(),source:state.url,exportProfile:{profile:cfg().profile,htmlCards:htmlCards(),proseHtml:cfg().proseHtml,yaml:cfg().yaml,uiFolder:cfg().uiFolder},visibility:{hiddenDuringExport,atEnd:document.visibilityState},messages:result.messages,warnings:result.warnings,cards:result.cards,timings:{...state.timings,exportPrepareMs:performance.now()-started},assets:result.assets.map(({path,messageId,width,height,tiles,kind})=>({path,messageId,width,height,tiles,kind})),exportedAt:new Date().toISOString()};
      zip.file('manifest.json',JSON.stringify(manifest,null,2));blob=await zip.generateAsync({type:'blob'});
    }else blob=new Blob([result.md],{type:'text/markdown;charset=utf-8'});
    assertCurrent();const url=URL.createObjectURL(blob);try{await send({type:'archive:download',url,filename:filename(extOf(mode)),saveAs:cfg().saveAs});}finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}}
    const list=items=>items.filter(Boolean).join(t('list.sep')),notes=result.warnings.length;lastWarn='';
    if(mode==='html'){done=true;const h=result.htmlStats;
      const text=t('status.htmlDone',cfg().htmlForm==='single'?t('side.htmlSingle'):t('set.htmlForm.folder'),seconds(performance.now()-started),list([t('count.liveCards',h.cards),t('count.apps',h.appBlocks),t('count.maps',h.maps),t('count.assetFiles',h.assets)]))+(notes?`\n${t('status.moreNotesHtml',notes)}`:'');
      if(notes)lastWarn=text;$('status').textContent=text;return;}
    const n=kind=>result.assets.filter(a=>a.kind===kind).length;
    const saved=list([t('count.images',n('original-image')),cfg().uiFolder&&t('count.uiData',n('ui-data')),t('count.cardImages',n('card-image')),t('count.apps',n('appblock'))+(n('appblock-preview')?t('count.previews',n('appblock-preview')):''),n('code-file')&&t('count.codeFiles',n('code-file')),n('attachment')&&t('count.attachments',n('attachment')),n('data-table')&&t('count.dataTables',n('data-table'))]);
    const text=(mode==='pdf'?`${t('status.pdfOpening')}\n`:mode==='obsidian'?`${t('status.obsidianWriting')}\n`:'')+t(mode==='preview'?'status.previewTimes':'status.exportTimes',seconds(state.timings.readMs),seconds(performance.now()-started))+t('status.saved',saved)+(notes?`\n${t('status.moreNotes',notes)}`:'');
    if(notes)lastWarn=text;$('status').textContent=text;
    done=mode!=='preview'&&mode!=='pdf';
  }catch(e){fail(e.message);if(mode==='pdf')deliver?.(null);if(e.reread)setTimeout(()=>load());}finally{busy(false);
    // 导出后自动关闭侧边栏: the result then shows above the buttons beside the input box.
    if(done&&cfg().autoClose&&!host.hidden&&resident){closeSidebar();toast($('status').textContent);}}}
  // The print page runs in a hidden frame of this tab, so the print dialog opens over ChatGPT and no
  // tab is left behind. Once the frame says it is ready, it receives the Markdown and the images
  // (Blobs) of the export; it never reads the ChatGPT page. It says when the dialog has closed and is
  // removed then. Tests and the live bundle supply the frame's window (ChatExportPrintFrame).
  function runPdf(){if(busyFlag)return;const page=chrome.runtime.getURL('print.html'),origin=chrome.runtime.getURL('').replace(/\/$/,'');
    document.querySelectorAll('iframe[data-archive-owned="print"]').forEach(n=>n.remove());
    // Chrome names the PDF after the tab's title, not the print page's: while the print dialog is
    // open the tab is titled as the file name setting says, and gets its own title back afterwards.
    let frame=null,tab=null,listen,pageTitle=null,pdfName=null;
    const close=()=>{frame?.remove();removeEventListener('message',listen);if(pageTitle!==null&&document.title===pdfName)document.title=pageTitle;pageTitle=null;};
    const ready=new Promise((ok,reject)=>{const timer=setTimeout(()=>reject(Error(t('err.printNoResponse'))),30000);
      listen=e=>{if(e.source!==tab||e.origin!==origin)return;const type=e.data?.type;
        if(type==='pdf:ready'){clearTimeout(timer);ok();}
        else if(type==='pdf:done'){close();$('status').textContent=t('status.printClosed');}
        else if(type==='pdf:error'){close();fail(t('err.pdfLayout',e.data.message||t('err.unknown')));}};
      addEventListener('message',listen);});
    ready.catch(()=>close());
    if(globalThis.ChatExportPrintFrame)tab=globalThis.ChatExportPrintFrame(page);
    else{frame=Object.assign(document.createElement('iframe'),{src:page,title:t('pdf.frameTitle')});frame.dataset.archiveOwned='print';
      // On screen but invisible: Chrome pauses frames that are off screen or hidden.
      frame.style.cssText='position:fixed;left:0;top:0;width:900px;height:1200px;border:0;opacity:0;pointer-events:none;z-index:-1';document.documentElement.append(frame);tab=frame.contentWindow;}
    run('pdf',async result=>{if(!result){close();return;}await ready;
      pdfName=Settings.fileBase(cfg(),{title:state.title});pageTitle=document.title;document.title=pdfName;
      tab.postMessage({type:'pdf:document',locale:I18n.locale,md:result.md,documentTitle:pdfName,version,source:state.url,exportedAt:new Date().toISOString(),warnings:result.warnings,
        assets:result.assets.filter(a=>/\.(?:png|jpe?g|gif|webp|svg)$/i.test(a.path)).map(({path,blob,width,height,kind})=>({path,blob,width,height,kind}))},origin);});}
  // 保存到 Obsidian: the files of the ZIP go to a relay tab (obsidian.html), which writes them into
  // the 笔记文件夹 the user chose once. The tab connects back to this one by job id and receives them in
  // chunks (obsidian-send.js), so length and image count do not matter; it then names the note's
  // obsidian:// link, which opens it. The link is kept per chat in this browser for the pill's 打开 half,
  // so a dismissed Chrome prompt costs one click and no second copy.
  let obsidianJob=null;
  try{chrome.runtime.onConnect?.addListener(port=>{const job=obsidianJob;if(!job||port.name!==`obsidian:${job.id}`)return;obsidianJob=null;job.connected(port);});}catch{}
  // The links live in chrome.storage.local, which the ChatGPT page cannot read. Links that 0.11.33 and
  // earlier kept in the page's localStorage move over once and are removed there. Without
  // chrome.storage (tests, the live bundle) they stay in localStorage.
  const NOTES='chatExportObsidianNotes',notesArea=(()=>{try{return chrome.storage?.local||null;}catch{return null;}})();
  let notes={};
  const pageNotes=()=>{try{return JSON.parse(localStorage.getItem(NOTES)||'{}')||{};}catch{return {};}};
  (async()=>{const old=pageNotes();if(!notesArea){notes=old;return;}
    try{const stored=(await notesArea.get(NOTES))?.[NOTES]||{};notes={...old,...stored};
      if(Object.keys(old).length)await notesArea.set({[NOTES]:notes});
      try{localStorage.removeItem(NOTES);}catch{}
      obsidianState();}catch{if(!Object.keys(notes).length)notes=old;}})();
  try{chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[NOTES]){notes=changes[NOTES].newValue||{};obsidianState();}});}catch{}
  // Read before writing, so a link saved meanwhile in another ChatGPT tab is kept.
  async function saveNote(key,url){notes={...notes,[key]:url};
    if(!notesArea){try{localStorage.setItem(NOTES,JSON.stringify(notes));}catch{}return;}
    try{await notesArea.set({[NOTES]:{...(await notesArea.get(NOTES))?.[NOTES],[key]:url}});}catch{}}
  function savedNote(){return notes[target().id]||'';}
  function obsidianState(){const url=savedNote();for(const b of [$('obsOpen'),D('dOpen')]){b.disabled=!url;b.title=url?t('side.obsOpenTip'):t('panel.obsOpenFirst');}}
  function openSaved(){const url=savedNote();if(url.startsWith('obsidian://open?'))location.href=url;return url;}
  // The path is a link: clicking it opens the note in Obsidian, as 打开 does.
  function opened(m,key){const at=document.createElement('a');at.className='chip link';at.textContent=String(m.path).split('/').join(' / ');at.title=t('obs.openNote');
    if(String(m.url).startsWith('obsidian://open?'))at.href=m.url;
    $('status').replaceChildren(t('status.obsSaved'),at,'\n'+t('status.obsOpening'));if(!String(m.url).startsWith('obsidian://open?'))return;
    if(key)saveNote(key,m.url);
    obsidianState();location.href=m.url;}
  function runObsidian(){const key=target().id;return run('obsidian',async result=>{const sender=globalThis.ChatExportObsidian;
    if(!sender)throw Error(t('err.obsNoModule'));
    const id=crypto.randomUUID();
    const sent=new Promise((ok,reject)=>{const timer=setTimeout(()=>{obsidianJob=null;reject(Error(t('err.obsNoResponse')));},30000);
      obsidianJob={id,connected:port=>{clearTimeout(timer);
        port.onMessage.addListener(m=>{if(m.type==='received')ok();else if(m.type==='written')opened(m,key);});
        port.onDisconnect.addListener(()=>reject(Error(t('err.obsClosed'))));
        sender.sendJob(port,{meta:{title:Settings.fileBase(cfg(),{title:state.title}),source:state.url,version,exportedAt:new Date().toISOString(),warnings:result.warnings},md:result.md,files:result.assets}).catch(reject);}};});
    await send({type:'obsidian:open',job:id});await sent;});}
  $('obsOpen').onclick=openSaved;
  $('reload').onclick=()=>load();
  // 改用多文件 beside the large-file note: the same setting as HTML 网页的形式 → ZIP.
  $('useFolder').onclick=()=>settings.set({htmlForm:'folder'});
  // Debug: the unmodified API response, to inspect model_dil_v2 and image fields.
  async function rawExport(){if(busyFlag)return;try{assertCurrent();const url=URL.createObjectURL(new Blob([JSON.stringify(state.raw,null,2)],{type:'application/json'}));try{await send({type:'archive:download',url,filename:filename('raw.json'),saveAs:cfg().saveAs});}finally{setTimeout(()=>URL.revokeObjectURL(url),60000);}$('status').textContent=t('status.rawDone');}catch(e){fail(e.message);}}
  const exportAs=kind=>kind==='pdf'?runPdf():kind==='obsidian'?runObsidian():run(kind);
  $('preview').onclick=()=>run('preview');$('export').onclick=()=>exportAs($('kind').value);
  $('kind').onchange=()=>settings.set({exportKind:$('kind').value});
  // Filters: all, my questions, the answers, invert, none.
  const boxes=()=>[...ui.querySelectorAll('#list input')],chips=['all','mine','answers','invert','none'];
  function pick(how){const roles=new Map((state?.messages||[]).map(m=>[m.id,m.role]));
    for(const b of boxes())b.checked=how==='all'?true:how==='none'?false:how==='invert'?!b.checked:(roles.get(b.dataset.messageId)==='user')===(how==='mine');
    for(const id of chips)$(id).classList.toggle('on',id===how&&how!=='invert');counted();}
  for(const id of chips)$(id).onclick=()=>pick(id);
  $('list').addEventListener('change',()=>{for(const id of chips)$(id).classList.remove('on');counted();});
  // The count has little room: a short form, and the whole sentence when pointed at.
  function fitPill(){const p=$('exportPill');p.classList.remove('tight');if(!p.classList.contains('two'))return;(window.requestAnimationFrame||setTimeout)(()=>p.classList.toggle('tight',p.scrollWidth>p.clientWidth+1));}
  function counted(){const n=ids().length,all=boxes().length;$('count').textContent=t('side.count',n,all);$('count').title=t('side.countTip',n,all);if(state)fileLine();}
  const clock=t=>{const d=new Date(t*1000),now=new Date(),p=n=>String(n).padStart(2,'0'),hm=`${p(d.getHours())}:${p(d.getMinutes())}`;return d.toDateString()===now.toDateString()?hm:`${d.getFullYear()===now.getFullYear()?'':d.getFullYear()+'-'}${p(d.getMonth()+1)}-${p(d.getDate())} ${hm}`;};
  // A message card: role, what it holds, time, and up to four lines of its text.
  function messageRow(m){const v=cfg(),label=document.createElement('label'),box=document.createElement('input'),body=document.createElement('div'),top=document.createElement('div'),text=document.createElement('div'),role=document.createElement('span');
    label.className='smsg';box.type='checkbox';box.checked=true;box.dataset.messageId=m.id;body.className='mbody';top.className='mtop';text.className='mtx';
    role.className=m.role==='user'?'role':'role a';role.textContent=Settings.role(v,m.role==='user'?'user':'assistant');top.append(role);
    for(const [n,key] of [[(m.segments||[]).filter(s=>s.kind==='card').length,'count.cards'],[(m.images||[]).length,'count.images'],[(m.attachments||[]).length,'count.attachments']])if(n){const b=document.createElement('span');b.className='bdg';b.textContent=t(key,n);top.append(b);}
    if(m.createTime){const t=document.createElement('span');t.className='time';t.textContent=clock(m.createTime);top.append(t);}
    text.textContent=(m.staticMd||m.md||m.summary||'').replace(/\u0000[^\u0000]*\u0000/g,'').replace(/\*\*|^#{1,6}\s+|^>\s?/gm,'').replace(/\s+/g,' ').trim().slice(0,600);
    body.append(top,text);label.append(box,body);return label;}
  // The sidebar's two views: the message list, and the settings (the toolbar panel's, in place).
  function showView(view){const set=view==='settings';$('listView').hidden=set;$('setView').hidden=!set;$('back').hidden=!set;$('logo').hidden=set;$('reload').hidden=set;$('gear').hidden=set;$('sbTitle').textContent=set?t('side.settings'):t('side.title');
    if(set){const k=$('kind').value;panelSettings.setOpen(k==='html'?'def':k==='pdf'?'name':k==='obsidian'?'obs':'md',true);}}
  function openSidebar(view='list'){host.hidden=false;showView(view);placeDock();fitPill();if(!busyFlag&&route()!==readRoute&&!streaming())load();}
  function closeSidebar(){host.hidden=true;placeDock();}
  $('close').onclick=closeSidebar;$('gear').onclick=$('gear2').onclick=()=>showView('settings');$('back').onclick=()=>showView('list');
  const panelSettings=UI.mountSettings($('setView'),settings,{
    action:name=>{if(name==='raw')rawExport();else if(name==='obsFolder')send({type:'obsidian:setup'}).catch(e=>fail(e.message));else if(name==='reset')settings.reset();else if(name==='shortcut')send({type:'open:shortcuts'}).catch(e=>fail(e.message));},
    // A page script cannot open extension pages; the background opens the explanation in a new tab.
    help:topic=>send({type:'open:help',topic}).catch(e=>fail(e.message)),
    commands:()=>send({type:'commands:get'}).then(r=>r.commands)});
  UI.attachTips(ui,$('sb'));
  // Status lines that end an export with problems are marked; with the sidebar closed they show above the buttons.
  let lastError='',lastWarn='';function fail(message){lastError=message;$('status').textContent=message;}
  new MutationObserver(()=>{const text=$('status').textContent;$('stx').className='stx'+(text&&text===lastError?' err':text&&(text===lastWarn||text.includes('⚠'))?' warn':'');if(host.hidden&&resident&&text)toast(text,busyFlag);}).observe($('status'),{childList:true,characterData:true,subtree:true});

  // The two split buttons beside ChatGPT's input box. Fixed to the window (not inside ChatGPT's
  // input box, which changes with its redesigns): to the right of the input box, or the corner.
  const dockHost=document.createElement('div');dockHost.dataset.archiveOwned='fast-text-dock';dockHost.hidden=true;document.documentElement.append(dockHost);
  const dui=dockHost.attachShadow({mode:'open'}),D=id=>dui.getElementById(id);
  const kindMenu=[['md','file','dock.md.sub'],['zip','archive','dock.zip.sub'],['html','code',''],['pdf','printer','dock.pdf.sub'],['obsidian','gem','dock.obsidian.sub']];
  // Injected by hand (tests, the live bundle) the buttons stay hidden and need no styles.
  dui.innerHTML=`<style>${resident?UI.css+UI.pageCss:''}:host([hidden]){display:none!important}</style><div class="cx" id="droot" lang="${I18n.tag}"><div class="dock" id="dock">
<div class="spl"><button class="main" id="dSelect" title="${esc(t('dock.selectTip'))}">${icon('list')}<span>${esc(t('dock.select'))}</span></button><button class="arr" data-menu="mSelect" title="${esc(t('dock.quick'))}" aria-haspopup="menu" aria-expanded="false">${icon('chev')}</button>
<div class="menu" id="mSelect" role="menu" hidden><div class="mlab">${esc(t('dock.quick'))}</div>${['all','mine','answers','none'].map(v=>`<button class="mi" role="menuitem" data-preset="${v}">${esc(t(`dock.preset.${v}`))}</button>`).join('')}<div class="msep"></div><button class="mi" role="menuitem" data-open="list">${icon('list')}${esc(t('dock.pickInSidebar'))}</button></div></div>
<div class="spl pri"><button class="main" id="dExport" title="${esc(t('dock.exportTip'))}"></button><button class="oopen" id="dOpen" hidden title="${esc(t('side.obsOpenTip'))}" aria-label="${esc(t('dock.obsOpenLabel'))}">${icon('ext')}</button><button class="arr" data-menu="mExport" title="${esc(t('dock.kinds'))}" aria-haspopup="menu" aria-expanded="false">${icon('chev')}</button>
<div class="menu" id="mExport" role="menu" hidden><div class="mlab">${esc(t('dock.kindsHint'))}</div>${kindMenu.map(([v,ic,sub])=>`<button class="mi" role="menuitemradio" data-kind="${v}">${icon(ic)}${esc(t(`kind.${v}.menu`))}<small data-sub="${v}">${sub?esc(t(sub)):''}</small><span class="ok">${icon('check')}</span></button>`).join('')}<div class="msep"></div><button class="mi" role="menuitem" data-open="settings">${icon('gear')}${esc(t('dock.settings'))}</button><div class="mfoot">Chat &amp; Intelligent UI Exporter for ChatGPT v${version}</div></div></div>
</div><div class="toast" id="toast" role="status"></div></div>`;
  const closeMenus=()=>{for(const m of dui.querySelectorAll('.menu'))m.hidden=true;for(const b of dui.querySelectorAll('[data-menu]'))b.setAttribute('aria-expanded','false');};
  dui.addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;
    if(t.dataset.menu){const m=D(t.dataset.menu),open=m.hidden;closeMenus();m.hidden=!open;t.setAttribute('aria-expanded',String(open));if(open)m.querySelector('button')?.focus();return;}
    closeMenus();
    if(t.id==='dSelect')return host.hidden?openSidebar():closeSidebar();
    if(t.id==='dExport')return quickExport();
    if(t.id==='dOpen')return openSaved();
    if(t.dataset.kind)return settings.set({exportKind:t.dataset.kind});
    if(t.dataset.preset)return preset(t.dataset.preset);
    if(t.dataset.open)return openSidebar(t.dataset.open);});
  dui.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenus();});
  document.addEventListener('click',e=>{if(!e.composedPath().includes(dockHost))closeMenus();},true);
  let toastTimer;
  function toast(text,keep=false){const t=D('toast'),s=$('status');if(text&&text===s.textContent&&s.querySelector('.chip'))t.replaceChildren(...[...s.childNodes].map(n=>n.cloneNode(true)));else t.textContent=text;t.classList.add('show');positionToast();clearTimeout(toastTimer);if(!keep)toastTimer=setTimeout(()=>t.classList.remove('show'),3500);}
  // ChatGPT's input box (only read for its position): the rounded box inside its composer form, as
  // in 2026-10 (form[data-chatgpt-composer] > [data-composer-body]), or the older #prompt-textarea form.
  function composer(){
    const input=document.querySelector('[data-composer-markdown][contenteditable="true"],div[contenteditable="true"][role="textbox"],#prompt-textarea');
    const form=document.querySelector('form[data-chatgpt-composer]')||input?.closest('form')||document.querySelector('form[data-type="unified-composer"]');
    return form?.querySelector('[data-composer-body]')||form||input;}
  function placeDock(){const v=cfg(),dock=D('dock');dockHost.hidden=!resident||!v.dockShow;dock.classList.toggle('busy',busyFlag);if(dockHost.hidden)return;
    const W=innerWidth,H=innerHeight,side=host.hidden?0:Math.min(372,W),s=dock.style;let box=v.dockPos==='input'?composer()?.getBoundingClientRect():null;if(box&&!box.width)box=null;
    s.left=s.right='';dock.classList.remove('narrow');
    if(box){const room=W-side-box.right,bottom=`${Math.max(8,H-box.bottom)}px`,wide=Math.max(132,dock.scrollWidth)+24;
      // As icons the buttons fit in less room (about 80px in a 1285px-wide window).
      dock.classList.add('narrow');const narrow=dock.scrollWidth+16;dock.classList.remove('narrow');
      if(room>=wide){s.left=`${box.right+12}px`;s.bottom=bottom;}
      else if(room>=narrow){dock.classList.add('narrow');s.left=`${box.right+8}px`;s.bottom=bottom;}
      // A narrow window: the buttons shrink to icons above the input box's right end.
      else{dock.classList.add('narrow');s.right=`${side+12}px`;s.bottom=`${Math.max(8,H-box.top+10)}px`;}}
    else{s.right=`${side+16}px`;s.bottom='24px';}
    positionToast();}
  function positionToast(){const r=D('dock').getBoundingClientRect(),t=D('toast');t.style.right=`${Math.max(8,innerWidth-r.right)}px`;t.style.bottom=`${Math.max(8,innerHeight-r.top+8)}px`;}
  function theme(){const h=document.documentElement,dark=h.classList.contains('dark')||!h.classList.contains('light')&&!!globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches;$('sb').classList.toggle('dark',dark);D('droot').classList.toggle('dark',dark);}
  const extOf=kind=>({md:'md',zip:'zip',html:cfg().htmlForm==='single'?'html':'html.zip',pdf:'pdf',obsidian:'md'})[kind];
  function syncSettings(){const v=cfg(),k=v.exportKind;$('kind').value=k;
    // Obsidian: 「导出」 becomes the pill 保存到 Obsidian | 打开 (here, in the sidebar and the toolbar panel).
    // Beside the input box and in the sidebar it reads ◆ 保存 | 打开 (the full words in the tooltip), so it
    // keeps its text where 导出 · 完整归档 does.
    const obs=k==='obsidian';
    D('dExport').innerHTML=obs?`${icon('gem')}<span>${esc(t('side.save'))}</span>`:`${icon(UI.kindIcon[k])}<span>${esc(t('side.export'))}</span><small>${esc(Settings.kinds[k].short)}</small>`;
    D('dOpen').hidden=$('obsOpen').hidden=!obs;$('exportPill').classList.toggle('two',obs);fitPill();$('export').textContent=obs?t('side.save'):t('side.export');$('export').title=D('dExport').title=obs?Settings.kinds.obsidian.verb:'';obsidianState();
    for(const b of dui.querySelectorAll('[data-kind]'))b.classList.toggle('on',b.dataset.kind===k);
    dui.querySelector('[data-sub="html"]').textContent=v.htmlForm==='single'?t('dock.html.singleSub'):t('dock.html.zipSub');
    for(const r of ui.querySelectorAll('#list .role'))r.textContent=Settings.role(v,r.classList.contains('a')?'assistant':'user');
    fileLine();placeDock();}
  // Pictures and files the export would carry: originals, attachments, tables, the code
  // interpreter's files and the pictures inside cards.
  function fileCount(messages){return messages.reduce((n,m)=>n+(m.images||[]).length+(m.attachments||[]).length+(m.tables||[]).length
    +new Set([...String(m.md||'').matchAll(sandboxLink)].map(x=>x[1])).size+(m.dil?uiImageUrls(m).length:0),0);}
  const chosen=()=>{const pick=new Set(ids());return (state?.messages||[]).filter(m=>pick.has(m.id));};
  // The line under 导出 shows the file name. When one HTML file would carry many pictures and files,
  // it says so instead, with 改用多文件 beside it: the same one line, so nothing above it moves.
  function fileLine(){const v=cfg(),k=v.exportKind,obs=k==='obsidian',n=state?fileCount(chosen()):0,big=k==='html'&&v.htmlForm==='single'&&n>Settings.bigHtmlFiles;
    $('fname').classList.toggle('warn',big);$('fname').title=big?t('side.htmlBigTip',n):'';$('useFolder').hidden=!big;
    $('fname').textContent=big?t('side.htmlBig'):k==='pdf'?t('side.pdfName'):obs?(state?`${v.obsidianFolder||'Obsidian'} / ${filename('md')}`:''):state?filename(extOf(k)):'';}
  settings.onChange(syncSettings);
  // Another language: the sidebar and the buttons are drawn again (after an export in progress),
  // and the chat is read again when the sidebar was open.
  let relocalizing=false;
  function relocalize(){if(relocalizing||busyFlag||!host.isConnected||I18n.setLocale(cfg().language)===shown)return;relocalizing=true;
    const open=!host.hidden,view=$('setView').hidden?'list':'settings';host.remove();dockHost.remove();globalThis.__fastTextPanel=null;mount({language:cfg().language,open,view});}
  settings.onChange((v,changed)=>{if(changed.includes('language'))relocalize();});

  // Reads the chat if the sidebar has not, or if it changed since; waits for a read or export in progress.
  const idle=async()=>{for(let i=0;busyFlag&&i<6000;i++)await new Promise(r=>setTimeout(r,100));};
  async function ensureLoaded(){await idle();let fresh=!!state&&state.url===route();if(fresh)try{assertCurrent();}catch{fresh=false;}if(!fresh)await load();}
  // A quick selection picked before the chat was read applies once it is.
  let pending=null;
  async function preset(how){if(state&&state.url===route()&&!busyFlag)pick(how);else{pending=how;await ensureLoaded();}if(state)toast(t('dock.selected',ids().length,boxes().length));}
  // 「导出」 beside the input box (or the toolbar panel): the current selection (all by default) in the default format.
  async function quickExport(kind=cfg().exportKind){if(busyFlag)return;await settings.ready;await ensureLoaded();if(!state)return;return exportAs(kind);}
  // The toolbar panel asks for the chat's summary, opens the sidebar and exports through these.
  async function summary(){if(!target().id)return {version,page:'other'};await settings.ready;await ensureLoaded();const ms=state?.messages||[];
    return {version,page:'chat',ok:!!state,title:state?.title||document.title,messages:ms.length,cards:ms.reduce((n,m)=>n+(m.segments||[]).filter(s=>s.kind==='card').length,0),images:ms.reduce((n,m)=>n+(m.images||[]).length,0),files:fileCount(chosen()),obsidianNote:!!savedNote(),selected:ids().length,status:state?'':$('status').textContent};}
  try{chrome.runtime.onMessage?.addListener((m,sender,reply)=>{if(!host.isConnected||sender?.id!==chrome.runtime.id)return;
    const respond=p=>{p.then(reply,e=>reply({error:e?.message||String(e)}));return true;};
    if(m?.type==='panel:summary')return respond(summary());
    if(m?.type==='panel:open'){openSidebar(m.view);reply({ok:true});return;}
    if(m?.type==='panel:toggle'){if(host.hidden)openSidebar();else closeSidebar();reply({ok:true});return;}
    if(m?.type==='panel:export')return respond(quickExport(m.kind).then(()=>{const text=$('status').textContent;return {status:text,error:!!text&&text===lastError};}));
    if(m?.type==='panel:obsidianOpen'){reply({ok:!!openSaved()});return;}
    if(m?.type==='panel:raw')return respond(ensureLoaded().then(rawExport).then(()=>({status:$('status').textContent})));});}catch{}
  // ChatGPT switches chats without reloading the page; while the sidebar is open,
  // read the new chat once (a failed read is not retried until the chat changes again).
  const watch=setInterval(()=>{if(!host.isConnected)return clearInterval(watch);theme();placeDock();if(host.hidden||busyFlag||route()===readRoute||streaming())return;load();},800);
  addEventListener('resize',placeDock);
  $('stop').onclick=()=>controller?.abort();document.addEventListener('keydown',e=>{if(e.key==='Escape'&&busyFlag&&host.isConnected)controller?.abort();});
  theme();syncSettings();
  if(again.open)openSidebar(again.view);else if(!resident)load();
})();
