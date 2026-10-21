// Draws a conversation's cards with this checkout's dil-render.js in a real browser, for
// changes the live bundle cannot show (cards are drawn by the installed extension's
// sandbox page). Images come from a live export of the same conversation:
//   node scripts/live/card-preview.cjs <raw.json> <export folder> <out.html>
// Open out.html in a browser; each card is rasterized with snapshotPng as in the sandbox.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '../..');
const render = require('../../extension/dil-render.js'), text = require('../../extension/fast-text.js');
const [rawPath, exportDir, out] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const exec = (code, scope) => vm.runInNewContext(code, {...scope}, {timeout:3000});
const mime = f => /\.png$/i.test(f) ? 'image/png' : /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.webp$/i.test(f) ? 'image/webp' : /\.gif$/i.test(f) ? 'image/gif' : '';
// sandbox:/mnt/data/x.png → files/x.png from the export, as the panel passes them.
const images = {};
for (const f of fs.existsSync(path.join(exportDir, 'files')) ? fs.readdirSync(path.join(exportDir, 'files')) : []) if (mime(f)) images[`sandbox:/mnt/data/${f}`] = `data:${mime(f)};base64,${fs.readFileSync(path.join(exportDir, 'files', f)).toString('base64')}`;
const cards = [];
for (const m of text.parseTree(raw).messages.filter(x => x.dil)) for (const s of render.segments(render.evaluate(m.dil, exec))) if (s.kind === 'card') cards.push(render.withImages(s.tree, images));
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>card preview</title><body style="margin:0;background:#ddd;font:13px system-ui">
<script>${fs.readFileSync(path.join(root, 'extension/dil-render.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>
<div id="out"></div><script>
const cards = ${JSON.stringify(cards).replace(/</g, '\\u003c')};
(async () => {for (const [i, tree] of cards.entries()) {
  const r = await ChatExportDilRender.snapshotPng(tree, document), img = new Image();
  img.src = URL.createObjectURL(new Blob([r.png], {type:'image/png'}));img.style.cssText = 'display:block;margin:12px;background:#fff;width:' + r.width + 'px';
  const label = document.createElement('div');label.textContent = 'card ' + (i + 1) + ' · ' + r.width + '×' + r.height;label.style.margin = '12px 12px 0';
  document.getElementById('out').append(label, img);
} document.title = 'done ' + cards.length;})().catch(e => {document.title = 'error';document.body.prepend(String(e.stack || e));});
</script>`);
console.log(`${out}: ${cards.length} cards, ${Object.keys(images).length} images`);
