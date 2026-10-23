# Export formats in detail

[← Back to the README](../README.md)

Every format is made on your computer from the conversation as ChatGPT's website returns it. The extension does not scroll the page or take screenshots of it, and calls no AI service.

- [Text only (.md)](#text-only)
- [Full archive (.zip)](#full-archive)
- [Intelligent UI cards](#intelligent-ui-cards)
- [HTML page](#html-page)
- [PDF (print)](#pdf)
- [Obsidian](#obsidian)
- [Generic or Obsidian Markdown](#generic-or-obsidian-markdown)
- [Not supported yet](#not-supported-yet)

## Text only

The answer text as editable Markdown, with tables, code blocks, formulas and source links.

- The document title is `#`, and each message is a `##` section (**You** / **ChatGPT**, or names of your own). Headings inside an answer move down two levels (from `###`), so the outline in Obsidian stays tidy.
- One answer split into several messages by ChatGPT (a note before a tool call, the tool output, the final answer) stays in one *ChatGPT* section.
- `utm_source=chatgpt.com`, which ChatGPT adds to links, is removed.
- Text on cards is written as it is: `*`, `` ` ``, `<`, `&`, `#` and `$` are escaped so they do not turn into bold, code, HTML, tags or formulas.
- With **Obsidian properties** on (the default), the file starts with YAML: title, source, time and model.

## Full archive

The Markdown plus every file it refers to. Keep `conversation.md` next to `assets/`, or the images will not show.

```text
<chat title> - <date>/
├── conversation.md    the text
├── assets/            original images, card pictures, embedded-app previews
├── files/             attachments and files from the code interpreter (CSV, …)
└── manifest.json      version, messages, timings and warnings, how each card was written
```

- **Attachments**: PDFs, spreadsheets and other files you uploaded go to `files/`, linked above your question as *Attachment: name*.
- **Images**: uploaded, generated and search-result images are saved in full size. A row of search images becomes one thumbnail strip, with the originals listed in a collapsed block below.
- **Code interpreter**: charts and generated files are downloaded, and links in the answer point to the local copies. Files that only appear on a card (a download card, for example) are downloaded too and listed at the end of the answer as *Files made by code*. A scrollable DataFrame is saved as a full CSV, with the first 10 rows shown in the text.
- **Maps**: the map ChatGPT drew (with its rating pins) is captured from the page, followed by a list of places: name (linked to the website or Yelp), category, rating, address, map link and description. Capturing needs the tab in front; otherwise only the list is kept.
- **Embedded apps** (AppBlock: WebGL, canvas, animations): run for about a second, captured as a preview picture, with a link to open the original.

## Intelligent UI cards

- **Image-and-text list cards** (one picture with a block of text, repeated) become a Markdown table: thumbnail on the left (click for the original), editable text on the right. With **Picture cards as HTML** (Beta) on, they are written as HTML side by side instead, closer to ChatGPT; only apps that show HTML, such as Obsidian, display it.
- **All other cards** are drawn as a PNG in the extension's sandbox page, with the search images inside them, and their text follows in a collapsible quote.
- If a step fails (an image that did not download, a picture that cannot be decoded), the card falls back to a PNG, and if there is no PNG either, to text only. `manifest.json` records which way each card was written and why.
- Text that a card only shows in another state (another tab, an opened section, something that appears after ticking a box) is listed at the end of the answer, under *Card content in other states*.

## HTML page

A page that looks like ChatGPT (its own styles, no OpenAI CSS, fonts or logo), complete and ready to open.

- **Text**: headings, lists, tables, code blocks with *Copy*, quotes and images. Formulas use the browser's own MathML, with the LaTeX source kept inside, so copy and search find it. Your questions appear as speech bubbles, attachments as file cards.
- **Cards run again.** Each card runs its program in a sandboxed frame, starting from its **default state** (ChatGPT does not save what you clicked). Tabs, sliders, menus, radio buttons, checkboxes, sections and buttons all work, and cards in the same answer share their state. *Copy* buttons copy; buttons that would send a new message in ChatGPT show what they would have sent. Charts can show their data as a table. A static copy of each card is kept in the page for printing, or if scripts are off.
- **Embedded apps** run as they are in a sandboxed frame that grows with its content; *Open in a new window* shows one alone. When printed, the preview picture is shown. An app that loads things from the web goes online as usual.
- **Maps** open offline, showing the picture captured at export and the list of places. With the setting *Online map button in the HTML* on (the default), the reader can click *Open the draggable map online* to load OpenStreetMap tiles, with pins, drag and zoom (Ctrl + wheel, or + −). If no tile loads within 4 seconds, or tiles keep failing, it goes back to the picture. The map loads no scripts from the web. Pictures in the text and apps that load web resources are not affected by this setting.
- **HTML written inside answers** is filtered when kept: anything that could run code is removed, and a box says what and why. See [What the HTML export removes, and why](html-filter.md).

### One file or ZIP

Both open and work the same, even with a double-click from your disk (`file://`): card programs and data are inside the page, and frames use `srcdoc`.

| | One HTML file (default) | ZIP |
| --- | --- | --- |
| What you get | `<title> - <date>.html` | `<title> - <date>.html.zip` with `conversation.html`, `assets/`, `files/`, `manifest.json` |
| Good | One file, easy to forward and store | Small page that opens fast; originals can be taken out |
| Watch out | About a third larger than the pictures in it | Unzip and keep the folders together |

When the selected messages carry more than 10 pictures and files, the line under *Export* (sidebar) and the info line (toolbar panel) become **⚠ Large file: switch to ZIP →**. One click switches; the panel does not move. A ZIP chosen before version 0.11.37 stays ZIP.

## PDF

**PDF (print)** lays the chat out and opens the print dialog right on the ChatGPT page; choose **Save as PDF**. The PDF is a still copy of what the chat shows when opened.

- **Real text**: built from text and layout, not stitched screenshots, so you can select, search and click links. It contains what the full archive does (text, original images, card pictures, app previews, map pictures), on A4 pages. No page reading, no network, no AI.
- **Cards** are drawn in their default state. A card taller than a page is cut at a blank line and continues on the next. Image-and-text list cards become a list with the picture on the left and selectable text on the right. The card's text sits invisibly behind its picture, in reading order, so search and copy still find it.
- **Collapsed blocks are open**: card text, original-image lists, other card states.
- **Left out**, as on the ChatGPT page: the thinking process, and the code the interpreter ran with its intermediate output. Generated charts and files stay in the text (files by name).
- **Layout**: A4 portrait with page numbers. Long code wraps. Wide tables first break long strings and use a smaller font, then get a landscape page of their own. Formulas become readable text (super- and subscripts, fractions, Greek letters); matrices and multi-line formulas are approximate. HTML written in answers shows as text, as on ChatGPT.
- **Fonts** are your system's, embedded by Chrome. On Windows: Microsoft YaHei, Segoe UI, Cascadia Mono, Cambria Math. macOS should use PingFang; not yet tested there.
- The default file name is the chat's title. Chrome's own header and footer (date, title, address) do not appear even if the option is ticked.

Known limits: joined emoji (👨‍👩‍👧‍👦) and the joined letters of Devanagari and Malayalam display correctly, but Chrome leaves them out of the text layer, so copy and search miss them; Arabic copies in display order. Images that failed to download show as *[Image not downloaded: …]*.

## Obsidian

Choose **Obsidian** as the format. *Export* becomes **Save | Open**:

- The first time, a page opens where you pick your notes folder (Chrome asks for permission once). Notes go to `<folder>/<chat title>/` with their `assets/` and `files/`, as in the ZIP.
- **Open** opens the note saved last from this chat in Obsidian (`obsidian://open`).
- Change the folder under *Settings → Obsidian → Notes folder*.

## Generic or Obsidian Markdown

*Made for* sets sensible defaults; each option can still be changed by hand.

| | Generic Markdown (default) | Obsidian |
| --- | --- | --- |
| Picture cards as HTML (Beta) | Off: a table, other cards as PNG with collapsed text | Off (you can turn it on) |
| HTML written in answers (`<svg>`, `<details>`) | Escaped, shown as text, as on ChatGPT | Kept, so it works |

Generic is for apps that may strip HTML (GitHub, Notion import, plain editors). Code blocks, inline code, formulas and autolinks are never affected. `manifest.json` records the choices in `exportProfile`.

## Not supported yet

- Other answers you regenerated: only the one shown on the page is exported.
- Combined card states: cards start from their default state; other states are listed as text.
