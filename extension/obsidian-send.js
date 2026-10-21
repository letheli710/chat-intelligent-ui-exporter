// Send to Obsidian (prototype). obsidian.html is a tab the panel opens: it receives the
// Markdown and every file of the ZIP export from the ChatGPT tab over a port, then writes them
// into the vault folder the user authorized once (File System Access API), in the same layout
// as the ZIP: <folder>/<title>/<title>.md beside assets/, ui/ and files/, so no link changes.
// Images are read on chatgpt.com while the user is signed in; nothing goes over the network
// here and no Obsidian plugin is needed. The panel loads this file too, for the sending side.
(function(root) {
  'use strict';
  const I18n = root.ChatExportI18n || (typeof module !== 'undefined' ? require('./i18n.js') : null), t = (...a) => I18n.t(...a);
  // Raw bytes per port message; base64 makes it about a third larger, well below Chrome's
  // 64 MB message limit.
  const CHUNK = 4 * 1024 * 1024;
  const DB = 'chat-export-obsidian', STORE = 'kv';

  // One file or folder name that Windows and Chrome both accept. Chrome's check (File System
  // Access, like net::IsSafePortablePathComponent) refuses with "Name is not allowed": control and
  // format characters (the invisible zero-width joiner in Malayalam, Arabic or emoji titles), `~`,
  // a trailing dot or space, device names and the .lnk / .local endings. Only the file and folder
  // names change; the title inside the note stays as ChatGPT wrote it. At most 90 characters, the
  // panel's file name rule, counted so an emoji is never cut in half.
  function safeSegment(name, fallback = '_') {
    let s = String(name ?? '').replace(/[\p{Cc}\p{Cf}\p{Cs}]|[\uFDD0-\uFDEF\uFFFE\uFFFF]/gu, '').replace(/~/g, '～').replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
    s = Array.from(s).slice(0, 90).join('').replace(/[ .]+$/, '');
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(s)) s = `_${s}`;
    if (/\.(lnk|local)$/i.test(s)) s += '_';
    return s && s !== '.' && s !== '..' ? s : fallback;
  }
  // If Chrome still refuses a name: letters, digits, marks and plain punctuation only.
  const plainSegment = (name, fallback) => safeSegment(Array.from(String(name ?? '')).map(c => /[\p{L}\p{M}\p{N} _\-.,()（），。、·]/u.test(c) ? c : '_').join('').replace(/_+/g, '_'), fallback);
  // A relative path ("Inbox/ChatGPT", "assets/x.png"): split on either slash, empty, "." and
  // ".." parts dropped so nothing lands outside the chosen folder.
  function safePath(path) {
    return String(path ?? '').replace(/\\/g, '/').split('/').map(p => p.trim()).filter(p => p && p !== '.' && p !== '..').map(p => safeSegment(p));
  }
  // "名字", "名字 2", "名字 3"…: the first that taken() says is free.
  async function uniqueName(base, taken) {
    for (let n = 1; n < 1000; n++) {const name = n === 1 ? base : `${base} ${n}`;if (!(await taken(name))) return name;}
    throw Error(t('obs.tooMany'));
  }
  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  // Opens the note in Obsidian. The chosen folder can be anywhere in the vault, and the page cannot
  // see the path above it, so the note is opened by its name in the vault Obsidian has open
  // (Obsidian finds a bare name as it finds a link). When the folder is the vault itself, its
  // name and the full path are known and given.
  const obsidianUrl = (note, vault, path) => vault
    ? `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path)}`
    : `obsidian://open?file=${encodeURIComponent(note)}`;

  // Sending side (panel, chatgpt.com): the note, a list of files, then each file in chunks.
  async function sendJob(port, job) {
    const files = job.files.filter(f => f.blob);
    port.postMessage({type: 'meta', meta: job.meta, md: job.md, files: files.map(f => ({path: f.path, type: f.blob.type, size: f.blob.size}))});
    for (let index = 0; index < files.length; index++) {
      const blob = files[index].blob;
      for (let offset = 0; offset < blob.size; offset += CHUNK)
        port.postMessage({type: 'chunk', index, data: toBase64(new Uint8Array(await blob.slice(offset, offset + CHUNK).arrayBuffer()))});
    }
    port.postMessage({type: 'end'});
  }
  // Receiving side: collects the messages above; returns the job once 'end' arrives and every
  // file has the size the sender announced.
  function receiver() {
    let head = null;const parts = [];
    return message => {
      if (message?.type === 'meta') {head = message;head.files.forEach((_, i) => parts[i] = []);return null;}
      if (!head) throw Error(t('obs.noMeta'));
      if (message.type === 'chunk') {parts[message.index].push(fromBase64(message.data));return null;}
      if (message.type !== 'end') return null;
      const files = head.files.map((f, i) => ({path: f.path, blob: new Blob(parts[i], {type: f.type})}));
      const short = files.find((f, i) => f.blob.size !== head.files[i].size);
      if (short) throw Error(t('obs.short', short.path));
      return {meta: head.meta, md: head.md, files};
    };
  }

  // Writes the note and its files under <folder>/<title>/. Returns the note's path inside the
  // chosen folder.
  async function writeJob(vault, folder, job, log = () => {}) {
    let dir = vault;
    for (const part of safePath(folder)) dir = await dir.getDirectoryHandle(part, {create: true});
    const exists = async name => {try {await dir.getDirectoryHandle(name);return true;} catch {return false;}};
    // The title as the folder's name; if Chrome refuses it anyway (a TypeError), a plainer one.
    const bases = [safeSegment(job.meta?.title, 'ChatGPT'), plainSegment(job.meta?.title, 'ChatGPT')];let name, home;
    for (let i = 0; i < bases.length; i++) {
      name = await uniqueName(bases[i], exists);
      try {home = await dir.getDirectoryHandle(name, {create: true});break;}
      catch (e) {if (e?.name !== 'TypeError' || i === bases.length - 1) throw e;log(t('obs.badName', name));}
    }
    const write = async (parent, file, blob) => {const writable = await (await parent.getFileHandle(file, {create: true})).createWritable();await writable.write(blob);await writable.close();};
    await write(home, `${name}.md`, new Blob([job.md], {type: 'text/markdown'}));
    let bytes = job.md.length;const renamed = [];
    for (const f of job.files) {
      const parts = safePath(f.path);
      if (!parts.length) continue;
      if (parts.join('/') !== f.path) renamed.push(`${f.path} → ${parts.join('/')}`);
      let parent = home;
      for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part, {create: true});
      await write(parent, parts.at(-1), f.blob);bytes += f.blob.size;log(t('obs.wrote', parts.join('/'), (f.blob.size / 1024).toFixed(0)));
    }
    return {name, notePath: [...safePath(folder), name, `${name}.md`].join('/'), files: job.files.length, bytes, renamed};
  }

  // The chosen folder's handle lives in this extension's IndexedDB; handles cannot go into
  // chrome.storage. (The key is still 'vault' so a folder picked in 0.11.8–0.11.10 is kept.)
  function db(mode, use) {
    return new Promise((ok, fail) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => fail(open.error);
      open.onsuccess = () => {const tx = open.result.transaction(STORE, mode), request = use(tx.objectStore(STORE));
        tx.oncomplete = () => {open.result.close();ok(request.result);};tx.onerror = () => fail(tx.error);};
    });
  }
  const loadVault = () => db('readonly', s => s.get('vault'));
  const saveVault = handle => db('readwrite', s => s.put(handle, 'vault'));
  const isVault = async handle => {try {await handle.getDirectoryHandle('.obsidian');return true;} catch {return false;}};

  // The relay tab opens in the background. It comes to the front only when it needs a click: the
  // first time (choose a folder) and when Chrome asks again to allow writing. Otherwise it writes,
  // tells the ChatGPT tab (which opens the note in Obsidian) and closes itself.
  // The folder's name goes into the shared settings (obsidianFolder), which the toolbar panel, the
  // settings tab and the sidebar show under Obsidian → 笔记文件夹.
  const remember = name => {try {chrome.storage?.local?.get('obsidianFolder', v => {if (v?.obsidianFolder !== name) chrome.storage.local.set({obsidianFolder: name});});} catch {}};
  function boot(doc) {
    const $ = id => doc.getElementById(id), win = doc.defaultView, started = performance.now();
    // The shared look (ui-kit.js). Extension pages run no inline scripts, so it is added here.
    const UI = root.ChatExportUI;
    if (UI) {doc.head.insertAdjacentHTML('beforeend', `<style>${UI.css}</style>`);doc.querySelector('.logo').innerHTML = UI.icon('gem');}
    I18n.fill(doc);doc.title = t('obs.title');
    const scheme = win.matchMedia?.('(prefers-color-scheme: dark)'), theme = () => doc.body.classList.toggle('dark', !!scheme?.matches);
    theme();scheme?.addEventListener?.('change', theme);
    const say = (text, warn = false) => {$('status').textContent = text;$('status').className = warn ? 'warn' : '';};
    const log = text => {$('log').textContent += `${((performance.now() - started) / 1000).toFixed(2)}s  ${text}\n`;};
    const show = (...ids) => ['pick', 'grant', 'write', 'open', 'repick'].forEach(id => $(id).hidden = !ids.includes(id));
    // A second line under the status: what to do, with the words to look for in bold.
    const hint = html => {$('hint').hidden = !html;$('hint').innerHTML = html || '';};
    // Where the note goes: the chosen folder (the page cannot see the path above it), then the
    // note's own folder, in a grey box (a path); words that are not a path go without it.
    // A saved note's path opens the note in Obsidian; a folder cannot be opened from the browser.
    const dest = (text, path = true, url = '') => {const d = $('dest');d.textContent = text;d.classList.toggle('chip', path);d.classList.toggle('link', !!url);
      d.title = url ? t('obs.openNote') : '';d.onclick = url ? () => {win.location.href = url;} : null;};
    const front = async () => {try {const tab = await chrome.tabs.getCurrent();if (tab) await chrome.tabs.update(tab.id, {active: true});} catch {}};
    try {$('version').textContent = `v${chrome.runtime.getManifest().version}`;} catch {}
    const params = new URLSearchParams(win.location.search), tabId = Number(params.get('tab')), jobId = params.get('job');
    // ?setup: opened from the panel's 更改笔记文件夹 to see or change the folder; nothing is sent.
    const setup = params.has('setup');let changed = false;
    if (!setup && (!tabId || !jobId)) {say(t('obs.alone'), true);return;}

    let job = null, folder = null, port = null, done = false;
    // Before writing: the note's path as it will be (a second copy gets 「 2」); after: as written.
    // A folder alone ends in 「 /」 so it too reads as a path.
    const notePath = () => {const name = safeSegment(job?.meta?.title, 'ChatGPT');return job ? ` / ${name} / ${name}.md` : ' /';};
    async function refresh() {
      folder = await loadVault().catch(() => null);
      if (!folder) {
        dest(t('obs.noFolder'), false);show('pick');
        if (setup) {say(t('obs.setupNone'));hint(t('obs.setupHint'));}
        else if (job) {say(t('obs.firstUse'));hint(t('obs.firstHint'));front();}
        else say(t('obs.receiving'));
        return;
      }
      const perm = await folder.queryPermission({mode: 'readwrite'});
      dest(`${folder.name}${notePath()}`);remember(folder.name);
      log(t('obs.permState', perm));
      if (setup) {show('repick');hint('');say(changed ? t('obs.setupDone', folder.name) : t('obs.setupNow', folder.name));return;}
      if (!job) return;
      if (perm === 'granted') return write();
      // Chrome forgets the permission when this kind of tab closes, unless the user picks
      // 每次访问时都允许 in its prompt; say so, or it asks again for every chat.
      show('grant', 'repick');front();
      say(t('obs.needGrant', folder.name));
      hint(t('obs.grantHint'));
    }
    async function write() {
      if (done) return;
      show();hint('');say(t('obs.writing'));
      try {
        const started2 = performance.now(), result = await writeJob(folder, '', job, log);done = true;
        const url = (await isVault(folder)) ? obsidianUrl(result.name, folder.name, result.notePath) : obsidianUrl(result.name);
        const warn = result.renamed.length > 0;dest(`${folder.name} / ${result.notePath.split('/').join(' / ')}`, true, url);
        say(t('obs.saved', result.files + 1, (result.bytes / 1048576).toFixed(1), ((performance.now() - started2) / 1000).toFixed(2)) + (warn ? `\n${t('obs.renamed', result.renamed.length)}\n${result.renamed.join('\n')}` : ''), warn);
        log(t('obs.done', url));
        $('open').onclick = () => {win.location.href = url;};show('open', 'repick');
        // The ChatGPT tab opens the note; this tab closes unless there is something to read here or
        // nobody is left to open it.
        if (port) {
          port.postMessage({type: 'written', path: `${folder.name}/${result.notePath}`, url});
          if (!warn) setTimeout(() => win.close(), 300);
        } else win.location.href = url;
      } catch (e) {say(t('obs.writeFailed', e?.message || e), true);log(String(e?.stack || e));show('write', 'repick');front();}
    }
    async function pick() {
      try {
        const handle = await win.showDirectoryPicker({id: 'chat-export-vault', mode: 'readwrite', startIn: folder || 'documents'});
        log(t('obs.picked', handle.name));await saveVault(handle);changed = true;await refresh();
      } catch (e) {if (e?.name !== 'AbortError') say(t('obs.pickFailed', e?.message || e), true);}
    }
    $('pick').onclick = pick;$('repick').onclick = pick;$('write').onclick = write;
    $('grant').onclick = async () => {const perm = await folder.requestPermission({mode: 'readwrite'});log(`requestPermission → ${perm}`);perm === 'granted' ? write() : refresh();};

    if (setup) {$('convLab').hidden = true;$('conv').textContent = t('obs.folderLabel');refresh();return;}
    const take = receiver();let received = 0;
    port = chrome.tabs.connect(tabId, {name: `obsidian:${jobId}`, frameId: 0});
    port.onMessage.addListener(message => {
      try {
        if (message.type === 'chunk') received += message.data.length * 3 / 4;
        if (message.type === 'meta') {$('conv').textContent = message.meta?.title || t('obs.untitled');log(t('obs.receiveStart', message.files.length, message.md.length));}
        const finished = take(message);
        if (!finished) {if (message.type === 'chunk') say(t('obs.receivingMb', (received / 1048576).toFixed(1)));return;}
        job = finished;log(t('obs.received', (received / 1048576).toFixed(1)));port.postMessage({type: 'received'});refresh();
      } catch (e) {say(t('obs.receiveFailed', e?.message || e), true);front();}
    });
    port.onDisconnect.addListener(() => {port = null;if (!job) {say(t('obs.disconnected'), true);front();}});
    refresh();
  }

  const api = {CHUNK, safeSegment, safePath, uniqueName, toBase64, fromBase64, obsidianUrl, sendJob, receiver, writeJob, boot};
  root.ChatExportObsidian = api;
  if (typeof module !== 'undefined') module.exports = api;
  // The page shows the language picked in the settings (read first), or the browser's.
  if (root.document?.getElementById?.('dest') && root.location?.protocol === 'chrome-extension:') {
    const store = root.ChatExportSettings?.open();
    Promise.resolve(store?.ready).catch(() => {}).then(() => {I18n.setLocale(store?.values?.language || 'auto');boot(root.document);});
  }
})(globalThis);
