(function htmlExportModule(root) {
  'use strict';
  const I18n = root.ChatExportI18n || (typeof module !== 'undefined' ? require('./i18n.js') : null), t = I18n.t;
  // Whole-conversation export as one HTML page that looks like the chat: prose, code, formulas,
  // tables, pictures, and Intelligent UI cards that work (each in a sandboxed frame running the
  // message's model_dil_v2 program from its default state), AppBlocks running in their own
  // sandboxed frames, and maps (draggable when online, else the picture taken from the page).
  // Two forms with the same page: "folder" (conversation.html + assets/ + files/, zipped by the
  // panel) and "single" (one file, every asset a data: URL). Opened from file://, a page cannot
  // fetch its neighbours, so all data the page needs is inside it and frames use srcdoc.
  // Nothing is loaded from the network except map tiles, and only when the reader is online.
  const escapeHtml = text => String(text ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'})[c]);
  // JSON inside <script type="application/json">: nothing in it can end the element.
  const jsonScript = value => JSON.stringify(value).replace(new RegExp('[<>&\u2028\u2029]', 'g'), c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const safeName = id => String(id).replace(/[^\w-]/g, '_');
  const stripTracking = url => String(url).replace(/\?utm_source=chatgpt\.com&/, '?').replace(/[?&]utm_source=chatgpt\.com(?![\w%.~-])/, '');
  const isLocal = href => !!href && !/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(href);
  const blobDataUrl = blob => new Promise((ok, fail) => {const reader = new root.FileReader();reader.onload = () => ok(String(reader.result));reader.onerror = () => fail(reader.error);reader.readAsDataURL(blob);});
  const MIME = {png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', csv:'text/csv', json:'application/json', pdf:'application/pdf', txt:'text/plain', html:'text/html'};
  const mimeOf = (path, blob) => {const type = String(blob?.type || '').split(';')[0].trim();return type && type !== 'application/octet-stream' ? type : MIME[String(path).split('.').pop().toLowerCase()] || 'application/octet-stream';};
  // A data URL with the type the file name says (some downloads arrive without a type).
  async function dataUrlOf(path, blob) {const url = await blobDataUrl(blob);return url.replace(/^data:[^;,]*/, `data:${mimeOf(path, blob)}`);}

  // Raw HTML in prose (kept when the panel says to keep it) is reduced to formatting, SVG and
  // MathML: no scripts, frames, styles sheets, forms, event attributes or script URLs.
  const SVG_ELEMENTS = 'svg g path rect circle ellipse line polyline polygon text tspan textPath defs marker linearGradient radialGradient stop clipPath mask pattern use symbol title desc foreignObject image filter feGaussianBlur feOffset feBlend feColorMatrix feMerge feMergeNode feFlood feComposite'.split(' ');
  const MATH_ELEMENTS = 'math semantics annotation mrow mi mn mo mfrac msqrt mroot msub msup msubsup munder mover munderover mtable mtr mtd mtext mspace mstyle mpadded mphantom menclose'.split(' ');
  const ALLOWED = new Set(['a','abbr','b','bdi','bdo','blockquote','br','caption','center','cite','code','col','colgroup','dd','del','details','dfn','div','dl','dt','em','figcaption','figure','font','h1','h2','h3','h4','h5','h6','hr','i','img','input','ins','kbd','li','mark','ol','p','pre','q','rp','rt','ruby','s','samp','small','span','strike','strong','sub','summary','sup','table','tbody','td','tfoot','th','thead','tr','tt','u','ul','var','wbr','x-slot', ...SVG_ELEMENTS.map(t => t.toLowerCase()), ...MATH_ELEMENTS]);
  const DROPPED = new Set(['script','style','iframe','frame','frameset','object','embed','applet','link','meta','base','template','noscript','portal','audio','video','source','track','canvas','dialog','select','textarea','button','form','option','title']);
  const URL_ATTRS = new Set(['href','src','xlink:href','action','formaction','poster','background','cite','data']);
  function sanitize(html, doc, nonce) {
    const tpl = doc.createElement('template');tpl.innerHTML = html;
    (function clean(node) {
      for (const el of [...node.children]) {
        const tag = el.localName;
        if (DROPPED.has(tag) || (tag === 'x-slot' && el.getAttribute('data-k') !== nonce)) {el.remove();continue;}
        if (!ALLOWED.has(tag) && !ALLOWED.has(tag.toLowerCase())) {clean(el);el.replaceWith(...el.childNodes);continue;}
        for (const at of [...el.attributes]) {
          const name = at.name.toLowerCase(), value = at.value.trim();
          if (/^on/.test(name) || name === 'srcdoc' || name === 'formaction' || name === 'action') el.removeAttribute(at.name);
          else if (name === 'style' && /javascript:|expression\s*\(|url\s*\(|@import/i.test(value)) el.removeAttribute(at.name);
          else if (URL_ATTRS.has(name) && !(isLocal(value) || /^(https?:|mailto:|#)/i.test(value) || /^data:image\/(png|jpe?g|gif|webp);/i.test(value) || (tag === 'a' && el.hasAttribute('download') && /^data:/i.test(value)))) el.removeAttribute(at.name);
        }
        if (tag === 'input') {if (el.getAttribute('type') !== 'checkbox') {el.remove();continue;}el.setAttribute('disabled', '');}
        clean(el);
      }
    })(tpl.content);
    return tpl.innerHTML;
  }

  // Markdown to HTML with the vendored marked, plus what ChatGPT answers and this exporter's
  // Markdown contain: formulas ($…$, $$…$$, \(…\), \[…\]), Obsidian callouts (folded notes),
  // "|200" thumbnail widths, and slots for cards, maps and AppBlocks (filled in afterwards,
  // outside the sanitizer).
  function markdownRenderer(ctx) {
    const lib = root.marked, R = root.ChatExportDilRender;
    if (!lib?.Marked) throw Error(t('err.marked'));
    const md = new lib.Marked({gfm:true, breaks:true, async:false});
    const slot = attrs => `<x-slot data-k="${ctx.nonce}" ${Object.entries(attrs).map(([k, v]) => `data-${k}="${escapeHtml(v)}"`).join(' ')}></x-slot>`;
    const math = (tex, display) => {const out = R.mathml(tex.trim(), display);return out ? (display ? `<div class="math-block">${out}</div>` : out) : `<code class="tex">${escapeHtml(display ? `$$${tex}$$` : `$${tex}$`)}</code>`;};
    md.use({extensions:[
      {name:'blockMath', level:'block', start:src => src.match(/^(?:\$\$|\\\[)/m)?.index,
        tokenizer(src) {const m = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n+|$)/.exec(src);if (m) return {type:'blockMath', raw:m[0], text:m[1] ?? m[2]};},
        renderer:t => math(t.text, true)},
      // Inline $…$ follows pandoc: no space inside either dollar, and none followed by a digit ("$5 and $10" stays text).
      {name:'inlineMath', level:'inline', start:src => {const m = /\$|\\\(/.exec(src);return m ? m.index : undefined;},
        tokenizer(src) {
          let m = /^\$\$((?:\\.|[^\\$])+?)\$\$/.exec(src);if (m) return {type:'inlineMath', raw:m[0], text:m[1], display:true};
          m = /^\\\(((?:\\.|[^\\])+?)\\\)/.exec(src);if (m) return {type:'inlineMath', raw:m[0], text:m[1]};
          m = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src);if (m) return {type:'inlineMath', raw:m[0], text:m[1]};
        },
        renderer:t => math(t.text, !!t.display)}
    ], renderer:{
      heading({tokens, depth}) {const n = Math.min(6, depth + 2);return `<h${n}>${this.parser.parseInline(tokens)}</h${n}>\n`;},
      code({text, lang}) {const language = String(lang || '').trim().split(/\s/)[0];return `<div class="codeblock"><div class="code-head"><span>${escapeHtml(language || t('html.code'))}</span><button type="button" class="copy">${escapeHtml(t('html.copy'))}</button></div><pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(text.replace(/\n$/, ''))}</code></pre></div>\n`;},
      table(token) {return `<div class="table-wrap">${lib.Renderer.prototype.table.call(this, token)}</div>\n`;},
      html({text}) {return text;},
      paragraph({tokens}) {
        const pictures = tokens.filter(t => t.type === 'image');
        if (pictures.length > 1 && tokens.every(t => t.type === 'image' || (t.type === 'text' && !t.text.trim()))) return `<div class="gallery">${this.parser.parseInline(pictures)}</div>\n`;
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
      link({href, title, tokens}) {
        const text = this.parser.parseInline(tokens);
        if (ctx.blockPaths.has(href)) return ctx.inCard.has(href) ? t('html.inCardAbove', text) : slot({app:href});
        if (isLocal(href)) {const url = ctx.resolve(href);if (!url) return t('html.fileNotSaved', text);return `<a href="${escapeHtml(url)}"${/^data:/.test(url) ? ` download="${escapeHtml(href.split('/').pop())}"` : ' target="_blank"'}>${text}</a>`;}
        if (!/^(https?:|mailto:)/i.test(href)) return text;
        return `<a href="${escapeHtml(stripTracking(href))}"${title ? ` title="${escapeHtml(title)}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      image({href, text}) {
        if (/^map:\d+$/.test(href)) return slot({map:href.slice(4)});
        const [alt, width] = String(text).split('|');
        // The AppBlock frame below carries its own preview (shown when printing).
        if (I18n.pattern('md.appPreview').test(alt)) return '';
        const url = isLocal(href) ? ctx.resolve(href) : /^https:\/\//i.test(href) ? href : null;
        if (!url) return escapeHtml(t('html.imageNotSavedNamed', alt));
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt.trim())}"${/^\d+$/.test(width || '') ? ` width="${width}" class="thumb"` : ''} loading="lazy">`;
      },
      blockquote(token) {
        const m = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)(?:\n|$)/.exec(token.text);
        if (!m) return `<blockquote>\n${this.parser.parse(token.tokens)}</blockquote>\n`;
        const [first, type, fold, title] = m, body = token.text.slice(first.length);
        if (type === 'chatgpt-appblock' && !fold) {const link = /\]\((ui\/appblock-[^)\s]+\.html)\)/.exec(title);if (link && ctx.blockPaths.has(link[1])) return ctx.inCard.has(link[1]) ? '' : slot({app:link[1]});}
        const head = md.parseInline(title || type), inner = body.trim() ? md.parse(body) : '';
        return fold ? `<details class="callout c-${escapeHtml(type)}"${fold === '+' ? ' open' : ''}><summary>${head}</summary><div class="callout-body">${inner}</div></details>\n`
          : `<div class="callout c-${escapeHtml(type)}"><div class="callout-title">${head}</div><div class="callout-body">${inner}</div></div>\n`;
      }
    }});
    return text => md.parse(text);
  }

  // What a user typed shows as plain text, as on ChatGPT; attachments and pictures sit above it.
  function userHtml(md, ctx) {
    const chips = [], pictures = [], lines = [];
    // "Attachment: [name](files/name)" as the Markdown wrote it, in the language of the export.
    const [before, after] = t('md.attachment', '\u0001').split('\u0001').map(I18n.quote);
    const chipLine = new RegExp(`^${before}(?:\\[((?:\\\\.|[^\\]\\\\])*)\\]\\(([^)\\s]+)\\)|(.+))${after}$`);
    for (const line of md.split('\n')) {
      const chip = chipLine.exec(line.trim()), picture = /^!\[([^\]]*)\]\(((?:assets\/|https:\/\/)[^)\s]+)\)$/.exec(line.trim());
      if (chip) {const name = (chip[1] ?? chip[3]).replace(/\\(.)/g, '$1'), url = chip[2] && ctx.resolve(chip[2]);chips.push(url ? `<a class="chip" href="${escapeHtml(url)}"${/^data:/.test(url) ? ` download="${escapeHtml(chip[2].split('/').pop())}"` : ' target="_blank"'}>📎 ${escapeHtml(name)}</a>` : `<span class="chip">📎 ${escapeHtml(name)}</span>`);}
      else if (picture) {const url = isLocal(picture[2]) ? ctx.resolve(picture[2]) : picture[2];pictures.push(url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(picture[1])}" loading="lazy">` : `<span class="chip">${escapeHtml(t('html.imageNotSaved'))}</span>`);}
      else lines.push(line);
    }
    const text = lines.join('\n').replace(/^\n+|\s+$/g, '');
    return `${chips.length ? `<div class="attachments">${chips.join('')}</div>` : ''}${pictures.length ? `<div class="user-images">${pictures.join('')}</div>` : ''}${text ? `<div class="bubble">${escapeHtml(text)}</div>` : ''}`;
  }

  // The frame every card runs in: it asks the page for the renderer and its card, then runs it.
  const CARD_BOOT = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style></head><body><div id="root"></div><script>'
    + 'addEventListener("message",function boot(e){var d=e.data;if(!d||d.type!=="dil:init"||e.source!==parent)return;removeEventListener("message",boot);'
    + 'try{(0,eval)(d.runtime);ChatExportDilRender.mountLive(d,document,parent);}catch(err){parent.postMessage({type:"dil:error",frame:d.frame,message:String(err&&err.message||err)},"*");}});'
    + 'parent.postMessage({type:"dil:hello"},"*");</script></body></html>';

  // Runs in the exported page (not in the extension): starts the card frames and relays their
  // state, sizes the frames, draws the maps when online, and handles copy, zoom and "open".
  function pageController() {
    const data = JSON.parse(document.getElementById('export-data').textContent);
    const runtime = JSON.parse(document.getElementById('dil-runtime').textContent);
    const frames = [];
    const resize = (frame, height) => {
      const n = Number(frame.dataset.resizes || 0), next = Math.min(1600, Math.round(Number(height)));
      if (!(next >= 60) || n > 30 || Math.abs(next - (parseFloat(frame.style.height) || frame.offsetHeight || 0)) < 4) return;
      frame.dataset.resizes = String(n + 1);frame.style.height = next + 'px';
    };
    document.querySelectorAll('.card-host').forEach((host, id) => {
      const frame = document.createElement('iframe');
      frame.className = 'card-frame';frame.title = data.text.card;frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
      frame.srcdoc = data.boot;host.append(frame);
      frames.push({id, host, frame, msg:Number(host.dataset.msg), card:Number(host.dataset.card), ready:false});
    });
    addEventListener('message', e => {
      const d = e.data || {}, f = frames.find(x => x.frame.contentWindow === e.source);
      if (!f) {
        if (d.type === 'ab:size') {const ab = [...document.querySelectorAll('iframe.ab-frame')].find(x => x.contentWindow === e.source);if (ab) resize(ab, d.height);}
        return;
      }
      const message = data.messages[f.msg] || {};
      if (d.type === 'dil:hello') f.frame.contentWindow.postMessage({type:'dil:init', runtime, frame:f.id, card:f.card, dil:message.dil, images:message.images, blocks:message.blocks, text:data.dilText}, '*');
      else if (d.type === 'dil:ready') f.ready = true;
      else if (d.type === 'dil:size' && d.height > 0) {f.frame.style.height = Math.ceil(d.height) + 'px';if (f.ready) f.host.classList.add('live');}
      else if (d.type === 'dil:error') {f.host.dataset.error = String(d.message || '');f.frame.remove();}
      else if (d.type === 'dil:state') for (const o of frames) if (o !== f && o.msg === f.msg) o.frame.contentWindow?.postMessage({type:'dil:set', key:d.key, value:d.value}, '*');
    });
    document.addEventListener('click', e => {
      const copy = e.target.closest('.codeblock .copy');
      if (copy) {
        const text = copy.closest('.codeblock').querySelector('code').textContent, done = () => {copy.textContent = data.text.copied;setTimeout(() => copy.textContent = data.text.copy, 1500);};
        const fallback = () => {const t = document.createElement('textarea');t.value = text;document.body.append(t);t.select();try {document.execCommand('copy');done();} catch (x) {}t.remove();};
        try {navigator.clipboard.writeText(text).then(done, fallback);} catch (x) {fallback();}
        return;
      }
      const open = e.target.closest('.ab-open');
      if (open) {const src = open.closest('.appblock').querySelector('iframe.ab-frame')?.getAttribute('srcdoc');if (src) window.open(URL.createObjectURL(new Blob([src], {type:'text/html'})), '_blank');return;}
      const picture = e.target.closest('.md img, .user-images img');
      if (picture && !picture.closest('a')) {const box = document.createElement('div');box.className = 'lightbox';const big = document.createElement('img');big.src = picture.src;big.alt = picture.alt;box.append(big);box.onclick = () => box.remove();document.body.append(box);return;}
    });
    document.addEventListener('keydown', e => {if (e.key === 'Escape') document.querySelectorAll('.lightbox').forEach(n => n.remove());});
    // Maps open as the picture taken at export, with no network request. Only the reader's click
    // on the map's online button asks for tiles; the same button then returns to the picture.
    document.addEventListener('click', e => {
      const button = e.target.closest('figure.map .map-load');if (!button) return;
      const figure = button.closest('figure.map');
      if (figure.mapView) return closeMap(figure, '');
      const places = (data.mapPlaces[Number(figure.dataset.map)] || []).filter(p => typeof p.lat === 'number' && typeof p.lng === 'number');
      if (!places.length) return;
      button.disabled = true;button.textContent = data.text.mapConnecting;note(figure, '');
      figure.mapView = slippyMap(figure, places);
    });
    const note = (figure, text) => {const n = figure.querySelector('.map-note');if (n) n.textContent = text;};
    function closeMap(figure, reason) {
      figure.mapView?.stop();figure.mapView = null;figure.classList.remove('map-online');
      const button = figure.querySelector('.map-load');button.disabled = false;button.textContent = reason ? data.text.mapRetry : data.text.mapOnline;
      note(figure, reason ? data.text.mapFailed.replace('{0}', reason) : '');
    }
    // A small draggable map of raster tiles (OpenStreetMap's standard tiles); no script is
    // loaded. A watchdog falls back to the picture: no tile within 4 seconds, an error before the
    // first tile, or 3 errors later. A tile can also arrive as an image saying access is blocked,
    // which the page cannot tell apart; the reader then returns with the same button.
    function slippyMap(figure, places) {
      const T = 256, view = document.createElement('div'), tiles = document.createElement('div'), pins = document.createElement('div');
      view.className = 'map-live';tiles.className = 'map-tiles';pins.className = 'map-pins';view.append(tiles, pins);
      const W = () => view.clientWidth || figure.clientWidth || 700, H = () => view.clientHeight || 360;
      const project = (lat, lng, z) => {const s = T * 2 ** z, r = Math.sin(Math.max(-85, Math.min(85, lat)) * Math.PI / 180);return [(lng + 180) / 360 * s, (0.5 - Math.log((1 + r) / (1 - r)) / (4 * Math.PI)) * s];};
      let z = 15, cx = 0, cy = 0, loaded = false, errors = 0, stopped = false;
      const fail = reason => {if (!stopped) closeMap(figure, reason);};
      const watchdog = setTimeout(() => {if (!loaded) fail(data.text.mapTimeout);}, data.mapTimeout || 4000);
      const fit = () => {
        for (z = 17; z > 2; z--) {const pts = places.map(p => project(p.lat, p.lng, z)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);if (Math.max(...xs) - Math.min(...xs) < W() - 80 && Math.max(...ys) - Math.min(...ys) < H() - 80) break;}
        const pts = places.map(p => project(p.lat, p.lng, z)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);cx = (Math.max(...xs) + Math.min(...xs)) / 2;cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      };
      const cache = new Map();
      const draw = () => {
        const w = W(), h = H(), left = cx - w / 2, top = cy - h / 2, n = 2 ** z, keep = new Set();
        for (let ty = Math.floor(top / T); ty <= Math.floor((top + h) / T); ty++) for (let tx = Math.floor(left / T); tx <= Math.floor((left + w) / T); tx++) {
          if (ty < 0 || ty >= n) continue;
          const key = `${z}/${tx}/${ty}`, wrapped = ((tx % n) + n) % n;keep.add(key);
          let img = cache.get(key);
          if (!img) {
            img = document.createElement('img');img.alt = '';img.draggable = false;
            img.onload = () => {
              if (loaded || stopped) return;
              loaded = true;clearTimeout(watchdog);figure.classList.add('map-online');
              const button = figure.querySelector('.map-load');button.disabled = false;button.textContent = data.text.mapBack;
            };
            img.onerror = () => {if (!stopped && (!loaded || ++errors >= 3)) fail(loaded ? data.text.mapTilesFailed : data.text.mapTileFailed);};
            img.src = `https://tile.openstreetmap.org/${z}/${wrapped}/${ty}.png`;
            cache.set(key, img);tiles.append(img);
          }
          img.style.transform = `translate(${tx * T - left}px,${ty * T - top}px)`;
        }
        for (const [key, img] of cache) if (!keep.has(key)) {img.remove();cache.delete(key);}
        pins.replaceChildren(...places.map(p => {
          const [x, y] = project(p.lat, p.lng, z), pin = document.createElement(p.href ? 'a' : 'div');
          pin.className = 'map-pin';pin.style.transform = `translate(${x - left}px,${y - top}px)`;
          if (p.href) {pin.href = p.href;pin.target = '_blank';pin.rel = 'noopener noreferrer';}
          const label = document.createElement('span');label.textContent = (p.rating ? p.rating.replace(/\s*[（(].*$/, '') + ' ' : '') + p.name;pin.append(label);
          return pin;
        }));
      };
      const zoom = (dz, ax = W() / 2, ay = H() / 2) => {const nz = Math.max(2, Math.min(18, z + dz));if (nz === z) return;const k = 2 ** (nz - z), wx = cx - W() / 2 + ax, wy = cy - H() / 2 + ay;cx = wx * k - ax + W() / 2;cy = wy * k - ay + H() / 2;z = nz;draw();};
      let drag = null;
      view.addEventListener('pointerdown', e => {if (e.target.closest('a,button')) return;drag = [e.clientX, e.clientY];view.setPointerCapture(e.pointerId);});
      view.addEventListener('pointermove', e => {if (!drag) return;cx -= e.clientX - drag[0];cy -= e.clientY - drag[1];drag = [e.clientX, e.clientY];draw();});
      view.addEventListener('pointerup', () => {drag = null;});
      // The wheel scrolls the page; with Ctrl (or ⌘) held it zooms the map, so reading on never gets stuck.
      view.addEventListener('wheel', e => {if (!e.ctrlKey && !e.metaKey) {note(figure, data.text.mapCtrl);return;}e.preventDefault();const r = view.getBoundingClientRect();zoom(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);}, {passive:false});
      const controls = document.createElement('div');controls.className = 'map-zoom';
      for (const [label, dz] of [['+', 1], ['−', -1]]) {const b = document.createElement('button');b.type = 'button';b.textContent = label;b.onclick = () => zoom(dz);controls.append(b);}
      const credit = document.createElement('div');credit.className = 'map-credit';credit.textContent = '© OpenStreetMap contributors';
      view.append(controls, credit);
      figure.insertBefore(view, figure.firstChild);
      fit();draw();
      return {stop:() => {stopped = true;clearTimeout(watchdog);view.remove();}};
    }
  }

  const pageCss = () => `:root{color-scheme:light;--text:#0d0d0d;--muted:#5d5d5d;--faint:#8f8f8f;--border:rgba(13,13,13,.1);--bubble:#f3f3f3;--code:#f9f9f9;--link:#2964aa}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--text);font:16px/1.75 -apple-system,"Segoe UI",${I18n.cjkFonts()},system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.page{max-width:800px;margin:0 auto;padding:32px 20px 96px}
header.top{border-bottom:1px solid var(--border);padding-bottom:16px;margin-bottom:8px}header.top h1{font-size:26px;line-height:1.3;margin:0 0 8px;font-weight:600}
.meta{margin:0;color:var(--muted);font-size:13px;line-height:1.7;overflow-wrap:anywhere}.meta a{color:inherit}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.turn{margin:32px 0}.turn.user{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.bubble{max-width:min(78%,600px);background:var(--bubble);border-radius:18px;padding:10px 18px;white-space:pre-wrap;overflow-wrap:anywhere}
.attachments,.user-images{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;max-width:78%}
.chip{display:inline-flex;align-items:center;gap:6px;max-width:320px;border:1px solid var(--border);border-radius:12px;padding:8px 12px;font-size:14px;line-height:1.4;color:inherit;text-decoration:none;background:#fff;overflow-wrap:anywhere}a.chip:hover{background:#f9f9f9}
.user-images img{max-width:260px;max-height:260px;border-radius:12px;object-fit:cover;cursor:zoom-in}
.md{overflow-wrap:break-word}.md>:first-child{margin-top:0}.md>:last-child{margin-bottom:0}
.md p{margin:0 0 16px}.md p:empty{display:none}
.md h3,.md h4,.md h5,.md h6{margin:28px 0 10px;line-height:1.4;font-weight:600}.md h3{font-size:20px}.md h4{font-size:18px}.md h5{font-size:16px}.md h6{font-size:15px;color:var(--muted)}
.md ul,.md ol{margin:0 0 16px;padding-left:26px}.md li{margin:4px 0}.md li>p{margin:0 0 6px}.md li>ul,.md li>ol{margin:4px 0}
.md a{color:var(--link)}.md strong{font-weight:600}
.md blockquote{margin:0 0 16px;padding:0 0 0 16px;border-left:3px solid #e3e3e3;color:var(--muted)}
.md hr{border:0;border-top:1px solid var(--border);margin:28px 0}
.md code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.875em;background:#ececec;border-radius:5px;padding:1px 5px}
.md code.tex{background:#f3f0ff}
.codeblock{margin:0 0 16px;border-radius:14px;background:var(--code);border:1px solid var(--border);overflow:hidden}
.code-head{display:flex;justify-content:space-between;align-items:center;padding:6px 14px;font-size:12px;line-height:20px;color:var(--muted);background:#f1f1f1}
.code-head button{border:0;background:none;color:inherit;font:inherit;cursor:pointer;padding:0}.code-head button:hover{color:var(--text)}
.codeblock pre{margin:0;padding:12px 16px;overflow-x:auto;font:13.5px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:4}
.md .codeblock code{background:none;padding:0;border-radius:0;font-size:inherit;white-space:pre}
.table-wrap{overflow-x:auto;margin:0 0 16px}.md table{border-collapse:collapse;font-size:14px;line-height:1.6}
.md th,.md td{border-bottom:1px solid var(--border);padding:8px 16px 8px 0;text-align:left;vertical-align:top}.md th{font-weight:600;border-bottom-color:rgba(13,13,13,.2)}.md tr:last-child td{border-bottom:0}
.md img{max-width:100%;height:auto;border-radius:12px;cursor:zoom-in;vertical-align:middle}.md img.thumb{height:150px;width:auto;object-fit:cover}
.gallery{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.gallery img{height:150px;width:auto;max-width:100%;object-fit:cover}
.math-block{margin:0 0 16px;overflow-x:auto;text-align:center}math{font-size:1.08em}
.callout{margin:0 0 16px;border:1px solid var(--border);border-radius:12px;padding:10px 14px;background:#fafafa}
.callout>summary,.callout-title{cursor:pointer;color:var(--muted);font-size:14px}.callout-title{cursor:default;margin-bottom:6px}.callout[open]>summary{margin-bottom:8px}
.callout-body{font-size:15px}.callout-body>:last-child{margin-bottom:0}
.card-host{position:relative;margin:16px 0}.card-static{pointer-events:none}
.card-frame{position:absolute;left:0;top:0;display:block;width:100%;height:0;border:0;visibility:hidden}
.card-host.live .card-static{display:none}.card-host.live .card-frame{position:static;visibility:visible}
.appblock{margin:16px 0;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:#fff}
.appblock figcaption{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 14px;font-size:13px;line-height:20px;color:var(--muted);border-bottom:1px solid var(--border)}
.appblock .ab-frame{border-radius:0}.ab-open{border:1px solid var(--border);background:#fff;border-radius:999px;padding:2px 10px;font:inherit;color:inherit;cursor:pointer}.ab-open:hover{color:var(--text)}
.ab-poster{display:none}.ab-static{display:flex;flex-direction:column;gap:6px;padding:10px;border:1px dashed #c9c9c9;border-radius:10px;font-size:13px;color:#5d5d5d}.ab-static img{max-width:100%;border-radius:8px}
figure.map{position:relative;margin:0 0 16px;border:1px solid var(--border);border-radius:16px;overflow:hidden;background:#f3f3f3}
.map-shot{display:block;width:100%;height:auto}.map-missing{padding:24px;text-align:center;color:var(--muted);font-size:14px}
figure.map.map-online .map-shot,figure.map.map-online .map-missing{display:none}figure.map:not(.map-online) .map-live{position:absolute;left:0;top:0;width:100%;visibility:hidden}
.map-load{margin-left:auto;border:1px solid var(--border);background:#fff;border-radius:999px;padding:1px 10px;font:inherit;color:var(--text);cursor:pointer}.map-load:disabled{color:var(--faint);cursor:wait}.map-note{flex-basis:100%;color:#b45309}.map-note:empty{display:none}figure.map figcaption{flex-wrap:wrap}
.map-live{position:relative;height:360px;overflow:hidden;touch-action:none;cursor:grab;background:#e8e8e8;user-select:none}.map-live:active{cursor:grabbing}
.map-tiles img{position:absolute;left:0;top:0;width:256px;height:256px;max-width:none;border-radius:0;cursor:inherit}
.map-pin{position:absolute;left:0;top:0;width:0;height:0;color:var(--text);text-decoration:none}
.map-pin span{position:absolute;left:0;bottom:6px;transform:translateX(-50%);white-space:nowrap;background:#fff;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600;line-height:18px;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.map-pin::after{content:"";position:absolute;left:-4px;top:-4px;width:8px;height:8px;border-radius:50%;background:#0d0d0d;border:2px solid #fff}
.map-zoom{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:4px}.map-zoom button{width:30px;height:30px;border:0;border-radius:8px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);font-size:18px;cursor:pointer}
.map-credit{position:absolute;right:0;bottom:0;padding:1px 6px;background:rgba(255,255,255,.85);font-size:10px;color:#555}
figure.map figcaption{display:flex;align-items:center;gap:6px;padding:6px 12px;font-size:13px;color:var(--muted);background:#fff}
details.info{display:inline}details.info>summary{display:inline;list-style:none;cursor:pointer;color:var(--faint)}details.info>summary::-webkit-details-marker{display:none}details.info[open]>div{margin-top:4px;font-size:12px;line-height:1.6}
footer.notes{margin-top:48px;border-top:1px solid var(--border);padding-top:16px;color:var(--muted);font-size:14px}footer.notes h2{font-size:15px;margin:0 0 8px;color:var(--text)}footer.notes ul{padding-left:22px;margin:0 0 12px}
.lightbox{position:fixed;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.82);cursor:zoom-out}.lightbox img{max-width:96vw;max-height:96vh;border-radius:6px;background:#fff}
@media print{.card-frame,.ab-frame,.map-live,.map-load,.code-head button,.ab-open{display:none!important}figure.map .map-shot,figure.map .map-missing{display:block!important}.card-host.live .card-static{display:block!important}.ab-poster{display:block;max-width:100%}.page{max-width:none}}`;

  // input: {title, url, version, exportedAt, form:'folder'|'single', maps:boolean,
  //   items:[the panel's messages after its archive pass: id, role, md (cards as \u0000CARD:n\u0000),
  //     segments, dil, contentReferences, smallImages, uiImages, cardFiles, mapImages],
  //   assets:[{path, blob, kind, messageId}], warnings:[...], document?}
  // Returns {html, files:[{path, blob}] (folder form: the assets the page links), stats}.
  async function build(input) {
    const R = root.ChatExportDilRender, doc = input.document || root.document, single = input.form === 'single';
    if (!R?.mountLive) throw Error(t('err.renderModule'));
    const nonce = `s${Math.random().toString(36).slice(2, 10)}`;
    const usable = (input.assets || []).filter(a => a.blob && !['ui-data', 'appblock'].includes(a.kind));
    const byPath = new Map(usable.map(a => [a.path, a]));
    const inline = new Map();
    if (single) await Promise.all(usable.map(async a => inline.set(a.path, await dataUrlOf(a.path, a.blob))));
    const used = new Set();
    const resolve = href => {let path = href;try {path = decodeURI(href);} catch {}const asset = byPath.get(path) || byPath.get(href);if (!asset) return null;used.add(asset.path);return single ? inline.get(asset.path) : asset.path;};
    const messages = [], mapPlaces = [];let cards = 0, appFrames = 0, maps = 0;
    const body = [];let turn = null;
    for (const item of input.items) {
      if (!turn || turn.role !== item.role) body.push(turn = {role:item.role, parts:[]});
      if (item.role === 'user') {turn.parts.push(userHtml(item.md, {resolve}));continue;}
      // Per message: its program, the pictures its cards show (small copies, as data URLs in
      // both forms so the frames look the same) and its AppBlocks.
      const k = messages.length, blocks = item.dil ? R.appBlocks(item.dil, item.contentReferences) : [];
      const blockOf = new Map(blocks.map(b => [`ui/appblock-${safeName(item.id)}-${safeName(b.id)}.html`, b]));
      const images = {};
      for (const [url, blob] of item.smallImages instanceof Map ? item.smallImages : []) try {images[url] = await dataUrlOf('x.jpg', blob);} catch {}
      for (const i of item.uiImages || []) if (i.blob && !images[i.url]) try {images[i.url] = await dataUrlOf(i.path, i.blob);} catch {}
      for (const f of item.cardFiles || []) if (f.blob && !images[`sandbox:${f.path}`]) try {images[`sandbox:${f.path}`] = await dataUrlOf(f.path, f.blob);} catch {}
      const cardTrees = (item.segments || []).map((s, i) => ({...s, index:i})).filter(s => s.kind === 'card' && s.tree);
      // AppBlocks inside a card run in the card's frame; the page's static copy shows their preview.
      const inCardIds = new Set();(function walk(n) {if (!n || typeof n !== 'object') return;if (Array.isArray(n)) return n.forEach(walk);if (n.type === '__chatgptClientDefinedWidget') inCardIds.add(n.props?.invocationId);walk(n.children);})(cardTrees.map(s => s.tree));
      const preview = b => {const p = `ui/appblock-${safeName(item.id)}-${safeName(b.id)}.html`.replace(/^ui\//, 'assets/').replace(/\.html$/, '.png');return resolve(p);};
      const inCard = new Set([...blockOf].filter(([, b]) => inCardIds.has(b.invocationId)).map(([p]) => p));
      const ctx = {nonce, resolve, blockPaths:new Set(blockOf.keys()), inCard};
      const toHtml = markdownRenderer(ctx);
      let md = String(item.md || '').replace(/\u0000CARD:(\d+)\u0000/g, (x, i) => `\n\n<x-slot data-k="${nonce}" data-card="${i}"></x-slot>\n\n`);
      let html = sanitize(toHtml(md), doc, nonce);
      const staticOpts = {live:true, image:src => images[src] || null, math:R.mathml,
        widget:id => {const b = blocks.find(x => x.invocationId === id);if (!b) return null;const shot = preview(b);return `<div class="ab-static">${shot ? `<img src="${escapeHtml(shot)}" alt="">` : ''}<span>🧩 ${escapeHtml(t('html.appInCard', b.title))}</span></div>`;}};
      // A slot alone in a paragraph takes the paragraph's place (a figure cannot sit inside <p>).
      html = html.replace(new RegExp(`<p>(<x-slot data-k="${nonce}" [^>]*></x-slot>)</p>`, 'g'), '$1');
      html = html.replace(new RegExp(`<x-slot data-k="${nonce}" ([^>]*)></x-slot>`, 'g'), (x, attrs) => {
        const card = /data-card="(\d+)"/.exec(attrs), map = /data-map="(\d+)"/.exec(attrs), app = /data-app="([^"]+)"/.exec(attrs);
        if (card) {
          const seg = cardTrees.find(s => s.index === Number(card[1]));if (!seg) return '';
          const n = cardTrees.indexOf(seg);cards++;
          return `<div class="card-host" data-msg="${k}" data-card="${n}"><div class="card-static"><div class="dil-root live">${R.toHtml(seg.tree, staticOpts)}</div></div></div>`;
        }
        if (map) {
          const ref = (item.contentReferences || [])[Number(map[1])], places = (Array.isArray(ref?.data?.points) ? ref.data.points : []).filter(p => p && typeof p === 'object').map(R.placeOf);
          const shot = item.mapImages?.[map[1]] ? resolve(item.mapImages[map[1]]) : null;mapPlaces.push(places.map(({name, lat, lng, rating, href}) => ({name, lat, lng, rating, href})));maps++;
          const live = input.maps && places.some(p => typeof p.lat === 'number' && typeof p.lng === 'number');
          return `<figure class="map" data-map="${mapPlaces.length - 1}">${shot ? `<img class="map-shot" src="${escapeHtml(shot)}" alt="${escapeHtml(t('dil.mapPlaces', places.length))}">` : `<div class="map-missing">${escapeHtml(t(live ? 'html.mapMissingLive' : 'html.mapMissing'))}</div>`}<figcaption>📍 ${escapeHtml(t('html.places', places.length))}${live ? `<button type="button" class="map-load">${escapeHtml(t('html.mapOnline'))}</button>` : ''}<details class="info"><summary title="${escapeHtml(t('html.mapInfo'))}">ⓘ</summary><div>${escapeHtml(t(live ? 'html.mapInfoLive' : 'html.mapInfoOffline'))}</div></details><span class="map-note" role="status"></span></figcaption></figure>`;
        }
        if (app) {
          const b = blockOf.get(app[1].replace(/&amp;/g, '&'));if (!b) return '';
          const shot = preview(b);appFrames++;
          return `<figure class="appblock"><figcaption><span>🧩 ${escapeHtml(t('md.appNamedPlain', b.title))}</span><button type="button" class="ab-open">${escapeHtml(t('html.openWindow'))}</button></figcaption>${R.appBlockFrame(b)}${shot ? `<img class="ab-poster" src="${escapeHtml(shot)}" alt="${escapeHtml(t('md.appPreview', b.title))}">` : ''}</figure>`;
        }
        return '';
      });
      turn.parts.push(`<div class="md" data-message-id="${escapeHtml(item.id)}">${html}</div>`);
      messages.push(cardTrees.length ? {dil:item.dil && {code:item.dil.code, constants:item.dil.constants, appData:item.dil.appData, requiredComponents:item.dil.requiredComponents, clientDefinedWidgets:item.dil.clientDefinedWidgets, contentReferences:item.contentReferences}, images, blocks:Object.fromEntries(blocks.filter(b => inCardIds.has(b.invocationId)).map(b => [b.invocationId, {id:b.id, title:b.title, language:b.language, content:b.content}]))} : {});
    }
    // Messages without cards still take a slot so data-msg indexes stay simple.
    const title = String(input.title || 'ChatGPT').replace(/\s+/g, ' ').trim() || 'ChatGPT';
    const sections = body.map(turn => `<section class="turn ${turn.role === 'user' ? 'user' : 'assistant'}"><h2 class="sr-only">${escapeHtml(turn.role === 'user' ? input.roles?.user || t('md.roleUser') : input.roles?.assistant || 'ChatGPT')}</h2>${turn.parts.join('\n')}</section>`).join('\n');
    const warnings = input.warnings || [];
    const notes = warnings.length ? `<footer class="notes"><h2>${escapeHtml(t('md.notes'))}</h2><ul>${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></footer>` : '';
    const when = input.exportedAt || new Date().toISOString();
    // The page's own words, in the language of the export (the page has no extension to ask).
    const text = Object.fromEntries(['copy', 'copied', 'mapConnecting', 'mapRetry', 'mapOnline', 'mapFailed', 'mapTimeout', 'mapBack', 'mapTilesFailed', 'mapTileFailed', 'mapCtrl'].map(k => [k, t(`html.${k}`)]));text.card = t('md.card');
    const data = {boot:CARD_BOOT, messages, maps:!!input.maps, mapPlaces, text, dilText:R.pageText()};
    const html = `<!doctype html>
<html lang="${I18n.tag}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="Chat &amp; Intelligent UI Exporter for ChatGPT ${escapeHtml(input.version || '')}">
<title>${escapeHtml(title)}</title>
<style>${R.CARD_CSS}\n${R.LIVE_CSS}\n${pageCss()}</style>
</head>
<body>
<div class="page">
<header class="top"><h1>${escapeHtml(title)}</h1><p class="meta">${escapeHtml(t('md.source', '\u0001')).replace('\u0001', `<a href="${escapeHtml(/^https?:/i.test(input.url || '') ? input.url : '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(input.url || '')}</a>`)}<br>${escapeHtml(t('html.exportedAt', when.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')))} · Chat &amp; Intelligent UI Exporter for ChatGPT ${escapeHtml(input.version || '')}</p></header>
<main>
${sections}
</main>
${notes}
</div>
<script type="application/json" id="export-data">${jsonScript(data)}</script>
<script type="application/json" id="dil-runtime">${jsonScript(R.source())}</script>
<script>(${pageController})();</script>
</body>
</html>
`;
    const files = single ? [] : usable.filter(a => used.has(a.path)).map(a => ({path:a.path, blob:a.blob}));
    return {html, files, stats:{cards, appBlocks:appFrames, maps, assets:used.size, bytes:html.length}};
  }

  const api = {build, sanitize, userHtml, markdownRenderer, get PAGE_CSS() {return pageCss();}, CARD_BOOT, pageController};
  root.ChatExportHtml = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
