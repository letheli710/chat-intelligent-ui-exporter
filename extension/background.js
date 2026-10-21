// The words of its errors, in the language picked in the settings.
importScripts(...['en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'pt_BR', 'fr', 'de', 'ru'].map(l => `locales/${l}.js`), 'i18n.js');
const I18n = globalThis.ChatExportI18n, t = I18n.t;
const allowed = url => /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url || '');
// The panel lives in the page (manifest content_scripts) and the toolbar icon opens popup.html.
// Tabs opened before the extension was installed or reloaded have no script, or the old version's
// script cut off from the extension: they get the current one.
const contentFiles = () => chrome.runtime.getManifest().content_scripts[0].js;
chrome.runtime.onInstalled.addListener(async () => {
  for (const tab of await chrome.tabs.query({url: ['https://chatgpt.com/*', 'https://chat.openai.com/*']}))
    chrome.scripting.executeScript({target: {tabId: tab.id}, files: contentFiles()}).catch(() => {});
});
// Alt+Shift+E (changeable in chrome://extensions/shortcuts) opens or closes the sidebar.
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-sidebar') return;
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (tab && allowed(tab.url)) chrome.tabs.sendMessage(tab.id, {type: 'panel:toggle'}).catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!sender.tab || !allowed(sender.url)) return;
  (async () => {
    try {I18n.setLocale((await chrome.storage.local.get('language')).language);} catch {}
    if (message.type === 'archive:download') {
      if (!message.url?.startsWith('blob:' + new URL(sender.url).origin + '/')) throw Error(t('bg.badDownload'));
      const filename=typeof message.filename==='string' && !/[\\/<>:"|?*\x00-\x1f]/.test(message.filename) && /\.(zip|md|json|html)$/.test(message.filename) ? message.filename : 'conversation-archive.zip';
      return {id: await chrome.downloads.download({url: message.url, filename, saveAs: message.saveAs === true})};
    }
    // Images the server resolved for search results live on images.openai.com,
    // which the page cannot fetch cross-origin; only that host is allowed here.
    if (message.type === 'archive:image') {
      const url = new URL(message.url);
      if (url.protocol !== 'https:' || url.hostname !== 'images.openai.com') throw Error(t('bg.badImage'));
      const response = await fetch(url, {credentials: 'omit'});
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 8 * 1024 * 1024) throw Error(t('bg.imageTooLarge'));
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return {type: response.headers.get('content-type') || '', data: btoa(binary)};
    }
    if (message.type === 'open:shortcuts') return {tab: (await chrome.tabs.create({url: 'chrome://extensions/shortcuts'})).id};
    // The explanation page behind the ⓘ of 折叠块等特殊标签 and 图文卡片用 HTML.
    if (message.type === 'open:help') {
      if (!['prose-html', 'html-cards'].includes(message.topic)) throw Error(t('bg.noHelp'));
      return {tab: (await chrome.tabs.create({url: chrome.runtime.getURL(`help.html#${message.topic}`)})).id};
    }
    // 保存到 Obsidian: the relay tab (obsidian.html) opens in the background beside this one and pulls
    // the export from it; it comes to the front itself when it needs a click.
    if (message.type === 'obsidian:open') {
      if (!/^[\w-]{8,64}$/.test(message.job || '')) throw Error(t('bg.badJob'));
      const url = chrome.runtime.getURL(`obsidian.html?tab=${sender.tab.id}&job=${message.job}`);
      return {id: (await chrome.tabs.create({url, index: sender.tab.index + 1, openerTabId: sender.tab.id, active: false})).id};
    }
    // 笔记文件夹 → 更改…: the same page, in front, without a job.
    if (message.type === 'obsidian:setup')
      return {id: (await chrome.tabs.create({url: chrome.runtime.getURL('obsidian.html?setup=1'), index: sender.tab.index + 1, openerTabId: sender.tab.id})).id};
    throw Error(t('bg.unknown'));
  })().then(result => reply(result), error => reply({error: error.message}));
  return true;
});
