// The ten languages: every one has every text, with the same {0} slots; nothing shown or written
// is left in the code; the sidebar, the toolbar panel and the exports come out in each language.
const {test} = require('./private-fixtures.cjs');const assert = require('node:assert/strict');const fs = require('node:fs');const path = require('node:path');
const env = require('../scripts/i18n-env.cjs'), {JSDOM, I18n} = env;
const {runExport} = require('../scripts/edge-harness.cjs');
const pdf = require('../extension/pdf-export.js');
const L = globalThis.ChatExportLocales, en = L.en, LOCALES = I18n.LOCALES;
const slots = text => [...new Set(String(text).match(/\{\d+\}/g) || [])].sort().join();
const forms = entry => typeof entry === 'object' ? Object.values(entry) : [entry];
const CJK = /[぀-ヿ㐀-鿿가-힯＀-￯　-〿]/;
// What a language must not show: any CJK script for the alphabetic ones; Han and kana for Korean.
const foreign = locale => locale === 'ko' ? /[぀-ヿ㐀-鿿　-〿]/ : CJK;
const selfNames = /^(简体中文|繁體中文|日本語|한국어)$/;

test('the ten languages are the ones decided, with English as the base', () => {
  assert.deepEqual(LOCALES, ['en', 'zh_CN', 'zh_TW', 'ja', 'ko', 'es', 'pt_BR', 'fr', 'de', 'ru']);
  for (const l of LOCALES) assert.ok(L[l], l);
  const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extName__');assert.equal(manifest.description, '__MSG_extDescription__');
  assert.equal(manifest.action.default_title, '__MSG_actionTitle__');assert.equal(manifest.commands['toggle-sidebar'].description, '__MSG_cmdToggleSidebar__');
});

test('every language has every text, no extra ones, with the same {0} slots and full plural forms', () => {
  const keys = Object.keys(en);
  for (const l of LOCALES) {
    const own = Object.keys(L[l]);
    assert.deepEqual(keys.filter(k => !(k in L[l])), [], `${l} is missing texts`);
    assert.deepEqual(own.filter(k => !(k in en)), [], `${l} has texts English has not`);
    for (const k of keys) {
      const want = slots(forms(en[k]).join(' ')), entry = L[l][k];
      for (const text of forms(entry)) {
        assert.equal(typeof text, 'string', `${l} ${k}`);assert.ok(text.trim() || k === 'list.sep' || k === 'dil.sep', `${l} ${k} is empty`);
        assert.equal(slots(text), slots(forms(entry).join(' ')), `${l} ${k}: plural forms use different slots`);
      }
      assert.equal(slots(forms(entry).join(' ')), want, `${l} ${k}: slots differ from English`);
      if (typeof entry === 'object') {
        assert.ok(entry.other, `${l} ${k} needs an "other" form`);
        // Each form a language counts with is there.
        const needed = new Set([0, 1, 2, 3, 5, 11, 21, 22, 25, 101].map(n => new Intl.PluralRules(I18n.TAGS[l]).select(n)));
        for (const f of needed) assert.ok(entry[f] !== undefined || f === 'other', `${l} ${k} lacks the "${f}" form`);
      }
    }
    // Brackets the code reads back: the app token ends in a fixed character, the source line has its URL slot.
    assert.match(I18n.every('dil.appToken').find(() => true), /\{0\}./);
  }
  for (const l of LOCALES) {
    I18n.setLocale(l);
    assert.match(I18n.t('dil.appToken', 'x'), /x\S$/, `${l}: dil.appToken must end with a closing character`);
    assert.ok(I18n.t('md.source', 'URL').includes('URL'), l);assert.ok(I18n.t('md.attachment', 'NAME').includes('NAME'), l);
  }
  I18n.setLocale(env.locale);
});

