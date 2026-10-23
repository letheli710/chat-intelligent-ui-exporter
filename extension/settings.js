// One set of export settings for the three places that show them: the sidebar on the ChatGPT
// page, the toolbar panel (popup.html) and the settings tab (options.html). They live in
// chrome.storage.local, which all three can read; chrome.storage.onChanged keeps them in step.
// Without chrome.storage (tests, the live bundle in the page's main world) the page's
// localStorage holds them, the five older options under the keys they always had.
(root => {
  const I18n=root.ChatExportI18n||(typeof module!=='undefined'?require('./i18n.js'):null),t=I18n.t;
  const version='0.11.39';
  const defaults={
    saveAs:false,
    exportKind:'zip', profile:'generic', htmlForm:'single', htmlMap:true, autoClose:false,
    fileName:'title-date', filePrefix:'ChatGPT', fileVersion:false,
    yaml:true, model:true, proseHtml:'escape', htmlCards:false, timestamps:false, sources:false, roleUser:'', roleAssistant:'ChatGPT',
    dockShow:true, dockPos:'input',
    uiFolder:false,
    // The name of the folder 保存到 Obsidian writes into, for display; the folder itself (its handle)
    // is kept by obsidian.html, which also writes this name.
    obsidianFolder:'',
    language:'auto',
  };
  const choices={exportKind:['md','zip','html','pdf','obsidian'],profile:['generic','obsidian'],htmlForm:['folder','single'],fileName:['title','title-date','date-title','prefix'],proseHtml:['escape','keep'],dockPos:['input','corner'],language:['auto',...I18n.LOCALES]};
  // The profile only sets the defaults of these options; each can still be changed by hand.
  // Picture cards as HTML stay off in both until that output is checked before it is written.
  const profiles={generic:{htmlCards:false,proseHtml:'escape'},obsidian:{htmlCards:false,proseHtml:'keep'}};
  // Where the page kept the first options before they moved to chrome.storage.local.
  const legacy={
    profile:{key:'chatExportProfile',read:v=>v,write:v=>v},
    htmlCards:{key:'chatExportHtmlCards',read:v=>v==='1',write:v=>v?'1':'0'},
    proseHtml:{key:'chatExportProseHtml',read:v=>v,write:v=>v},
    htmlForm:{key:'chatExportHtmlForm',read:v=>v,write:v=>v},
    htmlMap:{key:'chatExportHtmlMap',read:v=>v!=='0',write:v=>v?'1':'0'},
  };
  const pageKey=key=>`chatExport.${key}`;
  // Anything unknown or of the wrong kind falls back to the default.
  function clean(key,value){
    if(!(key in defaults)||value==null)return undefined;
    const d=defaults[key];
    if(choices[key])return choices[key].includes(value)?value:undefined;
    if(typeof d==='boolean')return typeof value==='boolean'?value:undefined;
    if(typeof d==='string')return typeof value==='string'?value.slice(0,40):undefined;
    return undefined;
  }
  function withDefaults(stored){
    const values={...defaults};
    // An older page saved only a profile: its defaults apply to the options it sets.
    if(clean('profile',stored.profile))Object.assign(values,profiles[stored.profile]);
    for(const key of Object.keys(defaults)){const v=clean(key,stored[key]);if(v!==undefined)values[key]=v;}
    return values;
  }
  const safe=fn=>{try{return fn();}catch{return null;}};
  function readPage(page){
    const out={};if(!page)return out;
    for(const [key,l] of Object.entries(legacy)){const v=safe(()=>page.getItem(l.key));if(v!=null)out[key]=l.read(v);}
    for(const key of Object.keys(defaults)){if(key in legacy)continue;const v=safe(()=>page.getItem(pageKey(key)));if(v!=null){try{out[key]=JSON.parse(v);}catch{}}}
    return out;
  }
  // area: chrome.storage.local (or null); events: chrome.storage.onChanged; page: the page's localStorage.
  // memory: start values kept only in this page (the live bundle), nothing is written anywhere.
  function create({area=null,events=null,page=null,memory=null}={}){
    const listeners=new Set();let values=withDefaults({});
    const emit=(changed,source)=>{for(const fn of listeners){try{fn(values,changed,source);}catch(e){console.error(e);}}};
    const apply=(patch,source)=>{const changed=[];values={...values};
      for(const [key,value] of Object.entries(patch)){const v=value===undefined?defaults[key]:clean(key,value);if(v===undefined||values[key]===v)continue;values[key]=v;changed.push(key);}
      if(changed.length)emit(changed,source);return changed;};
    let ready;
    if(memory){values=withDefaults(memory);ready=Promise.resolve(values);}
    else if(area){
      ready=(async()=>{
        const stored=await area.get(null)||{};
        // The first time the page's older settings are seen, they move over (only where nothing is
        // stored yet) and are removed from the page, so they are not moved again after a reset.
        const old=readPage(page),moved={};
        for(const [key,value] of Object.entries(old))if(!(key in stored)&&clean(key,value)!==undefined)moved[key]=value;
        if(Object.keys(moved).length)await area.set(moved);
        if(page)for(const l of Object.values(legacy))safe(()=>page.removeItem(l.key));
        values=withDefaults({...stored,...moved});emit(Object.keys(defaults),'load');return values;
      })();
      events?.addListener((changes,name)=>{if(name!=='local')return;const patch={};
        for(const [key,c] of Object.entries(changes))if(key in defaults)patch[key]=c.newValue;
        apply(patch,'storage');});
    }else{values=withDefaults(readPage(page));ready=Promise.resolve(values);}
    async function set(patch){
      // Picking a profile resets the options it sets to its defaults.
      if(patch.profile&&profiles[patch.profile]&&patch.profile!==values.profile)patch={...profiles[patch.profile],...patch};
      // The options a profile sets are written with it, so they stay what the profile chose.
      const changed=[...new Set([...apply(patch,'local'),...(patch.profile&&profiles[patch.profile]?Object.keys(profiles.generic):[])])];
      if(!changed.length||memory)return values;
      const out=Object.fromEntries(changed.map(k=>[k,values[k]]));
      if(area){
        const removed=changed.filter(k=>patch[k]===undefined);
        if(removed.length)await area.remove(removed);
        const kept=Object.fromEntries(Object.entries(out).filter(([k])=>!removed.includes(k)));
        if(Object.keys(kept).length)await area.set(kept);
      }else if(page)for(const [k,v] of Object.entries(out)){const l=legacy[k];safe(()=>page.setItem(l?l.key:pageKey(k),l?l.write(v):JSON.stringify(v)));}
      return values;
    }
    async function reset(){
      const patch=Object.fromEntries(Object.keys(defaults).map(k=>[k,undefined]));apply(patch,'local');
      if(memory)return values;
      if(area)await area.remove(Object.keys(defaults));
      else if(page)for(const k of Object.keys(defaults))safe(()=>page.removeItem(legacy[k]?.key||pageKey(k)));
      return values;
    }
    return {get values(){return values;},ready,set,reset,onChange:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}};
  }
  // The store for the place this script runs in.
  function open(){
    const chromeApi=root.chrome;let page=null;try{page=root.localStorage||null;}catch{}
    if(root.ChatExportSettingsMemory)return create({memory:root.ChatExportSettingsMemory});
    const area=safe(()=>chromeApi?.storage?.local);
    return area?create({area,events:chromeApi.storage.onChanged,page}):create({page});
  }

  // Read when shown, so they follow the language picked.
  const kinds={},fileNames={};
  for(const k of ['md','zip','html','pdf','obsidian'])Object.defineProperty(kinds,k,{enumerable:true,get:()=>({name:t(`kind.${k}.name`),file:{md:'.md',zip:'.zip',obsidian:'.md'}[k]||'',verb:t(`kind.${k}.verb`),short:t(`kind.${k}.short`)})});
  for(const k of ['title','title-date','date-title','prefix'])Object.defineProperty(fileNames,k,{enumerable:true,get:()=>t(`fileName.${k}`)});
  // The role names written into the export: an empty one is the language's own word ("Me", "我").
  const role=(values,who)=>who==='user'?values.roleUser||t('md.roleUser'):values.roleAssistant||'ChatGPT';
  const pad=n=>String(n).padStart(2,'0');
  const day=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const cleanPart=s=>String(s??'').replace(/\s+/g,' ').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
  // A title can end in a newline or spaces ("化工工艺教学 \n"); Windows also drops trailing dots.
  function fileBase(values,{title,date=new Date()}){
    const t=cleanPart(title).slice(0,90).replace(/[ .]+$/,'')||'ChatGPT',d=day(date),p=cleanPart(values.filePrefix).slice(0,40).replace(/[ .]+$/,'')||'ChatGPT';
    const base={title:t,'title-date':`${t} - ${d}`,'date-title':`${d} - ${t}`,prefix:`${p} - ${t}`}[values.fileName]||`${t} - ${d}`;
    return values.fileVersion?`${base} - v${version}`:base;
  }
  // 整段 HTML as one file carries every picture and file inside it, about a third larger than they are.
  // With more than this many, the sidebar and the toolbar panel suggest the ZIP form (the fixtures have
  // at most 10, a set of small CSV tables).
  const bigHtmlFiles=10;
  const api={version,defaults,choices,profiles,legacy,create,open,kinds,fileNames,fileBase,day,role,bigHtmlFiles};
  root.ChatExportSettings=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
