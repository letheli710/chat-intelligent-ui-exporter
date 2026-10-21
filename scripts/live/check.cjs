// Checks an unpacked export folder for problems a reader would notice:
//   node scripts/live/check.cjs <folder>
// broken relative links, placeholders the panel should have replaced, empty or
// broken images, files nothing links to, files saved twice, and HTML blocks a blank line
// turns into source text.
const fs = require('node:fs'), path = require('node:path');

function walk(dir, base = dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name), base) : [path.relative(base, path.join(dir, e.name)).replace(/\\/g, '/')]);
}
// Markdown outside fenced code and inline code, where placeholders would be visible text.
const prose = md => md.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '');
function pngSize(buf) {return buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 ? {w:buf.readUInt32BE(16), h:buf.readUInt32BE(20)} : null;}
const isLocal = href => href && !/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(href);

function links(text) {
  const out = [];
  // [text](dest) or ![alt](dest), with <dest> for paths containing spaces.
  for (const m of text.matchAll(/\]\((<[^>\n]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) out.push(m[1].replace(/^<|>$/g, ''));
  for (const m of text.matchAll(/\b(?:src|href)="([^"]+)"/g)) out.push(m[1].replace(/&amp;/g, '&'));
  return out;
}

// Block-level HTML that starts a line (inside quotes and callouts too). A blank line ends the
// HTML block (CommonMark), which is harmless when the next line is another tag; it shows source
// when that line is indented 4+ spaces (a code block), or when plain text lands inside an
// element that cannot hold a paragraph (svg, table). Returns the first line of each such block.
function brokenHtmlBlocks(md) {
  const lines = md.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, 'CODE').split('\n').map(l => l.replace(/\r$/, '').replace(/^(?:\s{0,3}> ?)*/, ''));
  const broken = [];let tag = null, depth = 0, head = '', afterBlank = false;
  const count = (line, t) => (line.match(new RegExp(`<${t}(?=[\\s>/])`, 'gi')) || []).length - (line.match(new RegExp(`<${t}\\b[^>]*/>`, 'gi')) || []).length - (line.match(new RegExp(`</${t}\\s*>`, 'gi')) || []).length;
  for (const line of lines) {
    if (!tag) {
      const m = line.match(/^\s{0,3}<(div|details|table|svg|figure|section|ul|ol|blockquote|pre|p)(?=[\s>/])/i);
      if (!m) continue;
      tag = m[1].toLowerCase();head = line.trim().slice(0, 80);depth = count(line, tag);afterBlank = false;
      if (depth <= 0) tag = null;
      continue;
    }
    if (!line.trim()) {afterBlank = true;continue;}
    if (afterBlank && (/^(?: {4}|\t)/.test(line) || (/^(svg|table)$/.test(tag) && !/^\s*</.test(line)))) {broken.push(head);tag = null;continue;}
    afterBlank = false;
    if ((depth += count(line, tag)) <= 0) tag = null;
  }
  return broken;
}

function check(dir) {
  const errors = [], warnings = [], files = walk(dir);
  const has = new Set(files), referenced = new Set(['conversation.md', 'manifest.json']);
  if (!has.has('conversation.md')) return {errors:['no conversation.md'], warnings, files:files.length};
  const md = fs.readFileSync(path.join(dir, 'conversation.md'), 'utf8');
  let manifest = {};try {manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));} catch {errors.push('manifest.json missing or invalid');}
  for (const w of manifest.warnings || []) warnings.push('exporter: ' + w);
  if (!/^# \S/.test(md)) errors.push('conversation.md does not start with a "# title" line');
  if (/^# .*\s$/m.test(md.split('\n')[0])) errors.push('title line ends with whitespace');
  // Every relative link from Markdown or a saved HTML page resolves to a file in the archive.
  const sources = [['conversation.md', md], ...files.filter(f => /\.html?$/.test(f)).map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')])];
  for (const [from, text] of sources) for (const href of links(from === 'conversation.md' ? prose(md) : text)) {
    if (!isLocal(href)) continue;
    let target;try {target = path.posix.normalize(path.posix.join(path.posix.dirname(from), decodeURI(href.split('#')[0])));} catch {errors.push(`${from}: undecodable link ${href}`);continue;}
    if (!target || target === '.') continue;
    referenced.add(target);
    if (!has.has(target)) errors.push(`${from}: broken link ${href}`);
  }
  const visible = prose(md);
  for (const [re, what] of [[/sandbox:\/mnt/g, 'sandbox: link left in text'], [/\]\((?:attachment|datatable|asset):/g, 'internal link token left'], [/\u0000|APPBLOCK:/g, 'AppBlock placeholder left'], [/\[object Object\]/g, '[object Object]'], [/\bundefined\b/g, '"undefined" in prose'], [/�/g, 'replacement character']]) {
    const n = (visible.match(re) || []).length;if (n) errors.push(`${what} ×${n}`);
  }
  // An HTML block ends at a blank line (CommonMark: VS Code's preview, Obsidian); an element
  // still open there shows the rest as source text. A lone \r also starts a new line there.
  for (const head of brokenHtmlBlocks(md)) errors.push(`HTML block cut off by a blank line: ${head}`);
  if (/\r(?!\n)/.test(md)) errors.push('lone \\r in conversation.md');
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    if (!buf.length) errors.push(`empty file ${f}`);
    if (/\.png$/i.test(f)) {
      const s = pngSize(buf);
      if (!s) errors.push(`not a PNG: ${f}`);
      else if (s.w < 16 || s.h < 16) errors.push(`tiny image ${f} ${s.w}×${s.h}`);
      else if (s.h > 32000) warnings.push(`very tall image ${f} ${s.w}×${s.h}`);
    }
    if (/\.jpe?g$/i.test(f) && !(buf[0] === 0xff && buf[1] === 0xd8)) errors.push(`not a JPEG: ${f}`);
    if (/_$|_(\.[^.]+)$/.test(f) && has.has(f.replace(/_$|_(\.[^.]+)$/, '$1'))) errors.push(`saved twice: ${f}`);
    // ui/*.json is the card data, kept for tools rather than linked.
    if (!referenced.has(f) && !/\.html?$|^ui\//.test(f)) warnings.push(`not linked from conversation.md: ${f}`);
  }
  return {errors, warnings, files:files.length, cards:(manifest.cards || []).length, messages:(manifest.messages || []).length, bytes:md.length};
}

module.exports = {check};
if (require.main === module) console.log(JSON.stringify(check(process.argv[2]), null, 1));
