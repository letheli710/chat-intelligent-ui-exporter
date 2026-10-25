# Development guide

[← Back to the README](../README.md)

## Setup

```bash
npm install
npm test
```

Load `extension/` with **Load unpacked** in `chrome://extensions`. After changing code, click the extension's **Reload** there, then refresh the ChatGPT tab: the background script and permissions only update on reload, and the panel warns when the page still runs an older version.

## Layout

| Path | What it is |
| --- | --- |
| `extension/` | The extension itself (Manifest V3). |
| `extension/fast-text.js` | Reads the conversation from ChatGPT's API and turns messages into Markdown. |
| `extension/fast-content.js` | The sidebar, the buttons beside the input box, and the exports. |
| `extension/dil-render.js` | Runs and draws Intelligent UI cards; `mountLive` makes them interactive in the HTML export. |
| `extension/html-export.js` | The whole-conversation HTML page: structure, styles, scripts, and the filter for HTML written in answers. |
| `extension/pdf-export.js`, `print.html` | The PDF layout, printed from a hidden frame on the ChatGPT page. |
| `extension/obsidian-send.js`, `obsidian.html` | Saving into an Obsidian notes folder. |
| `extension/settings.js`, `ui-kit.js`, `panel-page.js` | Settings shared by the sidebar, the toolbar panel and the options page. |
| `extension/locales/`, `_locales/` | The 10 interface languages (English is the base). |
| `extension/marked.min.js`, `jszip.min.js` | Bundled marked and JSZip (MIT). |
| `tests/` | Node tests (`node --test`). |
| `scripts/` | Checks, packaging and the README screenshots. |
| `docs/` | These documents and the README images. |

## Rules

- **Bump the version with every change to the extension**: `extension/manifest.json` (`version` and `version_name`), `extension/fast-content.js`, `extension/settings.js` and `package.json` (and `package-lock.json`). `tests/version.test.cjs` checks they match.
- New interface text goes into all 10 files in `extension/locales/`; `tests/i18n.test.cjs` checks that every key exists everywhere and that none is unused.
- Never commit HAR files, cookies, `Authorization` headers, tokens, raw conversation JSON or screenshots of private chats.

## Tests and checks

Most regression tests read real test conversations captured on chatgpt.com (`tests/fixtures/`) and local samples under `archive/`. They are **not in the public repository**; tests that need them are skipped with the missing path, so a fresh clone still runs the rest.

| Command | What it checks |
| --- | --- |
| `npm test` | All unit and integration tests. |
| `node scripts/html-check.cjs [--out dir] [name]` | HTML export of every fixture, both forms: every Markdown line is on the page, every referenced file exists, every card runs and changes when used, every embedded app has a frame, both forms match. |
| `npm run pdf-check` | Exports every fixture as PDF in headless Chrome and reads it back with pdf.js: text, images, uncut cards, links, embedded fonts, page count, no blank pages. `--shots` saves page images. |
| `npm run panel-check` | Loads the extension into a real Chrome on a stand-in chatgpt.com and goes through the buttons, sidebar, toolbar panel, settings, Obsidian saving and the large-file suggestion. |
| `node scripts/markdown-same.cjs [ref]` | Markdown export of every fixture compared with `main` (or another branch or tag). Needs `tests/fixtures/`. |

`pdf-check`, `panel-check` and the screenshots need a local Chrome (or set `CHROME_PATH`).

## README screenshots

The images in `docs/images/` come from the real extension in a real Chrome, on a stand-in chatgpt.com serving a made-up conversation (`scripts/readme-demo.cjs`), with the English interface:

```bash
npm run readme-shots                    # writes docs/images/
node scripts/readme-shots.cjs some/dir   # or somewhere else, to compare first
```

Retake them when the interface changes.

## Trying fallbacks on a real page

To see how a card falls back, open DevTools in the ChatGPT tab, switch the console's context (the dropdown above it) to this extension, run `chatExportFault='thumb'` (also `list`, `image`, `table`, `png`, `html`), export, then `delete chatExportFault`. The page's own scripts and `localStorage` cannot turn it on. The tests pass `fault` to `scripts/edge-harness.cjs`.

## Running the current code on chatgpt.com

`scripts/live/` runs the working copy in a real, signed-in chatgpt.com tab without reloading the extension: `bundle.cjs` builds a script to paste into the console, `receive.cjs` collects the result. Set `window.__liveHtml='single'|'folder'` for the HTML export, `window.__livePdf=true` for PDF.

## Packaging

`npm run package` writes `releases/chat-intelligent-ui-exporter-<version>.zip` with the contents of `extension/`. Test a package by unzipping it into a new folder and loading that, in a fresh Chrome profile, so a missing file shows up.
