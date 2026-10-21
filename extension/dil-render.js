(function dilRenderModule(root) {
  'use strict';
  // Static rendering of Intelligent UI (model_dil_v2.code) at its default state.
  // The compiled code is only executed inside the extension sandbox page;
  // this module builds the stub runtime and turns the element tree into Markdown.
  // The words: from i18n.js in the extension and its sandbox; in an exported page (where this
  // file runs again) from the page, which carries them in the language of the export (pageText).
  let pageWords = null;
  function t(key, ...args) {
    if (root.ChatExportI18n) return root.ChatExportI18n.t(key, ...args);
    const entry = pageWords?.words?.[key];
    if (entry == null) return key;
    let text = entry;
    if (typeof entry === 'object') {let form = 'other';try {form = new Intl.PluralRules(pageWords.tag).select(args.find(a => typeof a === 'number') ?? 0);} catch {}text = entry[form] ?? entry.other;}
    return String(text).replace(/\{(\d+)\}/g, (x, i) => args[i] === undefined ? x : String(args[i]));
  }
  const fonts = () => root.ChatExportI18n?.cjkFonts() || pageWords?.fonts || '"PingFang SC","Microsoft YaHei"';
  // Everything an exported page needs to draw its cards in the language of the export.
  const pageText = () => {const I18n = root.ChatExportI18n;return I18n ? {tag:I18n.tag, fonts:I18n.cjkFonts(), words:I18n.subset('dil.')} : pageWords;};
  const noop = () => {};
  const inert = () => new Proxy(noop, {get:(_, key) => key === Symbol.toPrimitive ? () => '' : inert(), apply:() => undefined});
  const plain = value => {
    if (value == null || ['string','number','boolean'].includes(typeof value)) return value;
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    try {return JSON.parse(JSON.stringify(value));} catch {return undefined;}
  };
  // execute(code, scope) runs the compiled program with the given globals.
  // overrides: state key -> value to start from instead of the default.
  // states: when given, receives each state's key and default value.
  // live (HTML export only): {get(key, default), set(key, next), handlers:[], refs:[]}. States
  // then read and write that store, and event props (onChange, onClick) are kept as numbers
  // (props.__on) into live.handlers, so the tree stays plain data. Without it nothing changes.
  function evaluate(dil, execute, {overrides = {}, states = null, live = null} = {}) {
    if (typeof dil?.code !== 'string' || !dil.code) throw Error(t('dil.noCode'));
    let stateIndex = 0, refIndex = 0;
    const Fragment = 'Fragment';
    const jsx = (type, props, ...children) => {
      const all = {...(props || {})};
      if (typeof type === 'function') return type({...all, children});
      const out = {type:String(type), props:{}, children:children.flat(Infinity)};
      for (const [key, value] of Object.entries(all)) {
        if (live && typeof value === 'function' && /^on[A-Z]/.test(key)) {(out.props.__on ||= {})[key] = live.handlers.push(value) - 1;continue;}
        const v = plain(value);if (v !== undefined) out.props[key] = v;
      }
      return out;
    };
    let tree = null;
    const known = {
      render:value => { tree = value; },
      // The compiler gives each state a stable key: DIL.useState(false, {key:"expanded"}).
      useState:(initial, options) => {
        const key = typeof options?.key === 'string' ? options.key : `#${stateIndex}`, value = typeof initial === 'function' ? initial() : initial;stateIndex++;
        states?.push({key, value});
        if (live) return [live.get(key, value), next => live.set(key, next)];
        return [Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : value, noop];
      },
      useConstants:() => dil.constants || {},
      useAppData:select => typeof select === 'function' ? select(dil.appData || {}) : dil.appData || {},
      useMemo:fn => fn(), useCallback:fn => fn, useRef:value => live ? (live.refs[refIndex++] ||= {current:value}) : {current:value}, useEffect:noop, useLayoutEffect:noop
    };
    // Hooks this stub does not know yet still run instead of throwing.
    const DIL = new Proxy(known, {get:(target, key) => key in target ? target[key] : inert()});
    // Server-resolved components (links, citations) carry their result in
    // appData.opGenui.componentResults, keyed by __resolutionId.
    const resolved = id => dil.appData?.opGenui?.componentResults?.[id]?.state || {};
    const components = {
      // Link text: what the model wrote between the tags, else its title, else the resolved page title.
      Link:props => {const s = resolved(props.__resolutionId), url = s.url || props.url, kids = [].concat(props.children ?? []).filter(c => c != null && c !== false && c !== ''), label = kids.length ? kids : [String(props.title || s.title || url || '')];return typeof url === 'string' && url ? {type:'link', props:{url}, children:label} : {type:'Fragment', props:{}, children:label};},
      Cite:props => ({type:'cite', props:{items:(Array.isArray(resolved(props.__resolutionId).items) ? resolved(props.__resolutionId).items : []).filter(i => typeof i?.url === 'string').map(i => ({url:i.url, label:String(i.source_label || i.title || i.url)}))}, children:[]}),
      // Inline names that open a detail panel: the name is part of the sentence.
      Entity:props => String(resolved(props.__resolutionId).value ?? props.value ?? ''),
      AsyncImage:props => images(props, 1),
      AsyncImageGroup:props => images(props, 8),
      FileCite:props => {const s = resolved(props.__resolutionId), name = s.file_name || props.file_name;return name ? {type:'cite', props:{items:[], file:String(name)}, children:[]} : '';},
      MemoryCite:() => '',
      LearningQuiz:props => quiz(props, resolved(props.__resolutionId)),
      Rating:props => rating(resolved(props.__resolutionId), props.data)
    };
    // A business rating (Yelp): stars, review count and the provider, as in a map's place list.
    // The bound data is only a type marker ({$type:"business_rating"}); the numbers come resolved.
    function rating(s, data) {
      const d = data && typeof data === 'object' ? data : {};
      const score = str(s.rating_label) || (num(d.rating) ? String(d.rating) : '');
      if (!score) return '';
      const count = str(s.review_count_label).replace(/^[(（]\s*(.*?)\s*[)）]$/, '$1') || (num(d.review_count) ? String(d.review_count) : '');
      const a = s.attribution && typeof s.attribution === 'object' ? s.attribution : {}, by = str(a.provider_label), url = str(a.provider_url);
      const source = by ? [count ? '· ' : ' · ', /^https?:\/\//.test(url) ? {type:'link', props:{href:url}, children:[by]} : by] : [];
      return {type:'text', props:{size:'sm'}, children:[`★${score}${count ? t('dil.reviews', count) : ''}`, ...source]};
    }
    // Search images: the server resolved them to content URLs.
    function images(props, max) {
      const list = (Array.isArray(resolved(props.__resolutionId).images) ? resolved(props.__resolutionId).images : []).filter(i => typeof i?.content_url === 'string').slice(0, max);
      const s = resolved(props.__resolutionId), ratio = String(s.frame_aspect_ratio || s.aspect_ratio || props.aspectRatio || '4:3'), width = s.frame_max_width || s.item_width || props.maxWidth || '180px';
      const nodes = list.map(i => ({type:'image', props:{src:i.content_url, href:typeof i.url === 'string' ? i.url : '', alt:String(i.title || props.query || props.alt || t('dil.image')), width, ratio}, children:[]}));
      // A group is a row of thumbnails in ChatGPT, not a stack of full-width pictures.
      // With no image found ChatGPT shows the fallback (<AsyncImage fallback={<text>…</text>}/>).
      return nodes.length > 1 ? {type:'image-group', props:{}, children:nodes} : nodes[0] || (props.fallback && typeof props.fallback === 'object' || typeof props.fallback === 'string' ? props.fallback : '');
    }
    function quiz(props, state) {
      const questions = Array.isArray(state.questions) ? state.questions : Array.isArray(props.questions) ? props.questions : [];
      const kids = [];
      if (props.title || state.title) kids.push({type:'title', props:{size:'md'}, children:[String(props.title || state.title)]});
      questions.forEach((q, n) => {
        const options = Array.isArray(q?.options) ? q.options : [], correct = new Set([].concat(q?.correct_values || []).map(String));
        kids.push({type:'text', props:{weight:'semibold'}, children:[`${n + 1}. ${q?.prompt ?? ''}`]});
        kids.push({type:'radio-group', props:{}, children:options.map(o => ({type:'radio', props:{value:String(o?.value ?? '')}, children:[`${o?.value ? `${o.value}. ` : ''}${o?.label ?? ''}`]}))});
        const right = options.filter(o => correct.has(String(o?.value)));
        if (right.length) kids.push({type:'caption', props:{}, children:[t('dil.answer', right.map(o => o.value ?? o.label).join(t('dil.sep'))) + (right[0]?.feedback ? t('dil.feedback', right[0].feedback) : '')]});
      });
      return {type:'card', props:{}, children:kids};
    }
    const scope = {DIL, __dil:{jsx, Fragment}, GenUI:live?.genui || inert(), ...components};
    // Other required components render their children; childless ones keep their main text.
    const summary = props => ['title','label','text','value','summary','role_summary','name','query'].map(k => props[k]).find(v => typeof v === 'string' && v.trim());
    for (const name of [].concat(dil.requiredComponents || [])) if (typeof name === 'string' && /^[A-Z][\w$]*$/.test(name) && !(name in scope)) scope[name] = props => {const kids = [].concat(props.children ?? []).filter(c => c != null && c !== false);return kids.length ? {type:'Fragment', props:{}, children:kids} : summary(props) ? {type:'text', props:{}, children:[t('dil.component', name, summary(props))]} : '';};
    execute(dil.code, scope);
    if (!tree) throw Error(t('dil.noRender'));
    return resolveWidgets(plain(tree), dil);
  }
  // Code blocks and some charts are client-defined widgets whose content lives
  // in content_references (linked by clientDefinedWidgets[id].refIndex).
  // AppBlocks stay as widget nodes; they are exported as standalone HTML.
  function widgetNode(invocationId, dil) {
    const ref = (Array.isArray(dil?.contentReferences) ? dil.contentReferences : [])[dil?.clientDefinedWidgets?.[invocationId]?.refIndex];
    const data = ref?.data, kind = data?.widget_type || ref?.category;
    if (kind === 'code_block' && typeof data?.content === 'string') return {type:'code-block', props:{language:typeof data.language === 'string' ? data.language : '', value:data.content}, children:[]};
    // Learning blocks show a formula as an interactive explainer; keep the formula and its description.
    if (ref?.category === 'learning_block' && typeof data?.content === 'string') {
      const about = String(ref.matched_text || '').split('\n')[0].trim();
      return {type:'Fragment', props:{}, children:[{type:'math', props:{block:true, value:data.content}, children:[]}, ...(about ? [{type:'caption', props:{}, children:[about]}] : [])]};
    }
    // Writing blocks (the document view that replaced Canvas) hold Markdown.
    if (kind === 'writing_block' && typeof data?.content === 'string') return {type:'writing-block', props:{value:data.content, variant:typeof data.variant === 'string' ? data.variant : ''}, children:[]};
    // Maps pin places (Yelp-backed entities); the exported note keeps them as a place list.
    if (ref?.category === 'map' && Array.isArray(data?.points)) return mapNode(data.points, dil.clientDefinedWidgets[invocationId].refIndex);
    if ((ref?.category === 'visualization' || kind === 'visualization') && data?.content && typeof data.content === 'object') {
      const c = data.content, pie = c.chartType === 'pie', kids = [];
      if (c.meta?.title) kids.push({type:'text', props:{weight:'semibold'}, children:[String(c.meta.title)]});
      if (c.meta?.description) kids.push({type:'text', props:{size:'sm', color:'secondary'}, children:[String(c.meta.description)]});
      kids.push({type:pie ? 'pie-chart' : 'chart', props:{data:c.data, series:c.series, xAxis:pie ? c.nameKey || c.xKey : {dataKey:c.xKey}, showDots:c.chartType === 'line', height:280}, children:[]});
      if (c.meta?.footer) kids.push({type:'text', props:{size:'sm', color:'tertiary'}, children:[String(c.meta.footer)]});
      return {type:'box', props:{border:true, radius:'xl', padding:3, gap:2}, children:kids};
    }
    return null;
  }
  const str = v => typeof v === 'string' && v.trim() ? v.trim() : '', num = v => typeof v === 'number' && Number.isFinite(v);
  // The facts a map shows for one pinned place.
  function placeOf(p) {
    const e = p.entity && typeof p.entity === 'object' ? p.entity : {};
    const lat = num(p.latitude) ? p.latitude : e.latitude, lng = num(p.longitude) ? p.longitude : e.longitude;
    return {name:str(p.name) || str(e.name) || t('dil.unnamedPlace'), href:[e.website_url, e.provider_url].find(u => /^https?:\/\//.test(str(u))) || '',
      category:str(p.category) || str(e.categories?.[0]), address:str(p.address) || str(e.address), description:str(p.description) || str(e.description),
      rating:num(e.rating) ? `★${e.rating}${num(e.rating_scale) && e.rating_scale !== 5 ? `/${e.rating_scale}` : ''}${num(e.review_count) ? t('dil.reviews', e.review_count) : ''}` : '',
      map:num(lat) && num(lng) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : '', lat:num(lat) ? lat : null, lng:num(lng) ? lng : null};
  }
  // The map picture (copied from the page by the panel; "map:<refIndex>" until then),
  // then the same places as a linked list with their facts.
  function mapNode(points, refIndex) {
    const places = points.filter(p => p && typeof p === 'object').map(placeOf);
    if (!places.length) return null;
    const picture = [{type:'map-image', props:{refIndex, count:places.length}, children:[]}];
    const items = places.map(pl => {
      const lines = [{type:'text', props:{}, children:[{type:'bold', props:{}, children:[pl.href ? {type:'link', props:{href:pl.href}, children:[pl.name]} : pl.name]}, ...[pl.category, pl.rating].filter(Boolean).map(f => ` · ${f}`)]}];
      if (pl.address || pl.map) lines.push({type:'text', props:{}, children:[pl.address, ...(pl.map ? [pl.address ? ' · ' : '', {type:'link', props:{href:pl.map}, children:[t('dil.map')]}] : [])]});
      if (pl.description) lines.push({type:'text', props:{}, children:[pl.description]});
      return {type:'list-item', props:{}, children:lines};
    });
    return {type:'Fragment', props:{}, children:[{type:'text', props:{}, children:[`📍 ${t('dil.mapPlaces', places.length)}`]}, ...picture, {type:'list', props:{}, children:items}]};
  }
  function resolveWidgets(node, dil) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => resolveWidgets(n, dil));
    if (node.type === '__chatgptClientDefinedWidget') return widgetNode(node.props?.invocationId, dil) || node;
    return {...node, children:(node.children || []).map(n => resolveWidgets(n, dil))};
  }
  // Markdown-native constructs stay text; everything else is UI drawn as an image.
  const inlineTypes = new Set(['bold','italic','code','link','strike','strikethrough','math','badge','icon','cite','input','textarea','favicon','label']);
  const textOf = node => node == null || node === false || node === true ? '' : typeof node !== 'object' ? String(node) : Array.isArray(node) ? node.map(textOf).join('') : textOf(node.children);
  const isInlineNode = node => node != null && (typeof node !== 'object' || (!Array.isArray(node) && inlineTypes.has(node.type) && !(node.type === 'math' && node.props?.block)));
  const UI_CONTAINERS = new Set(['box','card','row','grid','grid-item']);
  const headingLevel = {'3xl':1, '2xl':1, xl:1, lg:2, md:3, sm:4, xs:5};
  const optionLabel = (options, value) => {const hit = (Array.isArray(options) ? options : []).find(o => (o && typeof o === 'object' ? o.value : o) === value);return hit && typeof hit === 'object' ? hit.label ?? hit.value : hit ?? value ?? '';};
  const formatNumber = value => typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value ?? '');
  function chartModel(p, pie) {
    const rows = Array.isArray(p.data) ? p.data.filter(r => r && typeof r === 'object') : [];
    const xKey = typeof p.xAxis === 'string' ? p.xAxis : p.xAxis?.dataKey || p.nameKey || Object.keys(rows[0] || {})[0];
    let series = (Array.isArray(p.series) ? p.series : []).filter(s => s && s.dataKey);
    if (!series.length && rows[0]) series = Object.keys(rows[0]).filter(k => k !== xKey && typeof rows[0][k] === 'number').map(dataKey => ({dataKey}));
    return {rows, xKey, series:pie ? series.slice(0, 1) : series};
  }
  // Parentheses and spaces would end a Markdown link target early.
  const mdUrl = url => String(url ?? '').replace(/[()\s<>]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  // Alt text stays on one line and cannot close the brackets or set an Obsidian width.
  const altText = alt => String(alt ?? '').replace(/[[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
  // UI text is plain text: what the card shows is what the reader should see. Characters
  // that Markdown or Obsidian would read as syntax get a backslash; the rest is left as is
  // so the export stays readable. A "$" is a dollar sign: two prices in one paragraph
  // ("$8.99 … $8.98") would otherwise be read as a math formula.
  const word = /[\p{L}\p{N}]/u;
  const plainMd = s => String(s)
    .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
    .replace(/[*`$[\]]/g, '\\$&')
    // snake_case stays; "__init__" or "_x_" would be emphasis.
    .replace(/_/g, (m, i, t) => word.test(t[i - 1] || '') && word.test(t[i + 1] || '') ? m : '\\_')
    .replace(/<(?=[A-Za-z/!?])/g, '\\<').replace(/&(?=#?\w+;)/g, '\\&')
    .replace(/~~|==|%%/g, m => m.split('').map(c => '\\' + c).join(''))
    // "#tag" is an Obsidian tag and "# x" at a line start a heading.
    .replace(/(^|\s)#/g, '$1\\#')
    // A quote marker at a line start, and a line of only --- or === (a rule, or a setext
    // heading for the line above). List markers render much the same as the text.
    .replace(/^([ \t]*)(>|-{3,}\s*$|={3,}\s*$)/gm, '$1\\$2');
  // A code span holds its text literally; the fence is longer than any backtick run inside.
  // A line struck through by its style (lineThrough) reads as ~~…~~ line by line, since
  // a strikethrough cannot span a line break; spaces around it stay outside.
  const strikeMd = (t, p) => p.lineThrough ? t.split('\n').map(l => l.replace(/^(\s*)(\S[\s\S]*?)(\s*)$/, '$1~~$2~~$3')).join('\n') : t;
  const codeSpan = t => {const fence = '`'.repeat(Math.max(1, ...Array.from(t.matchAll(/`+/g), m => m[0].length + 1))), pad = /^`|`$/.test(t) ? ' ' : '';return `${fence}${pad}${t}${pad}${fence}`;};
  function toMarkdown(tree, {widget = id => t('dil.appToken', id)} = {}) {
    const cell = s => s.replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, '<br>').trim();
    function inline(node) {
      if (node == null || node === false || node === true) return '';
      if (typeof node !== 'object') return plainMd(node);
      if (Array.isArray(node)) return node.map(inline).join('');
      const p = node.props || {};
      switch (node.type) {
        case 'bold': return `**${inline(node.children)}**`;
        case 'italic': return `*${inline(node.children)}*`;
        case 'strike': case 'strikethrough': return `~~${inline(node.children)}~~`;
        case 'code': return codeSpan(textOf(node.children));
        case 'link': {const url = mdUrl(p.href || p.url), text = inline(node.children);return url ? `[${text || url}](${url})` : text;}
        case 'cite': {if (p.file) return t('dil.fileCite', plainMd(p.file));const items = Array.isArray(p.items) ? p.items : [];return items.length ? t('dil.cite', items.map(i => `[${plainMd(i.label)}](${mdUrl(i.url)})`).join(t('dil.sep'))) : '';}
        case 'input': case 'textarea': return t('dil.input', plainMd(p.value || p.placeholder || ''));
        case 'math': return `$${p.value ?? textOf(node.children)}$`;
        // An inline icon before the label renders as nothing; its space goes with it.
        case 'badge': return t('dil.badge', inline(node.children).trim());
        case 'icon': case 'button': return '';
        default: return inline(node.children);
      }
    }
    // Consecutive inline children form one paragraph; block children are separate.
    function blocks(children, depth, ui) {
      const out = [];let run = [];
      const flush = () => {const text = inline(run).trim();if (text) out.push(text);run = [];};
      for (const child of [].concat(children ?? [])) {
        if (isInlineNode(child)) {run.push(child);continue;}
        flush();const text = block(child, depth, ui);if (text && text.trim()) out.push(text.trim());
      }
      flush();
      return out.join('\n\n');
    }
    function table(node) {
      const rows = (node.children || []).filter(r => r?.type === 'table-row').map(r => (r.children || []).filter(c => c?.type === 'table-cell'));
      if (!rows.length) return '';
      // GFM needs a header row; without a marked one the first row serves (cards
      // often style their header row as text instead of setting header).
      const width = Math.max(...rows.map(r => r.length)), single = rows.length === 1 && !rows[0].some(c => c.props?.header);
      const fill = r => {const out = r.map(c => cell(blocks(c.children)));while (out.length < width) out.push('');return out;};
      const body = single ? rows : rows.slice(1);
      const aligns = Array.from({length:width}, (_, i) => (body.find(r => r[i]) || rows[0])[i]?.props?.align);
      const line = cells => `| ${cells.join(' | ')} |`;
      return [line(single ? Array(width).fill(' ') : fill(rows[0])), line(aligns.map(a => a === 'end' || a === 'right' ? '---:' : a === 'center' ? ':---:' : '---')), ...body.map(r => line(fill(r)))].join('\n');
    }
    function list(node, depth) {
      const numbered = node.props?.marker === 'number';let n = 0;
      return (node.children || []).filter(i => i?.type === 'list-item').map(item => {
        const marker = numbered ? `${++n}.` : '-', pad = ' '.repeat(marker.length + 1);
        const kids = item.children || [], own = blocks(kids.filter(c => c?.type !== 'list'), depth).replace(/\n\n+/g, '\n');
        const nested = kids.filter(c => c?.type === 'list').map(l => list(l, depth + 1).split('\n').map(x => pad + x).join('\n'));
        // A checkbox item is a task-list item, not a bullet holding a checkbox.
        const first = `${marker} ${own.split('\n').join(`\n${pad}`)}`.replace(/^(-|\d+\.) - \[( |x)\] /, (_, m, x) => `${m} [${x}] `);
        return [first, ...nested].join('\n');
      }).join('\n');
    }
    function chartTable(p, pie) {
      const {rows, xKey, series} = chartModel(p, pie);
      if (!rows.length || !series.length) return t('dil.chartEmpty');
      const head = [xKey, ...series.map(s => s.label || s.dataKey)].map(plainMd).map(cell);
      return [`| ${head.join(' | ')} |`, `| ${head.map((_, i) => i ? '---:' : '---').join(' | ')} |`, ...rows.map(r => `| ${[r[xKey], ...series.map(s => `${formatNumber(r[s.dataKey])}${s.valueSuffix || ''}`)].map(v => cell(plainMd(v ?? ''))).join(' | ')} |`)].join('\n');
    }
    // ui: inside a UI container, where titles are emphasis rather than headings.
    function block(node, depth = 0, ui = false) {
      if (node == null || node === false || node === true) return '';
      if (typeof node !== 'object') return plainMd(node);
      if (Array.isArray(node)) return blocks(node, depth, ui);
      const p = node.props || {}, inUi = ui || UI_CONTAINERS.has(node.type);
      switch (node.type) {
        case 'text': case 'caption': return strikeMd(inline(node.children), p);
        case 'title': return ui ? `**${strikeMd(inline(node.children), p)}**` : `${'#'.repeat(headingLevel[p.size] || 3)} ${strikeMd(inline(node.children), p)}`;
        case 'math': return p.block ? `$$\n${p.value ?? ''}\n$$` : `$${p.value ?? ''}$`;
        case 'code-block': {const value = String(p.value ?? '').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, ''), fence = '`'.repeat(Math.max(3, ...Array.from(value.matchAll(/`+/g), m => m[0].length + 1)));return `${fence}${/^[\w+#.-]+$/.test(p.language) ? p.language : ''}\n${value}\n${fence}`;}
        case 'divider': return '---';
        case 'writing-block': return String(p.value ?? '').trim();
        case 'table': return table(node);
        case 'list': return list(node, depth);
        case 'blockquote': return blocks(node.children, depth, ui).split('\n').map(l => l ? `> ${l}` : '>').join('\n');
        case 'checkbox': return `- [${p.checked ? 'x' : ' '}] ${inline(node.children)}`;
        case 'radio-group': return (node.children || []).filter(r => r?.type === 'radio').map(r => `- ${String(r.props?.value) === String(p.value) ? '(•)' : '( )'} ${inline(r.children)}`).join('\n');
        case 'slider': return t('dil.slider', formatNumber(p.value), formatNumber(p.min ?? 0), formatNumber(p.max ?? 100));
        case 'segmented-control': return t('dil.options', (Array.isArray(p.options) ? p.options : []).map(o => {const label = plainMd(optionLabel([o], o?.value ?? o));return (o?.value ?? o) === p.value ? `**${label}**` : label;}).join(' / '));
        case 'select': return t('dil.select', plainMd(optionLabel(p.options, p.value)));
        case 'image': return p.src ? `![${altText(p.alt)}](${p.src})` : '';
        // Obsidian reads "|width" in the alt text as the display width.
        case 'image-group': return (node.children || []).filter(i => i?.props?.src).map(i => `![${altText(i.props.alt)}|200](${i.props.src})`).join(' ');
        // Replaced by the drawn map picture in a ZIP export; dropped elsewhere.
        case 'map-image': return `![${t('dil.mapPlaces', p.count)}](map:${p.refIndex})`;
        case 'chart': return chartTable(p, false);
        case 'pie-chart': return chartTable(p, true);
        case 'svg': {const labels = [];(function collect(n) {if (!n || typeof n !== 'object') return;if (Array.isArray(n)) return n.forEach(collect);if (n.type === 'text' || n.type === 'tspan') {const t = textOf(n).trim();if (t) labels.push(t);return;}collect(n.children);})(node.children);return labels.length ? t('dil.diagram', labels.join(' · ')) : t('dil.diagramEmpty');}
        case 'row': {const parts = (node.children || []).map(c => isInlineNode(c) ? inline(c).trim() : block(c, depth, true).trim()).filter(Boolean);return parts.every(x => !x.includes('\n')) ? parts.join(' · ') : parts.join('\n\n');}
        case '__chatgptClientDefinedWidget': return widget(p.invocationId);
        default: return isInlineNode(node) ? inline(node) : blocks(node.children, depth, inUi);
      }
    }
    return block(tree).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // Text a card shows only in another state (another tab, an expanded section, a
  // checked box): the program is run again with one state changed at a time, and the
  // lines the default view does not have are kept. A boolean is flipped; a text state
  // takes the other options of the tab bar, select or radio group bound to it. States
  // are not combined, and numbers (sliders) are left at their default.
  function stateVariants(dil, execute, {limit = 16, widget} = {}) {
    const states = [], base = evaluate(dil, execute, {states});
    // A control's own markers (bold current option, [x], (•)) differ in every state.
    const norm = line => line.replace(/\*\*/g, '').replace(/\[[x ]\]|\([• ]\)/g, '').replace(/\s+/g, ' ').trim();
    // Rules, and a select or tab bar echoing its own choice, carry no content.
    const choiceLine = new RegExp(`^(?:${['dil.select', 'dil.options'].map(k => t(k, '\u0001').split('\u0001')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
    const linesOf = md => md.split('\n').map(l => l.trim()).filter(l => l && !/^(---|>)$/.test(l) && !choiceLine.test(l));
    const seen = new Set(linesOf(toMarkdown(base, {widget})).map(norm));
    const options = value => {
      const found = [];
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        const p = n.props || {};
        if (p.value === value && n.type !== 'radio') {
          for (const o of Array.isArray(p.options) ? p.options : []) found.push({value:o && typeof o === 'object' ? o.value : o, label:String(o && typeof o === 'object' ? o.label ?? o.value : o)});
          for (const c of n.children || []) if (c?.props && 'value' in c.props && c.type !== 'text') found.push({value:c.props.value, label:textOf(c.children).trim() || String(c.props.value)});
        }
        walk(n.children);
      })(base);
      return found.filter((o, i) => o.value !== value && found.findIndex(x => x.value === o.value) === i);
    };
    const tries = [];
    for (const s of states) {
      if (typeof s.value === 'boolean') tries.push({key:s.key, value:!s.value, label:t(s.value ? 'dil.whenOff' : 'dil.whenOn', s.key)});
      else if (typeof s.value === 'string') for (const o of options(s.value)) tries.push({key:s.key, value:o.value, label:t('dil.whenChosen', o.label)});
    }
    const out = [];
    for (const t of tries.slice(0, limit)) {
      let md;
      try {md = toMarkdown(evaluate(dil, execute, {overrides:{[t.key]:t.value}}), {widget});} catch {continue;}
      const fresh = linesOf(md).filter(l => {const k = norm(l);if (!k || seen.has(k)) return false;seen.add(k);return true;});
      if (fresh.length) out.push({key:t.key, value:t.value, label:t.label, md:fresh.join('\n\n')});
    }
    return out;
  }
  // Top-level prose and Markdown constructs stay Markdown; every other
  // top-level component (box, card, grid, chart, ...) becomes a card image.
  const proseTypes = new Set(['code-block','writing-block','image','image-group','map-image','text','title','divider','bold','italic','strike','strikethrough','code','link','cite','math','caption','table','list','blockquote','__chatgptClientDefinedWidget']);
  function segments(tree) {
    const flat = [], out = [];
    const add = node => {
      if (node == null || node === false || node === true || node === '') return;
      if (Array.isArray(node)) return node.forEach(add);
      if (node.type === 'Fragment') return node.children.forEach(add);
      flat.push(node);
    };
    add(tree);
    for (const node of flat) {
      const prose = typeof node !== 'object' || proseTypes.has(node.type);
      if (prose && out.at(-1)?.kind === 'md') out.at(-1).tree.children.push(node);
      else out.push(prose ? {kind:'md', tree:{type:'Fragment', props:{}, children:[node]}} : {kind:'card', tree:node});
    }
    return out;
  }
  // Tokens measured on chatgpt.com (Oct 2026); an approximation, not a pixel copy.
  // A run without spaces (a long URL or "AAAA…") breaks anywhere, as on the page,
  // instead of running past the card's edge.
  const CARD_CSS = `.dil-root{display:block;width:700px;padding:10px;box-sizing:border-box;font:16px/26px -apple-system,"Segoe UI",__CJK__,system-ui,sans-serif;color:#0d0d0d;background:#fff}
.dil-root *{box-sizing:border-box;overflow-wrap:anywhere}.dil-root p{margin:0}
.card{display:flex;flex-direction:column;gap:12px;border:1px solid rgba(13,13,13,.1);border-radius:16px;padding:12px;background:#fff}
.box{display:flex;flex-direction:column;min-width:0}.box.dir-row{flex-direction:row}.row{display:flex;flex-direction:row;align-items:center;gap:8px;min-width:0}
.grid{display:grid;gap:8px}[data-fill]{align-self:stretch}.grid-item{display:flex;flex-direction:column;min-width:0}.grid-item>*{flex:1 1 auto}
.fs-2xs{font-size:11px;line-height:14px}.fs-xs{font-size:12px;line-height:16px}.fs-sm{font-size:14px;line-height:20px}.fs-md{font-size:16px;line-height:26px}.fs-lg{font-size:18px;line-height:28px}.fs-xl{font-size:20px;line-height:28px}
.fw-regular{font-weight:400}.fw-medium{font-weight:500}.fw-semibold{font-weight:600}.fw-bold{font-weight:700}
.c-secondary{color:#5d5d5d}.c-tertiary{color:#8f8f8f}.c-success{color:#2f8f46}.c-danger{color:#e02e2a}.c-warning{color:#d25e28}.c-accent,.c-info{color:#3a83f7}.tnum{font-variant-numeric:tabular-nums}
.title{font-weight:600}.ts-xs{font-size:12px;line-height:16px}.ts-sm{font-size:14px;line-height:20px}.ts-md{font-size:16px;line-height:26px}.ts-lg{font-size:18px;line-height:28px}.ts-xl{font-size:20px;line-height:28px}.ts-2xl{font-size:24px;line-height:32px}.ts-3xl{font-size:30px;line-height:38px}
.caption{font-size:14px;line-height:18px;color:#5d5d5d}
.cb{display:flex;align-items:center;gap:8px}.cb-box{flex:none;width:16px;height:16px;border:1.5px solid #8f8f8f;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:1;color:#fff}.cb-box.on{background:#0d0d0d;border-color:#0d0d0d}
.radios{display:flex;flex-direction:column;gap:8px}.radios.dir-row{flex-direction:row;flex-wrap:wrap;gap:16px}.rb{flex:none;width:16px;height:16px;border:1.5px solid #8f8f8f;border-radius:50%;display:inline-flex;align-items:center;justify-content:center}.rb.on{border-color:#0d0d0d}.rb-dot{width:8px;height:8px;border-radius:50%;background:#0d0d0d}
.hr{border:0;border-top:1px solid rgba(13,13,13,.1);margin:4px 0;width:100%}
.tbl{width:100%;border-collapse:collapse;font-size:14px;line-height:20px}.tbl th,.tbl td{padding:8px 8px 8px 0;text-align:left;vertical-align:top;border-bottom:1px solid rgba(13,13,13,.05)}.tbl th{font-weight:600;border-bottom-color:rgba(13,13,13,.1)}.tbl tr:last-child td{border-bottom:0}
.lst{margin:0;padding-left:28px}.lst li{margin:2px 0}.bq{margin:0;padding-left:16px;border-left:3px solid #e3e3e3;color:#5d5d5d}
.badge{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:9999px;font-size:12px;line-height:20px;font-weight:500;background:#f3f3f3;color:#5d5d5d;white-space:nowrap}.b-success{background:rgba(4,184,76,.15);color:#3a843f}.b-danger{background:#fff0f0;color:#e02e2a}.b-warning{background:#fdf5f1;color:#d25e28}.b-info,.b-accent{background:#e8f1fe;color:#2c67c5}
.icon{display:inline-flex;align-items:center;justify-content:center;width:1em;line-height:1;vertical-align:-.125em}.icon svg{display:block;flex:none;width:1em;height:1em}.icon-xs{font-size:12px}.icon-sm{font-size:14px}.icon-md{font-size:16px}.icon-lg{font-size:20px}.icon-xl{font-size:24px}
.btn{display:inline-flex;align-items:center;gap:4px;border-radius:9999px;font-size:14px;line-height:20px;font-weight:500;padding:5px 12px;white-space:nowrap;background:#0d0d0d;color:#fff;border:1px solid transparent}.btn-sm{padding:3px 10px;font-size:13px}.btn-lg{padding:8px 16px}.btn-secondary{background:#f3f3f3;color:#0d0d0d}.btn-outline{background:#fff;color:#0d0d0d;border-color:rgba(13,13,13,.15)}.btn-ghost{background:transparent;color:#0d0d0d}
.slider{position:relative;height:20px;width:100%}.slider-track{position:absolute;left:0;right:0;top:8px;height:4px;border-radius:9999px;background:#e3e3e3}.slider-fill{position:absolute;left:0;top:8px;height:4px;border-radius:9999px;background:#0d0d0d}.slider-thumb{position:absolute;top:2px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:1px solid rgba(13,13,13,.15);box-shadow:0 1px 3px rgba(0,0,0,.2)}
.seg{display:inline-flex;gap:2px;padding:2px 0}.seg-block{display:flex;width:100%}.seg-block .seg-opt{flex:1;text-align:center}.seg-opt{padding:6px 16px;border-radius:9999px;font-size:14px;line-height:20px;font-weight:500;color:#5d5d5d;white-space:nowrap}.seg-opt.on{background:#f3f3f3;color:#0d0d0d}
.select{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px;border:1px solid rgba(13,13,13,.15);border-radius:8px;font-size:14px;background:#fff;white-space:nowrap}
.codeblk{margin:0;padding:10px 12px;background:#f9f9f9;border-radius:10px;overflow:hidden;white-space:pre-wrap;font:13px/1.5 ui-monospace,Consolas,monospace}.codeblk code{background:none;padding:0;font-size:inherit}
.math{font-family:"Cambria Math","Times New Roman",serif;font-style:italic}.math-block{display:block;text-align:center}
code{font-family:ui-monospace,Consolas,monospace;background:#f3f3f3;border-radius:4px;padding:0 4px;font-size:.9em}.link{color:#2964aa;text-decoration:underline}.cite{display:inline-flex;margin-left:4px;padding:0 8px;border-radius:9999px;background:#f3f3f3;color:#5d5d5d;font-size:12px;line-height:20px;white-space:nowrap}
.input{display:flex;align-items:center;min-height:36px;width:100%;padding:6px 12px;border:1px solid rgba(13,13,13,.15);border-radius:10px;background:#fff;color:#8f8f8f;font-size:14px;line-height:20px}.input-area{min-height:80px;align-items:flex-start}
.img-real{flex:none;display:block;object-fit:cover;border-radius:8px}.img-whole{max-width:100%;height:auto}.img-row{display:flex;flex-wrap:wrap;gap:8px}.img-ph{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;overflow:hidden;background:#f3f3f3;text-align:center}.img-alt{font-size:11px;line-height:14px;max-height:42px;overflow:hidden;padding:0 6px}
.widget,.img{border:1px dashed #c9c9c9;border-radius:10px;padding:10px 12px;color:#5d5d5d;font-size:13px}`;
  const RADIUS = {none:'0', xs:'4px', sm:'6px', md:'8px', lg:'10px', xl:'16px', '2xl':'20px', full:'9999px'};
  const BACKGROUND = {surface:'#fff', 'surface-primary':'#fff', 'surface-secondary':'#f9f9f9', 'surface-tertiary':'#f3f3f3', 'surface-elevated':'#fff', success:'#def3e5', danger:'#fff0f0', warning:'#fdf5f1', info:'#e8f1fe'};
  const JUSTIFY = {start:'flex-start', end:'flex-end', center:'center', between:'space-between', around:'space-around', evenly:'space-evenly'};
  const ALIGN = {start:'flex-start', end:'flex-end', center:'center', stretch:'stretch', baseline:'baseline'};
  const safeCss = value => typeof value === 'string' && /^[\w#.,()%\s/+-]+$/.test(value) ? value : null;
  const cssLength = value => typeof value === 'number' ? `${value * 4}px` : /^[\d.]+(px|%|rem|em)?$/.test(String(value)) ? String(value) : null;
  function boxStyle(p) {
    const s = [], length = v => typeof v === 'number' ? `${v * 4}px` : safeCss(v);
    for (const [prop, css] of [['maxWidth','max-width'],['width','width'],['minWidth','min-width'],['height','height'],['maxHeight','max-height'],['minHeight','min-height']]) {const v = p[prop] != null && (typeof p[prop] === 'number' ? `${p[prop]}px` : safeCss(p[prop]));if (v) s.push(`${css}:${v}`);}
    if (p.gap != null && length(p.gap)) s.push(`gap:${length(p.gap)}`);
    if (typeof p.padding === 'number' || typeof p.padding === 'string') {const v = length(p.padding);if (v) s.push(`padding:${v}`);}
    else if (p.padding && typeof p.padding === 'object') s.push(`padding:${(p.padding.y ?? p.padding.top ?? 0) * 4}px ${(p.padding.x ?? p.padding.right ?? 0) * 4}px`);
    if (p.radius != null) {const v = RADIUS[p.radius] ?? (p.radius === true ? RADIUS.md : cssLength(p.radius));if (v) s.push(`border-radius:${v}`);}
    if (p.border) s.push('border:1px solid rgba(13,13,13,.1)');
    if (p.background != null) {const v = BACKGROUND[p.background] ?? safeCss(p.background);if (v) s.push(`background:${v}`);}
    if (p.align && ALIGN[p.align]) s.push(`align-items:${ALIGN[p.align]}`);
    if (p.justify && JUSTIFY[p.justify]) s.push(`justify-content:${JUSTIFY[p.justify]}`);
    if (p.clip) s.push('overflow:hidden');
    if (p.wrap) s.push('flex-wrap:wrap');
    if (p.flex != null) {const n = Number(p.flex);if (Number.isFinite(n)) s.push(`flex:${n} 1 0%;min-width:0`);}
    if (typeof p.columns === 'number') s.push(`grid-template-columns:repeat(${Math.max(1, Math.min(12, Math.round(p.columns)))},minmax(0,1fr))`);
    if (p.textAlign && ['left','right','center','start','end'].includes(p.textAlign)) s.push(`text-align:${p.textAlign}`);
    return s.length ? ` style="${s.join(';')}"` : '';
  }
  const textClasses = (p, base) => {
    const c = [base];
    if (p.size) c.push(`${base === 'title' ? 'ts' : 'fs'}-${String(p.size).replace(/[^\w-]/g, '')}`);
    if (p.weight) c.push(`fw-${String(p.weight).replace(/[^\w-]/g, '')}`);
    const color = p.color ?? (p.secondary ? 'secondary' : p.success ? 'success' : p.danger ? 'danger' : null);
    if (color && /^[a-z-]+$/.test(color)) c.push(`c-${color}`);
    if (p.tabularNums) c.push('tnum');
    return c.filter(Boolean).join(' ');
  };
  const textStyle = p => {const s = [];if (p.color && !/^[a-z-]+$/.test(p.color) && safeCss(p.color)) s.push(`color:${p.color}`);if (p.textAlign && ['left','right','center','start','end'].includes(p.textAlign)) s.push(`text-align:${p.textAlign}`);if (p.preserveWhitespace) s.push('white-space:pre-wrap');if (p.lineThrough) s.push('text-decoration:line-through');return s.length ? ` style="${s.join(';')}"` : '';};
  // Common LaTeX as readable text with sup/sub, so card images show formulas, not source.
  const TEX = {alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', varepsilon:'ε', eta:'η', theta:'θ', lambda:'λ', mu:'μ', pi:'π', rho:'ρ', sigma:'σ', tau:'τ', phi:'φ', varphi:'φ', omega:'ω', Delta:'Δ', Sigma:'Σ', Omega:'Ω', Pi:'Π', Phi:'Φ',
    cdot:'·', times:'×', div:'÷', pm:'±', mp:'∓', le:'≤', leq:'≤', ge:'≥', geq:'≥', neq:'≠', ne:'≠', approx:'≈', equiv:'≡', propto:'∝', infty:'∞', to:'→', rightarrow:'→', leftarrow:'←', Rightarrow:'⇒', sum:'∑', prod:'∏', int:'∫', partial:'∂', nabla:'∇', circ:'°', degree:'°', ldots:'…', cdots:'⋯', dots:'…', quad:' ', qquad:'  ', ',':' ', ';':' ', ':':' ', ' ':' ', '%':'%', '{':'{', '}':'}', '\\':' ', '_':'_', '$':'$'};
  const TEX_TEXT = new Set(['mathrm','text','mathbf','mathit','mathsf','textbf','textit','operatorname','boldsymbol']);
  const TEX_DROP = new Set(['left','right','big','Big','bigl','bigr','Bigl','Bigr','displaystyle','textstyle']);
  function texHtml(source) {
    const s = String(source);let i = 0;
    const command = () => {
      i++;const name = /[a-zA-Z]/.test(s[i] || '') ? s.slice(i).match(/^[a-zA-Z]+/)[0] : s[i] || '';i += name.length;
      if (['frac','dfrac','tfrac'].includes(name)) {const a = arg(), b = arg();return `<sup>${a}</sup>⁄<sub>${b}</sub>`;}
      if (name === 'sqrt') return `√(${arg()})`;
      if (TEX_TEXT.has(name)) return arg();
      if (TEX_DROP.has(name)) return '';
      return escapeHtml(TEX[name] ?? name);
    };
    const arg = () => {
      while (s[i] === ' ') i++;
      if (s[i] === '{') {i++;const out = seq(true);i++;return out;}
      if (s[i] === '\\') return command();
      return i < s.length ? escapeHtml(s[i++]) : '';
    };
    const seq = nested => {
      let out = '';
      while (i < s.length && !(nested && s[i] === '}')) {
        const ch = s[i];
        if (ch === '\\') out += command();
        else if (ch === '^' || ch === '_') {i++;const g = arg();out += ch === '^' ? `<sup>${g}</sup>` : `<sub>${g}</sub>`;}
        else if (ch === '{') {i++;out += seq(true);i++;}
        else {out += escapeHtml(ch);i++;}
      }
      return out;
    };
    return seq(false);
  }
  const ICONS = {coffee:'☕', clock:'◷', 'trending-up':'↗', 'trending-down':'↘', 'chart-line':'↗', 'line-chart':'↗', 'chart-bar':'▥', 'bar-chart':'▥', 'bar-chart-2':'▥', 'chart-pie':'◔', 'pie-chart':'◔', file:'▤', 'file-text':'▤', 'file-spreadsheet':'▦', 'file-code':'▤', download:'⤓', upload:'⤒', 'external-link':'↗', link:'⛓', search:'⌕', settings:'⚙', calendar:'▦', 'map-pin':'⌖', heart:'♥', flame:'♨', droplet:'◖', thermometer:'🌡', 'lightbulb':'✦', sparkles:'✦', target:'◎', flag:'⚑', bookmark:'⚑', book:'▯', 'graduation-cap':'🎓', user:'◯', users:'◯◯', mail:'✉', phone:'✆', lock:'⚿', 'shield':'⛨', 'shield-check':'⛨', 'help-circle':'?', 'circle-help':'?', 'alert-octagon':'!', 'circle-alert':'!', 'triangle-alert':'⚠', 'chevron-right':'›', 'chevron-left':'‹', 'chevron-down':'⌄', 'chevron-up':'⌃', play:'▶', pause:'❚❚', square:'□', circle:'○', moon:'☾', cloud:'☁', 'cloud-rain':'☂', leaf:'❦', home:'⌂', timer:'◷', hourglass:'⧗', activity:'∿', percent:'%', hash:'#', calculator:'▦',
    'arrow-up-right':'↗', 'arrow-down-right':'↘', trash:'🗑', 'trash-2':'🗑', eraser:'⌫', brush:'🖌', pencil:'✎', palette:'🎨', image:'🖼', video:'▶', music:'♪', copy:'⧉', edit:'✎', 'circle-dot':'◉', 'dot':'•',
    'rotate-ccw':'↺', 'refresh-cw':'↻', check:'✓', 'check-circle':'✓', 'circle-check':'✓', x:'✕', 'x-circle':'✕', 'circle-x':'✕', 'alert-triangle':'⚠', 'alert-circle':'!', info:'ⓘ', 'arrow-right':'→', 'arrow-left':'←', 'arrow-up':'↑', 'arrow-down':'↓', plus:'+', minus:'−', star:'★', sun:'☀', zap:'⚡', battery:'▭', clock:'◷'};
  // ICONS:BEGIN generated by scripts/build-icons.cjs from lucide-static 1.48.0 (ISC, see THIRD_PARTY_NOTICES.md)
  const ICON_SVG = {"activity":"<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\"/>","alert-circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>","alert-octagon":"<path d=\"M12 16h.01\"/><path d=\"M12 8v4\"/><path d=\"M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z\"/>","alert-triangle":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","archive":"<rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\"/><path d=\"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8\"/><path d=\"M10 12h4\"/>","arrow-down":"<path d=\"M12 5v14\"/><path d=\"m19 12-7 7-7-7\"/>","arrow-down-left":"<path d=\"M17 7 7 17\"/><path d=\"M17 17H7V7\"/>","arrow-down-right":"<path d=\"m7 7 10 10\"/><path d=\"M17 7v10H7\"/>","arrow-left":"<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>","arrow-right":"<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>","arrow-up":"<path d=\"m5 12 7-7 7 7\"/><path d=\"M12 19V5\"/>","arrow-up-left":"<path d=\"M7 17V7h10\"/><path d=\"M17 17 7 7\"/>","arrow-up-right":"<path d=\"M7 7h10v10\"/><path d=\"M7 17 17 7\"/>","atom":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><path d=\"M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z\"/><path d=\"M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z\"/>","award":"<path d=\"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526\"/><circle cx=\"12\" cy=\"8\" r=\"6\"/>","badge-check":"<path d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\"/><path d=\"m16 9-5.5 5.5L8 12\"/>","bar-chart":"<path d=\"M5 21v-6\"/><path d=\"M12 21V9\"/><path d=\"M19 21V3\"/>","bar-chart-2":"<path d=\"M5 21v-6\"/><path d=\"M12 21V3\"/><path d=\"M19 21V9\"/>","bar-chart-3":"<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"M18 17V9\"/><path d=\"M13 17V5\"/><path d=\"M8 17v-3\"/>","battery":"<path d=\"M 22 14 L 22 10\"/><rect x=\"2\" y=\"6\" width=\"16\" height=\"12\" rx=\"2\"/>","bell":"<path d=\"M10.268 21a2 2 0 0 0 3.464 0\"/><path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\"/>","book":"<path d=\"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20\"/>","book-open":"<path d=\"M12 5v16\"/><path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\"/>","bookmark":"<path d=\"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z\"/>","box":"<path d=\"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z\"/><path d=\"m3.3 7 8.7 5 8.7-5\"/><path d=\"M12 22V12\"/>","brain":"<path d=\"M12 18V5\"/><path d=\"M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4\"/><path d=\"M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5\"/><path d=\"M17.997 5.125a4 4 0 0 1 2.526 5.77\"/><path d=\"M18 18a4 4 0 0 0 2-7.464\"/><path d=\"M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517\"/><path d=\"M6 18a4 4 0 0 1-2-7.464\"/><path d=\"M6.003 5.125a4 4 0 0 0-2.526 5.77\"/>","brush":"<path d=\"m11 10 3 3\"/><path d=\"M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z\"/><path d=\"M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031\"/>","building":"<path d=\"M12 10h.01\"/><path d=\"M12 14h.01\"/><path d=\"M12 6h.01\"/><path d=\"M16 10h.01\"/><path d=\"M16 14h.01\"/><path d=\"M16 6h.01\"/><path d=\"M8 10h.01\"/><path d=\"M8 14h.01\"/><path d=\"M8 6h.01\"/><path d=\"M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3\"/><rect x=\"4\" y=\"2\" width=\"16\" height=\"20\" rx=\"2\"/>","building-2":"<path d=\"M10 12h4\"/><path d=\"M10 8h4\"/><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2\"/><path d=\"M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16\"/>","calculator":"<rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\"/><line x1=\"8\" x2=\"16\" y1=\"6\" y2=\"6\"/><line x1=\"16\" x2=\"16\" y1=\"14\" y2=\"18\"/><path d=\"M16 10h.01\"/><path d=\"M12 10h.01\"/><path d=\"M8 10h.01\"/><path d=\"M12 14h.01\"/><path d=\"M8 14h.01\"/><path d=\"M12 18h.01\"/><path d=\"M8 18h.01\"/>","calendar":"<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/>","calendar-days":"<path d=\"M8 2v3\"/><path d=\"M16 2v3\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M8 13h.01\"/><path d=\"M12 13h.01\"/><path d=\"M16 13h.01\"/><path d=\"M8 17h.01\"/><path d=\"M12 17h.01\"/><path d=\"M16 17h.01\"/>","camera":"<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/>","car":"<path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\"/><circle cx=\"7\" cy=\"17\" r=\"2\"/><path d=\"M9 17h6\"/><circle cx=\"17\" cy=\"17\" r=\"2\"/>","chart-bar":"<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"M7 16h8\"/><path d=\"M7 11h12\"/><path d=\"M7 6h3\"/>","chart-column-increasing":"<path d=\"M13 17V9\"/><path d=\"M18 17V5\"/><path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"M8 17v-3\"/>","chart-line":"<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"m19 9-5 5-4-4-3 3\"/>","chart-no-axes-column-increasing":"<path d=\"M5 21v-6\"/><path d=\"M12 21V9\"/><path d=\"M19 21V3\"/>","chart-pie":"<path d=\"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z\"/><path d=\"M21.21 15.89A10 10 0 1 1 8 2.83\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","check-circle":"<path d=\"M21.801 10A10 10 0 1 1 17 3.335\"/><path d=\"m9 11 3 3L22 4\"/>","check-circle-2":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16 9-5.5 5.5L8 12\"/>","check-square":"<path d=\"M21 10.656V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.344\"/><path d=\"m9 11 3 3L22 4\"/>","chevron-down":"<path d=\"m6 9 6 6 6-6\"/>","chevron-left":"<path d=\"m15 18-6-6 6-6\"/>","chevron-right":"<path d=\"m9 18 6-6-6-6\"/>","chevron-up":"<path d=\"m18 15-6-6-6 6\"/>","chevrons-up-down":"<path d=\"m7 15 5 5 5-5\"/><path d=\"m7 9 5-5 5 5\"/>","circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/>","circle-alert":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\"/><line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\"/>","circle-check":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16 9-5.5 5.5L8 12\"/>","circle-dot":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"10\"/>","circle-help":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/><path d=\"M12 17h.01\"/>","circle-x":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m15 9-6 6\"/><path d=\"m9 9 6 6\"/>","clipboard":"<rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\"/><path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/>","cloud":"<path d=\"M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z\"/>","cloud-rain":"<path d=\"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242\"/><path d=\"M16 14v6\"/><path d=\"M8 14v6\"/><path d=\"M12 16v6\"/>","code":"<path d=\"m16 18 6-6-6-6\"/><path d=\"m8 6-6 6 6 6\"/>","coffee":"<path d=\"M10 2v2\"/><path d=\"M14 2v2\"/><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\"/><path d=\"M6 2v2\"/>","compass":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z\"/>","copy":"<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>","cpu":"<path d=\"M12 20v2\"/><path d=\"M12 2v2\"/><path d=\"M17 20v2\"/><path d=\"M17 2v2\"/><path d=\"M2 12h2\"/><path d=\"M2 17h2\"/><path d=\"M2 7h2\"/><path d=\"M20 12h2\"/><path d=\"M20 17h2\"/><path d=\"M20 7h2\"/><path d=\"M7 20v2\"/><path d=\"M7 2v2\"/><rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"2\"/><rect x=\"8\" y=\"8\" width=\"8\" height=\"8\" rx=\"1\"/>","credit-card":"<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\"/><line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\"/><path d=\"M6 14h2\"/>","croissant":"<path d=\"M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487\"/><path d=\"M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132\"/><path d=\"M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42\"/><path d=\"M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14\"/><path d=\"M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676\"/>","database":"<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\"/><path d=\"M3 5V19A9 3 0 0 0 21 19V5\"/><path d=\"M3 12A9 3 0 0 0 21 12\"/>","dollar-sign":"<line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"22\"/><path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\"/>","dot":"<circle cx=\"12\" cy=\"12\" r=\"1\"/>","download":"<path d=\"M12 15V3\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><path d=\"m7 10 5 5 5-5\"/>","droplet":"<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\"/>","dumbbell":"<path d=\"M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z\"/><path d=\"m2.5 21.5 1.4-1.4\"/><path d=\"m20.1 3.9 1.4-1.4\"/><path d=\"M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z\"/><path d=\"m9.6 14.4 4.8-4.8\"/>","edit":"<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\"/>","eraser":"<path d=\"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21\"/><path d=\"m5.082 11.09 8.828 8.828\"/>","external-link":"<path d=\"M15 3h6v6\"/><path d=\"M10 14 21 3\"/><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"/>","eye":"<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","eye-off":"<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\"/><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\"/><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\"/><path d=\"m2 2 20 20\"/>","factory":"<path d=\"M12 16h.01\"/><path d=\"M16 16h.01\"/><path d=\"M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z\"/><path d=\"M8 16h.01\"/>","file":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/>","file-code":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 12.5 8 15l2 2.5\"/><path d=\"m14 12.5 2 2.5-2 2.5\"/>","file-image":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><circle cx=\"10\" cy=\"12\" r=\"2\"/><path d=\"m20 17-1.296-1.296a2.41 2.41 0 0 0-3.408 0L9 22\"/>","file-spreadsheet":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M8 13h2\"/><path d=\"M14 13h2\"/><path d=\"M8 17h2\"/><path d=\"M14 17h2\"/>","file-text":"<path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\"/><path d=\"M14 2v5a1 1 0 0 0 1 1h5\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>","filter":"<path d=\"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z\"/>","flag":"<path d=\"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528\"/>","flame":"<path d=\"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4\"/>","flask-conical":"<path d=\"M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2\"/><path d=\"M6.453 15h11.094\"/><path d=\"M8.5 2h7\"/>","folder":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/>","folder-closed":"<path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\"/><path d=\"M2 10h20\"/>","folder-open":"<path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\"/>","function-square":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><path d=\"M9 17c2 0 2.8-1 2.8-2.8V10c0-2 1-3.3 3.2-3\"/><path d=\"M9 11.2h5.7\"/>","gift":"<path d=\"M12 7v14\"/><path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\"/><path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\"/><rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\"/>","git-branch":"<path d=\"M15 6a9 9 0 0 0-9 9V3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>","graduation-cap":"<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\"/><path d=\"M22 10v6\"/><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\"/>","grid-3x3":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M3 15h18\"/><path d=\"M9 3v18\"/><path d=\"M15 3v18\"/>","hash":"<line x1=\"4\" x2=\"20\" y1=\"9\" y2=\"9\"/><line x1=\"4\" x2=\"20\" y1=\"15\" y2=\"15\"/><line x1=\"10\" x2=\"8\" y1=\"3\" y2=\"21\"/><line x1=\"16\" x2=\"14\" y1=\"3\" y2=\"21\"/>","headphones":"<path d=\"M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3\"/>","heart":"<path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\"/>","help-circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/><path d=\"M12 17h.01\"/>","history":"<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M12 7v5l4 2\"/>","home":"<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>","hourglass":"<path d=\"M5 22h14\"/><path d=\"M5 2h14\"/><path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\"/><path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\"/>","house":"<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>","key":"<path d=\"m2 21 9.6-9.6\"/><path d=\"m7.5 15.5 2.3 2.3a1 1 0 0 1 0 1.4l-2.1 2.1a1 1 0 0 1-1.4 0L4 19\"/><circle cx=\"15.5\" cy=\"7.5\" r=\"5.5\"/>","laptop":"<path d=\"M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z\"/><path d=\"M20.054 15.987H3.946\"/>","layers":"<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\"/><path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\"/><path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\"/>","layout-dashboard":"<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\"/><rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\"/>","layout-grid":"<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\"/>","leaf":"<path d=\"M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20\"/><path d=\"M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13\"/>","lightbulb":"<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\"/><path d=\"M9 18h6\"/><path d=\"M10 22h4\"/>","line-chart":"<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/><path d=\"m19 9-5 5-4-4-3 3\"/>","link":"<path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\"/><path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\"/>","list":"<path d=\"M3 5h.01\"/><path d=\"M3 12h.01\"/><path d=\"M3 19h.01\"/><path d=\"M8 5h13\"/><path d=\"M8 12h13\"/><path d=\"M8 19h13\"/>","list-checks":"<path d=\"M13 5h8\"/><path d=\"M13 12h8\"/><path d=\"M13 19h8\"/><path d=\"m3 17 2 2 4-4\"/><path d=\"m3 7 2 2 4-4\"/>","list-filter":"<path d=\"M2 5h20\"/><path d=\"M6 12h12\"/><path d=\"M9 19h6\"/>","list-ordered":"<path d=\"M11 5h10\"/><path d=\"M11 12h10\"/><path d=\"M11 19h10\"/><path d=\"M4 4h1v5\"/><path d=\"M4 9h2\"/><path d=\"M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02\"/>","loader":"<path d=\"M12 2v4\"/><path d=\"m16.2 7.8 2.9-2.9\"/><path d=\"M18 12h4\"/><path d=\"m16.2 16.2 2.9 2.9\"/><path d=\"M12 18v4\"/><path d=\"m4.9 19.1 2.9-2.9\"/><path d=\"M2 12h4\"/><path d=\"m4.9 4.9 2.9 2.9\"/>","lock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>","mail":"<path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\"/><rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\"/>","map":"<path d=\"M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z\"/><path d=\"M15 5.764v15\"/><path d=\"M9 3.236v15\"/>","map-pin":"<path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>","menu":"<path d=\"M4 5h16\"/><path d=\"M4 12h16\"/><path d=\"M4 19h16\"/>","message-circle":"<path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\"/>","message-square":"<path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\"/>","mic":"<path d=\"M12 19v3\"/><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"/><rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\"/>","microscope":"<path d=\"M6 18h8\"/><path d=\"M3 22h18\"/><path d=\"M14 22a7 7 0 1 0 0-14h-1\"/><path d=\"M9 14h2\"/><path d=\"M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z\"/><path d=\"M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3\"/>","minus":"<path d=\"M5 12h14\"/>","monitor":"<rect width=\"20\" height=\"14\" x=\"2\" y=\"3\" rx=\"2\"/><line x1=\"8\" x2=\"16\" y1=\"21\" y2=\"21\"/><line x1=\"12\" x2=\"12\" y1=\"17\" y2=\"21\"/>","moon":"<path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\"/>","more-horizontal":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>","more-vertical":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"5\" r=\"1\"/><circle cx=\"12\" cy=\"19\" r=\"1\"/>","mountain":"<path d=\"m8 3 4 8 5-5 5 15H2L8 3z\"/>","music":"<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>","navigation":"<polygon points=\"3 11 22 2 13 21 11 13 3 11\"/>","package":"<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\"/><path d=\"M12 22V12\"/><polyline points=\"3.29 7 12 12 20.71 7\"/><path d=\"m7.5 4.27 9 5.15\"/>","palette":"<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\"/><circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\"/><circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","paperclip":"<path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\"/>","pause":"<rect x=\"14\" y=\"3\" width=\"5\" height=\"18\" rx=\"1\"/><rect x=\"5\" y=\"3\" width=\"5\" height=\"18\" rx=\"1\"/>","pencil":"<path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\"/><path d=\"m15 5 4 4\"/>","percent":"<line x1=\"19\" x2=\"5\" y1=\"5\" y2=\"19\"/><circle cx=\"6.5\" cy=\"6.5\" r=\"2.5\"/><circle cx=\"17.5\" cy=\"17.5\" r=\"2.5\"/>","phone":"<path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\"/>","pie-chart":"<path d=\"M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z\"/><path d=\"M21.21 15.89A10 10 0 1 1 8 2.83\"/>","pill":"<path d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\"/><path d=\"m8.5 8.5 7 7\"/>","plane":"<path d=\"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z\"/>","play":"<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\"/>","plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>","power":"<path d=\"M12 2v10\"/><path d=\"M18.4 6.6a9 9 0 1 1-12.77.04\"/>","printer":"<path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"/><path d=\"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6\"/><rect x=\"6\" y=\"14\" width=\"12\" height=\"8\" rx=\"1\"/>","puzzle":"<path d=\"M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z\"/>","refresh-cw":"<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>","rotate-ccw":"<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/>","rotate-cw":"<path d=\"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/>","ruler":"<path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z\"/><path d=\"m14.5 12.5 2-2\"/><path d=\"m11.5 9.5 2-2\"/><path d=\"m8.5 6.5 2-2\"/><path d=\"m17.5 15.5 2-2\"/>","save":"<path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\"/><path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\"/><path d=\"M7 3v4a1 1 0 0 0 1 1h7\"/>","scale":"<path d=\"M12 3v18\"/><path d=\"m19 8 3 8a5 5 0 0 1-6 0zV7\"/><path d=\"M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1\"/><path d=\"m5 8 3 8a5 5 0 0 1-6 0zV7\"/><path d=\"M7 21h10\"/>","school":"<path d=\"M14 21v-3a2 2 0 0 0-4 0v3\"/><path d=\"M18 4.933V21\"/><path d=\"m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6\"/><path d=\"m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11\"/><path d=\"M6 4.933V21\"/><circle cx=\"12\" cy=\"9\" r=\"2\"/>","scissors":"<circle cx=\"6\" cy=\"6\" r=\"3\"/><path d=\"M8.12 8.12 12 12\"/><path d=\"M20 4 8.12 15.88\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><path d=\"M14.8 14.8 20 20\"/>","search":"<path d=\"m21 21-4.34-4.34\"/><circle cx=\"11\" cy=\"11\" r=\"8\"/>","send":"<path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\"/><path d=\"m21.854 2.147-10.94 10.939\"/>","server":"<rect width=\"20\" height=\"8\" x=\"2\" y=\"2\" rx=\"2\" ry=\"2\"/><rect width=\"20\" height=\"8\" x=\"2\" y=\"14\" rx=\"2\" ry=\"2\"/><line x1=\"6\" x2=\"6.01\" y1=\"6\" y2=\"6\"/><line x1=\"6\" x2=\"6.01\" y1=\"18\" y2=\"18\"/>","settings":"<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","share":"<path d=\"M12 2v13\"/><path d=\"m16 6-4-4-4 4\"/><path d=\"M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8\"/>","share-2":"<circle cx=\"18\" cy=\"5\" r=\"3\"/><circle cx=\"6\" cy=\"12\" r=\"3\"/><circle cx=\"18\" cy=\"19\" r=\"3\"/><line x1=\"8.59\" x2=\"15.42\" y1=\"13.51\" y2=\"17.49\"/><line x1=\"15.41\" x2=\"8.59\" y1=\"6.51\" y2=\"10.49\"/>","sheet":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><line x1=\"3\" x2=\"21\" y1=\"9\" y2=\"9\"/><line x1=\"3\" x2=\"21\" y1=\"15\" y2=\"15\"/><line x1=\"9\" x2=\"9\" y1=\"9\" y2=\"21\"/><line x1=\"15\" x2=\"15\" y1=\"9\" y2=\"21\"/>","shield":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/>","shield-check":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>","shopping-cart":"<path d=\"m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18\"/><path d=\"M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25\"/><circle cx=\"18\" cy=\"20\" r=\"2\"/><circle cx=\"8\" cy=\"20\" r=\"2\"/>","sigma":"<path d=\"M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2\"/>","sliders-horizontal":"<path d=\"M10 5H3\"/><path d=\"M12 19H3\"/><path d=\"M14 3v4\"/><path d=\"M16 17v4\"/><path d=\"M21 12h-9\"/><path d=\"M21 19h-5\"/><path d=\"M21 5h-7\"/><path d=\"M8 10v4\"/><path d=\"M8 12H3\"/>","smartphone":"<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\"/><path d=\"M12 18h.01\"/>","snowflake":"<path d=\"m10 20-1.25-2.5L6 18\"/><path d=\"M10 4 8.75 6.5 6 6\"/><path d=\"m14 20 1.25-2.5L18 18\"/><path d=\"m14 4 1.25 2.5L18 6\"/><path d=\"m17 21-3-6h-4\"/><path d=\"m17 3-3 6 1.5 3\"/><path d=\"M2 12h6.5L10 9\"/><path d=\"m20 10-1.5 2 1.5 2\"/><path d=\"M22 12h-6.5L14 15\"/><path d=\"m4 10 1.5 2L4 14\"/><path d=\"m7 21 3-6-1.5-3\"/><path d=\"m7 3 3 6h4\"/>","sparkles":"<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\"/><path d=\"M20 2v4\"/><path d=\"M22 4h-4\"/><circle cx=\"4\" cy=\"20\" r=\"2\"/>","square":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/>","star":"<path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\"/>","stethoscope":"<path d=\"M11 2v2\"/><path d=\"M5 2v2\"/><path d=\"M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\"/><path d=\"M8 15a6 6 0 0 0 12 0v-3\"/><circle cx=\"20\" cy=\"10\" r=\"2\"/>","store":"<path d=\"M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5\"/><path d=\"M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244\"/><path d=\"M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05\"/>","sun":"<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2\"/><path d=\"M12 20v2\"/><path d=\"m4.93 4.93 1.41 1.41\"/><path d=\"m17.66 17.66 1.41 1.41\"/><path d=\"M2 12h2\"/><path d=\"M20 12h2\"/><path d=\"m6.34 17.66-1.41 1.41\"/><path d=\"m19.07 4.93-1.41 1.41\"/>","sunrise":"<path d=\"M12 2v8\"/><path d=\"m4.93 10.93 1.41 1.41\"/><path d=\"M2 18h2\"/><path d=\"M20 18h2\"/><path d=\"m19.07 10.93-1.41 1.41\"/><path d=\"M22 22H2\"/><path d=\"m8 6 4-4 4 4\"/><path d=\"M16 18a4 4 0 0 0-8 0\"/>","table":"<path d=\"M12 3v18\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\"/><path d=\"M3 9h18\"/><path d=\"M3 15h18\"/>","tag":"<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\"/><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\"/>","target":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>","terminal":"<path d=\"M12 19h8\"/><path d=\"m4 17 6-6-6-6\"/>","test-tube":"<path d=\"M14.5 2v17.5c0 1.4-1.1 2.5-2.5 2.5c-1.4 0-2.5-1.1-2.5-2.5V2\"/><path d=\"M8.5 2h7\"/><path d=\"M14.5 16h-5\"/>","thermometer":"<path d=\"M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z\"/>","thumbs-down":"<path d=\"M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z\"/><path d=\"M17 14V2\"/>","thumbs-up":"<path d=\"M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z\"/><path d=\"M7 10v12\"/>","timer":"<line x1=\"10\" x2=\"14\" y1=\"2\" y2=\"2\"/><line x1=\"12\" x2=\"15\" y1=\"14\" y2=\"11\"/><circle cx=\"12\" cy=\"14\" r=\"8\"/>","trash":"<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>","trash-2":"<path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\"/><path d=\"M3 6h18\"/><path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>","trending-down":"<path d=\"M16 17h6v-6\"/><path d=\"m22 17-8.5-8.5-5 5L2 7\"/>","trending-up":"<path d=\"M16 7h6v6\"/><path d=\"m22 7-8.5 8.5-5-5L2 17\"/>","triangle-alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","trophy":"<path d=\"M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2\"/><path d=\"M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2\"/><path d=\"M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3\"/><path d=\"M4 22h16\"/><path d=\"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z\"/><path d=\"M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3\"/>","truck":"<path d=\"M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2\"/><path d=\"M15 18H9\"/><path d=\"M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14\"/><circle cx=\"17\" cy=\"18\" r=\"2\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/>","umbrella":"<path d=\"M12 13v7a2 2 0 0 0 4 0\"/><path d=\"M12 2v2\"/><path d=\"M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z\"/>","unlock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 9.9-1\"/>","upload":"<path d=\"M12 3v12\"/><path d=\"m17 8-5-5-5 5\"/><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/>","user":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","utensils":"<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\"/><path d=\"M7 2v20\"/><path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\"/>","video":"<path d=\"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5\"/><rect x=\"2\" y=\"6\" width=\"14\" height=\"12\" rx=\"2\"/>","wallet":"<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\"/><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\"/>","waves":"<path d=\"M2 12q2.5 2 5 0t5 0 5 0 5 0\"/><path d=\"M2 19q2.5 2 5 0t5 0 5 0 5 0\"/><path d=\"M2 5q2.5 2 5 0t5 0 5 0 5 0\"/>","wifi":"<path d=\"M12 20h.01\"/><path d=\"M2 8.82a15 15 0 0 1 20 0\"/><path d=\"M5 12.859a10 10 0 0 1 14 0\"/><path d=\"M8.5 16.429a5 5 0 0 1 7 0\"/>","wind":"<path d=\"M12.8 19.6A2 2 0 1 0 14 16H2\"/><path d=\"M17.5 8a2.5 2.5 0 1 1 2 4H2\"/><path d=\"M9.8 4.4A2 2 0 1 1 11 8H2\"/>","wrench":"<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","x-circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m15 9-6 6\"/><path d=\"m9 9 6 6\"/>","zap":"<path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\"/>"};
  // ICONS:END
  const ICON_SIZE = {xs:1, sm:1, md:1, lg:1, xl:1};
  const iconSvg = shapes => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
  // SVG elements and attributes that are written camelCase in SVG itself.
  const SVG_TAGS = new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','marker','linearGradient','radialGradient','stop','clipPath','pattern','use','title']);
  const SVG_CAMEL = new Set(['viewBox','markerWidth','markerHeight','refX','refY','preserveAspectRatio','gradientUnits','gradientTransform','patternUnits','patternContentUnits','markerUnits','startOffset','textLength','lengthAdjust','clipPathUnits']);
  // safe (live HTML, shown in a page rather than drawn to an image): no event attributes or script URLs.
  function svgAttrs(p, isRoot, safe = false) {
    const out = [];
    for (const [key, value] of Object.entries(p)) {
      if (['key','xmlns','children','style'].includes(key) || value == null || typeof value === 'object') continue;
      const name = key === 'className' ? 'class' : SVG_CAMEL.has(key) ? key : key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      if (!/^[a-z][\w:-]*$/i.test(name)) continue;
      if (safe && (/^on/i.test(name) || /^\s*(javascript|data|vbscript):/i.test(String(value)))) continue;
      out.push(` ${name}="${escapeHtml(value)}"`);
    }
    if (isRoot) out.push(' xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;height:auto"');
    return out.join('');
  }
  const PALETTE = ['#3a83f7','#53b559','#ee7c37','#924ff7','#cf6194','#d2a02b'];
  function chartSvg(p, pie) {
    const {rows, xKey, series} = chartModel(p, pie), W = 640, H = Math.max(180, Math.min(480, Number(p.height) || 280));
    const color = (s, i) => safeCss(s?.color) || safeCss(s?.fill) || PALETTE[i % PALETTE.length];
    const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;height:auto" font-size="12" fill="#5d5d5d">${body}</svg>`;
    if (!rows.length || !series.length) return `<div class="widget">${escapeHtml(t('dil.chartEmptyHtml'))}</div>`;
    if (pie) {
      const s = series[0], values = rows.map(r => Math.max(0, Number(r[s.dataKey]) || 0)), total = values.reduce((a, b) => a + b, 0) || 1;
      const cx = H / 2, cy = H / 2, r = H / 2 - 16;let angle = -Math.PI / 2, out = '';
      values.forEach((v, i) => {
        const next = angle + v / total * Math.PI * 2, large = next - angle > Math.PI ? 1 : 0;
        const [x1, y1, x2, y2] = [cx + r * Math.cos(angle), cy + r * Math.sin(angle), cx + r * Math.cos(next), cy + r * Math.sin(next)];
        out += v >= total ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${PALETTE[i % PALETTE.length]}"/>` : `<path d="M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff" stroke-width="2"/>`;
        angle = next;
      });
      rows.forEach((row, i) => {out += `<rect x="${H + 24}" y="${24 + i * 22}" width="10" height="10" rx="2" fill="${PALETTE[i % PALETTE.length]}"/><text x="${H + 40}" y="${33 + i * 22}" fill="#0d0d0d">${escapeHtml(t('dil.pieItem', row[xKey], formatNumber(values[i]) + (s.valueSuffix || ''), Math.round(values[i] / total * 100)))}</text>`;});
      return svg(out);
    }
    const line = p.showDots === true || series.some(s => s.type === 'line' || s.chartType === 'line');
    const values = rows.flatMap(r => series.map(s => Number(r[s.dataKey]))).filter(Number.isFinite);
    let min = Math.min(0, ...values), max = Math.max(0, ...values);if (max === min) max = min + 1;
    const rough = (max - min) / 4, mag = 10 ** Math.floor(Math.log10(rough)), step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(v => v >= rough);
    min = Math.floor(min / step) * step;max = Math.ceil(max / step) * step;
    const L = 48, R = 12, T = 30, B = 30, plotW = W - L - R, plotH = H - T - B, y = v => T + (max - v) / (max - min) * plotH, band = plotW / rows.length;
    let out = '';
    for (let v = min; v <= max + step / 2; v += step) out += `<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="rgba(13,13,13,${Math.abs(v) < step / 1e6 ? '.25' : '.08'})"/><text x="${L - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatNumber(v))}</text>`;
    const every = Math.ceil(rows.length / 12);
    rows.forEach((row, i) => {if (i % every === 0) out += `<text x="${(L + band * (i + .5)).toFixed(1)}" y="${H - 10}" text-anchor="middle">${escapeHtml(String(row[xKey] ?? ''))}</text>`;});
    series.forEach((s, si) => {
      if (line) {
        const pts = rows.map((row, i) => [L + band * (i + .5), y(Number(row[s.dataKey]) || 0)]);
        out += `<polyline points="${pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}" fill="none" stroke="${color(s, si)}" stroke-width="2"/>`;
        if (rows.length <= 40) out += pts.map(([a, b]) => `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="3" fill="${color(s, si)}"/>`).join('');
      } else {
        const group = band * .7, w = group / series.length;
        rows.forEach((row, i) => {const v = Number(row[s.dataKey]) || 0, top = y(Math.max(v, 0)), bottom = y(Math.min(v, 0));out += `<rect x="${(L + band * i + (band - group) / 2 + w * si).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(1, w - 2).toFixed(1)}" height="${Math.max(1, bottom - top).toFixed(1)}" rx="2" fill="${color(s, si)}"/>`;});
      }
      out += `<rect x="${L + si * 120}" y="6" width="10" height="10" rx="2" fill="${color(s, si)}"/><text x="${L + si * 120 + 16}" y="15" fill="#0d0d0d">${escapeHtml(s.label || s.dataKey)}</text>`;
    });
    return svg(out);
  }
  // Well-formed XHTML, so it can be embedded in an SVG foreignObject.
  // opts.live (the HTML export): working controls, real links and images, MathML formulas;
  // see liveHtml below. Without opts the output is unchanged (card images).
  function toHtml(tree, opts = {}) {
    const live = opts.live ? liveHtml(opts) : null;
    function walk(node, ctx = {}) {
      if (node == null || node === false || node === true) return '';
      if (typeof node !== 'object') return escapeHtml(node);
      if (Array.isArray(node)) return node.map(n => walk(n, ctx)).join('');
      const p = node.props || {}, kids = (c = ctx) => walk(node.children, c), inline = () => walk(node.children, {...ctx, inline:true});
      if (ctx.svg) {
        if (!SVG_TAGS.has(node.type)) return kids();
        return `<${node.type}${svgAttrs(p, false, !!live)}>${kids()}</${node.type}>`;
      }
      if (live) {const out = live(node, p, ctx, kids, inline);if (out !== undefined) return out;}
      switch (node.type) {
        case 'svg': return `<svg${svgAttrs(p, true, !!live)}>${kids({svg:true})}</svg>`;
        case 'bold': return `<strong>${inline()}</strong>`;
        case 'italic': return `<em>${inline()}</em>`;
        case 'strike': case 'strikethrough': return `<s>${inline()}</s>`;
        case 'code': return `<code>${inline()}</code>`;
        case 'link': return `<span class="link">${inline()}</span>`;
        case 'input': case 'textarea': return `<span class="input${node.type === 'textarea' ? ' input-area' : ''}">${escapeHtml(p.value || p.placeholder || '')}</span>`;
        case 'spacer': return '<div style="flex:1 1 auto"></div>';
        case 'col': case 'form': return `<div class="box"${boxStyle(p)}>${kids({...ctx, inline:false})}</div>`;
        // A clickable panel (a folding section's header) is a box; direction:"row" keeps its title and chevron on one line.
        case 'pressable': return `<div class="box${p.direction === 'row' ? ' dir-row' : ''}"${boxStyle(p)}>${kids({...ctx, inline:false})}</div>`;
        case 'favicon': return '';
        case 'cite': if (p.file) return `<span class="cite">${escapeHtml(p.file)}</span>`;return (Array.isArray(p.items) ? p.items : []).slice(0, 1).map(i => `<span class="cite">${escapeHtml(i.label)}${p.items.length > 1 ? ` +${p.items.length - 1}` : ''}</span>`).join('');
        case 'writing-block': return `<pre class="codeblk">${escapeHtml(String(p.value ?? '').trim())}</pre>`;
        case 'math': return p.block ? `<div class="math math-block">${texHtml(p.value ?? '')}</div>` : `<span class="math">${texHtml(p.value ?? '')}${inline()}</span>`;
        case 'title': return `<div class="${textClasses(p, 'title')}"${textStyle(p)}>${inline()}</div>`;
        case 'text': return ctx.inline || p.inline ? `<span class="${textClasses(p, 't')}"${textStyle(p)}>${inline()}</span>` : `<p class="${textClasses(p, 't')}"${textStyle(p)}>${inline()}</p>`;
        case 'caption': return ctx.inline ? `<span class="caption">${inline()}</span>` : `<p class="caption"${textStyle(p)}>${inline()}</p>`;
        case 'checkbox': return `<div class="cb"><span class="cb-box${p.checked ? ' on' : ''}">${p.checked ? '✓' : ''}</span><span>${inline()}</span></div>`;
        case 'radio-group': return `<div class="radios${p.direction === 'row' ? ' dir-row' : ''}">${kids({...ctx, radio:String(p.value ?? '')})}</div>`;
        case 'radio': {const on = ctx.radio !== undefined && String(p.value) === ctx.radio;return `<div class="cb"><span class="rb${on ? ' on' : ''}">${on ? '<span class="rb-dot"></span>' : ''}</span><span>${inline()}</span></div>`;}
        case 'divider': return '<hr class="hr"/>';
        case 'code-block': return `<pre class="codeblk"><code>${escapeHtml(String(p.value ?? '').replace(/^\n+|\n+$/g, ''))}</code></pre>`;
        case 'card': return `<div class="card"${boxStyle(p)}>${kids()}</div>`;
        case 'box': case 'row': case 'grid': case 'grid-item': {
          // An empty box is a bar segment or swatch: fill the row's height.
          const fill = !(node.children || []).some(c => c != null && c !== false && c !== '') && p.height == null ? ' data-fill="1"' : '';
          return `<div class="${node.type}"${fill}${boxStyle(p)}>${kids({...ctx, inline:false})}</div>`;
        }
        case 'table': return `<table class="tbl"><tbody>${kids()}</tbody></table>`;
        case 'table-row': return `<tr>${kids()}</tr>`;
        case 'table-cell': {const tag = p.header ? 'th' : 'td', align = p.align === 'end' || p.align === 'right' ? 'right' : p.align === 'center' ? 'center' : null;return `<${tag}${align ? ` style="text-align:${align}"` : ''}>${kids({...ctx, inline:false})}</${tag}>`;}
        case 'list': {const tag = p.marker === 'number' ? 'ol' : 'ul';return `<${tag} class="lst">${kids()}</${tag}>`;}
        case 'list-item': return `<li>${kids({...ctx, inline:false})}</li>`;
        case 'blockquote': return `<blockquote class="bq">${kids()}</blockquote>`;
        case 'badge': return `<span class="badge b-${String(p.color || 'default').replace(/[^\w-]/g, '')}">${inline()}</span>`;
        // Lucide's vector icon when it has the name; else the old symbol, else a small dot.
        case 'icon': return `<span class="icon${p.color ? ` c-${String(p.color).replace(/[^\w-]/g, '')}` : ''}${ICON_SIZE[p.size] ? ` icon-${p.size}` : ''}">${ICON_SVG[p.name] ? iconSvg(ICON_SVG[p.name]) : ICONS[p.name] || iconSvg('<circle cx="12" cy="12" r="3" fill="currentColor"/>')}</span>`;
        case 'button': return `<span class="btn btn-${String(p.size || 'md').replace(/[^\w-]/g, '')} btn-${String(p.variant === 'outline' || p.variant === 'ghost' ? p.variant : p.color || 'primary').replace(/[^\w-]/g, '')}">${inline()}</span>`;
        case 'slider': {const min = Number(p.min ?? 0), max = Number(p.max ?? 100), pct = max > min ? Math.max(0, Math.min(100, (Number(p.value ?? min) - min) / (max - min) * 100)) : 0;return `<div class="slider"><div class="slider-track"></div><div class="slider-fill" style="width:${pct.toFixed(2)}%"></div><div class="slider-thumb" style="left:${pct.toFixed(2)}%"></div></div>`;}
        case 'segmented-control': return `<div class="seg${p.block ? ' seg-block' : ''}">${(Array.isArray(p.options) ? p.options : []).map(o => {const value = o && typeof o === 'object' ? o.value : o;return `<span class="seg-opt${value === p.value ? ' on' : ''}">${escapeHtml(optionLabel([o], value))}</span>`;}).join('')}</div>`;
        case 'select': return `<span class="select"><span>${escapeHtml(optionLabel(p.options, p.value))}</span><span class="c-secondary">▾</span></span>`;
        case 'chart': return chartSvg(p, false);
        case 'pie-chart': return chartSvg(p, true);
        case 'image': {
          // Remote images cannot be loaded offscreen: the panel downloads them first and passes
          // a data URL (props.data); without one, a placeholder of the image's own size keeps the layout.
          const sized = /^\d+(\.\d+)?px$/.test(String(p.width)), width = sized ? String(p.width) : '180px', [rw, rh] = String(p.ratio || '4:3').split(':').map(Number);
          // A share of its box (width="100%" in a 124px column) fills that box at the image's ratio;
          // drawn at the default 180px it would spill over the text beside it.
          if (/^\d+(\.\d+)?%$/.test(String(p.width))) {
            const size = `width:${escapeHtml(String(p.width))};max-width:100%;height:auto;aspect-ratio:${rw > 0 && rh > 0 ? `${rw}/${rh}` : '4/3'}`;
            if (/^data:image\//.test(p.data || '')) return `<img class="img-real" alt="" src="${escapeHtml(p.data)}" style="${size}"/>`;
            return `<div class="img img-ph" style="${size};box-sizing:border-box"><span>🖼</span><span class="img-alt">${escapeHtml(String(p.alt || t('dil.image')).slice(0, 60))}</span></div>`;
          }
          const height = rw > 0 && rh > 0 ? `${Math.round(parseFloat(width) * rh / rw)}px` : '135px';
          // A Markdown image in a card (a chart) has no size: ChatGPT shows it whole, as wide as its column.
          if (/^data:image\//.test(p.data || '') && !sized && !p.ratio) return `<img class="img-real img-whole" alt="" src="${escapeHtml(p.data)}"/>`;
          if (/^data:image\//.test(p.data || '')) return `<img class="img-real" alt="" src="${escapeHtml(p.data)}" style="width:${width};height:${height}"/>`;
          return `<div class="img img-ph" style="width:${width};height:${height}"><span>🖼</span><span class="img-alt">${escapeHtml(String(p.alt || t('dil.image')).slice(0, 60))}</span></div>`;
        }
        case 'image-group': return `<div class="img-row">${kids()}</div>`;
        case 'map-image': return '';
        case '__chatgptClientDefinedWidget': return `<div class="widget">${escapeHtml(t('dil.appSaved'))}</div>`;
        default: return ctx.inline || inlineTypes.has(node.type) ? inline() : `<div>${kids()}</div>`;
      }
    }
    return walk(tree);
  }
  // The HTML export's version of the components that differ from a card image: controls that
  // work (each event prop is a number into the live handlers, see evaluate), links that open,
  // pictures from opts.image(src), formulas from opts.math(tex, block), AppBlocks from
  // opts.widget(invocationId). The same markup is the page's static copy, without handlers.
  // Returns undefined to use the card-image branch.
  const json = value => escapeHtml(JSON.stringify(value ?? null));
  const safeUrl = url => typeof url === 'string' && /^(https?:|mailto:)/i.test(url.trim()) ? url.trim().replace(/\?utm_source=chatgpt\.com&/, '?').replace(/[?&]utm_source=chatgpt\.com(?![\w%.~-])/, '') : '';
  function liveHtml(opts) {
    const on = (p, name) => p.__on && Number.isInteger(p.__on[name]) ? ` data-on="${p.__on[name]}"` : '';
    const anchor = (url, body, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${body}</a>`;
    const valueOf = o => o && typeof o === 'object' ? o.value : o;
    return (node, p, ctx, kids, inline) => {
      switch (node.type) {
        case 'link': {const url = safeUrl(p.href || p.url);return url ? anchor(url, inline(), 'link') : inline();}
        case 'cite': {
          if (p.file) return undefined;
          const items = (Array.isArray(p.items) ? p.items : []).filter(i => safeUrl(i?.url));
          if (!items.length) return '';
          const one = i => anchor(safeUrl(i.url), escapeHtml(i.label));
          return `<span class="cite">${one(items[0])}${items.length > 1 ? `<span class="cite-more"> +${items.length - 1}<span class="cite-list">${items.slice(1).map(one).join('')}</span></span>` : ''}</span>`;
        }
        case 'math': {
          const tex = String(p.value ?? textOf(node.children)), out = opts.math?.(tex, !!p.block);
          return typeof out === 'string' ? (p.block ? `<div class="math-block">${out}</div>` : out) : undefined;
        }
        case 'image': {
          const src = p.src && opts.image?.(p.src);
          if (!src) return undefined;
          const sized = /^\d+(\.\d+)?px$/.test(String(p.width)), width = sized ? String(p.width) : '180px', [rw, rh] = String(p.ratio || '4:3').split(':').map(Number);
          const height = rw > 0 && rh > 0 ? `${Math.round(parseFloat(width) * rh / rw)}px` : '135px', alt = escapeHtml(String(p.alt || ''));
          const img = !sized && !p.ratio ? `<img class="img-real img-whole" alt="${alt}" src="${escapeHtml(src)}"/>` : `<img class="img-real" alt="${alt}" src="${escapeHtml(src)}" style="width:${width};height:${height}"/>`;
          return safeUrl(p.href) ? anchor(safeUrl(p.href), img, 'img-link') : img;
        }
        case 'slider': {
          const min = Number(p.min ?? 0), max = Number(p.max ?? 100), step = Number(p.step) > 0 ? Number(p.step) : 1, value = Number(p.value ?? min);
          return `<input type="range" class="slider-input" min="${min}" max="${max}" step="${step}" value="${Number.isFinite(value) ? value : min}"${on(p, 'onChange')} aria-label="${escapeHtml(t('dil.sliderLabel'))}"/>`;
        }
        case 'segmented-control': return `<div class="seg${p.block ? ' seg-block' : ''}" role="tablist">${(Array.isArray(p.options) ? p.options : []).map(o => {const v = valueOf(o), sel = v === p.value;return `<button type="button" class="seg-opt${sel ? ' on' : ''}" role="tab" aria-selected="${sel}"${on(p, 'onChange')} data-value="${json(v)}">${escapeHtml(optionLabel([o], v))}</button>`;}).join('')}</div>`;
        case 'select': return `<select class="select-input${p.block ? ' select-block' : ''}"${on(p, 'onChange')}>${(Array.isArray(p.options) ? p.options : []).map(o => {const v = valueOf(o);return `<option data-value="${json(v)}"${v === p.value ? ' selected=""' : ''}>${escapeHtml(optionLabel([o], v))}</option>`;}).join('')}</select>`;
        case 'checkbox': return `<div class="cb cb-live" role="checkbox" tabindex="0" aria-checked="${!!p.checked}"${on(p, 'onChange')} data-value="${json(!p.checked)}"><span class="cb-box${p.checked ? ' on' : ''}">${p.checked ? '✓' : ''}</span><span>${inline()}</span></div>`;
        case 'radio-group': return `<div class="radios${p.direction === 'row' ? ' dir-row' : ''}" role="radiogroup">${kids({...ctx, radio:String(p.value ?? ''), radioOn:on(p, 'onChange')})}</div>`;
        case 'radio': {const sel = ctx.radio !== undefined && String(p.value) === ctx.radio;return `<div class="cb rb-live" role="radio" tabindex="0" aria-checked="${sel}"${ctx.radioOn || ''} data-value="${json(p.value)}"><span class="rb${sel ? ' on' : ''}">${sel ? '<span class="rb-dot"></span>' : ''}</span><span>${inline()}</span></div>`;}
        case 'button': return `<button type="button" class="btn btn-${String(p.size || 'md').replace(/[^\w-]/g, '')} btn-${String(p.variant === 'outline' || p.variant === 'ghost' ? p.variant : p.color || 'primary').replace(/[^\w-]/g, '')}"${on(p, 'onClick')}>${inline()}</button>`;
        case 'pressable': return `<div class="box pressable${p.direction === 'row' ? ' dir-row' : ''}" role="button" tabindex="0"${on(p, 'onClick')}${boxStyle(p)}>${kids({...ctx, inline:false})}</div>`;
        case 'input': return `<input type="text" class="input"${on(p, 'onChange')} value="${escapeHtml(p.value ?? '')}" placeholder="${escapeHtml(p.placeholder ?? '')}"/>`;
        case 'textarea': return `<textarea class="input input-area"${on(p, 'onChange')} placeholder="${escapeHtml(p.placeholder ?? '')}">${escapeHtml(p.value ?? '')}</textarea>`;
        case '__chatgptClientDefinedWidget': {const out = opts.widget?.(p.invocationId);return typeof out === 'string' && out ? out : undefined;}
        case 'map-image': {const out = opts.map?.(p);return typeof out === 'string' ? out : undefined;}
        // The drawn chart shows few of its numbers; the data stays one click away, as in the Markdown table.
        case 'chart': case 'pie-chart': {
          const pie = node.type === 'pie-chart', {rows, xKey, series} = chartModel(p, pie), cells = (tag, values) => `<tr>${values.map(v => `<${tag}>${escapeHtml(v ?? '')}</${tag}>`).join('')}</tr>`;
          const data = rows.length && series.length ? `<details class="chart-data"><summary>${escapeHtml(t('dil.chartData'))}</summary><table class="tbl"><tbody>${cells('th', [xKey, ...series.map(s => s.label || s.dataKey)])}${rows.map(r => cells('td', [r[xKey], ...series.map(s => `${formatNumber(r[s.dataKey])}${s.valueSuffix || ''}`)])).join('')}</tbody></table></details>` : '';
          return chartSvg(p, pie) + data;
        }
        default: return undefined;
      }
    };
  }
  const cardCss = () => CARD_CSS.replace('__CJK__', fonts());
  // Styles for the live components above, added to the card styles in the HTML export.
  const LIVE_CSS = `.dil-root.live{width:auto;padding:0;background:transparent}
.slider-input{display:block;width:100%;height:20px;margin:0;accent-color:#0d0d0d;cursor:pointer}
button.seg-opt{border:0;background:transparent;font:inherit;font-size:14px;line-height:20px;font-weight:500;cursor:pointer}button.seg-opt:not(.on):hover{color:#0d0d0d}
.select-input{height:32px;max-width:100%;padding:0 8px;border:1px solid rgba(13,13,13,.15);border-radius:8px;background:#fff;color:#0d0d0d;font:inherit;font-size:14px}.select-block{width:100%}
.cb-live,.rb-live,[data-on]{cursor:pointer;user-select:none}button.btn{font-family:inherit;cursor:pointer}button.btn:hover{opacity:.85}
.pressable:hover{background-color:rgba(13,13,13,.03)}.dir-row{flex-direction:row}
input.input,textarea.input{font:inherit;font-size:14px;color:#0d0d0d;outline:none}textarea.input{resize:vertical}
a.link{color:#2964aa}a.img-link{display:contents}.cite a{color:inherit;text-decoration:none}.cite-more{position:relative}.cite-list{display:none;position:absolute;left:0;top:100%;z-index:2;flex-direction:column;gap:2px;padding:6px 8px;background:#fff;border:1px solid rgba(13,13,13,.1);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.08)}.cite-more:hover .cite-list,.cite-more:focus-within .cite-list{display:flex}
.math-block{display:block;text-align:center;overflow-x:auto}math{font-size:1.08em}
.dil-toast{position:fixed;left:50%;bottom:8px;z-index:5;max-width:92%;transform:translateX(-50%);padding:6px 14px;border-radius:9999px;background:#0d0d0d;color:#fff;font-size:13px;line-height:18px;box-shadow:0 2px 10px rgba(0,0,0,.2)}
.chart-data{margin-top:4px;font-size:13px;color:#5d5d5d}.chart-data summary{cursor:pointer}.chart-data .tbl{font-size:13px}
.ab-frame{display:block;width:100%;height:480px;border:0;border-radius:12px;background:#fff}`;
  // LaTeX to MathML Core, which Chrome draws natively. The source stays in an annotation, so
  // copying and searching still find it. Returns null for input it cannot read (the caller
  // shows the source); an unknown command keeps its name.
  const MATH_IDENT = {alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ϵ', varepsilon:'ε', zeta:'ζ', eta:'η', theta:'θ', vartheta:'ϑ', iota:'ι', kappa:'κ', lambda:'λ', mu:'μ', nu:'ν', xi:'ξ', pi:'π', varpi:'ϖ', rho:'ρ', varrho:'ϱ', sigma:'σ', varsigma:'ς', tau:'τ', upsilon:'υ', phi:'ϕ', varphi:'φ', chi:'χ', psi:'ψ', omega:'ω',
    Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π', Sigma:'Σ', Upsilon:'Υ', Phi:'Φ', Psi:'Ψ', Omega:'Ω', ell:'ℓ', hbar:'ℏ', infty:'∞', partial:'∂', nabla:'∇', emptyset:'∅', varnothing:'∅', aleph:'ℵ', Re:'ℜ', Im:'ℑ', wp:'℘', imath:'ı', jmath:'ȷ'};
  const MATH_OP = {cdot:'·', times:'×', div:'÷', pm:'±', mp:'∓', le:'≤', leq:'≤', leqslant:'⩽', ge:'≥', geq:'≥', geqslant:'⩾', neq:'≠', ne:'≠', approx:'≈', equiv:'≡', sim:'∼', simeq:'≃', cong:'≅', propto:'∝', to:'→', rightarrow:'→', leftarrow:'←', gets:'←', Rightarrow:'⇒', Leftarrow:'⇐', leftrightarrow:'↔', Leftrightarrow:'⇔', iff:'⟺', implies:'⟹', mapsto:'↦', longrightarrow:'⟶', longleftarrow:'⟵', uparrow:'↑', downarrow:'↓', rightleftharpoons:'⇌', xrightarrow:'→',
    in:'∈', notin:'∉', ni:'∋', subset:'⊂', subseteq:'⊆', supset:'⊃', supseteq:'⊇', cup:'∪', cap:'∩', setminus:'∖', wedge:'∧', land:'∧', vee:'∨', lor:'∨', neg:'¬', lnot:'¬', forall:'∀', exists:'∃', nexists:'∄', circ:'∘', bullet:'∙', star:'⋆', ast:'∗', oplus:'⊕', otimes:'⊗', odot:'⊙', perp:'⊥', parallel:'∥', mid:'∣', nmid:'∤', ll:'≪', gg:'≫', prec:'≺', succ:'≻',
    ldots:'…', cdots:'⋯', vdots:'⋮', ddots:'⋱', dots:'…', prime:'′', degree:'°', angle:'∠', triangle:'△', square:'□', therefore:'∴', because:'∵', langle:'⟨', rangle:'⟩', lceil:'⌈', rceil:'⌉', lfloor:'⌊', rfloor:'⌋', vert:'|', Vert:'‖', '|':'‖', lbrace:'{', rbrace:'}', '{':'{', '}':'}', backslash:'∖', colon:':', '%':'%', '$':'$', '&':'&', '#':'#', '_':'_'};
  const MATH_BIG = {sum:['∑', true], prod:['∏', true], coprod:['∐', true], bigcup:['⋃', true], bigcap:['⋂', true], bigoplus:['⨁', true], bigotimes:['⨂', true], int:['∫', false], iint:['∬', false], iiint:['∭', false], oint:['∮', false]};
  const MATH_FN = new Set(['sin','cos','tan','cot','sec','csc','arcsin','arccos','arctan','sinh','cosh','tanh','coth','log','ln','lg','exp','det','dim','ker','deg','gcd','lcm','arg','max','min','sup','inf','lim','liminf','limsup','Pr','sgn','tr','rank','mod']);
  const MATH_LIMITS = new Set(['lim','max','min','sup','inf','liminf','limsup']);
  const MATH_SPACE = {',':'0.1667em', ':':'0.2222em', '>':'0.2222em', ';':'0.2778em', ' ':'0.25em', quad:'1em', qquad:'2em', '!':'-0.1667em', enspace:'0.5em', thinspace:'0.1667em', medspace:'0.2222em', thickspace:'0.2778em'};
  const MATH_ACCENT = {hat:'^', widehat:'^', bar:'¯', overline:'¯', vec:'→', overrightarrow:'→', tilde:'~', widetilde:'~', dot:'˙', ddot:'¨', check:'ˇ', breve:'˘', acute:'´', grave:'`', overbrace:'⏞'};
  const MATH_TEXT = new Set(['text','textrm','textbf','textit','textsf','texttt','textnormal','mbox','hbox']);
  const MATH_DROP = new Set(['left','right','displaystyle','textstyle','scriptstyle','limits','nolimits','big','Big','bigg','Bigg','bigl','bigr','Bigl','Bigr','biggl','biggr','middle','nonumber','notag','label','tag']);
  const DOUBLE = {C:'ℂ', H:'ℍ', N:'ℕ', P:'ℙ', Q:'ℚ', R:'ℝ', Z:'ℤ'}, SCRIPT = {B:'ℬ', E:'ℰ', F:'ℱ', H:'ℋ', I:'ℐ', L:'ℒ', M:'ℳ', R:'ℛ'};
  const letterIn = (base, special) => ch => special[ch] || (/[A-Z]/.test(ch) ? String.fromCodePoint(base + ch.charCodeAt(0) - 65) : ch);
  const MATH_FONT = {mathbb:letterIn(0x1D538, DOUBLE), Bbb:letterIn(0x1D538, DOUBLE), mathcal:letterIn(0x1D49C, SCRIPT), mathscr:letterIn(0x1D49C, SCRIPT)};
  const MATH_STYLE = {mathbf:'font-weight:bold', boldsymbol:'font-weight:bold', bm:'font-weight:bold', mathsf:'font-family:sans-serif', mathtt:'font-family:monospace', mathit:'font-style:italic'};
  const ENV_FENCE = {pmatrix:['(', ')'], bmatrix:['[', ']'], Bmatrix:['{', '}'], vmatrix:['|', '|'], Vmatrix:['‖', '‖'], cases:['{', ''], dcases:['{', ''], rcases:['', '}']};
  function texMathml(source, display = false) {
    const s = String(source), esc = escapeHtml;let i = 0, steps = 0;
    const fail = () => {throw Error('tex');};
    const space = () => {while (i < s.length && /\s/.test(s[i])) i++;};
    const name = () => {i++;const m = /^[a-zA-Z]+/.exec(s.slice(i));const n = m ? m[0] : s[i] || '';i += n.length || 1;return n;};
    const mrow = items => items.length === 1 ? items[0] : `<mrow>${items.join('')}</mrow>`;
    const mo = (c, attrs = '') => `<mo${attrs}>${esc(c)}</mo>`;
    // Raw text up to the matching brace, for \text{…} and environment names.
    const raw = () => {space();if (s[i] !== '{') return s[i++] || '';let depth = 0, out = '';for (i++; i < s.length; i++) {if (s[i] === '\\' && i + 1 < s.length) {out += s[i] + s[i + 1];i++;continue;}if (s[i] === '{') depth++;else if (s[i] === '}' && !depth--) {i++;return out;}out += s[i];}return out;};
    const arg = () => {space();if (s[i] === '{') {i++;const items = list();if (s[i] !== '}') fail();i++;return mrow(items);}return atom()?.html ?? '<mrow></mrow>';};
    // A command at i: "\right" but not "\rightarrow".
    const at = t => s.startsWith(t, i) && !(/[a-zA-Z]$/.test(t) && /[a-zA-Z]/.test(s[i + t.length] || ''));
    const stop = () => i >= s.length || s[i] === '}' || s[i] === '&' || at('\\\\') || at('\\end') || at('\\right') || at('\\cr');
    // A delimiter after \left, \right, \big…
    const delimiter = () => {space();if (s[i] === '\\') {const n = name();return n === '|' ? '‖' : MATH_OP[n] ?? n;}const c = s[i++];return c === '.' ? '' : c;};
    function list() {
      const out = [];
      while (!stop()) {
        if (++steps > 20000) fail();
        const a = atom();if (!a) continue;
        let sup = null, sub = null, primes = '';
        for (;;) {
          space();
          if (s[i] === "'") {primes += '′';i++;}
          else if (s[i] === '^' && sup == null) {i++;sup = arg();}
          else if (s[i] === '_' && sub == null) {i++;sub = arg();}
          else break;
        }
        if (primes) sup = sup == null ? mo(primes) : `<mrow>${mo(primes)}${sup}</mrow>`;
        let html = a.html;
        if (sup != null || sub != null) {
          const under = a.limits && (display || a.always);
          html = sup != null && sub != null ? `<${under ? 'munderover' : 'msubsup'}>${html}${sub}${sup}</${under ? 'munderover' : 'msubsup'}>`
            : sub != null ? `<${under ? 'munder' : 'msub'}>${html}${sub}</${under ? 'munder' : 'msub'}>` : `<${under ? 'mover' : 'msup'}>${html}${sup}</${under ? 'mover' : 'msup'}>`;
        }
        out.push(html);
      }
      return out;
    }
    // Rows split by \\ and cells by &, up to \end{name} (or the end of the source at the top level).
    function table(env) {
      const rows = [];let row = [];
      for (;;) {
        if (++steps > 20000) fail();
        row.push(mrow(list()));
        if (s[i] === '&') {i++;continue;}
        if (at('\\\\') || at('\\cr')) {i += at('\\\\') ? 2 : 3;space();if (s[i] === '[') {while (i < s.length && s[i] !== ']') i++;i++;}rows.push(row);row = [];continue;}
        rows.push(row);
        if (at('\\end')) {i += 4;raw();}
        else if (env && i < s.length) fail();
        break;
      }
      if (rows.length > 1 && rows.at(-1).every(c => c === '<mrow></mrow>' || c === '')) rows.pop();
      return rows;
    }
    function environment(env) {
      if (env === 'array' || env === 'subarray') raw();
      const rows = table(env), align = /^(aligned|align\*?|split|alignat\*?|eqnarray\*?)$/.test(env) ? ' columnalign="right left right left right left"' : /cases/.test(env) ? ' columnalign="left left"' : '';
      const body = `<mtable${align}>${rows.map(r => `<mtr>${r.map(c => `<mtd>${c}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
      const [l, r] = ENV_FENCE[env] || ['', ''];
      return l || r ? `<mrow>${l ? mo(l, ' fence="true"') : ''}${body}${r ? mo(r, ' fence="true"') : ''}</mrow>` : body;
    }
    function atom() {
      space();if (i >= s.length) return null;
      const c = s[i];
      if (c === '{') {i++;const items = list();if (s[i] !== '}') fail();i++;return {html:mrow(items)};}
      if (c === '^' || c === '_') return {html:'<mrow></mrow>'};
      if (c === '\\') {
        const n = name();
        if (n === '\\' || n === 'newline') return null;
        if (MATH_TEXT.has(n)) return {html:`<mtext>${esc(raw().replace(/\\([{}$%&#_ ])/g, '$1'))}</mtext>`};
        if (n === 'operatorname' || n === 'mathrm' || n === 'rm') {const t = raw();return {html:/^[A-Za-z]+$/.test(t) ? `<mi mathvariant="normal">${esc(t)}</mi>` : `<mrow>${texMathmlBody(t)}</mrow>`, limits:n === 'operatorname'};}
        if (MATH_FONT[n]) {const t = raw();return {html:/^[A-Za-z ]*$/.test(t) ? `<mi>${esc([...t.replace(/\s/g, '')].map(MATH_FONT[n]).join(''))}</mi>` : `<mrow>${texMathmlBody(t)}</mrow>`};}
        if (MATH_STYLE[n]) return {html:`<mrow style="${MATH_STYLE[n]}">${arg()}</mrow>`};
        if (/^[dtc]?frac$/.test(n)) {const a = arg(), b = arg();return {html:`<mfrac${n === 'dfrac' ? ' displaystyle="true"' : ''}>${a}${b}</mfrac>`};}
        if (/^[dt]?binom$/.test(n)) {const a = arg(), b = arg();return {html:`<mrow>${mo('(')}<mfrac linethickness="0">${a}${b}</mfrac>${mo(')')}</mrow>`};}
        if (n === 'sqrt') {space();if (s[i] === '[') {i++;const items = [];while (i < s.length && s[i] !== ']') {const a = atom();if (a) items.push(a.html);space();}i++;const x = arg();return {html:`<mroot>${x}${mrow(items)}</mroot>`};}return {html:`<msqrt>${arg()}</msqrt>`};}
        if (MATH_ACCENT[n]) return {html:`<mover accent="true">${arg()}${mo(MATH_ACCENT[n], ' stretchy="true"')}</mover>`};
        if (n === 'underline' || n === 'underbrace') return {html:`<munder accentunder="true">${arg()}${mo(n === 'underline' ? '_' : '⏟', ' stretchy="true"')}</munder>`};
        if (n === 'left') {const l = delimiter(), items = list();if (!at('\\right')) fail();i += 6;const r = delimiter();return {html:`<mrow>${l ? mo(l, ' fence="true"') : ''}${items.join('')}${r ? mo(r, ' fence="true"') : ''}</mrow>`};}
        if (/^[bB]igg?[lrm]?$/.test(n)) {const d = delimiter();return d ? {html:mo(d, ' stretchy="false"')} : null;}
        if (n === 'begin') return {html:environment(raw().trim())};
        if (n in MATH_SPACE) return {html:`<mspace width="${MATH_SPACE[n]}"></mspace>`};
        if (n === 'hspace' || n === 'kern') {raw();return {html:'<mspace width="0.5em"></mspace>'};}
        if (n === 'color' || n === 'textcolor') {raw();return n === 'textcolor' ? {html:arg()} : null;}
        if (n === 'boxed' || n === 'fbox') return {html:`<mrow style="border:1px solid;padding:2px 4px">${arg()}</mrow>`};
        if (n === 'pmod') return {html:`<mrow>${mo('(')}<mi mathvariant="normal">mod</mi><mspace width="0.25em"></mspace>${arg()}${mo(')')}</mrow>`};
        if (n === 'not') {const a = atom();return a ? {html:`<mrow>${a.html}${mo('̸')}</mrow>`} : null;}
        if (MATH_BIG[n]) return {html:mo(MATH_BIG[n][0], ' largeop="true"'), limits:MATH_BIG[n][1]};
        if (MATH_FN.has(n)) return {html:`<mi>${esc(n)}</mi>`, limits:MATH_LIMITS.has(n), always:n === 'lim'};
        if (MATH_IDENT[n]) return {html:`<mi${/^[A-Z]/.test(n) && n.length > 1 ? ' mathvariant="normal"' : ''}>${MATH_IDENT[n]}</mi>`};
        if (MATH_OP[n] !== undefined) return {html:mo(MATH_OP[n])};
        if (MATH_DROP.has(n)) {if (/^(label|tag)$/.test(n)) raw();return null;}
        return {html:`<mi mathvariant="normal">${esc(n)}</mi>`};
      }
      const num = /^\d+(?:\.\d+)?/.exec(s.slice(i));
      if (num) {i += num[0].length;return {html:`<mn>${num[0]}</mn>`};}
      i++;
      if (c === '~') return {html:'<mspace width="0.25em"></mspace>'};
      if (/[A-Za-z]/.test(c)) return {html:`<mi>${c}</mi>`};
      if (c === '-') return {html:mo('−')};
      if (c === '*') return {html:mo('∗')};
      if ('+=<>/!,;:|()[].?'.includes(c)) return {html:mo(c, '()[]|'.includes(c) ? ' stretchy="false"' : '')};
      if (/\p{L}/u.test(c)) return {html:`<mi>${esc(c)}</mi>`};
      return {html:mo(c)};
    }
    const texMathmlBody = text => texMathml.body(text, display);
    try {
      const rows = table(null);
      const body = rows.length > 1 ? `<mtable columnalign="center">${rows.map(r => `<mtr>${r.map(c => `<mtd>${c}</mtd>`).join('')}</mtr>`).join('')}</mtable>` : rows[0].length > 1 ? rows[0].join('<mspace width="1em"></mspace>') : rows[0][0];
      if (i < s.length) fail();
      return {body};
    } catch {return null;}
  }
  texMathml.body = (text, display) => {const r = texMathml(text, display);if (!r) throw Error('tex');return r.body;};
  const mathml = (source, display = false) => {const r = texMathml(source, display);return r ? `<math${display ? ' display="block"' : ''}><semantics><mrow>${r.body}</mrow><annotation encoding="application/x-tex">${escapeHtml(source)}</annotation></semantics></math>` : null;};
  // Puts new markup into a live card without rebuilding what did not change, so a slider being
  // dragged, a focused field and a running AppBlock frame keep going.
  function morph(target, html) {
    const tpl = target.ownerDocument.createElement('template');tpl.innerHTML = html;
    (function patch(parent, next) {
      const a = [...parent.childNodes], b = [...next.childNodes];
      b.forEach((n, k) => {
        const o = a[k];
        if (!o) return parent.append(n);
        if (o.nodeType !== n.nodeType || o.nodeName !== n.nodeName || (o.nodeName === 'IFRAME' && o.getAttribute('srcdoc') !== n.getAttribute('srcdoc'))) return parent.replaceChild(n, o);
        if (o.nodeType !== 1) {if (o.nodeValue !== n.nodeValue) o.nodeValue = n.nodeValue;return;}
        const frame = o.nodeName === 'IFRAME';
        for (const at of [...o.attributes]) if (!n.hasAttribute(at.name) && !(frame && at.name === 'style')) o.removeAttribute(at.name);
        for (const at of [...n.attributes]) if (o.getAttribute(at.name) !== at.value && !(frame && at.name === 'style')) o.setAttribute(at.name, at.value);
        if (frame) return;
        if (o.nodeName === 'INPUT' || o.nodeName === 'TEXTAREA') {const v = o.nodeName === 'TEXTAREA' ? n.textContent : n.getAttribute('value') ?? '';if (o.value !== v && o.ownerDocument.activeElement !== o) o.value = v;if (o.nodeName === 'INPUT') return;}
        patch(o, n);
        if (o.nodeName === 'SELECT') {const k2 = [...o.options].findIndex(x => x.hasAttribute('selected'));if (k2 >= 0) o.selectedIndex = k2;}
      });
      for (let k = a.length - 1; k >= b.length; k--) a[k].remove();
    })(target, tpl.content);
  }
  // An AppBlock frame sizes itself to its content; elements as tall as the frame (a full-height
  // canvas) are left out, or the frame would keep growing.
  const APPBLOCK_SIZE = String(function reportSize() {
    const send = () => {try {const ih = innerHeight;let bottom = 0;for (const e of document.body ? document.body.querySelectorAll('*') : []) {const r = e.getBoundingClientRect();if (r.width && r.height && r.height < ih - 2) bottom = Math.max(bottom, r.bottom + scrollY);}parent.postMessage({type:'ab:size', height:Math.ceil(bottom) + 16}, '*');} catch (e) {}};
    addEventListener('load', () => {send();setTimeout(send, 400);setTimeout(send, 1500);try {new ResizeObserver(send).observe(document.body);} catch (e) {}});
  });
  function appBlockFrameHtml(block) {
    const script = `<script>(${APPBLOCK_SIZE})();</script>`, html = standaloneHtml(block);
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + script) : /<html[^>]*>/i.test(html) ? html.replace(/<html[^>]*>/i, m => m + script) : script + html;
  }
  const appBlockFrame = block => `<iframe class="ab-frame" title="${escapeHtml(block.title || t('dil.app'))}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" allow="fullscreen" srcdoc="${escapeHtml(appBlockFrameHtml(block))}"></iframe>`;
  // Applied for frames that post {type:'ab:size'}; a frame that keeps resizing stops after 30 tries.
  function setFrameHeight(frame, height) {
    const n = Number(frame.dataset.resizes || 0), next = Math.min(1600, Math.round(Number(height)));
    if (!(next >= 60) || n > 30 || Math.abs(next - (parseFloat(frame.style.height) || frame.offsetHeight || 0)) < 4) return;
    frame.dataset.resizes = String(n + 1);frame.style.height = `${next}px`;
  }
  function copyText(doc, text) {
    const fallback = () => {const t = doc.createElement('textarea');t.value = text;t.style.cssText = 'position:fixed;opacity:0';doc.body.append(t);t.select();try {doc.execCommand('copy');} catch {}t.remove();};
    try {doc.defaultView.navigator.clipboard.writeText(text).catch(fallback);} catch {fallback();}
  }
  // Runs inside a card frame of the HTML export: init = {frame, dil, card (index among the
  // message's cards), images:{src: url}, blocks:{invocationId: block}}. The program runs again
  // on every state change and the markup is patched in place. A state change is posted to the
  // page ({type:'dil:state'}), which passes it to the message's other cards ({type:'dil:set'}).
  function mountLive(init, doc, host) {
    if (init.text) pageWords = init.text;
    const win = doc.defaultView, store = new Map(), defaults = new Map();
    const send = data => {try {host.postMessage(Object.assign({frame:init.frame}, data), '*');} catch {}};
    const live = {handlers:[], refs:[], get:(key, value) => {defaults.set(key, value);return store.has(key) ? store.get(key) : value;},
      set:(key, next) => {
        const current = store.has(key) ? store.get(key) : defaults.get(key);let value;
        try {value = typeof next === 'function' ? next(current) : next;} catch {return;}
        if (Object.is(current, value)) return;
        store.set(key, value);schedule();
        let copy;try {copy = JSON.parse(JSON.stringify(value));} catch {return;}
        send({type:'dil:state', key, value:copy});
      },
      genui:new Proxy({
        copy:text => {copyText(doc, String(text ?? ''));toast(t('dil.copied'));},
        // A button that would send a new message in ChatGPT says what it would have sent.
        issueNewTurn:text => toast(t('dil.wouldSend', String(text ?? '').slice(0, 120))),
        openUrl:url => {if (safeUrl(url)) win.open(safeUrl(url), '_blank', 'noopener');}
      }, {get:(target, key) => key in target ? target[key] : (...args) => typeof args[0] === 'string' ? toast(t('dil.wouldRun', String(key))) : undefined})};
    const toast = text => {const t = doc.createElement('div');t.className = 'dil-toast';t.setAttribute('role', 'status');t.textContent = text;doc.querySelectorAll('.dil-toast').forEach(n => n.remove());doc.body.append(t);win.setTimeout(() => t.remove(), 3000);};
    const style = doc.createElement('style');style.textContent = `${cardCss()}\n${LIVE_CSS}`;doc.head.append(style);
    const root = doc.getElementById('root') || doc.body.appendChild(doc.createElement('div'));
    const execute = (code, scope) => Function(...Object.keys(scope), code)(...Object.values(scope));
    const opts = {live:true, image:src => init.images?.[src] || null, math:mathml, widget:id => init.blocks?.[id] ? appBlockFrame(init.blocks[id]) : null};
    let queued = false, shown = false;
    const schedule = () => {if (!queued) {queued = true;Promise.resolve().then(render);}};
    const size = () => send({type:'dil:size', height:Math.ceil(root.getBoundingClientRect().height)});
    function render() {
      queued = false;live.handlers.length = 0;
      try {
        const cards = segments(evaluate(init.dil, execute, {live})).filter(s => s.kind === 'card'), card = cards[init.card];
        morph(root, card ? `<div class="dil-root live">${toHtml(card.tree, opts)}</div>` : '');
        if (!shown) {shown = true;send({type:'dil:ready'});}
        size();
      } catch (e) {if (!shown) send({type:'dil:error', message:String(e?.message || e)});}
    }
    const fire = (el, value) => {const fn = live.handlers[Number(el.dataset.on)];if (typeof fn === 'function') try {fn(value);} catch {}};
    const valueOf = el => {try {return JSON.parse(el?.dataset?.value ?? 'null');} catch {return null;}};
    root.addEventListener('click', e => {
      const el = e.target.closest?.('[data-on]');
      if (!el || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || (e.target.closest('a') && el.contains(e.target.closest('a')))) return;
      fire(el, el.hasAttribute('data-value') ? valueOf(el) : undefined);
    });
    root.addEventListener('input', e => {const el = e.target;if (!el.dataset?.on || el.tagName === 'SELECT') return;fire(el, el.type === 'range' ? Number(el.value) : el.value);});
    root.addEventListener('change', e => {const el = e.target;if (el.tagName === 'SELECT' && el.dataset.on) fire(el, valueOf(el.options[el.selectedIndex]));});
    root.addEventListener('keydown', e => {if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-on][role]') && e.target.tagName === 'DIV') {e.preventDefault();e.target.click();}});
    win.addEventListener('message', e => {
      const d = e.data;
      if (d?.type === 'dil:set' && e.source === host) {store.set(d.key, d.value);schedule();}
      else if (d?.type === 'ab:size') {const f = [...doc.querySelectorAll('iframe')].find(x => x.contentWindow === e.source);if (f) setFrameHeight(f, d.height);}
    });
    if (win.ResizeObserver) new win.ResizeObserver(size).observe(root);
    render();
    return {render, store};
  }
  // A "picture list" card: every image sits alone in a row next to plain text (a title, a
  // description, links, citations), separated at most by dividers. Such a card can be written
  // as a Markdown table of thumbnail + text. Anything else (two images in a row, buttons,
  // charts, inputs, icons, nested cards) returns null and the card stays a PNG.
  // The loose form (used only for the HTML option) also takes what real picture lists look
  // like: the list in a col or grid, each image in a box of its own (row > box > image), the
  // text in a col (with rows of its own), and icons beside the text (left out, as in the
  // Markdown). Text-only parts before the first picture row and after the last one (a heading,
  // a badge, a caption) are kept as the list's header and footer ({md, html, htmlError}, set
  // on the returned array); text between two picture rows still keeps the card a PNG.
  const LIST_TEXT = new Set(['text','title','caption','bold','italic','strike','strikethrough','code','link','cite','badge','label','Fragment','box']);
  const LOOSE_TEXT = new Set([...LIST_TEXT, 'icon', 'col', 'row']), LOOSE_CONTAINERS = new Set(['col','grid','grid-item']);
  function pictureList(tree, {loose = false} = {}) {
    const items = [], header = [], footer = [], textTypes = loose ? LOOSE_TEXT : LIST_TEXT;
    const textOnly = n => n == null || n === false || typeof n !== 'object' ? true : Array.isArray(n) ? n.every(textOnly) : (textTypes.has(n.type) || (n.type === 'math' && !n.props?.block)) && (n.children || []).every(textOnly);
    const blank = n => n == null || n === false || n === true || (typeof n === 'string' && !n.trim()) || n?.type === 'divider' || n?.type === 'spacer';
    const imageOf = k => {
      if (k?.type === 'image') return k;
      if (!loose || k?.type !== 'box') return null;
      const inner = (k.children || []).filter(c => !blank(c));
      return inner.length === 1 && inner[0]?.type === 'image' ? inner[0] : null;
    };
    const visit = n => {
      if (blank(n)) return true;
      if (Array.isArray(n)) return n.every(visit);
      if (loose && textOnly(n)) {
        if (toMarkdown({type:'box', props:{}, children:[n]}).trim()) (items.length ? footer : header).push(n);
        return true;
      }
      if (typeof n !== 'object') return false;
      const kids = n.children || [], images = kids.map(imageOf).filter(Boolean);
      if (n.type === 'row' && images.length === 1) {
        if (footer.length) return false;
        const rest = kids.filter(k => !imageOf(k));
        if (!images[0].props?.src || !rest.every(textOnly)) return false;
        // Loose lists read the text inside the card (a title is bold, not a heading), as the
        // HTML shows it; the strict form keeps its existing Markdown.
        const md = toMarkdown({type:loose ? 'box' : 'Fragment', props:{}, children:rest}).trim();
        if (!md) return false;
        let html = null, htmlError = null;
        try { html = cardTextHtml(rest); } catch (e) { htmlError = e.message; }
        items.push({src:images[0].props.src, alt:String(images[0].props.alt || ''), md, html, htmlError});
        return true;
      }
      return (n.type === 'box' || n.type === 'card' || n.type === 'Fragment' || (loose && LOOSE_CONTAINERS.has(n.type))) && kids.every(visit);
    };
    const part = nodes => {
      const md = nodes.length ? toMarkdown({type:'box', props:{}, children:nodes}).trim() : '';
      if (!md) return null;
      let html = null, htmlError = null;
      try { html = cardTextHtml(nodes); } catch (e) { htmlError = e.message; }
      return {md, html, htmlError};
    };
    // An unexpected tree must never break the card: it simply stays a PNG.
    try {
      if (!visit(tree) || !items.length) return null;
      const head = part(header), foot = part(footer);
      if (head) items.header = head;
      if (foot) items.footer = foot;
      return items;
    } catch { return null; }
  }
  // The text beside one picture as HTML for the "Markdown + HTML" option, built from the card
  // tree (not by re-reading its Markdown), with the structure toMarkdown gives it: blocks are
  // separated by <br/>. Markdown viewers end an HTML block at a blank line, so the result never
  // holds a line break at all: every kind of newline becomes <br/>, control characters go.
  // Only the tags the validator allows are used (a strikethrough is <del>); a formula has no
  // place in them and throws, so that card keeps the Markdown table.
  const htmlText = t => String(t).replace(/\r\n?|[\n\u2028\u2029]/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/g, '').replace(/\t/g, ' ')
    .replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c])
    // Obsidian reads "$…$" as a formula even inside HTML.
    .replace(/\$/g, '&#36;').replace(/\n/g, '<br/>');
  function cardTextHtml(nodes) {
    const href = u => /^https?:\/\//i.test(String(u ?? '')) ? htmlText(mdUrl(u)) : '';
    function inline(node) {
      if (node == null || node === false || node === true) return '';
      if (typeof node !== 'object') return htmlText(node);
      if (Array.isArray(node)) return node.map(inline).join('');
      const p = node.props || {};
      switch (node.type) {
        case 'bold': return `<strong>${inline(node.children)}</strong>`;
        case 'italic': return `<em>${inline(node.children)}</em>`;
        case 'strike': case 'strikethrough': return `<del>${inline(node.children)}</del>`;
        case 'math': throw Error(t('dil.hasMath'));
        case 'code': return `<code>${htmlText(textOf(node.children))}</code>`;
        case 'link': {const url = href(p.href || p.url), text = inline(node.children);return url ? `<a href="${url}">${text || url}</a>` : text;}
        case 'cite': {
          if (p.file) return t('dil.fileCite', htmlText(p.file));
          const items = Array.isArray(p.items) ? p.items : [];
          return items.length ? t('dil.cite', `${items.map(i => {const url = href(i.url);return url ? `<a href="${url}">${htmlText(i.label ?? '')}</a>` : htmlText(i.label ?? '');}).join(t('dil.sep'))}`) : '';
        }
        case 'badge': return t('dil.badge', inline(node.children).trim());
        case 'icon': return '';
        default: return inline(node.children);
      }
    }
    function blocks(children, ui) {
      const out = [];let run = [];
      const flush = () => {const text = inline(run).replace(/^(?:\s|<br\/>)+|(?:\s|<br\/>)+$/g, '');if (text) out.push(text);run = [];};
      for (const child of [].concat(children ?? [])) {
        if (isInlineNode(child)) {run.push(child);continue;}
        flush();const text = block(child, ui);if (text) out.push(text);
      }
      flush();
      return out.join('<br/>');
    }
    function block(node, ui) {
      if (node == null || node === false || node === true) return '';
      if (typeof node !== 'object') return htmlText(node).trim();
      if (Array.isArray(node)) return blocks(node, ui);
      switch (node.type) {
        case 'text': case 'caption': {const text = inline(node.children).trim();return node.props?.lineThrough && text ? `<del>${text}</del>` : text;}
        case 'title': {const text = inline(node.children);return `<strong>${node.props?.lineThrough && text.trim() ? `<del>${text}</del>` : text}</strong>`;}
        // As in toMarkdown: one-line parts side by side are joined with " · ".
        case 'row': {const parts = [].concat(node.children ?? []).map(c => isInlineNode(c) ? inline(c).trim() : block(c, true).trim()).filter(Boolean);return parts.join(parts.some(x => x.includes('<br/>')) ? '<br/>' : ' · ');}
        default: return isInlineNode(node) ? inline(node) : blocks(node.children, ui || UI_CONTAINERS.has(node.type));
      }
    }
    return blocks(nodes, false);
  }
  // The plain text a reader sees for Markdown that toMarkdown wrote: escapes undone, emphasis,
  // code and link markers dropped. Used to check that the HTML shows the same words.
  function markdownText(md) {
    const s = String(md).replace(/^#{1,6} /gm, '');let out = '';
    for (let i = 0; i < s.length;) {
      const c = s[i];
      if (c === '\\' && /[!-/:-@[-`{-~]/.test(s[i + 1] || '')) {out += s[i + 1];i += 2;continue;}
      if (c === '`') {
        const run = s.slice(i).match(/^`+/)[0];let end = -1;
        for (let j = s.indexOf(run, i + run.length); j >= 0; j = s.indexOf(run, j + 1)) if (s[j - 1] !== '`' && s[j + run.length] !== '`') {end = j;break;}
        if (end < 0) {out += run;i += run.length;continue;}
        let code = s.slice(i + run.length, end);if (/^ [\s\S]* $/.test(code) && code.trim()) code = code.slice(1, -1);
        out += code;i = end + run.length;continue;
      }
      if (s.startsWith('**', i) || s.startsWith('~~', i)) {i += 2;continue;}
      if (c === '*') {i++;continue;}
      if (c === '[') {
        let j = i + 1, depth = 1;
        for (; j < s.length && depth; j++) {if (s[j] === '\\') {j++;continue;}if (s[j] === '[') depth++;else if (s[j] === ']') depth--;}
        const close = s.indexOf(')', j);
        if (!depth && s[j] === '(' && close > 0) {out += markdownText(s.slice(i + 1, j - 1));i = close + 1;continue;}
      }
      out += c;i++;
    }
    return out;
  }
  // Checks the HTML block written for a picture list before it goes into the note; returns
  // the first problem found, or null. An HTML block that a Markdown viewer would cut short
  // (a blank or indented line), that does not parse, that uses anything outside the short
  // list of tags and attributes below, or whose words differ from the Markdown text is not used.
  // With a header or footer (the Markdown of the text above or below the pictures), the first or
  // last <div> inside the block holds it, and its words are checked too.
  const CARD_HTML_TAGS = new Set(['div','a','img','strong','em','del','code','br']), CARD_HTML_ATTRS = new Set(['style','href','src','alt','width','height']);
  function validateCardHtml(html, texts, Parser, {header = null, footer = null} = {}) {
    const block = String(html);
    if (!/^<div[\s>]/.test(block)) return t('dil.v.noDiv');
    if (/[\r\u0000]/.test(block)) return t('dil.v.cr');
    const lines = block.split('\n');
    if (lines.some(l => !l.trim())) return t('dil.v.blank');
    if (lines.some(l => /^( {4}|\t)/.test(l))) return t('dil.v.indent');
    const doc = new Parser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml">${block}</div>`, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return t('dil.v.xhtml');
    for (const el of doc.getElementsByTagName('*')) {
      if (!CARD_HTML_TAGS.has(el.localName)) return t('dil.v.tag', el.localName);
      for (const a of el.attributes) if (!CARD_HTML_ATTRS.has(a.name) && !(el === doc.documentElement && a.name === 'xmlns')) return t('dil.v.attr', a.name);
    }
    const rows = [...doc.documentElement.children[0]?.children || []];
    // Spacing and control characters (which the HTML drops) do not count.
    const squash = t => t.replace(/[\s\x00-\x1f\x7f\ufffd\ufffe\uffff]+/g, '');
    for (const [md, el, where] of [[header, header != null && rows.shift(), 'Above'], [footer, footer != null && rows.pop(), 'Below']]) {
      if (md == null) continue;
      if (!el || el.getElementsByTagName('img').length) return t(`dil.v.noText${where}`);
      if (squash(el.textContent) !== squash(markdownText(md))) return t(`dil.v.mismatch${where}`);
    }
    if (rows.length !== texts.length) return t('dil.v.rows', rows.length, texts.length);
    for (let k = 0; k < rows.length; k++) {
      const shown = rows[k].lastElementChild?.textContent ?? '';
      if (squash(shown) !== squash(markdownText(texts[k]))) return t('dil.v.item', k + 1);
    }
    return null;
  }
  // Attaches downloaded pictures ({url: data URL}) to image nodes for drawing; src stays the URL.
  function withImages(tree, images) {
    if (!images || typeof images !== 'object') return tree;
    const walk = node => {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map(walk);
      const data = node.type === 'image' && typeof images[node.props?.src] === 'string' ? images[node.props.src] : null;
      return {...node, props:data ? {...node.props, data} : node.props, children:(node.children || []).map(walk)};
    };
    return walk(tree);
  }
  // Browser only (sandbox page): lays the card out offscreen and rasterizes it
  // through an SVG foreignObject. The ChatGPT page is never scrolled or captured.
  async function snapshotPng(tree, doc, {scale = 2, waitFonts = true} = {}) {
    const now = () => doc.defaultView.performance.now(), started = now();
    const html = `<div class="dil-root">${toHtml(tree)}</div>`;
    const host = doc.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:720px';
    host.innerHTML = `<style>${cardCss()}</style>${html}`;
    doc.body.append(host);
    try {
      if (waitFonts) await doc.fonts?.ready;
      // Whole images take their own height, known only once they have loaded.
      await Promise.all([...host.querySelectorAll('img.img-whole')].map(img => img.complete ? null : new Promise(resolve => {img.onload = img.onerror = resolve;})));
      // Lay out at ChatGPT's column width (so width="100%" stays wide), then
      // crop the empty space right of narrower cards such as maxWidth="260px".
      const rootNode = host.querySelector('.dil-root'), rect = rootNode.getBoundingClientRect();
      const right = Math.max(0, ...[...rootNode.children].map(child => child.getBoundingClientRect().right - rect.left));
      // A background tab may not lay the frame out at all; never emit a blank image.
      if (!(rect.width > 0 && rect.height > 0)) throw Error(t('dil.e.layout'));
      const width = Math.min(Math.ceil(rect.width), Math.ceil(right) + 10), height = Math.ceil(rect.height);
      const laidOut = now();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml"><style>${cardCss()}</style>${html}</div></foreignObject></svg>`;
      // onload rather than image.decode(): decode() waits for a rendering
      // opportunity, which an embedded frame on a busy page may not get soon.
      const image = new doc.defaultView.Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;image.onerror = () => reject(Error(t('dil.e.svg')));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      });
      const decoded = now();
      const canvas = doc.createElement('canvas');
      canvas.width = width * scale;canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);ctx.fillStyle = '#fff';ctx.fillRect(0, 0, width, height);ctx.drawImage(image, 0, 0);
      const drawn = now();
      // Synchronous encode: canvas.toBlob() waits for browser idle time, which a
      // busy page such as chatgpt.com rarely gives (seen: several seconds).
      const base64 = canvas.toDataURL('image/png').split(',')[1] || '';
      if (!base64) throw Error(t('dil.e.image'));
      const binary = doc.defaultView.atob(base64), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const png = bytes.buffer, done = now(), round = Math.round;
      return {png, width, height, layoutMs:round(laidOut - started), rasterMs:round(done - laidOut), decodeMs:round(decoded - laidOut), drawMs:round(drawn - decoded), encodeMs:round(done - drawn)};
    } finally {host.remove();}
  }
  // AppBlocks are stored as content_references and linked from the program by
  // invocation id -> clientDefinedWidgets[id].refIndex.
  function appBlocks(dil, contentReferences) {
    const refs = Array.isArray(contentReferences) ? contentReferences : [];
    return Object.entries(dil?.clientDefinedWidgets || {}).map(([invocationId, widget]) => {
      const data = refs[widget?.refIndex]?.data;
      if (!data || data.widget_type !== 'app_block' || typeof data.content !== 'string') return null;
      return {invocationId, id:String(data.app_block_id || invocationId), title:data.title || t('dil.app'), language:data.language, content:data.content};
    }).filter(Boolean);
  }
  const escapeHtml = text => String(text).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  // AppBlocks are written against ChatGPT's Tailwind utilities; outside ChatGPT a
  // small subset of the common ones keeps their layout and spacing.
  const TAILWIND_LITE = (() => {
    const rem = n => `${n / 4}rem`, out = [];
    const esc = s => s.replace(/[./:]/g, c => `\\${c}`);
    const rule = (cls, css) => out.push(`.${esc(cls)}{${css}}`);
    for (const n of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12]) {
      const k = String(n);
      rule(`gap-${k}`, `gap:${rem(n)}`);rule(`gap-x-${k}`, `column-gap:${rem(n)}`);rule(`gap-y-${k}`, `row-gap:${rem(n)}`);
      for (const [p, props] of [['p', ['padding']], ['px', ['padding-left', 'padding-right']], ['py', ['padding-top', 'padding-bottom']], ['pt', ['padding-top']], ['pb', ['padding-bottom']], ['pl', ['padding-left']], ['pr', ['padding-right']], ['m', ['margin']], ['mx', ['margin-left', 'margin-right']], ['my', ['margin-top', 'margin-bottom']], ['mt', ['margin-top']], ['mb', ['margin-bottom']], ['ml', ['margin-left']], ['mr', ['margin-right']]]) rule(`${p}-${k}`, props.map(x => `${x}:${rem(n)}`).join(';'));
      rule(`space-y-${k}`, `display:block`);out.push(`.${esc(`space-y-${k}`)}>*+*{margin-top:${rem(n)}}`);out.push(`.${esc(`space-x-${k}`)}>*+*{margin-left:${rem(n)}}`);
      rule(`w-${k}`, `width:${rem(n)}`);rule(`h-${k}`, `height:${rem(n)}`);
    }
    for (let n = 1; n <= 12; n++) {rule(`grid-cols-${n}`, `grid-template-columns:repeat(${n},minmax(0,1fr))`);rule(`col-span-${n}`, `grid-column:span ${n}/span ${n}`);}
    const sizes = {xs:['.75rem', '1rem'], sm:['.875rem', '1.25rem'], base:['1rem', '1.5rem'], lg:['1.125rem', '1.75rem'], xl:['1.25rem', '1.75rem'], '2xl':['1.5rem', '2rem'], '3xl':['1.875rem', '2.25rem']};
    for (const [k, [f, l]] of Object.entries(sizes)) rule(`text-${k}`, `font-size:${f};line-height:${l}`);
    const gray = {50:'#f9fafb', 100:'#f3f4f6', 200:'#e5e7eb', 300:'#d1d5db', 400:'#9ca3af', 500:'#6b7280', 600:'#4b5563', 700:'#374151', 800:'#1f2937', 900:'#111827'};
    for (const [k, v] of Object.entries(gray)) for (const c of ['gray', 'slate', 'zinc', 'neutral']) {rule(`text-${c}-${k}`, `color:${v}`);rule(`bg-${c}-${k}`, `background-color:${v}`);rule(`border-${c}-${k}`, `border-color:${v}`);}
    const radius = {'':'.25rem', sm:'.125rem', md:'.375rem', lg:'.5rem', xl:'.75rem', '2xl':'1rem', '3xl':'1.5rem', full:'9999px', none:'0'};
    for (const [k, v] of Object.entries(radius)) rule(k ? `rounded-${k}` : 'rounded', `border-radius:${v}`);
    const fixed = {flex:'display:flex', 'inline-flex':'display:inline-flex', grid:'display:grid', block:'display:block', 'inline-block':'display:inline-block', hidden:'display:none', 'flex-col':'flex-direction:column', 'flex-row':'flex-direction:row', 'flex-wrap':'flex-wrap:wrap', 'flex-1':'flex:1 1 0%', 'flex-none':'flex:none', 'shrink-0':'flex-shrink:0', grow:'flex-grow:1',
      'items-center':'align-items:center', 'items-start':'align-items:flex-start', 'items-end':'align-items:flex-end', 'items-baseline':'align-items:baseline', 'items-stretch':'align-items:stretch', 'justify-center':'justify-content:center', 'justify-between':'justify-content:space-between', 'justify-start':'justify-content:flex-start', 'justify-end':'justify-content:flex-end', 'justify-around':'justify-content:space-around',
      'w-full':'width:100%', 'h-full':'height:100%', 'w-auto':'width:auto', 'h-auto':'height:auto', 'min-w-0':'min-width:0', 'max-w-full':'max-width:100%', relative:'position:relative', absolute:'position:absolute', fixed:'position:fixed', 'inset-0':'inset:0', 'top-0':'top:0', 'left-0':'left:0', 'right-0':'right:0', 'bottom-0':'bottom:0',
      'overflow-hidden':'overflow:hidden', 'overflow-auto':'overflow:auto', 'pointer-events-none':'pointer-events:none', 'select-none':'user-select:none', 'cursor-pointer':'cursor:pointer', 'text-center':'text-align:center', 'text-left':'text-align:left', 'text-right':'text-align:right', truncate:'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', 'whitespace-nowrap':'white-space:nowrap', 'tabular-nums':'font-variant-numeric:tabular-nums',
      'font-normal':'font-weight:400', 'font-medium':'font-weight:500', 'font-semibold':'font-weight:600', 'font-bold':'font-weight:700', 'font-mono':'font-family:ui-monospace,Consolas,monospace', 'leading-tight':'line-height:1.25', 'leading-none':'line-height:1', uppercase:'text-transform:uppercase', 'tracking-wide':'letter-spacing:.025em',
      border:'border:1px solid #e5e7eb', 'border-0':'border-width:0', 'border-2':'border:2px solid #e5e7eb', 'border-t':'border-top:1px solid #e5e7eb', 'border-b':'border-bottom:1px solid #e5e7eb', 'border-black/10':'border-color:rgba(0,0,0,.1)', 'border-black/5':'border-color:rgba(0,0,0,.05)',
      'bg-white':'background-color:#fff', 'bg-black':'background-color:#000', 'bg-transparent':'background-color:transparent', 'text-white':'color:#fff', 'text-black':'color:#000', shadow:'box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06)', 'shadow-sm':'box-shadow:0 1px 2px rgba(0,0,0,.05)', 'opacity-50':'opacity:.5', 'opacity-60':'opacity:.6', 'opacity-70':'opacity:.7', 'opacity-80':'opacity:.8'};
    for (const [k, v] of Object.entries(fixed)) rule(k, v);
    // ChatGPT supplies --viz-* colors to AppBlocks; light-theme approximations (an app's own values win).
    const viz = `--viz-text:#0d0d0d;--viz-sub:#5d5d5d;--viz-muted:#8f8f8f;--viz-border:rgba(13,13,13,.15);--viz-card:#fff;--viz-bg:#fff;--viz-accent:#3a83f7;--viz-accent-bg:#e8f1fe;${PALETTE.map((c, i) => `--viz-series-${i + 1}:${c}`).join(';')}`;
    return `:root{${viz}}*,::before,::after{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#0d0d0d}${out.join('')}`;
  })();
  function standaloneHtml(block) {
    const style = `<style data-exporter="tailwind-lite">${TAILWIND_LITE}</style>`;
    if (/<html[\s>]/i.test(block.content)) return /<head[^>]*>/i.test(block.content) ? block.content.replace(/<head[^>]*>/i, m => m + style) : block.content;
    return `<!doctype html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${escapeHtml(block.title)}</title>\n${style}\n</head>\n<body>\n${block.content}\n</body>\n</html>\n`;
  }
  // AppBlock preview: runs inside the AppBlock's own frame before its scripts.
  // WebGL keeps its frames readable; after a short wait the page is drawn into a
  // PNG (canvases swapped for their pixels) and posted to the parent with a nonce.
  const APPBLOCK_CAPTURE = String(function capture(nonce, wait, maxWidth, maxHeight) {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, options) {
      return getContext.call(this, type, /webgl/i.test(String(type)) ? Object.assign({}, options, {preserveDrawingBuffer:true}) : options);
    };
    const send = data => parent.postMessage(Object.assign({nonce}, data), '*');
    // Two animation frames let WebGL finish drawing; a timeout covers throttled frames.
    const frames = () => new Promise(done => {const t = setTimeout(done, 300);requestAnimationFrame(() => requestAnimationFrame(() => {clearTimeout(t);done();}));});
    addEventListener('load', () => setTimeout(async () => {
      try {
        await frames();
        // Crop to where the content ends, not to the frame: full-height elements would otherwise pad the image.
        const doc = document.documentElement, bottom = Math.max(0, ...[...document.body.querySelectorAll('*')].map(e => {const r = e.getBoundingClientRect();return r.width && r.height ? r.bottom : 0;}));
        const width = Math.min(maxWidth, Math.max(320, doc.scrollWidth)), height = Math.min(maxHeight, Math.max(40, Math.ceil(bottom) + 8));
        const live = [...document.querySelectorAll('canvas')].map(c => {let url = null;try {url = c.toDataURL('image/png');} catch {}const r = c.getBoundingClientRect();return {url:url && url.length > 30 ? url : null, w:r.width || c.width, h:r.height || c.height};});
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('script').forEach(s => s.remove());
        // Canvases become images of their pixels; one that cannot be read keeps its box, empty.
        [...clone.querySelectorAll('canvas')].forEach((c, i) => {const img = document.createElement(live[i]?.url ? 'img' : 'div');if (live[i]?.url) img.setAttribute('src', live[i].url);img.setAttribute('style', `${c.getAttribute('style') || ''};display:block;width:${live[i]?.w}px;height:${live[i]?.h}px`);c.replaceWith(img);});
        const fields = [...document.querySelectorAll('input,textarea,select')], copies = [...clone.querySelectorAll('input,textarea,select')];
        copies.forEach((el, i) => {const o = fields[i];if (!o) return;if (o.type === 'checkbox' || o.type === 'radio') o.checked ? el.setAttribute('checked', '') : el.removeAttribute('checked');else if (el.tagName === 'TEXTAREA') el.textContent = o.value;else if (el.tagName !== 'SELECT') el.setAttribute('value', o.value);});
        const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n').replace(/(^|[\s,}])html(?=[\s,{.:#[])/g, '$1.ab-html').replace(/(^|[\s,}])body(?=[\s,{.:#[])/g, '$1.ab-body');
        const bg = getComputedStyle(document.body).backgroundColor, body = new XMLSerializer().serializeToString(clone).replace(/^<body/, '<div').replace(/<\/body>$/, '</div>');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" class="ab-html" style="width:${width}px;font-family:system-ui,sans-serif"><style>${css.replace(/<\/style/gi, '')}</style>${body.replace(/^<div/, '<div class="ab-body"')}</div></foreignObject></svg>`;
        const image = new Image();
        await new Promise((ok, no) => {image.onload = ok;image.onerror = () => no(Error(t('dil.e.previewSvg')));image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;});
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        canvas.width = width * 2;canvas.height = height * 2;ctx.scale(2, 2);ctx.fillStyle = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#fff';ctx.fillRect(0, 0, width, height);ctx.drawImage(image, 0, 0);
        send({png:canvas.toDataURL('image/png'), width, height});
      } catch (e) {send({error:String(e && e.message || e)});}
    }, wait));
  });
  // The AppBlock page with the capture script placed before any of its own scripts.
  function appBlockCaptureHtml(block, nonce, {wait = 900, maxWidth = 700, maxHeight = 1400} = {}) {
    const script = `<script>(${APPBLOCK_CAPTURE})(${JSON.stringify(nonce)},${Number(wait)},${Number(maxWidth)},${Number(maxHeight)});</script>`;
    const html = standaloneHtml(block);
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + script) : script + html;
  }
  // Sandbox side: renders the AppBlock in a nested sandboxed frame and returns its PNG.
  function appBlockPreview(block, doc, {timeout = 5000, wait = 900, frameHeight = 480} = {}) {
    const view = doc.defaultView, nonce = `ab-${Math.random().toString(36).slice(2)}`;
    const frame = doc.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = `position:absolute;left:0;top:0;width:700px;height:${Number(frameHeight)}px;border:0`;
    return new Promise((resolve, reject) => {
      const finish = (fn, value) => {view.removeEventListener('message', onMessage);clearTimeout(timer);frame.remove();fn(value);};
      const onMessage = event => {if (event.source !== frame.contentWindow || event.data?.nonce !== nonce) return;event.data.error ? finish(reject, Error(event.data.error)) : finish(resolve, event.data);};
      const timer = setTimeout(() => finish(reject, Error(t('dil.e.previewTimeout'))), timeout);
      view.addEventListener('message', onMessage);
      frame.srcdoc = appBlockCaptureHtml(block, nonce, {wait});
      doc.body.append(frame);
    }).then(({png, width, height}) => {
      const binary = view.atob(String(png).split(',')[1] || ''), bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      if (!bytes.length) throw Error(t('dil.e.previewEmpty'));
      return {png:bytes.buffer, width, height};
    });
  }
  // Content-script side: evaluates through the sandbox page over a private port.
  function sandboxClient(doc, src, {timeout = 8000} = {}) {
    const frame = doc.createElement('iframe'), created = performance.now(), stats = {loadMs:null};
    // Full size and inside the viewport, but transparent and click-through: cards
    // need real layout, and Chrome throttles animation frames of cross-origin
    // frames placed off screen, which left WebGL AppBlocks undrawn.
    frame.src = src;frame.dataset.archiveOwned = 'dil-sandbox';frame.setAttribute('aria-hidden', 'true');frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:0;top:0;width:760px;height:600px;border:0;opacity:0;pointer-events:none;z-index:-1';
    const ready = new Promise((resolve, reject) => {
      frame.addEventListener('load', () => {stats.loadMs = Math.round(performance.now() - created);resolve();}, {once:true});
      setTimeout(() => reject(Error(t('dil.e.sandbox'))), timeout);
    });
    ready.catch(noop);
    doc.documentElement.append(frame);
    const request = async (type, dil, extra = {}) => {
      await ready;
      return new Promise((resolve, reject) => {
        const channel = new MessageChannel(), timer = setTimeout(() => {channel.port1.close();reject(Error(t('dil.e.timeout')));}, timeout);
        channel.port1.onmessage = event => {clearTimeout(timer);channel.port1.close();event.data?.error ? reject(Error(event.data.error)) : resolve(event.data);};
        frame.contentWindow.postMessage({type, ...extra, locale:root.ChatExportI18n?.locale, dil:dil && {code:dil.code, constants:dil.constants, appData:dil.appData, requiredComponents:dil.requiredComponents, clientDefinedWidgets:dil.clientDefinedWidgets, contentReferences:dil.contentReferences, images:dil.images}}, '*', [channel.port2]);
      });
    };
    const evaluateRemote = async dil => (await request('dil:evaluate', dil)).tree;
    // Returns {segments:[{kind:'md',tree} | {kind:'card',tree,png,width,height}], timings}.
    evaluateRemote.snapshot = dil => request('dil:snapshot', dil);
    // Loads fonts and draws a tiny card once, while the conversation is still being read.
    evaluateRemote.warmup = () => request('dil:warmup', null);
    // Returns {png, width, height} for one AppBlock, drawn after it has run briefly.
    evaluateRemote.appblock = block => request('appblock:preview', null, {block:{id:block.id, title:block.title, content:block.content}});
    evaluateRemote.stats = stats;
    evaluateRemote.close = () => frame.remove();
    return evaluateRemote;
  }
  const api = {evaluate, stateVariants, toMarkdown, segments, toHtml, texHtml, get CARD_CSS() {return cardCss();}, pageText, withImages, pictureList, validateCardHtml, markdownText, snapshotPng, appBlocks, standaloneHtml, appBlockCaptureHtml, appBlockPreview, sandboxClient,
    // HTML export: live cards, formulas, AppBlock frames, map places, and this file's own source
    // (run again inside every card frame of the exported page).
    LIVE_CSS, mathml, mountLive, morph, appBlockFrame, appBlockFrameHtml, setFrameHeight, copyText, placeOf, source:() => `(${dilRenderModule})(globalThis);`};
  root.ChatExportDilRender = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
