// Loads this checkout's extension into a real Chrome (a fresh, temporary profile) and goes through
// the new interface on a stand-in chatgpt.com: the page and the conversation API are answered from a
// saved conversation, so no ChatGPT login is needed. It checks the buttons beside the input box, the
// sidebar, the toolbar panel and the settings tab, exports once from each, and saves screenshots:
//   node scripts/panel-check.cjs [raw.json] [outDir]
// Exit code 1 if a check fails. A real, logged-in chatgpt.com still needs a look by hand.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const rawPath = process.argv[2] || path.join(root, 'tests/fixtures/edge-2026-10/EDGE-01.raw.json');
const out = path.resolve(process.argv[3] || path.join(root, 'tmp/panel-check'));
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
// Chrome's own language, which the extension follows (auto): the checks below are written for zh-CN.
const LANG = process.env.PANEL_LANG || 'zh-CN';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const failures = [];const check = (ok, what) => {console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);if (!ok) failures.push(what);};

// A page shaped like ChatGPT's: the messages, and the input box at the bottom centre.
const chatPage = (title, dark) => `<!doctype html><html class="${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><title>${title}</title><style>
body{margin:0;font:15px/1.6 system-ui;background:${dark ? '#212121' : '#fff'};color:${dark ? '#ececec' : '#0d0d0d'}}
nav{position:fixed;left:0;top:0;bottom:0;width:260px;background:${dark ? '#171717' : '#f9f9f9'};padding:12px;box-sizing:border-box}
main{margin-left:260px;padding:24px 0 160px}.col{max-width:760px;margin:0 auto;padding:0 24px}
.u{background:${dark ? '#303030' : '#f4f4f4'};border-radius:18px;padding:10px 16px;margin:16px 0 16px auto;max-width:70%}
form{position:fixed;bottom:28px;left:calc(260px + (100vw - 260px - 768px) / 2);width:768px}
[data-composer-body]{border:1px solid #ccc;border-radius:28px;padding:13px 20px;background:${dark ? '#303030' : '#fff'}}
</style></head><body><nav><b>ChatGPT</b><p>${title}</p></nav><main><div class="col">
<div class="u" data-message-id="q">问题</div><div data-message-id="a">回答……</div></div></main>
<form data-chatgpt-composer=""><div data-composer-body=""><div contenteditable="true" role="textbox" data-composer-markdown="" aria-label="Ask ChatGPT">询问任何问题</div></div></form></body></html>`;

