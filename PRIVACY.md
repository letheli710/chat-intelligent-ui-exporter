# Privacy Policy

Chat & Intelligent UI Exporter for ChatGPT · Last updated: 2026-10-22

[中文版见下方](#隐私政策)

## Summary

The extension exports your ChatGPT conversations to files on your own computer. It does not collect your data, has no servers of its own, contains no analytics or advertising, and never sends your conversations to the developer or to any third party.

## What the extension reads, and why

The extension works only on chatgpt.com and chat.openai.com tabs. There, to show its export panel and to export, it reads:

- **The conversation open in that tab**: its messages, attachments, images, generated files and interface-card data, fetched from ChatGPT's own website, in the same way the ChatGPT page loads them.
- **A temporary sign-in token from that ChatGPT page**: used only to send those requests to ChatGPT. It stays in memory for the duration of the request; it is never saved, exported, or sent anywhere else.
- **Pictures from search results on images.openai.com**: downloaded without cookies, so they can be put into the export.

## Where data is kept

Everything stays on your computer:

- **Exported files** (Markdown, ZIP, HTML, PDF) go to the folder you choose, through Chrome's normal downloads or print dialog.
- **Settings** (export kind, file names, language and similar) are stored in the extension's own storage (`chrome.storage.local`).
- **Obsidian**: if you use "Save to Obsidian", the note folder you pick is remembered in the extension's own storage (IndexedDB) so Chrome can ask once for permission, and the link to the note saved for each chat is kept in `chrome.storage.local` so the "Open" button can open it again. Notes are written only inside the folder you picked.

The developer never receives any of this.

## Network requests

- The extension itself contacts only chatgpt.com / chat.openai.com and images.openai.com, as described above.
- **Feedback** opens a Google Form in a new tab, with the extension version, language, Chrome version and operating system filled in. Nothing is sent unless you submit the form yourself, and the form is handled by Google under its own privacy policy.
- **Exported HTML pages and previews behave like ordinary web pages.** If the conversation or a generated component refers to resources on the web (pictures, embedded apps that load libraries or data, links), your browser requests them from those websites when you preview or open the export, which shows those sites your IP address, like any page visit. The map in an exported HTML page shows a picture taken at export; only if you click "view the online map" does it load map tiles from OpenStreetMap.

## How to delete your data

- Exported files: delete them like any other file.
- Settings, the remembered Obsidian folder and saved note links: removing the extension deletes all of them. Settings alone can be reset on the extension's settings page.

## Changes and contact

Changes to this policy are published in this file in the public repository, https://github.com/letheli710/chat-intelligent-ui-exporter. Questions: open an issue there, or write to letheli710@gmail.com.

The extension is not affiliated with OpenAI.

---

# 隐私政策

Chat & Intelligent UI Exporter for ChatGPT · 最后更新：2026-10-22

## 概要

本扩展把你的 ChatGPT 对话导出为你电脑上的文件。它不收集你的数据，没有自己的服务器，不含统计或广告，也从不把你的对话发给开发者或任何第三方。

## 扩展读取什么、为什么

扩展只在 chatgpt.com 和 chat.openai.com 标签页上工作。为了显示导出面板和完成导出，它会读取：

- **该标签页里打开的对话**：消息、附件、图片、生成的文件和界面卡片数据，从 ChatGPT 自己的网站读取，方式和 ChatGPT 页面加载它们一样。
- **该 ChatGPT 页面的临时登录凭据**：只用来向 ChatGPT 发送上述请求，只在请求期间留在内存里，不会被保存、导出或发往别处。
- **images.openai.com 上的搜索结果图片**：下载时不带 cookie，用来放进导出文件。

## 数据保存在哪里

所有数据都留在你的电脑上：

- **导出文件**（Markdown、ZIP、HTML、PDF）通过 Chrome 的下载或打印对话框保存到你选择的位置。
- **设置**（导出方式、文件名、语言等）保存在扩展自己的存储（`chrome.storage.local`）里。
- **Obsidian**：使用“保存到 Obsidian”时，你选的笔记文件夹记在扩展自己的存储（IndexedDB）里，这样 Chrome 只需请求一次授权；每段对话保存的笔记链接记在 `chrome.storage.local` 里，供“打开”按钮再次打开。笔记只会写进你选的那个文件夹。

开发者收不到以上任何内容。

## 联网请求

- 扩展自己只会访问 chatgpt.com / chat.openai.com 和 images.openai.com，用途如上。
- **反馈**会在新标签页打开一个 Google 表单，并预先填好扩展版本、语言、Chrome 版本和操作系统。你不自己提交就不会发送任何内容；表单由 Google 按其隐私政策处理。
- **导出的 HTML 页面和预览就像普通网页。** 如果对话或生成的组件引用了网上的资源（图片、会加载库或数据的嵌入应用、链接），预览或打开导出文件时，浏览器会向这些网站请求它们，和访问任何网页一样，对方会看到你的 IP 地址。导出 HTML 里的地图显示导出时截取的画面；只有你点“联网查看可拖动地图”时，才会从 OpenStreetMap 加载地图图块。

## 如何删除数据

- 导出文件：像删除普通文件一样删除即可。
- 设置、记住的 Obsidian 文件夹和笔记链接：卸载扩展会把它们全部删除。只想清设置的话，可以在扩展的设置页里恢复默认。

## 变更与联系

本政策的变更会发布在公开仓库的这个文件里：https://github.com/letheli710/chat-intelligent-ui-exporter 。有问题请在那里提 issue，或写信到 letheli710@gmail.com。

本扩展与 OpenAI 无关。
