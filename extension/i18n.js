// The words of the extension in ten languages: the panel, the sidebar, the settings, the status
// lines and the fixed text it writes into exported files. English (locales/en.js) holds every key;
// another language may leave a key out and shows the English text there.
// The language is the one picked in the settings, or the browser's (auto). Each place that shows
// words sets it: the sidebar and panels from the settings, the sandbox and the print page from the
// request that the sidebar sends them.
(root => {
  const LOCALES=['en','zh_CN','zh_TW','ja','ko','es','pt_BR','fr','de','ru'];
  // Each language's own name, for the language setting.
  const NAMES={en:'English',zh_CN:'简体中文',zh_TW:'繁體中文',ja:'日本語',ko:'한국어',es:'Español',pt_BR:'Português (Brasil)',fr:'Français',de:'Deutsch',ru:'Русский'};
  // BCP 47 tags, for <html lang> and dates.
  const TAGS={en:'en',zh_CN:'zh-CN',zh_TW:'zh-TW',ja:'ja',ko:'ko',es:'es',pt_BR:'pt-BR',fr:'fr',de:'de',ru:'ru'};
  // Chinese, Japanese and Korean share many characters but draw them differently: the fonts of
  // the language picked go first. Languages without such characters keep Simplified Chinese
  // first, as before (most chats this was made for are in Chinese).
  const CJK={
    zh_CN:'"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC"',
    zh_TW:'"PingFang TC","Microsoft JhengHei","Noto Sans CJK TC","Source Han Sans TC"',
    ja:'"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","Noto Sans CJK JP","Source Han Sans JP"',
    ko:'"Apple SD Gothic Neo","Malgun Gothic","Noto Sans CJK KR","Source Han Sans KR"',
  };
  const tables=()=>root.ChatExportLocales||(root.ChatExportLocales={});
  // Node (the tests) loads the language files itself; the extension lists them before this file.
  if(typeof module!=='undefined'&&typeof require==='function')for(const l of LOCALES)if(!tables()[l])require(`./locales/${l}.js`);

  // A browser language ("zh-HK", "pt-PT", "de-AT") to one of the ten, or English.
  function match(tag){
    const t=String(tag||'').replace('_','-').toLowerCase();
    if(!t)return 'en';
    if(t.startsWith('zh'))return /^zh-(tw|hk|mo|hant)/.test(t)?'zh_TW':'zh_CN';
    if(t.startsWith('pt'))return 'pt_BR';
    const base=t.split('-')[0];
    return LOCALES.find(l=>l.toLowerCase()===base)||'en';
  }
  function browserLocale(){
    try{const ui=root.chrome?.i18n?.getUILanguage?.();if(ui)return match(ui);}catch{}
    return match(root.navigator?.language);
  }
  let locale='en';
  // pref: 'auto' (the browser's language) or one of LOCALES.
  function setLocale(pref){locale=LOCALES.includes(pref)?pref:browserLocale();return locale;}
  setLocale('auto');

  // t('key', a, b): the text with {0}, {1} filled in. A text given as {one, other, few, many}
  // is picked by the first number, as the language counts it (Russian has three forms).
  function t(key,...args){
    const all=tables(),own=all[locale]?.[key],entry=own!==undefined?own:all.en?.[key];
    if(entry===undefined)return key;
    let text=entry;
    if(typeof entry==='object'){
      const n=args.find(a=>typeof a==='number');
      let form='other';try{form=new Intl.PluralRules(TAGS[own!==undefined?locale:'en']).select(n??0);}catch{}
      text=entry[form]??entry.other;
    }
    return text.replace(/\{(\d+)\}/g,(x,i)=>args[i]===undefined?x:String(args[i]));
  }
  // For regular expressions built from a text.
  const quote=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // A text with its {0}, {1} as groups, to find it again: pattern('md.appToken','g').
  const pattern=(key,flags='')=>new RegExp(t(key).split(/\{\d+\}/).map(quote).join('(.+?)'),flags);
  // A number written for the current language ("1,234" or "1 234").
  const number=n=>{try{return Number(n).toLocaleString(TAGS[locale]);}catch{return String(n);}};
  // The same text in every language, to read back files exported in any of them.
  const every=key=>[...new Set(LOCALES.map(l=>tables()[l]?.[key]??tables().en?.[key]).filter(v=>typeof v==='string'))];

  const cjkFonts=()=>CJK[locale]||CJK.zh_CN;
  // The texts whose keys start with prefix, in the current language (English where it has none):
  // what an exported page carries to draw its cards.
  const subset=prefix=>{const all=tables(),out={};for(const k of Object.keys(all.en||{}))if(k.startsWith(prefix))out[k]=all[locale]?.[k]??all.en[k];return out;};

  // An extension page's fixed words: data-i18n="key" fills an element's text, data-i18n-html its
  // markup (our own texts with <b> or <code>); <html lang> follows.
  function fill(doc){
    for(const n of doc.querySelectorAll('[data-i18n]'))n.textContent=t(n.getAttribute('data-i18n'));
    for(const n of doc.querySelectorAll('[data-i18n-html]'))n.innerHTML=t(n.getAttribute('data-i18n-html'));
    doc.documentElement.lang=TAGS[locale];
  }

  const api={LOCALES,NAMES,TAGS,match,setLocale,t,quote,pattern,number,every,subset,cjkFonts,fill,get locale(){return locale;},get tag(){return TAGS[locale];}};
  root.ChatExportI18n=api;
  if(typeof module!=='undefined')module.exports=api;
})(globalThis);
