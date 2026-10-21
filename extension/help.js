// The explanation page (help.html) that the ⓘ of 折叠块等特殊标签 and 图文卡片用 HTML open on click:
// the panel's look, its version, the light or dark theme and the language picked in the settings.
// Its words are the help.* texts of the language files, named in help.html.
(async () => {
  const S=globalThis.ChatExportSettings,UI=globalThis.ChatExportUI,I18n=globalThis.ChatExportI18n,body=document.body;
  const store=S.open();await store.ready.catch(()=>{});
  I18n.setLocale(store.values?.language||'auto');I18n.fill(document);document.title=`${I18n.t('help.title')} · Chat & Intelligent UI Exporter for ChatGPT`;
  document.head.insertAdjacentHTML('afterbegin',`<style>${UI.css}</style>`);
  body.classList.add('cx');
  const scheme=matchMedia('(prefers-color-scheme: dark)'),theme=()=>body.classList.toggle('dark',scheme.matches);theme();scheme.addEventListener('change',theme);
  document.getElementById('logo').innerHTML=UI.icon('logo');
  const ver=document.getElementById('ver');ver.innerHTML=`<i></i>v${S.version}`;ver.style.background='var(--surface)';
})();
