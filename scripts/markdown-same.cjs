// Compares the ZIP Markdown export of every edge/pro fixture between a base ref (main, or the
// branch or tag given) and this checkout: node scripts/markdown-same.cjs [ref]. Exits 1 if any differs.
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const ref = process.argv[2] || 'main', root = path.join(__dirname, '..');
const base = path.join(root, 'tmp/markdown-same-base'), modules = path.join(base, 'node_modules');
const fixtures = ['edge-2026-10', 'pro-2026-10'].map(d => path.join(root, 'tests/fixtures', d)).filter(d => fs.existsSync(d))
  .flatMap(d => fs.readdirSync(d).map(f => path.join(d, f)));
if (!fixtures.length) {console.error('No fixtures in tests/fixtures/ (edge-2026-10, pro-2026-10); copy them in first.');process.exit(2);}
// The node_modules junction is removed on its own first, so clearing the folder never reaches the real one.
if (fs.existsSync(modules)) fs.unlinkSync(modules);
fs.rmSync(base, {recursive:true, force:true});
// The whole of extension/ and scripts/ at that ref, so the harness finds every file it requires.
const git = args => execFileSync('git', args, {cwd:root, maxBuffer:1 << 28});
for (const f of git(['ls-tree', '-r', '--name-only', ref, '--', 'extension', 'scripts']).toString().split('\n').filter(Boolean)) {
  fs.mkdirSync(path.join(base, path.dirname(f)), {recursive:true});
  fs.writeFileSync(path.join(base, f), git(['show', `${ref}:${f}`]));
}
fs.symlinkSync(path.join(root, 'node_modules'), modules, 'junction');
const mine = require('./edge-harness.cjs'), theirs = require(path.join(base, 'scripts/edge-harness.cjs'));
(async () => {
  let diff = 0;
  for (const f of fixtures) {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    const [a, b] = [await mine.runExport(raw), await theirs.runExport(raw)];
    const same = a.md === b.md && JSON.stringify([...a.files.keys()]) === JSON.stringify([...b.files.keys()]);
    if (!same) diff++;
    console.log(same ? 'same' : 'DIFF', path.basename(f));
  }
  console.log(`${fixtures.length - diff} same, ${diff} different (base: ${ref})`);
  process.exit(diff ? 1 : 0);
})();