(async () => {
  if (!executablePath) throw Error('Chrome not found; set CHROME_PATH');
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8')), id = raw.conversation_id || 'demo-chat', title = raw.title || 'ChatGPT';
  // A second chat with 11 generated pictures, for the note that one HTML file may be large.
  const manyId = 'many-pictures', many = {title:'海报', conversation_id:manyId, current_node:'b', mapping:{a:{parent:null, children:['b'], message:{id:'a', create_time:1790000000, author:{role:'user'}, content:{parts:['做海报']}}},
    b:{parent:'a', children:[], message:{id:'b', create_time:1790000000, author:{role:'assistant'}, content:{content_type:'multimodal_text', parts:['给你：', ...Array.from({length:11}, (_, i) => ({content_type:'image_asset_pointer', asset_pointer:`file-service://file-${i}`}))]}}}}};
  fs.rmSync(out, {recursive:true, force:true});fs.mkdirSync(path.join(out, 'downloads'), {recursive:true});
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-check-')), downloads = path.join(out, 'downloads');
  // The profile's own download folder, so the files keep the names the extension gives them.
  fs.mkdirSync(path.join(profile, 'Default'), {recursive:true});
  fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({download:{default_directory:downloads, prompt_for_download:false}}));
  const browser = await puppeteer.launch({executablePath, headless:true, pipe:true, userDataDir:profile, enableExtensions:[path.join(root, 'extension')], args:['--window-size=1440,900', `--lang=${LANG}`], defaultViewport:{width:1440, height:900}});
  try {
    const worker = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('/background.js'), {timeout:15000});
    const extId = new URL(worker.url()).host, base = `chrome-extension://${extId}/`;
    // Finished downloads (looked up by name: they can finish in either order).
    const downloaded = () => fs.readdirSync(downloads).filter(f => !/\.(crdownload|tmp)$/.test(f)).map(f => [f, fs.statSync(path.join(downloads, f)).mtimeMs]).sort((a, b) => a[1] - b[1]).map(([f]) => f);
    const waitDownload = async n => {for (let i = 0; i < 120 && downloaded().length < n; i++) await sleep(250);return downloaded();};
    const today = require('../extension/settings.js').day();
    let dark = false;
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    const serve = r => {
      const u = new URL(r.url());
      if (u.host !== 'chatgpt.com' && u.host !== 'files.example') return r.continue();
      const json = body => r.respond({status:200, contentType:'application/json', body:JSON.stringify(body)});
      if (u.pathname === '/api/auth/session') return json({accessToken:'t'});
      if (u.pathname.startsWith(`/backend-api/conversation/${manyId}`)) return json(many);
      if (u.pathname.startsWith('/backend-api/conversation/') && !u.pathname.includes('/interpreter/')) return json(raw);
      if (/^\/backend-api\/(files|conversation)\//.test(u.pathname)) return json({status:'success', download_url:'https://files.example/f.png'});
      if (u.host === 'files.example' || u.pathname.startsWith('/backend-api/')) return r.respond({status:200, contentType:'image/png', body:PNG});
      return r.respond({status:200, contentType:'text/html; charset=utf-8', body:chatPage(title, dark)});
    };
    page.on('request', serve);
    const errors = [];page.on('pageerror', e => errors.push(e.message));
    await page.goto(`https://chatgpt.com/c/${id}`);
    const dock = await page.waitForSelector('[data-archive-owned="fast-text-dock"]', {timeout:10000});
    await sleep(1200);
    const inShadow = (host, sel) => page.evaluateHandle((h, s) => document.querySelector(`[data-archive-owned="${h}"]`).shadowRoot.querySelector(s), host, sel);
    const shadowText = (host, sel) => page.evaluate((h, s) => document.querySelector(`[data-archive-owned="${h}"]`).shadowRoot.querySelector(s)?.textContent, host, sel);
    const box = await (await inShadow('fast-text-dock', '#dock')).boundingBox(), form = await (await page.$('[data-composer-body]')).boundingBox();
    check(box && box.x >= form.x + form.width && Math.abs(box.y + box.height - form.y - form.height) < 12, `buttons sit to the right of the input box (${JSON.stringify(box)})`);
    check(await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text"]').hidden), 'the sidebar starts closed');
    check((await shadowText('fast-text-dock', '.vtag')) === undefined, 'no version under the buttons');
    await page.screenshot({path:path.join(out, '1-buttons.png')});
    // A 1285px-wide window leaves about 130px beside the input box: the buttons shrink to icons there.
    await page.setViewport({width:1285, height:900});await sleep(1200);
    const small = await (await inShadow('fast-text-dock', '#dock')).boundingBox(), smallForm = await (await page.$('[data-composer-body]')).boundingBox();
    const narrow = await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text-dock"]').shadowRoot.getElementById('dock').classList.contains('narrow'));
    check(narrow && small.x >= smallForm.x + smallForm.width && small.x + small.width <= 1285, `in a narrower window the buttons stay right of the input box, as icons (${JSON.stringify(small)})`);
    await page.screenshot({path:path.join(out, '1b-buttons-narrow.png')});
    await page.setViewport({width:1440, height:900});await sleep(1000);
    // 导出 ▾ menu, then 导出 with the sidebar closed (all messages, the default 完整归档).
    await (await inShadow('fast-text-dock', '[data-menu="mExport"]')).click();await sleep(200);
    await page.screenshot({path:path.join(out, '2-export-menu.png')});
    await page.keyboard.press('Escape');
    await (await inShadow('fast-text-dock', '#dExport')).click();
    let files = await waitDownload(1);
    check(files[0] === `${title} - ${today}.zip`, `导出 beside the input box downloads the ZIP as title - date (${files.join(', ')})`);
    await page.screenshot({path:path.join(out, '3-toast.png')});
    // 选择 opens the sidebar.
    await (await inShadow('fast-text-dock', '#dSelect')).click();
    await page.waitForFunction(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.querySelectorAll('#list input').length > 0, {timeout:20000});
    await sleep(300);
    check(!(await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text"]').hidden)), '选择 opens the sidebar');
    await page.screenshot({path:path.join(out, '4-sidebar.png')});
    await (await inShadow('fast-text', '#mine')).click();
    check(/^已选 \d+ \/ \d+$/.test(await shadowText('fast-text', '#count')), `filters update the count (${await shadowText('fast-text', '#count')})`);
    await (await inShadow('fast-text', '#all')).click();
    await page.evaluate(() => {const s = document.querySelector('[data-archive-owned="fast-text"]').shadowRoot;s.getElementById('kind').value = 'md';s.getElementById('kind').dispatchEvent(new Event('change'));});
    await (await inShadow('fast-text', '#export')).click();
    files = await waitDownload(2);
    check(files.includes(`${title} - ${today}.md`), `the sidebar's 导出 downloads the Markdown (${files.join(', ')})`);
    const md = fs.readFileSync(path.join(downloads, `${title} - ${today}.md`), 'utf8');
    check(md.startsWith('---\ntitle: '), 'the Markdown starts with the Obsidian properties');
    // ⚙: the settings in the sidebar. A switch flips in place: no jump, focus kept.
    await (await inShadow('fast-text', '#gear2')).click();await sleep(200);
    // The same ⓘ in the sidebar opens it too (through the background worker).
    await (await inShadow('fast-text', '[data-row="proseHtml"] .info')).click();
    const fromPage = await browser.waitForTarget(t => t.url() === base + 'help.html#prose-html', {timeout:10000}).catch(() => null);
    check(!!fromPage, 'the sidebar\'s ⓘ opens the explanation page');if (fromPage) await (await fromPage.asPage()).close();await page.bringToFront();
    const flip = await page.evaluate(async () => {const s = document.querySelector('[data-archive-owned="fast-text"]').shadowRoot, view = s.getElementById('setView');
      view.scrollTop = 200;const before = view.scrollTop, sw = s.getElementById('timestamps');sw.focus();sw.click();await new Promise(r => setTimeout(r, 150));
      return {before, after:view.scrollTop, focus:s.activeElement === sw, same:s.getElementById('timestamps') === sw, checked:sw.checked};});
    check(flip.same && flip.focus && flip.before === flip.after && flip.checked, `a switch flips in place (${JSON.stringify(flip)})`);
    await page.screenshot({path:path.join(out, '5-sidebar-settings.png')});
    // The settings tab: the same component, all groups open; a change there reaches the page at once.
    const options = await browser.newPage();await options.goto(base + 'options.html');await sleep(500);
    check(await options.evaluate(() => document.getElementById('timestamps').checked), 'the settings tab shows the change made in the sidebar');
    check(await options.evaluate(() => document.querySelectorAll('.acc.open').length === 6 && document.querySelectorAll('.acc').length === 6), 'the settings tab opens all six groups (Obsidian included)');
    await options.screenshot({path:path.join(out, '6-options.png'), fullPage:true});
    await options.click('#autoClose');await sleep(200);
    check(await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.getElementById('autoClose').checked), 'a change in the settings tab reaches the sidebar');
    // Scrolled into view first, so the hover itself does not scroll the page.
    const tip = await options.$('[data-row="htmlCards"] .info');await tip.scrollIntoView();await sleep(100);const rowBox = await (await options.$('[data-row="timestamps"]')).boundingBox();
    await tip.hover();await sleep(250);
    const tipShown = await options.evaluate(() => document.querySelector('.tipbox').classList.contains('show'));
    const rowAfter = await (await options.$('[data-row="timestamps"]')).boundingBox();
    check(tipShown && rowBox.y === rowAfter.y, 'ⓘ shows on hover without moving the rows');
    await options.screenshot({path:path.join(out, '7-tooltip.png')});
    await options.emulateMediaFeatures([{name:'prefers-color-scheme', value:'dark'}]);await sleep(200);
    await options.screenshot({path:path.join(out, '8-options-dark.png'), fullPage:true});
    // The ⓘ of 图文卡片用 HTML opens its explanation in a new tab.
    await options.click('[data-row="htmlCards"] .info');
    const help = await (await browser.waitForTarget(t => t.url() === base + 'help.html#html-cards', {timeout:10000})).asPage();
    await help.setViewport({width:1000, height:900});await sleep(400);
    check(await help.evaluate(() => !!document.querySelector('section#html-cards') && document.body.classList.contains('cx')), 'clicking ⓘ opens the explanation page at its section');
    await help.screenshot({path:path.join(out, '7b-help.png'), fullPage:true});await help.close();
    // So does the ⓘ of HTML 网页的形式, at its own section.
    await options.click('[data-row="htmlForm"] .info');
    const formHelp = await (await browser.waitForTarget(t => t.url() === base + 'help.html#html-form', {timeout:10000})).asPage();
    await formHelp.setViewport({width:1000, height:900});await sleep(400);
    check(await formHelp.evaluate(() => {const s = document.querySelector('section#html-form');return !!s && s.querySelectorAll('.opt').length === 2 && !/\b(help|set)\.[a-z]/.test(s.textContent);}), 'the ⓘ of HTML 网页的形式 opens help.html#html-form, with both forms explained');
    await formHelp.screenshot({path:path.join(out, '7c-help-html-form.png'), fullPage:true});await formHelp.close();
    await options.close();
    // The toolbar panel, opened over the chat tab.
    await page.bringToFront();
    const sw = await worker.worker();await sw.evaluate(() => chrome.action.openPopup());
    const popupTarget = await browser.waitForTarget(t => t.url() === base + 'popup.html', {timeout:10000});
    const popup = await popupTarget.asPage();
    await popup.waitForFunction(() => /条消息/.test(document.getElementById('chatMeta')?.textContent || ''), {timeout:20000});
    check(await popup.evaluate(() => /^v\d/.test(document.getElementById('ver').textContent) && document.getElementById('warn').hidden), 'the toolbar panel shows the version, no warning');
    check(await popup.evaluate(t => document.getElementById('chatTitle').textContent === t, title), 'the toolbar panel shows the current chat');
    await popup.screenshot({path:path.join(out, '9-popup.png'), fullPage:true});
    const head = await popup.$('[data-group="def"] .acch');await head.click();await sleep(150);
    await popup.screenshot({path:path.join(out, '10-popup-open-group.png'), fullPage:true});
    await popup.click('#export');
    files = await waitDownload(3);
    // The sidebar made 仅文字 the default, which the toolbar panel's button follows.
    check(files.length === 3 && files.includes(`${title} - ${today} (1).md`), `导出 in the toolbar panel downloads in the default format (${files.join(', ')})`);
    await popup.close().catch(() => {});
    // Obsidian as the export kind: 导出 becomes the pill 保存到 Obsidian | 打开 beside the input box, in
    // the sidebar and in the toolbar panel. 打开 stays off until this chat has a saved note.
    await page.bringToFront();
    await (await inShadow('fast-text-dock', '[data-menu="mExport"]')).click();await sleep(200);
    await (await inShadow('fast-text-dock', '[data-kind="obsidian"]')).click();await sleep(300);
    await (await inShadow('fast-text-dock', '[data-menu="mExport"]')).click();await sleep(200);
    await page.screenshot({path:path.join(out, '11-obsidian-menu.png')});await page.keyboard.press('Escape');await sleep(150);
    const dockObs = await page.evaluate(() => {const d = document.querySelector('[data-archive-owned="fast-text-dock"]').shadowRoot;return {main:d.getElementById('dExport').textContent, open:!d.getElementById('dOpen').hidden, off:d.getElementById('dOpen').disabled, narrow:d.getElementById('dock').classList.contains('narrow')};});
    check(dockObs.main === '保存' && !dockObs.narrow && dockObs.open && dockObs.off, `导出 beside the input box becomes 保存到 Obsidian | 打开 (${JSON.stringify(dockObs)})`);
    await page.screenshot({path:path.join(out, '12-obsidian-buttons.png')});
    if (await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text"]').hidden)) {await (await inShadow('fast-text-dock', '#dSelect')).click();await sleep(400);}
    const sideObs = await page.evaluate(() => {const s = document.querySelector('[data-archive-owned="fast-text"]').shadowRoot;return {main:s.getElementById('export').textContent, open:!s.getElementById('obsOpen').hidden, pill:s.getElementById('exportPill').classList.contains('two')};});
    check(sideObs.main === '保存' && sideObs.open && sideObs.pill, `the sidebar's 导出 becomes the same pill (${JSON.stringify(sideObs)})`);
    await page.screenshot({path:path.join(out, '13-obsidian-sidebar.png')});
    // The bottom row keeps its place whatever the kind (the list and the button have fixed widths).
    const rowPos = await page.evaluate(async () => {const s = document.querySelector('[data-archive-owned="fast-text"]').shadowRoot, k = s.getElementById('kind'), at = [];
      for (const v of ['md', 'zip', 'html', 'pdf', 'obsidian']) {k.value = v;k.dispatchEvent(new Event('change'));await new Promise(r => setTimeout(r, 150));
        at.push(['kind', 'exportPill', 'gear2'].map(id => {const r = s.getElementById(id).getBoundingClientRect();return `${Math.round(r.left)}+${Math.round(r.width)}`;}).join(' '));}
      return at;});
    check(new Set(rowPos).size === 1, `the sidebar's bottom row stays put across the five kinds (${rowPos.join(' | ')})`);
    await sw.evaluate(() => chrome.action.openPopup());
    const obsPopup = await (await browser.waitForTarget(t => t.url() === base + 'popup.html', {timeout:10000})).asPage();
    await obsPopup.waitForFunction(() => /条消息/.test(document.getElementById('chatMeta')?.textContent || ''), {timeout:20000});
    check(await obsPopup.evaluate(() => /保存到 Obsidian/.test(document.getElementById('export').textContent) && document.getElementById('obsOpen')?.disabled === true), 'the toolbar panel shows the pill too');
    // No 「当前对话」 label; the kind list at the end of the info line switches the default kind.
    check(await obsPopup.evaluate(() => !document.querySelector('#hero .xk') && document.getElementById('kindSel').value === 'obsidian'), 'the toolbar panel has no 当前对话 label and its kind list shows Obsidian');
    await obsPopup.select('#kindSel', 'md');await sleep(200);
    check(await obsPopup.evaluate(() => document.getElementById('export').textContent === '导出仅文字' && !document.getElementById('obsOpen')), 'picking 仅文字 there turns the pill back into 导出仅文字');
    await obsPopup.screenshot({path:path.join(out, '14b-popup-kind-md.png')});
    await obsPopup.select('#kindSel', 'obsidian');await sleep(200);
    // 每次导出时选择保存位置 does not apply to Obsidian: greyed out, and it says why.
    check(await obsPopup.evaluate(() => {const row = document.querySelector('[data-row="saveAs"]');return row.classList.contains('dim') && document.getElementById('saveAs').disabled && /Obsidian 时不用/.test(row.textContent);}), '下载时选择保存位置 is greyed out while Obsidian is the kind');
    await (await obsPopup.$('[data-group="obs"] .acch')).click();await sleep(150);
    await obsPopup.screenshot({path:path.join(out, '14-obsidian-popup.png'), fullPage:true});
    await obsPopup.close().catch(() => {});
    // 保存到 Obsidian: the relay tab receives the chat in the background and, with no folder chosen
    // yet, comes to the front to ask for one (the folder dialog itself needs a person).
    await page.bringToFront();
    await (await inShadow('fast-text-dock', '#dExport')).click();
    const relay = await (await browser.waitForTarget(t => t.url().startsWith(base + 'obsidian.html?tab='), {timeout:15000})).asPage();
    const asked = await relay.waitForFunction(() => /第一次使用/.test(document.getElementById('status').textContent) && !document.getElementById('pick').hidden, {timeout:30000}).then(() => true, () => false);
    check(asked, 'the relay tab receives the chat and asks for the 笔记文件夹 the first time');
    await relay.setViewport({width:1000, height:700});await relay.screenshot({path:path.join(out, '15-obsidian-relay.png')});
    // A whole save, with a folder in the extension's private storage (OPFS) standing in for the one
    // a person would pick: Chrome lets the page write there without asking. The note and its image
    // land in <folder>/<title>/, the relay tab closes itself and the sidebar says where it went.
    await relay.evaluate(async () => {const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Vault-Test', {create:true});
      await new Promise((ok, fail) => {const open = indexedDB.open('chat-export-obsidian', 1);open.onupgradeneeded = () => open.result.createObjectStore('kv');
        open.onsuccess = () => {const tx = open.result.transaction('kv', 'readwrite');tx.objectStore('kv').put(dir, 'vault');tx.oncomplete = () => {open.result.close();ok();};tx.onerror = () => fail(tx.error);};});});
    await relay.close().catch(() => {});
    // In a tab of its own: after writing, the page opens obsidian://, whose Chrome prompt would hold
    // up the clicks in the steps that follow.
    const savePage = await browser.newPage();await savePage.setRequestInterception(true);savePage.on('request', serve);
    await savePage.goto(`https://chatgpt.com/c/${id}`);await savePage.waitForSelector('[data-archive-owned="fast-text-dock"]');await sleep(1200);
    await (await savePage.evaluateHandle(() => document.querySelector('[data-archive-owned="fast-text-dock"]').shadowRoot.getElementById('dExport'))).click();
    const relay2 = await (await browser.waitForTarget(t => t.url().startsWith(base + 'obsidian.html?tab=') && t !== relay.target(), {timeout:15000})).asPage().catch(() => null);
    const closed = relay2 ? await new Promise(r => {relay2.once('close', () => r(true));setTimeout(() => r(relay2.isClosed()), 20000);}) : false;
    const saved = await savePage.waitForFunction(() => /已保存到 Vault-Test \/ /.test(document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.getElementById('status').textContent), {timeout:20000}).then(() => true, () => false);
    const vaultFiles = await (async () => {const p = await browser.newPage();await p.goto(base + 'obsidian.html');
      const list = await p.evaluate(async () => {const out = [];const walk = async (d, pre) => {for await (const [n, h] of d.entries()) {if (h.kind === 'directory') await walk(h, `${pre}${n}/`);else out.push(`${pre}${n}`);}};
        await walk(await (await navigator.storage.getDirectory()).getDirectoryHandle('Vault-Test'), '');return out;});
      await p.close();return list;})();
    check(closed && saved && vaultFiles.some(f => /^[^/]+\/[^/]+\.md$/.test(f)), `保存 writes the note into <folder>/<title>/, then the relay tab closes (${JSON.stringify({closed, saved, vaultFiles})})`);
    const openOn = await savePage.evaluate(() => !document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.getElementById('obsOpen').disabled);
    check(openOn, '打开 turns on once this chat has a saved note');
    // Where it went is a path in a grey box: in the toast (sidebar closed), the sidebar's status and
    // 设置 → 笔记文件夹. (Clicks are held up by Chrome's obsidian:// prompt here, so the sidebar is
    // shown directly for its picture.)
    check(await savePage.evaluate(() => document.querySelector('[data-archive-owned="fast-text-dock"]').shadowRoot.querySelector('#toast .chip')?.textContent.startsWith('Vault-Test / ')), 'the toast shows the path in a grey box');
    await savePage.screenshot({path:path.join(out, '16-obsidian-saved-toast.png')});
    await savePage.evaluate(() => {document.querySelector('[data-archive-owned="fast-text"]').hidden = false;});await sleep(300);
    check(await savePage.evaluate(() => {const c = document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.querySelector('#status .chip');return c?.textContent.startsWith('Vault-Test / ') && c.classList.contains('link') && c.href.startsWith('obsidian://open?');}), 'the saved status shows the path in a grey box, as a link that opens the note');
    await savePage.screenshot({path:path.join(out, '16-obsidian-saved.png')});
    await savePage.close().catch(() => {});
    const opts = await browser.newPage();await opts.goto(base + 'options.html');await sleep(500);
    check(await opts.evaluate(() => {const v = document.querySelector('[data-row="obsFolder"] .val');return v.classList.contains('chip') && v.textContent === 'Vault-Test /';}), '设置 → 笔记文件夹 shows the folder as 「Vault-Test /」 in a grey box');
    await (await opts.$('[data-group="obs"]')).screenshot({path:path.join(out, '17-obsidian-setting.png')});
    // 更改… opens the same page on its own: 保存路径 「Vault-Test /」, no 「对话」 label.
    await opts.goto(base + 'obsidian.html?setup=1');await opts.setViewport({width:1000, height:520});await sleep(500);
    check(await opts.evaluate(() => document.getElementById('dest').textContent === 'Vault-Test /' && document.getElementById('convLab').hidden && /保存路径/.test(document.querySelector('.dest').textContent)), '更改笔记文件夹 shows 保存路径 「Vault-Test /」');
    await opts.screenshot({path:path.join(out, '18-obsidian-setup.png')});
    await opts.close();await page.bringToFront();
    // Over a tab that is not a ChatGPT chat.
    const blank = await browser.newPage();await blank.goto('about:blank');await blank.bringToFront();
    await sw.evaluate(() => chrome.action.openPopup());
    const other = await (await browser.waitForTarget(t => t.url() === base + 'popup.html', {timeout:10000})).asPage();
    await other.waitForSelector('#hero .xt');
    check(await other.evaluate(() => document.querySelector('#hero .xt').textContent === '这里没有 ChatGPT 对话' && !!document.getElementById('openChat')), 'the toolbar panel says when the tab is not a ChatGPT chat');
    await other.screenshot({path:path.join(out, '9b-popup-not-chat.png')});
    await other.close().catch(() => {});await blank.close();await page.bringToFront();
    // A chat with 11 pictures, HTML as one file: the file-name line of the sidebar and the info line of
    // the toolbar panel say it may be large, with 改用多文件; the rows around them do not move.
    await sw.evaluate(() => chrome.storage.local.set({exportKind:'html', htmlForm:'single'}));
    await page.goto(`https://chatgpt.com/c/${manyId}`);await page.waitForSelector('[data-archive-owned="fast-text-dock"]');await sleep(1200);
    await (await inShadow('fast-text-dock', '#dSelect')).click();
    await page.waitForFunction(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.querySelectorAll('#list input').length > 0, {timeout:20000});await sleep(300);
    const sideLine = () => page.evaluate(() => {const s = document.querySelector('[data-archive-owned="fast-text"]').shadowRoot, top = id => Math.round(s.getElementById(id).getBoundingClientRect().top);
      return {text:s.getElementById('fname').textContent, button:!s.getElementById('useFolder').hidden, rows:[top('stx'), top('export'), top('fname')]};});
    const bigSide = await sideLine();
    check(bigSide.text === '⚠ 文件可能很大' && bigSide.button, `the sidebar's file-name line says one HTML file may be large (${bigSide.text})`);
    await page.screenshot({path:path.join(out, '19-sidebar-big-html.png')});
    await (await inShadow('fast-text', '#useFolder')).click();await sleep(300);
    const zipSide = await sideLine();
    check(zipSide.text.endsWith('.html.zip') && !zipSide.button && JSON.stringify(zipSide.rows) === JSON.stringify(bigSide.rows), `改用多文件 switches to ZIP and nothing in the sidebar moves (${bigSide.rows} → ${zipSide.rows})`);
    check((await sw.evaluate(() => chrome.storage.local.get('htmlForm'))).htmlForm === 'folder', '改用多文件 is the same setting as HTML 网页的形式');
    await sw.evaluate(() => chrome.storage.local.set({htmlForm:'single'}));
    await sw.evaluate(() => chrome.action.openPopup());
    const bigPopup = await (await browser.waitForTarget(t => t.url() === base + 'popup.html', {timeout:10000})).asPage();
    await bigPopup.waitForFunction(() => /⚠/.test(document.getElementById('chatMeta')?.textContent || ''), {timeout:20000}).catch(() => {});
    const popupLine = () => bigPopup.evaluate(() => ({text:document.getElementById('chatMeta').textContent, button:!!document.getElementById('useFolder'), rows:['kindSel', 'export', 'pick'].map(id => Math.round(document.getElementById(id).getBoundingClientRect().top))}));
    const bigTop = await popupLine();
    check(bigTop.text === '⚠ 文件可能很大' && bigTop.button, `the toolbar panel's info line says one HTML file may be large (${bigTop.text})`);
    await bigPopup.screenshot({path:path.join(out, '20-popup-big-html.png'), fullPage:true});
    await bigPopup.click('#useFolder');await sleep(300);
    const zipTop = await popupLine();
    check(/条消息/.test(zipTop.text) && !zipTop.button && JSON.stringify(zipTop.rows) === JSON.stringify(bigTop.rows), `改用多文件 in the toolbar panel switches to ZIP and its buttons do not move (${bigTop.rows} → ${zipTop.rows})`);
    await bigPopup.close().catch(() => {});await page.goto(`https://chatgpt.com/c/${id}`);await page.waitForSelector('[data-archive-owned="fast-text-dock"]');await sleep(800);
    // Dark ChatGPT page.
    dark = true;await page.goto(`https://chatgpt.com/c/${id}`);await page.waitForSelector('[data-archive-owned="fast-text-dock"]');await sleep(1200);
    await (await inShadow('fast-text-dock', '#dSelect')).click();
    await page.waitForFunction(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.querySelectorAll('#list input').length > 0, {timeout:20000});await sleep(300);
    check(await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.getElementById('sb').classList.contains('dark')), 'the sidebar follows ChatGPT\'s dark theme');
    await page.screenshot({path:path.join(out, '11-sidebar-dark.png')});
    check(!errors.length, `no page errors ${errors.join(' | ')}`);
  } finally {
    await browser.close();fs.rmSync(profile, {recursive:true, force:true});
  }
  console.log(failures.length ? `${failures.length} check(s) failed; screenshots in ${out}` : `all checks passed; screenshots in ${out}`);
  process.exit(failures.length ? 1 : 0);
})().catch(e => {console.error('PANEL CHECK CRASH', e);process.exit(1);});