test('Russian counts in its three forms; English in two; a missing text shows English', () => {
  I18n.setLocale('ru');
  assert.equal(I18n.t('count.messages', 1), '1 сообщение');assert.equal(I18n.t('count.messages', 3), '3 сообщения');assert.equal(I18n.t('count.messages', 5), '5 сообщений');assert.equal(I18n.t('count.messages', 21), '21 сообщение');
  I18n.setLocale('en');
  assert.equal(I18n.t('count.messages', 1), '1 message');assert.equal(I18n.t('count.messages', 2), '2 messages');
  L.de.__probe = undefined;I18n.setLocale('de');assert.equal(I18n.t('test.only'), 'test.only');
  L.en['test.only'] = 'English only';assert.equal(I18n.t('test.only'), 'English only');delete L.en['test.only'];delete L.de.__probe;
  // Browser languages map to the ten; others fall back to English.
  assert.equal(I18n.match('zh-HK'), 'zh_TW');assert.equal(I18n.match('zh-Hant-TW'), 'zh_TW');assert.equal(I18n.match('zh-SG'), 'zh_CN');
  assert.equal(I18n.match('pt-PT'), 'pt_BR');assert.equal(I18n.match('de-AT'), 'de');assert.equal(I18n.match('it-IT'), 'en');assert.equal(I18n.match(''), 'en');
  I18n.setLocale(env.locale);
});

test('the manifest words exist in all ten languages, within the store limits', () => {
  for (const l of LOCALES) {
    const m = JSON.parse(fs.readFileSync(`extension/_locales/${l}/messages.json`, 'utf8'));
    for (const k of ['extName', 'extDescription', 'actionTitle', 'cmdToggleSidebar']) assert.ok(m[k]?.message?.trim(), `${l} ${k}`);
    assert.ok([...m.extName.message].length <= 75, `${l} name`);assert.ok([...m.extDescription.message].length <= 132, `${l} description`);
  }
  assert.deepEqual(fs.readdirSync('extension/_locales').sort(), [...LOCALES].sort());
});

