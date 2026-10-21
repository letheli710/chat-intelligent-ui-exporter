// Run with javascript_tool in each chatgpt.com tab: a box that keeps what is pasted
// into it (Ctrl+V) and puts the finished export on the clipboard (Ctrl+C) for
// receive.cjs. The page's CSP forbids eval in its own handlers, so the pasted bundle
// is evaluated by a second javascript_tool call: (0, eval)(window.__livePasted).
(() => {
  const ta = document.getElementById('__liveLoader') || Object.assign(document.createElement('textarea'), {id:'__liveLoader'});
  ta.style.cssText = 'position:fixed;left:0;top:0;width:40px;height:40px;z-index:2147483647;opacity:.2';document.body.append(ta);
  ta.onpaste = e => {e.preventDefault();window.__livePasted = e.clipboardData.getData('text');};
  ta.oncopy = e => {e.preventDefault();e.clipboardData.setData('text/plain', window.__live?.out || '');};
  ta.value = 'x';ta.focus();ta.select();return 'loader ready';
})();
