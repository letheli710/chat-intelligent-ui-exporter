# What the HTML export removes, and why

When the setting **Collapsible blocks, etc. → Keep effect** (中文界面：折叠块等特殊标签 → 保留效果) is on, HTML that ChatGPT wrote inside an answer is kept in the exported HTML page. Before it goes into the page, it is filtered: anything that could run code, or that would do nothing outside ChatGPT, is removed. The rest of the answer is exported as usual.

Where something you would have seen is removed, the page shows a dashed box:

> ▸ Removed: &lt;iframe&gt; — embedded page

Click it for the reason and a link to the matching section below. A link whose address was removed keeps its text, with a dashed underline; hover over it for the reason.

These notes are in English only, like a browser's error pages. Nothing is sent anywhere: the filter runs on your computer while the file is made.

Markdown export is not affected; this is only about the HTML page.

## Embedded pages

`<iframe>`, `<frame>`, `<frameset>`, `<portal>`, `<object>`, `<embed>`, `<applet>`

An embedded page or object can run its own code inside the exported file, with access to everything in it, so it is not kept.

Embedded apps that ChatGPT made with its own tools (AppBlock) are different: they are exported separately, in a sandbox, and are not affected.

## Media

`<audio>`, `<video>` (and their `<source>`, `<track>`)

A player loads and runs content from the web when the page opens, so it is not kept. Pictures in the answer are kept.

## Canvas

`<canvas>`

A canvas is empty until a script draws on it. Scripts are not kept, so the canvas would stay blank and is removed instead.

## Forms

`<form>`, `<button>`, `<select>`, `<textarea>`, `<dialog>`, and inputs other than checkboxes

Forms and buttons in an answer only worked inside ChatGPT; in the exported page they would do nothing, so they are not kept. Checkboxes are kept, ticked or not as they were, but cannot be changed.

## Links

A link is kept only when its address is a web page (`http:`, `https:`), an e-mail address (`mailto:`), a place on the same page (`#…`), or a file in the export. Other addresses, such as `javascript:`, `vbscript:` or `data:` (except pictures), could run code when clicked, so the address is removed and the text stays.

Browsers ignore tabs, line breaks and control characters inside an address, so the filter does the same before it checks one: `java&#9;script:` counts as `javascript:`.

## Removed without a notice

These never showed anything on the page, so they go without a box:

- `<script>`, `<noscript>`, `<template>`
- `<style>`, `<link>`, `<meta>`, `<base>`, `<title>`
- event attributes such as `onclick`, and `srcdoc`, `action`, `formaction`
- a `style` attribute that loads something (`url(…)`, `@import`) or runs code (`expression(…)`, `javascript:`)

Inside SVG pictures and math formulas, removed parts also go without a box, so the picture or formula keeps its shape.
