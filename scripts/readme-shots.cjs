// Screenshots for the README, from the real extension in a real Chrome (English UI), on a stand-in
// chatgpt.com that serves the made-up chat in scripts/readme-demo.cjs. No ChatGPT login is needed.
//   node scripts/readme-shots.cjs [outDir]      (default docs/images)
const fs = require('fs'), os = require('os'), path = require('path');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'docs/images'));
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => p && fs.existsSync(p));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
const raw = require('./readme-demo.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const marked = fs.readFileSync(path.join(root, 'extension/marked.min.js'), 'utf8');

// A page shaped like ChatGPT's, showing the same chat as text.
const turns = Object.values(raw.mapping).map(n => n.message).filter(m => m.content.parts?.[0]);
const chatPage = () => `<!doctype html><html class="light"><head><meta charset="utf-8"><title>${raw.title}</title><style>
body{margin:0;font:15px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff;color:#0d0d0d}
nav{position:fixed;left:0;top:0;bottom:0;width:260px;background:#f9f9f9;padding:14px;box-sizing:border-box;font-size:14px}nav p{margin:6px 0;padding:6px 8px;border-radius:8px}nav .on{background:#ececec}
main{margin-left:260px;padding:24px 0 170px}.col{max-width:720px;margin:0 auto;padding:0 24px}
.u{background:#f4f4f4;border-radius:18px;padding:10px 16px;margin:20px 0 20px auto;width:fit-content;max-width:70%}
table{border-collapse:collapse;font-size:14px;margin:8px 0}td,th{border:1px solid #e5e5e5;padding:6px 10px;text-align:left}
blockquote{margin:0;padding-left:14px;border-left:3px solid #e3e3e3;color:#5d5d5d}
form{position:fixed;bottom:28px;left:calc(260px + (100vw - 260px - 720px) / 2);width:720px}
[data-composer-body]{border:1px solid #ddd;border-radius:28px;padding:13px 20px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.05);color:#8f8f8f}
</style><script>${marked}</script></head><body><nav><b>ChatGPT</b><p class="on">${raw.title}</p><p>Weekly meal plan</p><p>Python regex help</p></nav><main><div class="col">
${turns.map(m => m.author.role === 'user' ? `<div class="u" data-message-id="${m.id}">${m.content.parts[0]}</div>` : `<div class="md" data-message-id="${m.id}"></div>`).join('\n')}
</div></main><form data-chatgpt-composer=""><div data-composer-body=""><div contenteditable="true" role="textbox" data-composer-markdown="" aria-label="Ask ChatGPT">Ask anything</div></div></form>
<script>const md=${JSON.stringify(Object.fromEntries(turns.filter(m => m.author.role !== 'user').map(m => [m.id, m.content.parts[0].replace(/<box[\s\S]*<\/box>/, '')])))};for(const [id,t] of Object.entries(md))document.querySelector('[data-message-id="'+id+'"]').innerHTML=marked.parse(t);</script></body></html>`;

(async () => {
  if (!executablePath) throw Error('Chrome not found; set CHROME_PATH');
  fs.mkdirSync(out, {recursive:true});
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'readme-shots-')), downloads = path.join(profile, 'downloads');
  fs.mkdirSync(path.join(profile, 'Default'), {recursive:true});fs.mkdirSync(downloads);
  fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({download:{default_directory:downloads, prompt_for_download:false}}));
  const browser = await puppeteer.launch({executablePath, headless:true, pipe:true, userDataDir:profile, enableExtensions:[path.join(root, 'extension')], args:['--window-size=1280,800', '--lang=en-US'], defaultViewport:{width:1280, height:800, deviceScaleFactor:2}});
  const shot = async (page, name, opts = {}) => {await page.screenshot({path:path.join(out, name), ...opts});console.log('wrote', name);};
  try {
    const worker = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('/background.js'), {timeout:15000});
    const sw = await worker.worker(), base = `chrome-extension://${new URL(worker.url()).host}/`;
    await sw.evaluate(() => chrome.storage.local.set({exportKind:'html', htmlForm:'single'}));
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = new URL(r.url());
      if (u.host !== 'chatgpt.com' && u.host !== 'files.example') return r.continue();
      const json = body => r.respond({status:200, contentType:'application/json', body:JSON.stringify(body)});
      if (u.pathname === '/api/auth/session') return json({accessToken:'t'});
      if (u.pathname.startsWith('/backend-api/conversation/')) return json(raw);
      if (u.host === 'files.example' || u.pathname.startsWith('/backend-api/')) return r.respond({status:200, contentType:'image/png', body:PNG});
      return r.respond({status:200, contentType:'text/html; charset=utf-8', body:chatPage()});
    });
    await page.goto(`https://chatgpt.com/c/${raw.conversation_id}`);
    await page.waitForSelector('[data-archive-owned="fast-text-dock"]', {timeout:10000});await sleep(1200);
    await shot(page, 'buttons.png', {clip:{x:260, y:560, width:1020, height:240}});
    // The sidebar, with every message ticked.
    await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text-dock"]').shadowRoot.getElementById('dSelect').click());
    await page.waitForFunction(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.querySelectorAll('#list input').length > 0, {timeout:20000});await sleep(500);
    await shot(page, 'sidebar.png');
    // Export the whole chat as one HTML file, then open it.
    await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.getElementById('export').click());
    let file = null;for (let i = 0; i < 120 && !file; i++) {await sleep(250);file = fs.readdirSync(downloads).find(f => f.endsWith('.html'));}
    if (!file) throw Error('no HTML download');
    const html = await browser.newPage();await html.goto('file:///' + path.join(downloads, file).replace(/\\/g, '/'));await sleep(1500);
    await html.evaluate(() => document.querySelector('.card-frame, iframe')?.scrollIntoView({block:'center'}));await sleep(800);
    await shot(html, 'html-export.png');
    await html.close();
    // The toolbar panel over the chat.
    await page.bringToFront();await sw.evaluate(() => chrome.action.openPopup());
    const popup = await (await browser.waitForTarget(t => t.url() === base + 'popup.html', {timeout:10000})).asPage();
    await popup.waitForFunction(() => /message/i.test(document.getElementById('chatMeta')?.textContent || ''), {timeout:20000}).catch(() => {});await sleep(400);
    const height = await popup.evaluate(() => Math.min(innerHeight, document.querySelector('[data-group="btns"]')?.getBoundingClientRect().bottom || innerHeight));
    await shot(popup, 'popup.png', {clip:{x:0, y:0, width:360, height:Math.floor(height) + 2}});await popup.close().catch(() => {});
    // The ZIP export, for the card picture the Markdown links to.
    await sw.evaluate(() => chrome.storage.local.set({exportKind:'zip'}));await sleep(300);
    await page.evaluate(() => document.querySelector('[data-archive-owned="fast-text"]').shadowRoot.getElementById('export').click());
    let zip = null;for (let i = 0; i < 160 && !zip; i++) {await sleep(250);zip = fs.readdirSync(downloads).find(f => f.endsWith('.zip'));}
    if (!zip) throw Error('no ZIP download');
    const JSZip = require(path.join(root, 'extension/jszip.min.js')), files = await JSZip.loadAsync(fs.readFileSync(path.join(downloads, zip)));
    const card = Object.keys(files.files).find(f => /^assets\/card-.*\.png$/.test(f));
    if (card) {fs.writeFileSync(path.join(out, 'markdown-card.png'), await files.file(card).async('nodebuffer'));console.log('wrote markdown-card.png');}
    // The settings page with its groups open.
    const options = await browser.newPage();await options.setViewport({width:900, height:1000, deviceScaleFactor:2});
    await options.goto(base + 'options.html');await options.waitForSelector('#settings .xset');await sleep(400);
    await shot(options, 'settings.png');
  } finally {
    await browser.close();fs.rmSync(profile, {recursive:true, force:true});
  }
})().catch(e => {console.error('README SHOTS CRASH', e);process.exit(1);});
