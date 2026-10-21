// Most regression tests read real conversation captures that stay private and
// untracked (tests/fixtures/, archive/research/2026-10-12/, "archive/Output - test 1/"). Where those files are
// absent (fresh clones, other worktrees) the test is reported as skipped with the
// missing path, so real failures are not buried among missing-fixture errors.
const base = require('node:test');
const fs = require('node:fs');
const PRIVATE = /tests[\\/]fixtures|research[\\/]2026-10-12|Output - test 1/;
const isMissing = e => e && e.code === 'ENOENT' && PRIVATE.test(String(e.path || e.message));
function wrap(fn) {
  if (typeof fn !== 'function') return fn;
  return async function (t) {
    try { return await fn.call(this, t); }
    catch (e) { if (isMissing(e)) { t.skip(`缺少本地私有夹具：${e.path}`); return; } throw e; }
  };
}
function test(name, options, fn) {
  return typeof options === 'function' ? base.test(name, wrap(options)) : base.test(name, options, wrap(fn));
}
// For files that read a private sample at load time: returns null when it is absent.
function readPrivate(file, encoding) {
  try { return fs.readFileSync(file, encoding); } catch (e) { if (isMissing(e)) return null; throw e; }
}
// Throws the same ENOENT inside a test, so the wrapper above reports a skip.
function needPrivate(value, file) {
  if (value == null) throw Object.assign(Error(`ENOENT: ${file}`), {code:'ENOENT', path:file});
  return value;
}
module.exports = Object.assign(test, base, {test, readPrivate, needPrivate});
