# Third-party notices

Markdown code-fence sizing and KaTeX annotation extraction are adapted from approaches in otaliptus/chatgpt-markdown-exporter, reviewed 2026-10-12:
https://github.com/otaliptus/chatgpt-markdown-exporter/blob/main/content.js
MIT, Copyright (c) 2026 Talip. Full license: licenses/otaliptus-MIT.txt.

JSZip is bundled locally for ZIP creation. Its version and copyright are recorded in the jszip.min.js header; license is in licenses/JSZip-LICENSE.md. marked v15.0.12 (marked.min.js, unmodified) is bundled locally to turn Markdown into the HTML export's page. MIT, Copyright (c) 2018+ MarkedJS and 2011-2018 Christopher Jeffrey. License: licenses/marked-LICENSE.md. The PDF print page (print.html) bundles the same marked release as marked.umd.js. 

Card icons are the shapes of Lucide icons (lucide-static 1.48.0, 211 icons, embedded in dil-render.js by scripts/build-icons.cjs). ISC, Copyright (c) 2026 Lucide Icons and Contributors. License: licenses/lucide-LICENSE.txt.

No remote scripts are loaded. An exported HTML page loads only map tiles from tile.openstreetmap.org when the reader is online and the map option was on.

The exporter implementation is a new prototype. The previously installed proprietary ChatGPT Exporter has not been copied.