// Every key the code asks for is in English, and every English text is asked for somewhere.
test('the code and the language files name the same texts', () => {
  const files = fs.readdirSync('extension').filter(f => f.endsWith('.js') && !/\.min\.js$|marked\.umd|jszip|^i18n\.js$/.test(f));
  const used = new Set(), word = /['"`]((?:kind|fileName|md|tip|set|panel|count|side|dock|status|err|warn|card|fault|list|html|pdf|dil|bg|obs|help)\.[\w.\-]*\w)['"`]/g;
  for (const f of files) for (const m of fs.readFileSync(path.join('extension', f), 'utf8').matchAll(word)) used.add(m[1]);
  // The extension pages name theirs in data-i18n / data-i18n-html (i18n.js fill()).
  for (const f of fs.readdirSync('extension').filter(f => f.endsWith('.html'))) for (const m of fs.readFileSync(path.join('extension', f), 'utf8').matchAll(/data-i18n(?:-html)?="([\w.\-]+)"/g)) used.add(m[1]);
  // Keys built from a name: kind.<k>.<part>, tip.<name>, dock.preset.<p>, …
  for (const k of ['md', 'zip', 'html', 'pdf', 'obsidian']) for (const p of ['name', 'verb', 'short', 'option', 'menu', 'side']) used.add(`kind.${k}.${p}`);
  for (const k of ['title', 'title-date', 'date-title', 'prefix']) used.add(`fileName.${k}`);
  for (const k of ['saveAs', 'profile', 'prose', 'cards', 'htmlForm', 'map', 'fver', 'yaml', 'pending', 'ui', 'shortcut', 'obs', 'ver', 'language']) used.add(`tip.${k}`);
  for (const k of ['all', 'mine', 'answers', 'none']) used.add(`dock.preset.${k}`);
  for (const k of ['aboveNoHtml', 'belowNoHtml']) used.add(`card.${k}`);
  for (const k of ['noTextAbove', 'noTextBelow', 'mismatchAbove', 'mismatchBelow']) used.add(`dil.v.${k}`);
  for (const k of ['copy', 'copied', 'mapConnecting', 'mapRetry', 'mapOnline', 'mapFailed', 'mapTimeout', 'mapBack', 'mapTilesFailed', 'mapTileFailed', 'mapCtrl']) used.add(`html.${k}`);
  used.delete('html.zip');
  assert.deepEqual([...used].filter(k => !(k in en)).sort(), [], 'asked for but missing');
  assert.deepEqual(Object.keys(en).filter(k => !used.has(k)).sort(), [], 'written but never asked for');
});

// What the extension shows or writes lives in the language files; Chinese left in its code is
// only what it reads from ChatGPT (its labels and punctuation) or glyphs that warm the fonts.
test('no Chinese is left in the extension code, outside comments and what ChatGPT itself writes', () => {
  // obsidian-send.js: full-width characters that file names keep or get in place of others.
  const allowed = [/const NAMES={en:'English',zh_CN:'简体中文'/, /aria-label="停止生成"/, /\[\(（\]/, /\[\)）\]/, /\[（\(\]/, /'Aa 0 预熱 あ 한 Я'/, /\.replace\(\/~\/g, '～'\)/, /\(\)（），。、·\]/];
  const found = [];
  for (const f of fs.readdirSync('extension').filter(f => /\.(js|html|json)$/.test(f) && !/\.min\.js$|marked\.umd|jszip/.test(f))) {
    fs.readFileSync(path.join('extension', f), 'utf8').split(/\r?\n/).forEach((line, i) => {
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\s\/\/ .*$/, '');
      if (CJK.test(code) && !allowed.some(a => a.test(code))) found.push(`${f}:${i + 1}: ${code.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(found, []);
});

// The sidebar and the buttons beside the input box, drawn in each language.
const chat = {title:'Plan', current_node:'b', mapping:{a:{parent:null, children:['b'], message:{id:'a', author:{role:'user'}, content:{parts:['Hello there']}}}, b:{parent:'a', children:[], message:{id:'b', author:{role:'assistant'}, content:{parts:['General Kenobi']}}}}};
const shownText = root => {
  const out = [];
  const walk = n => {
    if (n.nodeType === 3) out.push(n.nodeValue);
    if (n.nodeType === 1) {
      if (n.tagName === 'STYLE') return;
      for (const a of ['title', 'aria-label', 'data-tip', 'placeholder']) if (n.hasAttribute(a)) out.push(n.getAttribute(a));
      if (n.tagName === 'OPTION' || n.tagName === 'TEXTAREA' || n.tagName === 'INPUT') out.push(n.textContent);
    }
    if (n.shadowRoot) walk(n.shadowRoot);
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
  return out.map(s => s.trim()).filter(Boolean);
};
const rawKey = /^(?:kind|fileName|md|tip|set|panel|count|side|dock|status|err|warn|card|fault|list|html|pdf|dil|bg|obs|help)\.[\w.\-]+$/;
// Words of Simplified Chinese that another language must not show (its texts differ from theirs).
const chineseOf = (locale, keys) => keys.flatMap(k => forms(L.zh_CN[k])).filter(s => typeof s === 'string').flatMap(s => s.split(/\{\d+\}/)).map(s => s.trim()).filter(s => CJK.test(s) && [...s].length >= 3 && !Object.keys(L[locale]).some(k => forms(L[locale][k]).some(v => String(v).includes(s))));

test('the sidebar, its settings and the buttons by the input box show each language', async () => {
  for (const locale of LOCALES) {
    env.use(locale);
    const dom = new JSDOM('<div data-message-id="b">General Kenobi</div>', {url:'https://chatgpt.com/c/chat', runScripts:'outside-only'}), w = dom.window;
    w.fetch = async p => ({ok:true, json:async () => p === '/api/auth/session' ? {accessToken:'t'} : chat});
    w.ChatExportResident = true;
    for (const f of ['fast-text.js', 'settings.js', 'ui-kit.js', 'fast-content.js']) w.eval(fs.readFileSync(`extension/${f}`, 'utf8'));
    const host = w.document.querySelector('[data-archive-owned="fast-text"]'), dock = w.document.querySelector('[data-archive-owned="fast-text-dock"]');
    host.shadowRoot.getElementById('gear').click();
    // Every settings group open, so each row's words are drawn.
    for (const head of host.shadowRoot.querySelectorAll('.acch')) head.click();
    const texts = [...shownText(host), ...shownText(dock)];
    assert.equal(host.shadowRoot.getElementById('sb').getAttribute('lang'), I18n.TAGS[locale]);
    assert.ok(texts.includes(L[locale]['side.settings'] ?? en['side.settings']), `${locale}: the settings title`);
    assert.ok(texts.includes(L[locale]['dock.select']), `${locale}: the Select button`);
    assert.ok(texts.some(s => s.includes(L[locale]['set.saveAs'])), `${locale}: the save row`);
    assert.deepEqual(texts.filter(s => rawKey.test(s)), [], `${locale}: a key shows instead of its text`);
    if (!['zh_CN', 'zh_TW', 'ja'].includes(locale)) assert.deepEqual(texts.filter(s => foreign(locale).test(s) && !selfNames.test(s)), [], `${locale}: CJK text in the panel`);
    else if (locale !== 'zh_CN') {const leaks = chineseOf(locale, Object.keys(en).filter(k => /^(set|side|dock|tip|kind|fileName)\./.test(k)));assert.deepEqual(texts.filter(s => leaks.some(z => s.includes(z))), [], `${locale}: Simplified Chinese in the panel`);}
    dom.window.close();
  }
  env.use(env.LOCALE);
});

test('picking another language draws the sidebar again in it; auto follows the browser', async () => {
  env.use('en');
  const dom = new JSDOM('<div></div>', {url:'https://chatgpt.com/c/chat', runScripts:'outside-only'}), w = dom.window;
  w.fetch = async p => ({ok:true, json:async () => p === '/api/auth/session' ? {accessToken:'t'} : chat});
  for (const f of ['fast-text.js', 'settings.js', 'ui-kit.js', 'fast-content.js']) w.eval(fs.readFileSync(`extension/${f}`, 'utf8'));
  const root = () => w.document.querySelector('[data-archive-owned="fast-text"]').shadowRoot;
  for (let i = 0; i < 100 && root().getElementById('preview').disabled; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(root().getElementById('sbTitle').textContent, 'Select messages');
  root().getElementById('gear').click();
  const select = root().getElementById('language');
  assert.equal(select.value, 'auto');assert.equal(select.options.length, 11);
  select.value = 'de';select.dispatchEvent(new w.Event('change', {bubbles:true}));
  for (let i = 0; i < 200 && root().getElementById('export').textContent !== 'Exportieren'; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(root().getElementById('export').textContent, 'Exportieren');
  assert.equal(w.document.querySelectorAll('[data-archive-owned="fast-text"]').length, 1, 'one sidebar');
  assert.equal(root().getElementById('setView').hidden, false, 'still on the settings view');
  // The chat is read again in the new language before the window goes.
  for (let i = 0; i < 200 && root().getElementById('preview').disabled; i++) await new Promise(r => setTimeout(r, 5));
  dom.window.close();env.use(env.LOCALE);
});

test('the toolbar panel and the settings tab show each language', async () => {
  for (const locale of LOCALES) for (const page of ['popup', 'options']) {
    env.use('en');
    const dom = new JSDOM(`<!doctype html><html><head></head><body data-page="${page}"></body></html>`, {url:`chrome-extension://x/${page}.html`, runScripts:'outside-only'}), w = dom.window;
    const stored = {language:locale};
    w.matchMedia = () => ({matches:false, addEventListener() {}});
    w.chrome = {runtime:{getManifest:() => ({version:require('../extension/settings.js').version, content_scripts:[{js:[]}]}), openOptionsPage() {}, reload() {}},
      storage:{local:{get:async () => ({...stored}), set:async v => Object.assign(stored, v), remove:async () => {}}, onChanged:{addListener() {}}},
      tabs:{query:async () => [{id:1, url:'https://chatgpt.com/c/x', title:'Plan'}], sendMessage:async (id, m) => m.type === 'panel:summary' ? {version:require('../extension/settings.js').version, page:'chat', ok:true, title:'Plan', messages:2, cards:1, images:3} : {}, create() {}, update() {}, reload() {}},
      scripting:{executeScript:async () => {}}};
    for (const f of ['settings.js', 'ui-kit.js', 'panel-page.js']) w.eval(fs.readFileSync(`extension/${f}`, 'utf8'));
    for (let i = 0; i < 100 && !w.document.querySelector('#settings .xset'); i++) await new Promise(r => setTimeout(r, 5));
    if (page === 'popup') for (let i = 0; i < 100 && !w.document.getElementById('chatMeta')?.textContent; i++) await new Promise(r => setTimeout(r, 5));
    const texts = shownText(w.document.body);
    assert.equal(w.document.documentElement.lang, I18n.TAGS[locale], `${locale} ${page}`);
    assert.deepEqual(texts.filter(s => rawKey.test(s)), [], `${locale} ${page}: a key shows instead of its text`);
    assert.ok(texts.includes(L[locale]['panel.feedback']), `${locale} ${page}: feedback link`);
    if (page === 'popup') {
      I18n.setLocale(locale);
      assert.equal(w.document.getElementById('chatMeta').textContent, [I18n.t('count.messages', 2), I18n.t('count.cards', 1), I18n.t('count.images', 3)].join(' · '));
    } else assert.equal(w.document.title, L[locale]['panel.settingsTitle']);
    if (!['zh_CN', 'zh_TW', 'ja'].includes(locale)) assert.deepEqual(texts.filter(s => foreign(locale).test(s) && !selfNames.test(s)), [], `${locale} ${page}: CJK text`);
    dom.window.close();
  }
  env.use(env.LOCALE);
});

// The fixed words of an export, in each language: nothing in Simplified Chinese is written that the
// chat itself does not contain; the print page reads the sections of every language back.
const fixtures = ['edge-2026-10/EDGE-01', 'edge-2026-10/EDGE-04', 'edge-2026-10/EDGE-05', 'edge-2026-10/EDGE-09', 'edge-2026-10/EDGE-10', 'pro-2026-10/PRO-03', 'pro-2026-10/PRO-11'];
const fixedChinese = Object.keys(en).filter(k => /^(md|dil|html|warn|count|pdf)\./.test(k)).flatMap(k => forms(L.zh_CN[k])).flatMap(s => String(s).split(/\{\d+\}/)).map(s => s.replace(/^[：、，。（）〔〕［］「」\s]+|[：、，。（）〔〕［］「」\s]+$/g, '')).filter(s => CJK.test(s) && [...s].length >= 3);
const count = (text, part) => text.split(part).length - 1;
test('exports in each language carry its fixed words and none of the Chinese ones', async () => {
  for (const name of fixtures) {
    const raw = JSON.parse(fs.readFileSync(`tests/fixtures/${name}.raw.json`, 'utf8')), source = JSON.stringify(raw);
    for (const locale of LOCALES) {
      const zip = await runExport(raw, {locale}), html = await runExport(raw, {locale, html:'single'});
      assert.deepEqual(zip.errors, [], `${name} ${locale}`);assert.deepEqual(html.errors, [], `${name} ${locale} html`);
      const sections = pdf.splitDocument((await runExport(raw, {locale, mode:'pdf'})).pdf.md);I18n.setLocale(locale);
      assert.ok(sections.source.startsWith('https://chatgpt.com/'), `${name} ${locale}: the PDF finds the source line`);
      assert.ok(sections.sections.some(s => s.role === 'assistant'), `${name} ${locale}: the PDF finds the answers`);
      if (raw.mapping && Object.values(raw.mapping).some(n => n.message?.author?.role === 'user')) assert.ok(sections.sections.some(s => s.role === 'user' && s.label === I18n.t('md.roleUser')), `${name} ${locale}: the PDF finds the prompts`);
      assert.match(html.html, new RegExp(`<html lang="${I18n.tag}">`));
      if (locale.startsWith('zh')) continue;
      // A fixed word may appear only as often as the chat itself has it (the title is written twice:
      // the properties and the heading, or <title> and <h1>).
      const allowed = part => count(source, part) + 2 * count(raw.title || '', part);
      // Words the language itself writes the same way (Japanese 行 × 列) are its own.
      const own = Object.values(L[locale]).flatMap(forms).join('\n');
      const leaks = fixedChinese.filter(part => !own.includes(part)).filter(part => count(zip.md, part) > allowed(part) || count(html.html.replace(/<script[\s\S]*?<\/script>/g, ''), part) > allowed(part));
      assert.deepEqual([...new Set(leaks)], [], `${name} ${locale}: Chinese fixed words in the export`);
    }
  }
  I18n.setLocale(env.locale);
});

test('the print page lays out in the language of the export, also for a payload that does not say it', async () => {
  const raw = JSON.parse(fs.readFileSync('tests/fixtures/edge-2026-10/EDGE-01.raw.json', 'utf8'));
  for (const locale of ['de', 'ja']) {
    const r = await runExport(raw, {locale, mode:'pdf'});
    for (const payload of [r.pdf, {...r.pdf, locale:undefined}]) {
      const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {url:'file:///print.html', virtualConsole:new env.VirtualConsole()}), doc = dom.window.document;
      Object.defineProperty(dom.window.HTMLImageElement.prototype, 'complete', {get:() => true});
      await pdf.render({...payload, assets:payload.assets.map(a => ({...a, blob:null, url:'blob:' + a.path}))}, doc);
      I18n.setLocale(locale);
      assert.equal(doc.documentElement.lang, I18n.tag, `${locale}${payload.locale ? '' : ' (no locale)'}`);
      assert.ok(doc.querySelector('.doc-meta').textContent.startsWith(I18n.t('md.source', '').trim()), locale);
      assert.equal(doc.querySelector('section.msg.user .role').textContent, I18n.t('md.roleUser'));
      dom.window.close();
    }
  }
  I18n.setLocale(env.locale);
});

test('the exported page carries its own words for the cards it runs, in the language of the export', async () => {
  const raw = JSON.parse(fs.readFileSync('tests/fixtures/edge-2026-10/EDGE-01.raw.json', 'utf8'));
  const page = (await runExport(raw, {locale:'fr', html:'single'})).html;
  const data = JSON.parse(/<script type="application\/json" id="export-data">([\s\S]*?)<\/script>/.exec(page)[1]);
  assert.equal(data.text.copy, 'Copier');assert.equal(data.dilText.tag, 'fr');assert.equal(data.dilText.words['dil.copied'], 'Copié');
  assert.ok(Object.keys(data.dilText.words).every(k => k.startsWith('dil.')));
  // The card runtime inside the page has no extension to ask: it uses those words.
  const render = require('../extension/dil-render.js'), saved = globalThis.ChatExportI18n;
  try {
    delete globalThis.ChatExportI18n;
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
    render.mountLive({frame:0, card:0, dil:{code:'DIL.render(DIL.h("card",{},DIL.h("text",{},"x")))'}, text:data.dilText}, dom.window.document, {postMessage() {}});
    assert.equal(render.toHtml({type:'chart', props:{}, children:[]}), `<div class="widget">${'Graphique (aucune donnée)'}</div>`);
  } finally {globalThis.ChatExportI18n = saved;}
});
