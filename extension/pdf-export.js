// PDF export: print.html (an extension page the panel opens) lays out the exported Markdown
// and its images for paper, then opens the browser's print dialog, where "Save as PDF" saves
// it. Text stays text (selectable, searchable, links clickable) with the system's CJK
// fonts embedded by the browser (those of the export's language first); cards are the same PNG images as in the ZIP, cut at blank
// rows where they are taller than a page, with their text and other states as notes below.
// It only reads what the ZIP export already made (Markdown, card PNGs, originals, AppBlock
// previews), never the page or the network, and runs no AI service.
(function(root) {
  'use strict';
  const I18n = root.ChatExportI18n || (typeof module !== 'undefined' ? require('./i18n.js') : null), t = I18n.t;
  const MM = 96 / 25.4;
  // A4 portrait; wide tables get a landscape page. The layout is measured on screen at the
  // same content width, so what fits here fits on paper.
  const PAGE = {width:210, height:297, top:14, side:14, bottom:16};
  const contentWidth = (PAGE.width - 2 * PAGE.side) * MM, contentHeight = (PAGE.height - PAGE.top - PAGE.bottom) * MM;
  const wideWidth = (PAGE.height - 2 * PAGE.side) * MM;
  // An image slice leaves room for the line above it on the same page.
  const sliceHeight = Math.floor(contentHeight * 0.96);
  const sans = () => `system-ui,-apple-system,"Segoe UI",${I18n.cjkFonts()},sans-serif`;
  const mono = () => `ui-monospace,"Cascadia Mono",Consolas,"SF Mono",Menlo,${I18n.cjkFonts()},"Noto Sans Mono CJK SC",monospace`;
  // Chrome leaves out its own header and footer (date, title, address; drawn in a font whose
  // characters a search misses) on every page edge that has a margin box of the page's own: the
  // empty one on top, the page number at the bottom.
  const printCss = (SANS = sans(), MONO = mono()) => `@page{size:A4;margin:${PAGE.top}mm ${PAGE.side}mm ${PAGE.bottom}mm;@bottom-center{content:counter(page) " / " counter(pages);font:9px ${SANS};color:#8f8f8f}@top-center{content:""}}
@page wide{size:A4 landscape}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#e8e8eb;color:#0d0d0d;font:14px/1.65 ${SANS}}
#pdf-doc{width:${PAGE.width - 2 * PAGE.side}mm;margin:16px auto 40px;padding:${PAGE.top}mm ${PAGE.side}mm;background:#fff;box-shadow:0 2px 14px #0002;overflow-wrap:break-word}
#pdf-bar{position:sticky;top:0;z-index:1;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:10px 16px;background:#172330;color:#fff;font:13px/1.5 ${SANS}}
#pdf-bar button{padding:6px 14px;border:0;border-radius:6px;background:#10a37f;color:#fff;font:inherit;cursor:pointer}#pdf-bar button:disabled{opacity:.5}
#pdf-bar .hint{color:#c5ccd6;font-size:12px}
@media print{body{background:#fff}#pdf-doc{width:auto;margin:0;padding:0;box-shadow:none}#pdf-bar{display:none}}
.doc-head{margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e3e3e3}
.doc-head h1{margin:0 0 4px;font-size:22px;line-height:1.35}
.doc-meta{color:#6b6b6b;font-size:11px}
.doc-meta a{color:inherit}
.msg{margin:16px 0}
.msg .role{margin-bottom:4px;color:#8f8f8f;font-size:11px;font-weight:600;break-after:avoid}
.msg.user .role{text-align:right}
.msg.user .bubble{width:fit-content;max-width:78%;margin-left:auto;padding:8px 14px;border-radius:18px;background:#f3f3f3}
.msg.notes{margin-top:24px;padding-top:8px;border-top:1px solid #e3e3e3;color:#555;font-size:12px}
.md>:first-child{margin-top:0}.md>:last-child{margin-bottom:0}
.md p{margin:0 0 .7em}
.md h1,.md h2,.md h3,.md h4,.md h5,.md h6{margin:1em 0 .4em;line-height:1.35;break-after:avoid}
.md h1{font-size:20px}.md h2{font-size:18px}.md h3{font-size:17px}.md h4{font-size:15.5px}.md h5,.md h6{font-size:14px}
.md ul,.md ol{margin:0 0 .7em;padding-left:1.6em}.md li{margin:.15em 0}.md li>p{margin:0 0 .3em}
.md hr{border:0;border-top:1px solid #e3e3e3;margin:1em 0}
.md blockquote{margin:.6em 0;padding:0 0 0 12px;border-left:3px solid #d9d9de;color:#3d3d3d}
.md a{color:#0b65c2;text-decoration:none}
.md .local-link{color:inherit;border-bottom:1px dotted #aaa}
.md code{padding:0 .25em;border-radius:4px;background:#f0f0f2;font:.88em/1.4 ${MONO}}
.md .code{margin:.6em 0;border:1px solid #e3e3e3;border-radius:8px;background:#f7f7f8;overflow:hidden}
.md .code-lang{padding:3px 10px;border-bottom:1px solid #e9e9ec;color:#6b6b6b;font:10.5px/1.5 ${SANS}}
.md pre{margin:0;padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:11.5px/1.5 ${MONO}}
.md pre code{padding:0;background:none;font:inherit}
.md .table-wrap{margin:.6em 0}
.md .table-wrap.wide{page:wide;width:${PAGE.height - 2 * PAGE.side}mm}
.md table{border-collapse:collapse;font-size:12px;line-height:1.45}
.md th,.md td{padding:4px 7px;border:1px solid #dcdce0;vertical-align:top;text-align:left}
.md th{background:#f5f5f6;font-weight:600}
.md tr{break-inside:avoid}
.md img{max-width:100%;height:auto}
.md img.photo{display:block;max-height:${Math.round(contentHeight * 0.8)}px;width:auto;margin:6px 0;object-fit:contain;break-inside:avoid}
.md .card{margin:8px 0}
.md .card img{display:block;break-inside:avoid}
.md .pic-list{margin:8px 0}
.md .pic-row{display:flex;gap:16px;align-items:flex-start;margin:0 0 10px;padding:12px 14px;border:1px solid #e5e5e5;border-radius:16px;break-inside:avoid}
.md .pic-img{flex:none}
.md .pic-thumb{display:block;width:160px;height:120px;object-fit:cover;border-radius:10px}
.md .pic-text{flex:1;min-width:0;font-size:13.5px;line-height:1.6}
.md .pic-text>:last-child{margin-bottom:0}
.md .missing{color:#8f8f8f}
.md .math{font-family:"Cambria Math","STIX Two Math","Times New Roman",${SANS}}
.md .math-block{margin:.6em 0;text-align:center;font-size:15px;break-inside:avoid}
.md .callout{margin:.6em 0;padding:6px 10px;border-left:3px solid #c9c9cf;border-radius:0 6px 6px 0;background:#f8f8f9;color:#333;font-size:12.5px}
.md .callout-title{margin-bottom:2px;color:#6b6b6b;font-size:11.5px;font-weight:600;break-after:avoid}
.md .card-text-layer{margin:-1px 0 0;color:transparent;font:1px/1px ${SANS};overflow:hidden}
.md .card-text-layer *{display:inline!important;margin:0!important;padding:0!important;border:0!important;background:none!important;color:inherit!important;font:inherit!important}
.md .card-text-layer *::after{content:" "}
.md .callout.chatgpt-appblock{border-left-color:#10a37f}`;

  const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const isExternal = href => /^(?:https?:|mailto:)/i.test(href || '');
  // Formulas as readable text with sup/sub (the same converter as the card images).
  // Before that, environments, alignment marks and decorations (\boxed, \hat) are dropped,
  // \\ breaks a displayed formula's line, and symbols the card converter lacks become their
  // characters (\in → ∈, \langle → ⟨, \mathbb{R} → ℝ).
  const TEX_MORE = {in:'∈', notin:'∉', ni:'∋', subset:'⊂', subseteq:'⊆', supset:'⊃', supseteq:'⊇', cup:'∪', cap:'∩', setminus:'∖', forall:'∀', exists:'∃', emptyset:'∅', varnothing:'∅',
    langle:'⟨', rangle:'⟩', '|':'‖', lVert:'‖', rVert:'‖', Vert:'‖', lvert:'|', rvert:'|', vert:'|', mid:'|', lfloor:'⌊', rfloor:'⌋', lceil:'⌈', rceil:'⌉',
    xi:'ξ', zeta:'ζ', kappa:'κ', nu:'ν', chi:'χ', psi:'ψ', iota:'ι', upsilon:'υ', vartheta:'ϑ', varrho:'ϱ', varsigma:'ς', Gamma:'Γ', Lambda:'Λ', Theta:'Θ', Psi:'Ψ', Xi:'Ξ', Upsilon:'Υ',
    ll:'≪', gg:'≫', sim:'∼', simeq:'≃', cong:'≅', perp:'⊥', parallel:'∥', angle:'∠', leftrightarrow:'↔', Leftrightarrow:'⇔', iff:'⟺', implies:'⟹', mapsto:'↦', uparrow:'↑', downarrow:'↓', Leftarrow:'⇐', longrightarrow:'⟶',
    neg:'¬', land:'∧', lor:'∨', wedge:'∧', vee:'∨', oplus:'⊕', otimes:'⊗', star:'⋆', bullet:'•', prime:'′', dagger:'†', vdots:'⋮', ddots:'⋱', ell:'ℓ', hbar:'ℏ', aleph:'ℵ', oint:'∮', iint:'∬', top:'⊤', bot:'⊥'};
  const BLACKBOARD = {R:'ℝ', N:'ℕ', Z:'ℤ', Q:'ℚ', C:'ℂ', P:'ℙ'}, LINE = String.fromCharCode(3);
  const cleanTex = (source, block) => String(source)
    .replace(/\\(?:begin|end)\{[^}]*\}(?:\{[^}]*\})?/g, ' ')
    .replace(/\\mathbb\s*\{\s*([A-Z])\s*\}|\\mathbb\s*([A-Z])/g, (x, a, b) => BLACKBOARD[a || b] || a || b)
    .replace(/\\(?:boxed|underline|overline|hat|bar|vec|tilde|dot|ddot|widehat|widetilde|overrightarrow|mathcal|mathscr|mathfrak|cancel|bm|pmb)(?![a-zA-Z])/g, '')
    .replace(/\\tag\*?\{([^}]*)\}/g, '\\quad($1)')
    .replace(/\\\\(?:\[[^\]]*\])?/g, block ? LINE : ' ')
    .replace(/(?<!\\)&/g, ' ')
    .replace(/\\(?:([a-zA-Z]+)(?![a-zA-Z])|(\|))/g, (x, name, bar) => TEX_MORE[name || bar] ?? x);
  function tex(source, block = false) {
    const f = root.ChatExportDilRender?.texHtml, clean = cleanTex(source, block);
    return (f ? f(clean) : escapeHtml(clean)).split(LINE).map(l => l.trim()).filter(Boolean).join('<br>');
  }
  // ChatGPT shows \[…\], $$…$$ and \(…\) as formulas; a lone $…$ only when it hugs its text
  // (not "$5 and $6") and is not followed by a digit.
  const MATH_BLOCK = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])[ \t]*(?:\n|$)/;
  const MATH_INLINE = /^(?:\$\$([^$]+?)\$\$|\\\(([\s\S]+?)\\\)|\$(?![\s$])((?:\\.|[^\\$\n])+?)(?<![\s\\])\$(?!\d))/;
  const mathExtensions = [
    {name:'mathBlock', level:'block', start:src => {const i = src.search(/^[ \t]*(?:\$\$|\\\[)/m);return i < 0 ? undefined : i;},
      tokenizer(src) {const m = MATH_BLOCK.exec(src.replace(/^[ \t]+/, ''));if (m) return {type:'mathBlock', raw:src.slice(0, src.length - src.replace(/^[ \t]+/, '').length) + m[0], text:(m[1] ?? m[2]).trim()};},
      renderer:t => `<div class="math math-block">${tex(t.text, true)}</div>\n`},
    {name:'mathInline', level:'inline', start:src => {const i = src.search(/(?<!\\)\$|\\\(/);return i < 0 ? undefined : i;},
      tokenizer(src) {const m = MATH_INLINE.exec(src);if (m) return {type:'mathInline', raw:m[0], text:m[1] ?? m[2] ?? m[3]};},
      renderer:t => `<span class="math">${tex(t.text)}</span>`},
  ];
  // Markdown → HTML for one message. HTML written in the text shows as text, as on the
  // ChatGPT page (only the exporter's own <br>, <sup> and <sub> pass). Images resolve to
  // the exported files; links to files of the archive keep their text without a target.
  // In a table row a "|" splits cells even inside `code` or $math$, unless escaped, and a cell
  // past the header's count is dropped ("`\\|`" is an escaped backslash, then a split). Pipes
  // inside those spans are kept as content here, so no text of the row is lost.
  const PIPE = '\u0001';
  function protectTablePipes(md, {math = true} = {}) {
    let fence = null;
    return md.split('\n').map(line => {
      const inner = line.replace(/^(?:[ \t]*>[ \t]?)+/, ''), open = /^ {0,3}(`{3,}|~{3,})/.exec(inner);
      if (fence) {if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !inner.trim().slice(open[1].length).trim()) fence = null;return line;}
      if (open) {fence = open[1];return line;}
      if (!/^\s*\|.*\|\s*$/.test(inner)) return line;
      let out = '';
      for (let i = 0; i < line.length;) {
        const tick = /^`+/.exec(line.slice(i));
        if (tick) {const end = line.indexOf(tick[0], i + tick[0].length);if (end > 0) {out += line.slice(i, end + tick[0].length).replace(/\\?\|/g, PIPE);i = end + tick[0].length;continue;}}
        if (math && (line[i] === '$' || line.startsWith('\\(', i)) && line[i - 1] !== '\\') {const m = MATH_INLINE.exec(line.slice(i));if (m) {out += m[0].replace(/\\?\|/g, PIPE);i += m[0].length;continue;}}
        out += line[i++];
      }
      return out;
    }).join('\n');
  }
  function markdownHtml(md, {resolve = () => null, math = true, breaks = false} = {}) {
    const lib = root.marked || (typeof require === 'function' ? require('marked') : null);
    const marked = new lib.Marked({gfm:true, breaks});
    marked.use({extensions:math ? mathExtensions : [], renderer:{
      html({text}) {return /^<\/?(?:br|sup|sub)\s*\/?>$/i.test(text.trim()) ? text : escapeHtml(text);},
      image({href, text}) {
        const size = /\|(\d+)(?:x(\d+))?$/.exec(text), alt = text.replace(/\|\d+(?:x\d+)?$/, ''), found = resolve(href);
        if (!found) return `<span class="missing">${escapeHtml(t('pdf.imageMissing', alt || href))}</span>`;
        const a = found.asset || {}, card = /^(?:card-image|appblock-preview)$/.test(a.kind);
        const width = card && a.width ? Math.min(a.width, Math.floor(contentWidth)) : size ? +size[1] : null;
        return `<img class="${card ? 'card-img' : 'photo'}" src="${escapeHtml(found.url)}" alt="${escapeHtml(alt)}" data-path="${escapeHtml(href)}"${width ? ` style="width:${width}px"` : ''}>`;
      },
      link({href, title, tokens}) {
        const text = this.parser.parseInline(tokens);
        return isExternal(href) ? `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${text}</a>` : `<span class="local-link" title="${escapeHtml(href)}">${text}</span>`;
      },
      code({text, lang}) {
        const label = (lang || '').trim().split(/\s/)[0];
        return `<div class="code">${label ? `<div class="code-lang">${escapeHtml(label)}</div>` : ''}<pre><code>${escapeHtml(text)}</code></pre></div>\n`;
      },
    }});
    return marked.parse(protectTablePipes(md, {math})).split(PIPE).join('|');
  }
  // The exported document: "# title", the source line ("Source: url"), then "## You" / "## ChatGPT"
  // sections (separated by "---") and an optional notes section, in any of the languages.
  // Headings inside messages start at ###, and fenced code is skipped, so these lines are the sections.
  function splitDocument(md) {
    const users = I18n.every('md.roleUser'), notes = I18n.every('md.notes'), sources = I18n.every('md.source').map(s => s.split('{0}')[0]);
    const SECTION = new RegExp(`^## (${[...users, 'ChatGPT', ...notes].map(I18n.quote).join('|')})\\s*$`);
    const lines = md.replace(/\r\n?/g, '\n').split('\n'), out = {title:'', source:'', sections:[]};
    let fence = null, current = null;const head = [];
    for (const line of lines) {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !line.trim().slice(open[1].length).trim()) fence = null;}
      else if (open) fence = open[1];
      else if (SECTION.test(line)) {
        const name = SECTION.exec(line)[1];
        current = {role:users.includes(name) ? 'user' : name === 'ChatGPT' ? 'assistant' : 'notes', label:name, lines:[]};out.sections.push(current);continue;
      }
      (current ? current.lines : head).push(line);
    }
    for (const line of head) {
      if (!out.title && /^# /.test(line)) out.title = line.slice(2).trim();
      else if (!out.source && sources.some(s => line.startsWith(s))) out.source = line.slice(sources.find(s => line.startsWith(s)).length).trim();
    }
    for (const s of out.sections) {
      while (s.lines.length && !s.lines.at(-1).trim()) s.lines.pop();
      if (s.role !== 'notes' && s.lines.at(-1)?.trim() === '---') s.lines.pop();
      s.md = s.lines.join('\n').trim();delete s.lines;
    }
    return out;
  }
  const localeOf = md => {const tables = root.ChatExportLocales || {}, lines = md.split(/\r?\n/, 12);
    return I18n.LOCALES.find(l => {const head = tables[l]?.['md.source']?.split('{0}')[0];return head && lines.some(line => line.startsWith(head));}) || null;};
  // Folded Obsidian callouts ("> [!note]- Card text") are opened: paper shows everything.
  function openCallouts(container) {
    for (const quote of [...container.querySelectorAll('blockquote')]) {
      const first = quote.firstElementChild;
      if (!first || first.tagName !== 'P') continue;
      const m = /^\s*\[!([\w-]+)\][+-]?[ \t]*((?:(?!<br>)[^\n])*)/.exec(first.innerHTML);
      if (!m) continue;
      const type = m[1].toLowerCase(), rest = first.innerHTML.slice(m[0].length).replace(/^\s*(?:<br>)?\s*/, '');
      const box = quote.ownerDocument.createElement('div'), title = quote.ownerDocument.createElement('div');
      box.className = `callout ${type}${I18n.every('md.cardText').includes(m[2].replace(/<[^>]+>/g, '').trim()) ? ' card-text' : ''}`;
      title.className = 'callout-title';title.innerHTML = m[2] || type;
      if (rest.trim()) first.innerHTML = rest;else first.remove();
      box.append(title, ...quote.childNodes);quote.replaceWith(box);
    }
  }
  function wrapBlocks(container) {
    const doc = container.ownerDocument;
    // A picture-list card is exported as a two-column table with an empty header, a thumbnail
    // (linked to the original) on the left and the text on the right; on paper it is a list again.
    for (const table of [...container.querySelectorAll('table')]) {
      const head = [...table.querySelectorAll('thead th')], rows = [...table.querySelectorAll('tbody tr')];
      const picture = cell => cell && cell.querySelectorAll('img').length === 1 && !cell.textContent.trim();
      if (head.length !== 2 || head.some(th => th.textContent.trim()) || !rows.length || !rows.every(r => r.cells.length === 2 && picture(r.cells[0]))) continue;
      const list = doc.createElement('div');list.className = 'pic-list';
      for (const r of rows) {
        const row = doc.createElement('div'), pic = doc.createElement('div'), text = doc.createElement('div');
        row.className = 'pic-row';pic.className = 'pic-img';text.className = 'pic-text';
        const img = r.cells[0].querySelector('img');img.className = 'pic-thumb';img.removeAttribute('style');pic.append(img);
        text.innerHTML = r.cells[1].innerHTML;row.append(pic, text);list.append(row);
      }
      table.replaceWith(list);
    }
    for (const table of container.querySelectorAll('table')) {const wrap = doc.createElement('div');wrap.className = 'table-wrap';table.replaceWith(wrap);wrap.append(table);}
    // A paragraph that is only a card image becomes a card block (sliced later if tall).
    for (const img of container.querySelectorAll('img.card-img')) {
      const p = img.parentElement;
      if (p?.tagName === 'P' && p.childNodes.length === 1) {const card = doc.createElement('div');card.className = 'card';p.replaceWith(card);card.append(img);}
    }
    // The card text right after it stays in the PDF as invisible text, a line about 1px tall
    // under the card in reading order: the PDF can be searched and copied, and nothing shows
    // twice. What the image does not show stays visible below it: pictures the card did not
    // draw (AppBlock previews) and nested notes (AppBlock links).
    for (const card of container.querySelectorAll('.card')) {
      const text = card.nextElementSibling;
      if (!text?.classList.contains('card-text')) continue;
      text.querySelector('.callout-title')?.remove();text.querySelectorAll('.missing').forEach(n => n.remove());
      const keep = [...text.querySelectorAll('img, .callout')].filter(n => !n.parentElement.closest('.callout:not(.card-text)'));
      if (keep.length) {const extra = doc.createElement('div');extra.className = 'card-extra';
        // A card-sized picture (an AppBlock preview) is a card of its own, sliced if tall.
        extra.append(...keep.map(n => {if (!n.matches('img.card-img')) return n;const box = doc.createElement('div');box.className = 'card';box.append(n);return box;}));text.after(extra);}
      // Run inline, a numbered list loses its numbers (they are list markers, not text).
      for (const ol of text.querySelectorAll('ol')) [...ol.children].forEach((li, k) => li.prepend(`${(+ol.getAttribute('start') || 1) + k}. `));
      text.className = 'card-text-layer';
    }
  }
  // Builds the document into doc (print.html, or a test page). assets: [{path, blob|url,
  // width, height, kind}]. Resolves once images are loaded and the layout fits the page.
  async function render(payload, doc = root.document) {
    // The words and fonts of the language the panel exported in (a payload saved before it said
    // so: the language its source line is written in).
    I18n.setLocale(payload.locale || localeOf(payload.md || '') || 'auto');
    if (doc.documentElement) doc.documentElement.lang = I18n.tag;
    const win = doc.defaultView, urls = new Map(), assets = new Map();
    for (const a of payload.assets || []) {
      const url = a.url || (a.blob ? win.URL.createObjectURL(a.blob) : null);
      if (url) {urls.set(a.path, url);assets.set(a.path, a);}
    }
    const resolve = href => {let p = href;try {p = decodeURI(href);} catch {}return urls.has(p) ? {url:urls.get(p), asset:assets.get(p)} : null;};
    const parts = splitDocument(payload.md || '');
    doc.title = payload.documentTitle || parts.title || 'ChatGPT';
    let style = doc.getElementById('pdf-style');
    if (!style) {style = doc.createElement('style');style.id = 'pdf-style';doc.head.append(style);}
    style.textContent = printCss();
    let main = doc.getElementById('pdf-doc');
    if (!main) {main = doc.createElement('main');main.id = 'pdf-doc';doc.body.append(main);}
    const meta = [parts.source && escapeHtml(t('md.source', '\u0001')).replace('\u0001', isExternal(parts.source) ? `<a href="${escapeHtml(parts.source)}">${escapeHtml(parts.source)}</a>` : escapeHtml(parts.source)),
      payload.exportedAt && escapeHtml(t('html.exportedAt', new Date(payload.exportedAt).toLocaleString(I18n.tag, {hour12:false}))), payload.version && `Chat &amp; Intelligent UI Exporter for ChatGPT ${escapeHtml(payload.version)}`].filter(Boolean).join(' · ');
    main.innerHTML = `<header class="doc-head"><h1>${escapeHtml(parts.title)}</h1><div class="doc-meta">${meta}</div></header>` + parts.sections.map(s => {
      // User prompts keep their line breaks and are not read as formulas, as on the page.
      const html = markdownHtml(s.md, {resolve, math:s.role !== 'user', breaks:s.role === 'user'});
      return s.role === 'user' ? `<section class="msg user"><div class="role">${escapeHtml(s.label)}</div><div class="bubble md">${html}</div></section>`
        : s.role === 'assistant' ? `<section class="msg assistant"><div class="role">${escapeHtml(s.label)}</div><div class="md">${html}</div></section>`
          : `<section class="msg notes"><div class="role">${escapeHtml(s.label)}</div><div class="md">${html}</div></section>`;
    }).join('');
    for (const md of main.querySelectorAll('.md')) {openCallouts(md);wrapBlocks(md);}
    // Local blobs load at once; an image that never does is reported, not waited for.
    await Promise.race([Promise.all([...main.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => {img.onload = img.onerror = r;}))), new Promise(r => win.setTimeout(r, 15000))]);
    await doc.fonts?.ready;
    const report = {cards:[], images:[], tables:[], links:[...main.querySelectorAll('a[href]')].map(a => a.getAttribute('href')), localLinks:main.querySelectorAll('.local-link').length};
    for (const img of main.querySelectorAll('img')) report.images.push({path:img.dataset.path, card:img.classList.contains('card-img'), ok:img.naturalWidth > 0});
    for (const wrap of main.querySelectorAll('.table-wrap')) report.tables.push(fitTable(wrap));
    // Where each image lands on paper, in a simple model of the printout: text flows on, an
    // image that does not fit the rest of a page moves to the next one. A tall card's first
    // slice fills the rest of its page when that is at least a quarter page.
    const origin = () => main.getBoundingClientRect().top + parseFloat(win.getComputedStyle(main).paddingTop || 0);
    let shift = 0;
    for (const img of [...main.querySelectorAll('img')]) {
      if (!img.isConnected) continue;
      const box = img.getBoundingClientRect(), y = box.top - origin() + shift, room = contentHeight - y % contentHeight;
      if (img.parentElement?.classList.contains('card') && !img.classList.contains('card-slice')) {
        const info = await sliceCard(img.parentElement, room >= contentHeight / 4 ? room - 6 : null);report.cards.push(info);
        if (info.slices.length > 1) {shift += room >= contentHeight / 4 ? 0 : room;continue;}
      }
      if (box.height > room && box.height <= contentHeight) shift += room;
    }
    report.height = Math.ceil(main.getBoundingClientRect().height);report.pagesEstimate = Math.max(1, Math.ceil(report.height / contentHeight));
    return report;
  }
  // A card taller than a page is cut into page-sized images, each cut at the row with the
  // least ink in the last third above the page end (usually a gap between lines of text).
  async function sliceCard(card, first = null) {
    const img = card.querySelector('img'), doc = card.ownerDocument, info = {path:img.dataset.path, width:img.naturalWidth, height:img.naturalHeight, slices:[]};
    if (!img.naturalWidth) return {...info, error:'image did not load'};
    const shown = img.getBoundingClientRect().width || Math.min(contentWidth, img.naturalWidth), k = img.naturalWidth / shown;
    const limit = Math.floor(sliceHeight * k), head = first ? Math.floor(first * k) : limit;
    if (img.naturalHeight <= Math.max(limit, head)) {info.slices.push(img.naturalHeight);return info;}
    const canvas = doc.createElement('canvas');canvas.width = img.naturalWidth;canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d', {willReadFrequently:true});g.drawImage(img, 0, 0);
    const cuts = [0], next = () => cuts.length === 1 ? head : limit;
    while (img.naturalHeight - cuts.at(-1) > next()) cuts.push(quietRow(g, img.naturalWidth, cuts.at(-1) + next(), Math.floor(next() / 3)));
    cuts.push(img.naturalHeight);
    const pieces = [];
    for (let i = 1; i < cuts.length; i++) {
      const h = cuts[i] - cuts[i - 1], piece = doc.createElement('canvas');piece.width = img.naturalWidth;piece.height = h;
      piece.getContext('2d').drawImage(canvas, 0, cuts[i - 1], img.naturalWidth, h, 0, 0, img.naturalWidth, h);
      const url = await new Promise(r => piece.toBlob(b => r(doc.defaultView.URL.createObjectURL(b)), 'image/png'));
      const part = doc.createElement('img');part.src = url;part.alt = t('pdf.slice', img.alt, i, cuts.length - 1);part.className = 'card-img card-slice';
      part.dataset.path = img.dataset.path;part.style.width = `${shown}px`;pieces.push(part);info.slices.push(h);
    }
    await Promise.all(pieces.map(p => p.decode().catch(() => {})));
    img.replaceWith(...pieces);
    return info;
  }
  // The row in [end - span, end] with the fewest pixels unlike the row's own background,
  // ignoring the outer 4% on each side (card borders); the lowest such row wins.
  function quietRow(g, width, end, span) {
    const top = Math.max(1, end - span), data = g.getImageData(0, top, width, end - top).data, from = Math.floor(width * 0.04), to = width - from;
    let best = end, bestInk = Infinity;
    for (let y = end - top - 1; y >= 0; y--) {
      const counts = new Map();let ink = 0;
      for (let x = from; x < to; x += 2) {const i = (y * width + x) * 4, key = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | data[i + 2] >> 4;counts.set(key, (counts.get(key) || 0) + 1);}
      let bg = 0, most = -1;for (const [key, n] of counts) if (n > most) {most = n;bg = key;}
      for (const [key, n] of counts) if (key !== bg) ink += n;
      if (ink < bestInk) {bestInk = ink;best = top + y;if (!ink) break;}
    }
    return best;
  }
  // A table wider than the page first breaks the long words (URLs, IDs) of its cells if it has
  // few columns, then gets a smaller font, then a landscape page, then smaller still and every
  // word may break.
  function fitTable(wrap) {
    const table = wrap.querySelector('table'), fits = () => table.getBoundingClientRect().width <= wrap.getBoundingClientRect().width + 0.5, result = {columns:table.rows[0]?.cells.length || 0, font:12, wide:false, fits:true};
    if (fits()) return result;
    if (result.columns <= 4) {
      for (const cell of table.querySelectorAll('th,td')) if (/\S{24,}/.test(cell.textContent)) cell.style.overflowWrap = 'anywhere';
      result.breakWords = 'long';if (fits()) return result;
    }
    for (const size of [11, 10, 9]) {table.style.fontSize = `${size}px`;result.font = size;if (fits()) return result;}
    wrap.classList.add('wide');result.wide = true;
    for (const size of [12, 11, 10, 9, 8]) {table.style.fontSize = `${size}px`;result.font = size;if (fits()) return result;}
    table.style.overflowWrap = 'anywhere';result.breakWords = 'all';result.fits = fits();
    return result;
  }
  // print.html runs in a hidden frame of the ChatGPT tab (window.parent is the panel's page): the
  // panel sends the export once this page says it is ready; the page prints it and says when the
  // print dialog has closed, so the panel removes the frame. Opened as a tab (window.opener), the
  // same exchange works and the page stays open with a button to print again.
  function boot(doc) {
    const win = doc.defaultView, bar = doc.getElementById('pdf-bar'), status = doc.getElementById('pdf-status'), button = doc.getElementById('pdf-print');
    const panel = win.parent !== win ? win.parent : win.opener, origins = ['https://chatgpt.com', 'https://chat.openai.com'];
    const say = text => {status.textContent = text;}, tell = message => {for (const origin of origins) try {panel.postMessage(message, origin);} catch {}};
    let received = false;button.onclick = () => win.print();
    // Until the export arrives (with its language), the page speaks the language of the settings.
    const words = () => {doc.documentElement.lang = I18n.tag;doc.title = t('pdf.title');button.textContent = t('pdf.print');};
    words();try {root.chrome?.storage?.local.get('language').then(v => {if (!received && v?.language) {I18n.setLocale(v.language);words();say(t(panel ? 'pdf.waiting' : 'pdf.standalone'));}}, () => {});} catch {}
    if (!panel) {bar.hidden = false;say(t('pdf.standalone'));return;}
    win.addEventListener('message', async event => {
      if (received || event.source !== panel || !origins.includes(event.origin) || event.data?.type !== 'pdf:document') return;
      received = true;if (event.data.locale) I18n.setLocale(event.data.locale);words();say(t('pdf.layingOut'));
      try {
        const report = await render(event.data, doc);
        button.disabled = false;
        say(t('pdf.ready', report.pagesEstimate));
        win.addEventListener('afterprint', () => {say(t('pdf.again'));tell({type:'pdf:done'});}, {once:true});
        setTimeout(() => win.print(), 100);
      } catch (e) {say(t('pdf.failed', e?.message || e));tell({type:'pdf:error', message:String(e?.message || e)});}
    });
    tell({type:'pdf:ready'});
    say(t('pdf.waiting'));bar.hidden = win.parent !== win;
  }
  const api = {PAGE, get PRINT_CSS() {return printCss();}, contentWidth, contentHeight, wideWidth, sliceHeight, MATH_BLOCK, MATH_INLINE, texHtml:tex, protectTablePipes, markdownHtml, splitDocument, wrapBlocks, render, boot};
  root.ChatExportPdf = api;
  if (typeof module !== 'undefined') module.exports = api;
  if (root.document?.getElementById?.('pdf-bar') && root.location?.protocol === 'chrome-extension:') boot(root.document);
})(globalThis);
