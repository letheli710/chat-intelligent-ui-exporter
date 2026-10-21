// The extension's words for the tests and the check scripts. They run in Simplified Chinese, the
// language their expectations were written in (so a passing run also shows that the Chinese
// output has not changed); EXPORTER_LOCALE=en (or another language) runs them in that one.
// Use this module's JSDOM in place of jsdom's: a window that runs scripts gets the language
// files and i18n.js, with the browser's language set to the one in use. use(locale) switches
// the language for the modules required in Node and for the windows made from then on.
const fs = require('node:fs'), path = require('node:path'), jsdom = require('jsdom');
const I18n = require('../extension/i18n.js');
const LOCALE = process.env.EXPORTER_LOCALE || 'zh_CN';
let current = LOCALE;
const use = locale => {current = locale;I18n.setLocale(locale);return locale;};
use(LOCALE);
const sources = [...I18n.LOCALES.map(l => `extension/locales/${l}.js`), 'extension/i18n.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
function load(w, locale = current) {
  Object.defineProperty(w.navigator, 'language', {value:I18n.TAGS[locale], configurable:true});
  for (const source of sources) w.eval(source);
  return w;
}
class JSDOM extends jsdom.JSDOM {
  constructor(html, options = {}) {super(html, options);if (options.runScripts) load(this.window);}
}
module.exports = {...jsdom, JSDOM, I18n, LOCALE, load, use, get locale() {return current;}};
