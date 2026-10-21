// Compares the ZIP Markdown export of every edge/pro fixture between a base branch (main) and
// this checkout: node scripts/markdown-same.cjs. Exits 1 if any differs.
const fs = require('fs'), path = require('path'), {execSync} = require('child_process');
const base = path.join(__dirname, '../tmp/markdown-same-main');
fs.rmSync(base, {recursive:true, force:true});
// settings.js and ui-kit.js are copied once main has them.
for (const f of ['extension/fast-text.js', 'extension/dil-render.js', 'extension/fast-content.js', 'extension/settings.js', 'extension/ui-kit.js', 'extension/manifest.json', 'scripts/edge-harness.cjs']) {
  try {execSync(`git cat-file -e main:${f}`, {stdio:'ignore'});} catch {continue;}
  fs.mkdirSync(path.join(base, path.dirname(f)), {recursive:true});
  fs.writeFileSync(path.join(base, f), execSync(`git show main:${f}`, {maxBuffer:1 << 26}));
}
fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(base, 'node_modules'), 'junction');
const mine = require('../scripts/edge-harness.cjs'), theirs = require(path.join(base, 'scripts/edge-harness.cjs'));
const fixtures = ['edge-2026-10', 'pro-2026-10'].flatMap(d => fs.readdirSync(`tests/fixtures/${d}`).map(f => `tests/fixtures/${d}/${f}`));
(async () => {
  let diff = 0;
  for (const f of fixtures) {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    const [a, b] = [await mine.runExport(raw), await theirs.runExport(raw)];
    const norm = r => r.md.replace(/-swift-[\d.]+/g, '');
    const same = norm(a) === norm(b) && JSON.stringify([...a.files.keys()]) === JSON.stringify([...b.files.keys()]);
    if (!same) diff++;
    console.log(same ? 'same' : 'DIFF', path.basename(f));
  }
  process.exit(diff ? 1 : 0);
})();
