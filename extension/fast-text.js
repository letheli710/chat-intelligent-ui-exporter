(function(root) {
  'use strict';
  const I18n = root.ChatExportI18n || (typeof module !== 'undefined' ? require('./i18n.js') : null), t = I18n.t;
  const error = message => { throw Error(message); };
  // Uploaded and generated images point at the files service, e.g.
  // file-service://file-abc or sediment://file_abc.
  const fileIdOf = pointer => typeof pointer === 'string' ? pointer.match(/^(?:file-service|sediment):\/\/([\w-]+)$/)?.[1] || null : null;
  const fence = text => '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), m => m[0].length + 1)));
  function textOf(message, warnings) {
    const content = message.content || {};
    const fallback = message.metadata?.model_dil_v2?.fallbackMarkdown;
    if (content.content_type !== 'code' && typeof fallback === 'string' && fallback.trim()) {
      // Restore original code whitespace only when every nonblank code line is
      // identical. A different program in fallback is never guessed/replaced.
      const raw=(content.parts || []).filter(p=>typeof p==='string').join('\n');
      const blocks=[...raw.matchAll(/(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*(?=\n|$))/gm)].map(m=>m[0]);
      const sameLines=value=>value.split('\n').filter(line=>line.trim()).join('\n');
      return fallback.replace(/(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*(?=\n|$))/gm,block=>blocks.find(original=>sameLines(original)===sameLines(block)) || block);
    }
    if (['user_editable_context','model_editable_context'].includes(content.content_type)) return '';
    const parts = content.parts || (typeof content.text === 'string' ? [content.text] : []);
    const text = parts.map(part => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      const fileId = fileIdOf(part?.asset_pointer);
      if (fileId) return `![${t('md.image')}](asset:${fileId})`;
      warnings.push(`${message.id}: ${t('warn.nonText', part?.content_type || 'unknown')}`);
      return '';
    }).filter(Boolean).join('\n');
    if (!text && content.content_type && !['text','multimodal_text','code'].includes(content.content_type)) warnings.push(`${message.id}: ${t('warn.noText', content.content_type)}`);
    if (content.content_type === 'code' && text) return `${fence(text)}${/^[\w+-]+$/.test(content.language || '') ? content.language : ''}\n${text}\n${fence(text)}`;
    return text;
  }
  const cell = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/\r?\n/g,'<br>');
  // A raw HTML tag in ordinary prose ("<svg …>", "</details>", "<!-- … -->") shows as text on
  // the ChatGPT page; with escapeHtml its "<" becomes "&lt;" so a viewer shows it as text too.
  // Autolinks (<https://…>, <a@b.c>) are not tags and stay links.
  const rawHtml = /<(?=\/?[A-Za-z][\w-]*(?::[\w-]+)?(?:[\s/>]|$)|!)/g;
  function normalizeText(text, options = {}) {
    const uiReasons = new Set(); let needsTableUI = false;
    // Never rewrite literals, code examples, or equations while repairing prose.
    const protectedPattern = /(^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\2[ \t]*(?=\n|$))|(\\\[[\s\S]*?\\\])|(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$(?!\$)[^\n$]+\$)/gm;
    const prose = part => {
      const literals=[];
      part=part.replace(/(`+)([^`\n]*)\1/g,match=>`\u0000INLINE${literals.push(match)-1}\u0000`);
      if(options.escapeHtml)part=part.replace(rawHtml,'&lt;');
      part = part.replace(/\uE200genui\uE202([\s\S]*?)\uE201/g, (_, json) => {
        uiReasons.add('structured-ui');
        try {
          const payload=JSON.parse(json), chart=payload.charts_widget_v2?.content;
          if (chart && Array.isArray(chart.data) && Array.isArray(chart.series)) {
            const columns=[{dataKey:chart.xKey,label:chart.xKey},...chart.series];
            return `\n\n${chart.meta?.title || t('md.chart')}\n\n${chart.meta?.description || ''}\n\n| ${columns.map(c=>cell(c.label||c.dataKey)).join(' | ')} |\n| ${columns.map(()=>'---').join(' | ')} |\n${chart.data.map(row=>`| ${columns.map(c=>cell(row[c.dataKey]) + cell(c.valueSuffix||'')).join(' | ')} |`).join('\n')}\n\n> ${t('md.chartData')}\n`;
          }
          const lines=[];
          const walk=(value,path)=>{
            if (typeof value==='string' || typeof value==='number' || typeof value==='boolean') lines.push(t('md.field', cell(path), cell(value)));
            else if(value && typeof value==='object') for(const [key,item] of Object.entries(value)) walk(item,path ? `${path}.${key}` : key);
          };
          walk(payload,'');
          return `\n\n${lines.join('\n\n')}\n\n> ${t('md.structuredText')}\n`;
        } catch {
          return `\n\n> ${t('md.unparsed')}\n`;
        }
      });
      part = part.replace(/Current (?:selection|value) unavailable\./g, () => {
        uiReasons.add('live-state');return t('md.liveState');
      });
      part=part.replace(/\uE200([^\uE201]*?)\uE201/g, (_, marker) => {
        uiReasons.add('internal-marker');
        return t('md.internalMarker', cell(marker.split('\uE202')[0]));
      });
      part=part.replace(/\u0000INLINE(\d+)\u0000/g,(_,index)=>literals[Number(index)]);
      // Only repair actual table rows, leaving inline code elsewhere untouched.
      const lines=part.split('\n');let repaired=false;
      for(let i=0;i<lines.length;i++) {
        if(!/^\s*\|/.test(lines[i]))continue;
        lines[i]=lines[i].replace(/(`+)([^`\n]*\|[^`\n]*)\1/g,(_,ticks,literal)=>{
          repaired=true;needsTableUI=true;uiReasons.add('table-literal');return `<code>${cell(literal)}</code>`;
        });
        if(repaired && (i===lines.length-1 || !/^\s*\|/.test(lines[i+1]))) {
          lines[i]+=`\n\n> ${t('md.tableRepaired')}`;repaired=false;
        }
      }
      part=lines.join('\n');
      return part;
    };
    let md='',last=0;
    for(const match of text.matchAll(protectedPattern)) {
      md+=prose(text.slice(last,match.index))+match[0];last=match.index+match[0].length;
    }
    md+=prose(text.slice(last));
    return {md,needsUI:uiReasons.size>0,needsTableUI,uiReasons:[...uiReasons]};
  }
  // Plain-text replies mark citations, entities and images inline with private-use
  // markers (matched_text); content_references says what each one stands for.
  function applyReferences(text, refs) {
    if (!Array.isArray(refs) || !refs.length || typeof text !== 'string') return text;
    const url = u => String(u).replace(/[()\s<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
    const link = (label, u) => `[${String(label).replace(/([[\]])/g, '\\$1')}](${url(u)})`;
    const render = r => {
      const items = Array.isArray(r.items) ? r.items.filter(i => typeof i?.url === 'string') : [];
      if (items.length) return t('md.cite', items.map(i => link(i.attribution || i.title || i.url, i.url)).join(t('list.sep')));
      if (typeof r.alt === 'string' && r.alt.trim()) return r.alt;
      if (typeof r.name === 'string' && r.name.trim()) return r.name;
      return '';
    };
    // Longest markers first, so a marker that contains another is replaced whole.
    for (const r of refs.filter(r => typeof r?.matched_text === 'string' && r.matched_text.trim()).sort((a, b) => b.matched_text.length - a.matched_text.length)) text = text.split(r.matched_text).join(render(r));
    return text;
  }
  function toolImages(message) {
    const title = message.metadata?.image_gen_title, plots = message.metadata?.ada_visualizations;
    const parts = (message.content?.parts || []).filter(p => fileIdOf(p?.asset_pointer)).map(p => ({fileId:fileIdOf(p.asset_pointer), width:p.width, height:p.height, alt:title ? t('md.generatedNamed', title) : t('md.generated')}));
    const outputs = (message.metadata?.aggregate_result?.messages || []).filter(m => m?.message_type === 'image' && fileIdOf(m.image_url)).map((m, i) => ({fileId:fileIdOf(m.image_url), width:m.width, height:m.height, alt:plots?.[i]?.title ? t('md.plotNamed', plots[i].title) : t('md.plot')}));
    return [...parts, ...outputs].map(i => ({...i, alt:i.alt.replace(/[[\]\r\n]/g, ' ')}));
  }
  function records(messages) {
    const warnings = [], result = [], seen = new Set();
    for (const message of messages) {
      if (!message) continue;
      const role = message.author?.role;
      // Tool output is plumbing, except the images it shows in the conversation:
      // generated images and code-interpreter plots.
      if (role === 'tool') {
        if (message.metadata?.is_visually_hidden_from_conversation || !message.id || seen.has(message.id)) continue;
        const images = toolImages(message);
        // A DataFrame shown as a scrollable table is a CSV in the files service.
        const tables = (message.metadata?.ada_visualizations || []).filter(v => v?.type === 'table' && typeof v.file_id === 'string').map(v => ({fileId:v.file_id, title:String(v.title || t('md.tableDefault')).replace(/[[\]\r\n]/g, ' ').trim()}));
        if (!images.length && !tables.length) continue;
        seen.add(message.id);
        const md = [...tables.map(table => `[${t('md.dataTable', table.title)}](datatable:${table.fileId})`), ...images.map(i => `![${i.alt}](asset:${i.fileId})`)].join('\n\n');
        result.push({id:message.id, role:'assistant', md, needsUI:false, needsTableUI:false, uiReasons:[], needsAssets:false, images, tables, summary:[...tables.map(table => table.title), ...images.map(i => i.alt)].join(t('list.sep')).slice(0,100)});
        continue;
      }
      if (!['user','assistant'].includes(role) || message.metadata?.is_visually_hidden_from_conversation) continue;
      // Analysis/tool plumbing is not the displayed answer.
      if (message.channel && !['final','commentary'].includes(message.channel)) continue;
      if (message.recipient && message.recipient !== 'all') continue;
      if (!message.id || seen.has(message.id)) error(t('err.messageId'));
      seen.add(message.id);
      const text = textOf(message, warnings);
      const source = message.metadata?.model_dil_v2 ? text : applyReferences(text, message.metadata?.content_references);
      const normalized = normalizeText(source);
      // The same text with prose HTML escaped, for the generic Markdown profile (the panel picks one).
      normalized.mdEscaped = source.includes('<') ? normalizeText(source, {escapeHtml:true}).md : normalized.md;
      if (message.metadata?.model_dil_v2) {
        normalized.needsUI = true;
        if(!normalized.uiReasons.includes('model-dil'))normalized.uiReasons.push('model-dil');
      }
      // Files-service images are downloaded by id; only other images need the page.
      const images = (message.content?.parts || []).filter(p=>fileIdOf(p?.asset_pointer)).map(p=>({fileId:fileIdOf(p.asset_pointer),width:p.width,height:p.height}));
      const needsAssets = (message.content?.parts || []).some(p=>p && typeof p==='object' && (p.content_type==='image_asset_pointer' || p.asset_pointer) && !fileIdOf(p.asset_pointer)) || /!\[[^\]]*\]\((?!asset:)/.test(normalized.md);
      normalized.needsAssets = needsAssets;normalized.images = images;
      // Files the user attached (a PDF, a CSV…) show as chips above the prompt and are not in
      // the parts; they download by id like images and are linked first.
      normalized.attachments = role === 'user' ? (message.metadata?.attachments || []).filter(a => typeof a?.id === 'string' && !images.some(i => i.fileId === a.id)).map(a => ({fileId:a.id, name:String(a.name || a.id).split('/').pop(), mime:a.mime_type, size:a.size})) : [];
      if (normalized.attachments.length) {
        const chips = normalized.attachments.map(a => t('md.attachment', `[${a.name.replace(/([\\[\]])/g, '\\$1')}](attachment:${a.fileId})`)).join('\n\n');
        normalized.md = `${chips}\n\n${normalized.md}`;normalized.mdEscaped = `${chips}\n\n${normalized.mdEscaped}`;
      }
      if (message.metadata?.model_dil_v2) {
        // Keep everything needed to re-render the UI: the model-authored DIL
        // source, the compiled program, and embedded widgets (AppBlocks).
        normalized.dil = message.metadata.model_dil_v2;
        normalized.dilSource = (message.content?.parts || []).filter(p=>typeof p==='string').join('\n');
        normalized.contentReferences = message.metadata.content_references || [];
      }
      const md = normalized.md || (needsAssets ? `> ${t('md.needsImages')}` : '');
      // The time and model are shown in the sidebar and, when asked, written into the Markdown.
      if (md.trim()) result.push({id:message.id, role, ...normalized, createTime:Number.isFinite(message.create_time) ? message.create_time : undefined, model:role === 'assistant' ? message.metadata?.model_slug : undefined, summary:md.replace(/\s+/g,' ').slice(0,100)});
    }
    if (!result.length) error(t('err.nothingToExport'));
    return {messages:result,warnings};
  }
  function parseTree(data, leafId) {
    const map = data.mapping;
    if (!map || typeof map !== 'object') error(t('err.treeFormat'));
    // A DOM message id may differ from the mapping node id.
    const candidate = leafId && (map[leafId] ? leafId : Object.keys(map).find(key => map[key].message?.id === leafId));
    let selectedLeaf = candidate || data.current_node;
    // DOM may expose an older ancestor because later messages are virtualized.
    if (candidate && data.current_node) {
      let at = data.current_node;const visited = new Set();
      while (at && map[at] && !visited.has(at)) {
        if (at === candidate) {selectedLeaf=data.current_node;break;}
        visited.add(at);at=map[at].parent;
      }
    }
    // For an alternate visible branch, finish its unambiguous descendant chain.
    const descendants=new Set();
    while (map[selectedLeaf]?.children?.length) {
      if(descendants.has(selectedLeaf))error(t('err.branchLoop'));
      descendants.add(selectedLeaf);
      const children=map[selectedLeaf].children;
      if(children.length!==1)error(t('err.manyBranches'));
      selectedLeaf=children[0];
    }
    let cursor = selectedLeaf;
    if (!cursor || !map[cursor]) error(t('err.noBranch'));
    const reversed = [], seen = new Set();
    while (cursor != null) {
      if (seen.has(cursor) || !map[cursor]) error(t('err.treeBroken'));
      seen.add(cursor); const node = map[cursor];
      if (node.message) reversed.push(node.message);
      cursor = node.parent;
    }
    return {...records(reversed.reverse()), title:data.title || 'ChatGPT', branch:selectedLeaf};
  }
  async function loadConversation({id,share=false,leafId,fetch:request,signal,onProgress}) {
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) error(t('err.openChat'));
    async function get(path, headers = {}) {
      signal?.throwIfAborted();
      const response = await request(path,{credentials:'same-origin',headers,signal});
      return response;
    }
    const sessionResponse = await get('/api/auth/session');
    if (!sessionResponse.ok && !share) error(t('err.sessionRetry', sessionResponse.status));
    const session = sessionResponse.ok ? await sessionResponse.json() : {};
    if (!session.accessToken && !share) error(t('err.login'));
    const headers = session.accessToken ? {Authorization:`Bearer ${session.accessToken}`} : {};
    // A shared link is a snapshot with its own id; files belong to the conversation behind it.
    if (share) {
      const response = await get(`/backend-api/share/${encodeURIComponent(id)}`, headers);
      if (!response.ok) error(response.status === 401 && !session.accessToken ? t('err.shareLogin') : t('err.shareFailed', response.status));
      const shared = await response.json();
      if (!shared.mapping) error(t('err.shareFormat'));
      return {...parseTree(shared,leafId),pages:1,source:'share',conversationId:shared.backing_conversation_id || null,raw:shared};
    }
    // Keep credentials only in this request closure; never return/store/log them.
    const legacy = await get(`/backend-api/conversation/${encodeURIComponent(id)}`, headers);
    let data, pages = 1;
    if (legacy.ok) {
      data = await legacy.json();
      if (data.conversation_id && data.conversation_id !== id) error(t('err.otherChat'));
      if (data.mapping) return {...parseTree(data,leafId),pages,source:'conversation-tree',raw:data};
      error(t('err.chatFormat'));
    }
    if (legacy.status !== 404) error(t('err.chatFailed', legacy.status));
    let cursor = null, collected = [], title = '', seenCursors = new Set(), rawPages = [];
    do {
      const suffix = cursor ? `&before=${encodeURIComponent(cursor)}` : '';
      const response = await get(`/backend-api/conversations/${encodeURIComponent(id)}?include_has_versions=true&num_turns=100${suffix}`,headers);
      if (!response.ok) error(t('err.historyFailed', response.status));
      data = await response.json();
      if (data.conversation_id && data.conversation_id !== id) error(t('err.otherChat'));
      if (data.mapping && !cursor) return {...parseTree(data,leafId),pages,source:'conversation-tree',raw:data};
      rawPages.unshift(data);
      if (!Array.isArray(data.messages) || !data.page_info) error(t('err.pageFormat'));
      title ||= data.title || 'ChatGPT';
      collected = [...data.messages.map(item => item.message || item),...collected];
      onProgress?.({pages,messages:collected.length});
      if (!data.page_info.has_previous_page) break;
      cursor = data.page_info.start_cursor;
      if (!cursor || seenCursors.has(cursor) || pages >= 1000) error(t('err.pageCursor'));
      seenCursors.add(cursor); pages++;
    } while (true);
    // API pages are chronological, with older pages prepended. Deduplicate overlaps.
    const unique = [], byId = new Map();
    for (const message of collected) {
      if (!message.id) error(t('err.pageMessageId'));
      if (byId.has(message.id)) {
        if (JSON.stringify(byId.get(message.id)) !== JSON.stringify(message)) error(t('err.pageChanged'));
      } else {byId.set(message.id,message);unique.push(message);}
    }
    if(unique.every(m=>Number.isFinite(m.create_time))) unique.sort((a,b)=>a.create_time-b.create_time);
    return {...records(unique),title,pages,source:'paginated-conversation',raw:{pages:rawPages}};
  }
  const extensionOf = type => ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg'})[String(type || '').split(';')[0].trim()] || 'bin';
  // Some file URLs answer without a content type (e.g. code-interpreter plots).
  async function sniffImage(blob) {
    try {
      const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer()), ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
      if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
      if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
      if (ascii(0, 4) === 'GIF8') return 'gif';
      if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
    } catch {}
    return 'bin';
  }
  async function pool(items, limit, worker) {
    const results = new Array(items.length);let next = 0;
    await Promise.all(Array.from({length:Math.min(limit,items.length)}, async () => {
      while (next < items.length) {const index = next++;results[index] = await worker(items[index], index);}
    }));
    return results;
  }
  // Downloads original images through the files API, in parallel and without
  // touching the page. Failures are returned per item so the caller can fall back.
  async function downloadFiles({ids, conversationId, fetch:request, signal, concurrency = 6, onProgress}) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const sessionResponse = await request('/api/auth/session',{credentials:'same-origin',signal});
    if (!sessionResponse.ok) error(t('err.session', sessionResponse.status));
    const token = (await sessionResponse.json()).accessToken;
    if (!token) error(t('err.login'));
    const headers = {Authorization:`Bearer ${token}`};
    let done = 0;
    return pool(unique, concurrency, async fileId => {
      try {
        signal?.throwIfAborted();
        const query = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}&inline=false` : '';
        let meta = await request(`/backend-api/files/download/${encodeURIComponent(fileId)}${query}`,{credentials:'same-origin',headers,signal});
        if (meta.status === 404) meta = await request(`/backend-api/files/${encodeURIComponent(fileId)}/download`,{credentials:'same-origin',headers,signal});
        if (!meta.ok) throw Error(`HTTP ${meta.status}`);
        const url = (await meta.json()).download_url;
        if (typeof url !== 'string' || !url) throw Error(t('err.noDownloadUrl'));
        const sameOrigin = url.startsWith('/') || url.startsWith(root.location?.origin + '/');
        const file = await request(url,{credentials:sameOrigin ? 'include' : 'omit',signal});
        if (!file.ok) throw Error(t('err.downloadHttp', file.status));
        const blob = await file.blob();
        let ext = extensionOf(blob.type || file.headers?.get?.('content-type'));
        if (ext === 'bin') ext = await sniffImage(blob);
        return {fileId, blob, path:`assets/${fileId}.${ext}`};
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        return {fileId, error:e.message};
      } finally {onProgress?.({done:++done,total:unique.length});}
    });
  }
  // Image URLs the server resolved into Intelligent UI data (AsyncImage etc.).
  function dilImageUrls(dil) {
    const urls = new Set();
    const walk = (value, key) => {
      if (typeof value === 'string') {if (/^https:\/\//.test(value) && /image|img|src|thumb|photo|logo|icon|url/i.test(key || ''))urls.add(value);}
      else if (Array.isArray(value)) value.forEach(item => walk(item, key));
      else if (value && typeof value === 'object') for (const [k, item] of Object.entries(value)) walk(item, k);
    };
    // Server-resolved components: only search images are images (content_url);
    // links, citations and entities point at web pages.
    const results = dil?.appData?.opGenui?.componentResults || {};
    for (const r of Object.values(results)) if (/^AsyncImage/.test(r?.componentName || '')) for (const i of r.state?.images || []) if (typeof i?.content_url === 'string' && /^https:\/\//.test(i.content_url)) urls.add(i.content_url);
    const appData = dil?.appData?.opGenui ? {...dil.appData, opGenui:{...dil.appData.opGenui, modelDataBindings:undefined, modelDataBindingSafeUrls:undefined, componentResults:undefined}} : dil?.appData;
    walk(appData, '');walk(dil?.constants, '');
    return [...urls];
  }
  // The first rows of a CSV as a Markdown table (a DataFrame preview); rows counts all data rows.
  function csvTable(text, limit = 10) {
    const rows = [];let row = [], value = '', quoted = false;
    const s = String(text).replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {if (c === '"' && s[i + 1] === '"') {value += '"';i++;} else if (c === '"') quoted = false; else value += c;}
      else if (c === '"' && value === '') quoted = true;
      else if (c === ',') {row.push(value);value = '';}
      else if (c === '\n' || c === '\r') {if (c === '\r' && s[i + 1] === '\n') i++;row.push(value);rows.push(row);row = [];value = '';}
      else value += c;
    }
    if (value !== '' || row.length) {row.push(value);rows.push(row);}
    const [head, ...body] = rows.filter(r => r.some(v => v !== ''));
    if (!head) return {md:'', rows:0, cols:0};
    const esc = v => cell(v).replace(/[\\*`$[\]_~]/g, '\\$&') || ' ';
    const line = r => `| ${head.map((_, k) => esc(r[k])).join(' | ')} |`;
    return {md:[line(head), `| ${head.map(() => '---').join(' | ')} |`, ...body.slice(0, limit).map(line)].join('\n'), rows:body.length, cols:head.length};
  }
  // Files the code interpreter wrote (sandbox:/mnt/data/...), linked from a message.
  async function downloadSandboxFiles({items, conversationId, fetch:request, signal, concurrency = 4, cached = new Map()}) {
    if (!items.length) return [];
    const sessionResponse = await request('/api/auth/session',{credentials:'same-origin',signal});
    if (!sessionResponse.ok) error(t('err.session', sessionResponse.status));
    const token = (await sessionResponse.json()).accessToken;
    if (!token) error(t('err.login'));
    const headers = {Authorization:`Bearer ${token}`}, names = new Set();
    return pool(items, concurrency, async ({messageId, path}) => {
      try {
        signal?.throwIfAborted();
        // Charts a card shows were already downloaded to draw the card.
        const blob = cached.get(`${messageId}\n${path}`) || await (async () => {
          const meta = await request(`/backend-api/conversation/${encodeURIComponent(conversationId)}/interpreter/download?message_id=${encodeURIComponent(messageId)}&sandbox_path=${encodeURIComponent(path)}`,{credentials:'same-origin',headers,signal});
          if (!meta.ok) throw Error(`HTTP ${meta.status}`);
          const url = (await meta.json()).download_url;
          if (typeof url !== 'string' || !url) throw Error(t('err.noDownloadUrl'));
          const sameOrigin = url.startsWith('/') || url.startsWith(root.location?.origin + '/');
          const file = await request(url,{credentials:sameOrigin ? 'include' : 'omit',signal});
          if (!file.ok) throw Error(t('err.downloadHttp', file.status));
          return file.blob();
        })();
        let name = (path.split('/').pop() || 'file').replace(/[^\p{L}\p{N}_.\-]/gu, '_'), n = 1;
        while (names.has(name)) name = name.replace(/(\.[^.]*)?$/, m => `-${++n}${m}`);
        names.add(name);
        return {messageId, path, blob, localPath:`files/${name}`};
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        return {messageId, path, error:e.message};
      }
    });
  }
  // fetchImage (optional) downloads hosts the page cannot reach cross-origin.
  async function downloadUrls({urls, fetch:request, fetchImage, signal, concurrency = 6, prefix = 'assets/ui-'}) {
    return pool(urls, concurrency, async (url, index) => {
      try {
        signal?.throwIfAborted();
        let blob, type;
        if (fetchImage && /^https:\/\/images\.openai\.com\//.test(url)) {blob = await fetchImage(url);type = blob.type;}
        else {
          const file = await request(url,{credentials:'omit',signal});
          if (!file.ok) throw Error(`HTTP ${file.status}`);
          blob = await file.blob();type = blob.type || file.headers?.get?.('content-type');
        }
        let ext = extensionOf(type);
        if (ext === 'bin') ext = await sniffImage(blob);
        return {url, blob, path:`${prefix}${index + 1}.${ext}`};
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        return {url, error:e.message};
      }
    });
  }
  // Runs fn on each line outside fenced code and $$ math blocks, including those
  // inside a quote (a card's folded text).
  function proseLines(md, fn) {
    let fence = null, math = false;
    return md.split('\n').map(line => {
      const inner = line.replace(/^(?:[ \t]*>[ \t]?)+/, ''), open = inner.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !inner.trim().slice(open[1].length).trim()) fence = null;return line;}
      if (open) {fence = open[1];return line;}
      if (/^\s*\$\$\s*$/.test(inner)) {math = !math;return line;}
      return math ? line : fn(line);
    }).join('\n');
  }
  // The document uses # for its title and ## per message, so headings inside a
  // message start at ### (capped at ######) and the outline stays in order.
  const demoteHeadings = md => proseLines(md, line => line.replace(/^(#{1,6})(?=\s)/, h => '#'.repeat(Math.min(6, h.length + 2))));
  // ChatGPT tags every link it cites with ?utm_source=chatgpt.com; the archive keeps the plain address.
  const stripTracking = md => proseLines(md, line => line.replace(/\?utm_source=chatgpt\.com&/g, '?').replace(/[?&]utm_source=chatgpt\.com(?![\w%.~-])/g, ''));
  const pad = n => String(n).padStart(2, '0');
  const stamp = seconds => {const d = new Date(seconds * 1000);return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  // Obsidian properties at the top of the file instead of the source line (the panel's Markdown settings).
  function properties(conversation, selected, url, {model = true, created}) {
    const models = conversation.messages.filter(m => selected.has(m.id) && m.model).map(m => m.model);
    const used = models.sort((a, b) => models.filter(x => x === b).length - models.filter(x => x === a).length)[0];
    const lines = ['---', `title: ${JSON.stringify(conversation.title.replace(/\s+/g,' ').trim())}`, `source: ${JSON.stringify(url)}`];
    if (Number.isFinite(created)) lines.push(`created: ${new Date(created * 1000).toISOString()}`);
    if (model && used) lines.push(`model: ${JSON.stringify(used)}`);
    lines.push('tags:', '  - chatgpt', '---');
    return lines.join('\n');
  }
  // options: yaml (properties instead of the source line), model, timestamps, roles {user, assistant}, created (seconds).
  // The fixed words (the source line, the role names left empty, the notes heading) are in the language picked.
  function markdown(conversation, ids, url, options = {}) {
    const {yaml = false, timestamps = false, roles = {}} = options;
    const name = role => role === 'user' ? roles.user || t('md.roleUser') : roles.assistant || 'ChatGPT';
    const selected = new Set(ids);
    // One answer can arrive as several messages (a note before a tool call, the tool's
    // image, the final text); consecutive messages of one role form one section.
    let body = '', last = null;
    for (const m of conversation.messages.filter(m => selected.has(m.id))) {
      const md = stripTracking(demoteHeadings(m.md));
      const time = timestamps && Number.isFinite(m.createTime) ? ` · ${stamp(m.createTime)}` : '';
      body += m.role === last ? `\n\n${md}` : `${last ? '\n\n---\n\n' : ''}## ${name(m.role)}${time}\n\n${md}`;
      last = m.role;
    }
    if (!body) error(t('err.selectOne'));
    const warnings=(conversation.warnings||[]).filter(w=>[...selected].some(id=>w.startsWith(`${id}:`)));
    const note=warnings.length ? `\n\n## ${t('md.notes')}\n\n${warnings.map(w=>`- ${w}`).join('\n')}\n` : '';
    const title = `# ${conversation.title.replace(/\s+/g,' ').trim()}`;
    return `${yaml ? `${properties(conversation, selected, url, options)}\n\n${title}` : `${title}\n\n${t('md.source', url)}`}\n\n${body}\n${note}`;
  }
  const api = {fileIdOf,textOf,normalizeText,applyReferences,toolImages,records,parseTree,loadConversation,downloadFiles,downloadSandboxFiles,dilImageUrls,downloadUrls,csvTable,markdown};
  root.FastTextExporter = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
