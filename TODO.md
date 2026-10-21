# TODO

项目唯一的进度清单，按阶段排列。做完的条目勾选 `[x]`，并写上版本或提交；不再删除条目。

- 当前分支：`edge-loop`（PR #11，已合并），已有 0.8.33–0.8.44；HTML 导出在 `claude/conversation-html-36cd5e`（0.10.x），见下一节。
- 实时导出与核对的结果在主仓库的 `Output/edge-test-output/`（不入库），报告见那里的 `REPORT.md`。
- 面板新规范：`C:\Workspace\Project\GPT REA\design\panel-spec.md`。

## 保存到 Obsidian（分支 `obsidian-export`，0.11.20 起）

导出方式的第 5 种。选中后「导出」变成胶囊「保存 | 打开」（原型方案 B）；内容经中转页（`obsidian.html`）写进用户选的笔记文件夹，再用 `obsidian://open` 打开。

- [x] Obsidian 作为第 5 种导出方式：输入框旁、侧边栏、工具栏面板三处的胶囊；设置里 Obsidian → 笔记文件夹（0.11.20）。
- [x] 工具栏面板去掉「当前对话」，信息行末尾可换导出方式（原型方案 C）；侧边栏底部那行换方式时不再跳动（0.11.21）。
- [x] 中转页改用统一样式，写明「存到」哪里、要点什么；选 Obsidian 时「下载时选择保存位置」变灰（0.11.22）。
- [x] 对话标题里有 Chrome 不接受的字符时（马拉雅拉姆文等带的隐形连接符、emoji 组合、~、.lnk 结尾），文件夹名去掉或换掉这些字符；Chrome 仍拒绝就改用只含文字和数字的名字。笔记里的标题不变（用户报告，0.11.24）。
- [x] panel-check 在真实 Chrome 里走完一次保存（用 OPFS 代替用户选的文件夹）。
- [ ] **Chrome 授权提示第一次没出现「每次访问时都允许」**（用户实测，2026-10-20）：第一次点「允许写入」时，Chrome 弹窗里没有这个选项；第二次弹出时有，选了以后就不再每段对话都问，之后很顺。可能和各人 Chrome 的设置或状态有关。暂不修，先记录；以后如果有更多人遇到，再查 Chrome 什么时候才给三选一提示（官方说明：只在「恢复已保存的授权」时出现）。
- [ ] 多个 Obsidian 库时的临时切换（讨论过「导出 ▾」里列出存过的文件夹），待定。

## 卡片图标改为矢量（release-html-pdf，0.11.5，PR #15 验收 P3）

- [x] 卡片里的图标原来是文字符号（`ICONS` 表，没有的显示 `•`），在 PNG、HTML、PDF 里都像乱码：EDGE-03 折叠区的 chevron-up/down 显示成「^」「v」，folder-open/closed 显示成「•」；EDGE-09「按需求选择」的 moon / sunrise / croissant / coffee 显示成小符号。现在用 Lucide 的矢量图标（lucide-static 1.48.0，ISC，开发依赖），由 `scripts/build-icons.cjs` 生成到 `dil-render.js` 的 `ICON_SVG`（211 个，35 KB）：夹具用到的全部图标、原符号表覆盖的名称、常用扩展。Lucide 没有的名称画成小圆点，`size`（xs–xl）生效。Markdown 不变（图标在 Markdown 里本来就不输出）。
- [x] 夹具里卡片用到的图标名（按使用次数）：rotate-ccw 11、check-circle 9、copy 5、download 5、chevron-down 4、chevron-up 4、file-spreadsheet 4、file-text 3、info 3、sliders-horizontal 2、calculator 2、check-circle-2 2、coffee 2、chart-line 2、alert-triangle 2、alert-circle 2，其余各 1 次：trending-up、external-link、home、settings、heart、star、bell、plus、flask-conical、layers、folder-open、folder-closed、check-square、list-filter、message-square、message-circle、moon、sunrise、croissant、sheet、archive、chart-column-increasing、image、chart-no-axes-column-increasing、x-circle、scale、arrow-up-right、arrow-down-left、check、file-image、file-code、clock、trending-down、arrow-right、arrow-down、trash-2、circle、wrench、activity、graduation-cap。全部 56 个在 Lucide 里都有，已补齐。
- [x] 顺带修复：卡片图片（PNG/PDF）里的 `pressable`（折叠区标题这类可点的面板）原来按普通块排，忽略 `direction:"row"`，chevron 掉到标题下一行；现在和 HTML 一样排在同一行。
- [x] 核对：127 个测试通过；html-check 26 个对话 0 错误；pdf-check 34 个对话 0 错误；markdown-same 22 个夹具 Markdown 与 main 相同。截图：EDGE-03 PDF 第 9 页、HTML 卡片，EDGE-09 HTML 卡片和卡片 PNG。`tests/html-cards.test.cjs` 的“checking one card takes under 2 ms”在整套并行跑、机器忙时偶尔超时（与图标无关，单独跑和再跑两次都通过）。

## 整段对话导出为 HTML（分支 `claude/conversation-html-36cd5e`，0.10.0 起）

面板规范里“整段对话导成 HTML”的占位换成了真功能：HTML = 尽量还原对话现场（PDF 由另一个会话做）。

- [x] 新模块 `extension/html-export.js`：正文用本地打包的 marked 转 HTML（公式 → MathML、Obsidian 折叠块 → `<details>`、`|200` 缩略图、正文 HTML 先过白名单清理）；提问显示为原样文字气泡；附件为文件卡片（0.10.0）。
- [x] 卡片可以操作：每张卡片一个沙箱 `srcdoc` iframe，页面把 `dil-render.js` 自身源码和这条消息的 `model_dil_v2` 交给它，`useState` 真正驱动重渲染（`mountLive` + 就地 `morph`，拖动中的滑块不被重建），从默认状态开始；同一条回答的几张卡片互相同步状态。页面里另有默认状态的静态副本（无脚本、打印、出错时显示）（0.10.0）。
- [x] `dil-render.js` 只做扩展：`evaluate` 的 live 选项、`toHtml(tree, opts)` 的 live 分支（真控件、真链接、图片、MathML、AppBlock、图表数据折叠表）、LaTeX → MathML、AppBlock 自适应高度的 iframe。Markdown 导出逐字节不变：`scripts/markdown-same.cjs` 对比 main，22 个 edge/pro 夹具全部相同。
- [x] AppBlock 原样放进沙箱 iframe 运行（WebGL、canvas、动画、SVG），高度随内容；卡片里的 AppBlock 在卡片 iframe 里嵌套运行；“新窗口打开”；打印时显示预览图（0.10.0）。
- [x] 地图：联网时用 OpenStreetMap 图块画可拖动、缩放的地图（自写，不加载外部脚本）；离线显示导出时截取的画面，地点列表始终是文字。面板选项旁有 ⓘ 说明（0.10.0；0.10.2 从 CARTO 换成 OSM，CARTO 无 key 时返回 “API KEY REQUIRED”）。
- [x] 地图改为默认静态（0.10.3）：打开页面零网络请求，显示截图 + 地点列表；点“联网查看可拖动地图”才加载图块。看门狗：4 秒内无图块、第一张出错或之后 3 次出错，自动回到截图并提示；按钮变成“返回截图”，应对返回“禁止访问”图片这类页面分不出的情况。打印时始终用截图；滚轮不再被地图吞掉，按住 Ctrl 才缩放。测试覆盖：打开时无请求、出错回退、超时回退、加载成功、返回截图。
- [x] 两种形式：ZIP（`conversation.html` + `assets/` + `files/` + `manifest.json`）和单个 HTML 文件（全部 data: URL），显示一致；卡片图片在两种形式里都用同一份内嵌缩略图（0.10.0）。
- [x] 卡片按钮：`GenUI.copy` 复制并提示“已复制”，`GenUI.issueNewTurn` 提示原本会发送的内容（0.10.1）。
- [x] `scripts/html-check.cjs`：所有夹具（EDGE-01…11、PRO-01…11、dil-checkbox、lab-energy、lab-survey、mainlab，共 26 个对话）× 两种形式，0 错误。检查 Markdown 导出每行文字都在页面上、文件齐全、每张卡片能运行且操作后内容变化、AppBlock 有 iframe、两种形式文字和元素一致（0.10.1）。
- [x] 测试：`tests/html-export.test.cjs` 10 个（含负向测试：缺字、按钮无效、程序报错都会被查出），全部 98 个测试通过。
- [x] 浏览器截图核对（截图在主仓库 `Output/html-test-output/0.10.2/screenshots/`，不入库）：
  - EDGE-01：卡片在 iframe 里运行，点“控件”标签后内容切换；
  - EDGE-03：7896 px 高的卡片完整显示，不裁切；
  - EDGE-05：3 个 AppBlock 在 iframe 里运行（A 的 canvas 动画在转），高度自适应；
  - EDGE-09：OSM 可拖动地图带 5 个评分标记，拖动后标记跟着移动；地点列表完整；
  - lab-survey：三维曲面 WebGL AppBlock 运行；卡片里嵌套的“Canvas 画板”能画线；9 张卡片全部进入可操作状态。
- [x] 实时导出（`scripts/live/`，0.10.2，加锁 `live-export.lock`，用完删除）：EDGE-01 单文件、EDGE-03 单文件、EDGE-05 单文件、EDGE-09 文件夹、R05 文件夹，`receive.cjs` 检查 0 错误。结果在主仓库 `Output/html-test-output/0.10.2/`。
- [x] **实时导出 R05「展示三维曲面」（Lab 三维对话）**：文件夹形式，0 错误；WebGL 曲面在 iframe 里运行，预览图从 `assets/` 正常加载（第三次尝试；前两次 Chrome 窗口在后台，`visibilityState=hidden` 时粘贴进不去）。
- [x] **重新加载插件后再验收一次**（0.10.3，插件 ID `lomiib…`，从本分支 `extension/` 加载，用户在 EDGE-09 上点“下载 HTML”，文件夹形式）：0 条提示；地图截图截到了（`assets/map-…jpg`，79 KB 的真 JPEG，带评分标记）；卡片里的 5 张搜索图片都内嵌成 data URL，没有远程地址或占位框；引用的文件全部存在；2 张卡片都进入可操作状态；打开页面时对 OpenStreetMap 0 次请求。粘贴模式下的两条提示（搜索图片、地图截图）是粘贴模式本身的限制。
- [x] 坏网络模拟（0.10.3，内置浏览器 + 本地假地图服务 `tmp/badnet.cjs`，不入库）：打开时 0 请求；请求挂起 → 加载期间不出现灰框，4 秒后回到截图并提示；403 和拒绝连接 → 约 0.06 秒回退并提示；返回“禁止访问”的灰色图片 → 页面当作成功（已知分辨不出），点“返回截图”能回到截图；正常网络 → 8 张图块、5 个标记。注意：测试时挂起的图块必须放在另一个端口，否则会占满 Chrome 对同一主机的 6 个连接，连页面本身都打不开。
- [ ] 文件夹形式只在 http 本地服务器和 jsdom 里核对过；内置浏览器把 `file://` 页面当作 data: 快照打开，没在真正的 `file://` 下点过（单文件形式在 data: 下核对过，卡片 iframe、AppBlock、地图都正常）。
- [ ] 未做：深色模式、代码语法高亮、思考过程、卡片的组合状态（只从默认状态开始，ChatGPT 不保存页面上点过的状态）。
- [ ] 与 PDF 分支合并时：`fast-content.js` 里本分支只加了 HTML 入口（面板 `#htmlBox` 用 `insertAdjacentHTML` 单独插入，没改第 12 行的面板模板）、`build(zip, html)` / `attachData(…, html)` / `captureMaps(…, html)` 的 html 分支和 `busy()` 列表里的 `'html'`；`background.js` 注入列表加了 `marked.min.js`、`html-export.js`，下载允许 `.html`。

## Phase 1（P0）：三条保底路线收尾，立即上线

三条保底路线是底线，任何 HTML 输出都不能绕过：

1. 图文卡片：Markdown 表格（或 HTML）
2. 失败 → PNG 卡片图
3. 再失败 → 折叠文字

HTML 开关默认走安全路线，确保现在的流程马上可用。

### 未提交代码与版本号

- [x] **主仓库未提交的 Rating 改动**（0.8.43，b1567ac；作者会话确认后搬过来，主仓库已恢复）：主仓库 `pro-edge-fixes` 上有未提交的修改，涉及 `dil-render.js`、`tests/edge-cases.test.cjs` 和版本号文件，内容是把 Yelp 评分（Rating 组件）画进卡片，用的是 EDGE-09 的回归测试。它把版本写成了 0.8.39，与 `edge-loop` 的 0.8.39 冲突。处理方式：
  - 先确认是哪个会话在做；
  - 把改动移到 `edge-loop` 最新提交之后，改为下一个可用版本（0.8.43 起）；
  - 主仓库恢复干净，保持 `pro-edge-fixes` 的 0.8.38。
- [x] **版本号以 `edge-loop` 为准**：0.8.39 B13、0.8.40 B14、0.8.41 B15、0.8.42 导出用途、0.8.43 Rating、0.8.44 HTML 默认值。Phase 2 在 `html-table` 分支用 0.9.x。之后每个改动扩展的提交都升一个补丁版本并推送。
- [ ] **`EXPERIMENT-CONVERSATIONS.md` 是否入库**：主仓库根目录这份实验对话清单还没入库，需要决定。2026-10-18 已更正 EDGE-04 链接 `a7fe` → `a2fe`。

### HTML 开关的默认安全策略

- [x] 把两件事拆成两个独立开关，放进高级设置（0.8.44，b8a1a04）：

  | 开关 | 管什么 | 通用 Markdown | Obsidian |
  |---|---|---|---|
  | 图文卡片用 HTML（Beta，`htmlCards`） | 我们生成的左图右文 HTML | 关 | 关（0.8.42 里是开，要改回关） |
  | 保留正文里的 HTML/SVG（`proseHtml`） | ChatGPT 写在回答里的 SVG、`<details>` | 转义成文字 | 保留 |

- [x] 正文 HTML 的转义还要覆盖“带卡片的消息”里的正文：查明这类正文走 DIL 组件树，`toMarkdown` 本来就给 `<` 加反斜杠，两种用途都会转义，不用改代码；已加回归测试（cee50e5）。
- [ ] 同步 `panel-spec.md` 的默认值表：增加“导出用途”，并加入上表的两个开关。

### 回归测试与发版

- [x] `node --test --test-force-exit tests/*.test.cjs` 全部通过（88 个）。
- [x] 用 `scripts/live/` 实时导出（0.8.44）：56 个对话按“通用 Markdown”全部导出一遍，0 错误。两种用途的差别只有正文 HTML，所以 Obsidian 用途只跑了带正文 HTML 的 H06，确认原样保留。`check.cjs` 新增“HTML 块被空行切断后显示成源码”和“单独的 `\r`”两项检查（cee50e5）。用 markdown-it 验证过：H06 的 SVG 中间有空行，但 VS Code 预览里仍然完整。
- [x] 重新加载插件后验收（插件改为从 `ChatGPT Exporter-edge-loop\extension` 加载，ID `fadldm…`，0.8.44）：
  - PRO-11 图表卡片里的图完整、不裁切（B14）：已确认，卡片从 1122 px 变成 2456 px 高，坐标轴、图例都在；
  - PRO-05 第 2 张卡片显示“试验曲线见下方下载链接。”（B15）：已确认，原来的空白卡片现在显示这段文字。
- [x] 图文卡片表格（HTML 关闭时）：文字里单独的 `\r` 会把这一行表格拆成两行（markdown-it 把它当换行）。单元格现在把 `\r\n`、单独的 `\r` 都当换行，转成 `<br>`；没有 `\r` 的输出不变，23 个夹具逐字节相同（0.8.45）。这个问题由 Phase 2 发现，用户同意在 Phase 1 修。
- [x] 合并 PR #11，用 `scripts/package.cjs` 打出 `releases/conversation-archive-<版本>.zip`。（2026-10-18 合并进 main，merge commit 038401b；发布包 `releases/conversation-archive-0.8.44.zip`，不入库，主仓库和 edge-loop worktree 各有一份。）

## Phase 2（P1）：HTML 渲染层与编辑层攻关（可交给独立会话并行推进）

所有 HTML 输出都放在开关后面，默认关。在这个阶段的东西做好之前，不改变 Phase 1 的行为。

### 防止“做坏了却不回退”：静态校验与白名单

- [ ] **组件白名单**：卡片树里只有白名单组件时才输出 HTML，否则直接走 PNG。白名单从 text、title、row、box、image、divider、badge、table 开始，按实验逐步扩大。（图文卡片部分已完成：0.9.0 严格识别 + HTML 只用 div/a/img/strong/em/code/br；0.9.2 打开 HTML 时放宽识别 col、图片单独装在 box 里、图标。其他卡片的 HTML 属渲染层，未做。）
- [x] **结构校验**：生成的 HTML 用 `DOMParser` 按 XHTML 解析，必须没有 parsererror。（0.9.0，`validateCardHtml`；`<img/>`、`<br/>` 自闭合）
- [x] **Markdown 安全校验**：HTML 块内不能有空行，行首不能有 4 个空格或 Tab，HTML 块必须以块级标签开头。违反任意一条，Markdown 解析器就会把后半段当文字，显示成代码，也就是“抽风”的直接原因。（0.9.0；另外所有换行（含单独的 `\r`、U+2028/2029）都写成 `<br/>`，控制字符去掉。单独的 `\r` 是实测唯一会把块切断的输入）
- [x] **文字一致校验**：HTML 的 textContent 与同一张卡片的 Markdown 文字，归一化后必须一致，防止内容丢失。（0.9.0，逐行比较，忽略空白和控制字符）
- [x] 以上任意一项不通过，就回到 PNG → 文字；回退原因记进 `manifest.json` 的 `cards`。（0.9.0：先退回 Markdown 表格，表格不行再 PNG → 文字；原因形如“HTML 未通过校验，改用表格：…”。含公式、删除线的卡片也直接用表格。故障开关新增 `html`）
- [x] 测试里引入 markdown-it（只作开发依赖），解析导出的 `.md`，断言 HTML 块完整。（0.9.0，`tests/html-cards.test.cjs`：15 种刁钻输入、13 种校验失败、单卡 < 2 ms、EDGE-09、HT-01…06 夹具）

### 渲染层

- [ ] 在 `dil-render.js` 新增可移植的 HTML 输出：复用 `toHtml` 的组件分支（已覆盖约 45 种组件），把 `CARD_CSS` 的类样式转成行内样式（Obsidian 不可靠地支持 `<style>`），输出为单行或无空行的 HTML。
- [ ] 图表、饼图直接用 `chartSvg` 的 SVG。公式在 HTML 里不渲染，含 `math` 的卡片先列为白名单外，走 PNG。
- [ ] 在 `fast-content.js` 的 `cardMarkdown` 中，非图文卡片在开关打开且校验通过时输出 HTML，图片路径指向 `assets/`、`files/`。
- [ ] 新组合场景的扩展测试：用 EDGE-01（18 类组件）、EDGE-03（超高卡片）、EDGE-04（多卡穿插），以及 PRO-02/04/06/08/11（指标网格、表格、滑块、文件列表），逐个加夹具断言。
- [ ] 实验：把卡片直接存成 SVG 矢量图（现在的 PNG 本来就是先生成 SVG 再转成图），比较 Obsidian 里的清晰度和兼容性。

### 编辑层

- [ ] 先明确需求：在 Obsidian 源码模式里改 HTML 卡片的文字后，结构不坏、能再次导出。可编辑的文字副本目前已有，就是折叠的“卡片文字”。
- [ ] 编辑友好的输出格式：每张卡片前后加 `<!-- chatgpt-card:… -->` 标记，一个元素一行、不留空行，属性顺序固定。
- [ ] 修复与校验脚本（`scripts/`）：检查改过的 `.md` 里 HTML 块是否仍然完整，必要时自动去掉误加的空行。
- [ ] 在 Obsidian 里真正所见即所得地编辑，需要另做 Obsidian 插件，属于更后面的项目。

## 导出格式：整段对话 PDF（分支 `claude/conversation-pdf-de4bdd`，0.11.x）

PDF = 把对话定格成纸面的静态版。只用现有的静态产物（Markdown、卡片 PNG、原图、AppBlock 预览图），不依赖整段对话 HTML 的渲染器。代码在 `extension/pdf-export.js` 和 `extension/print.html`，面板里只加了入口（`fast-content.js` 的 `runPdf`）。规则写在 README 的“PDF”一节。

### 技术验证（2026-10-18，Windows 11，Chrome 155）

- [x] **打印路径**（0.11.2 起改为页面里的隐藏框架，见下）：面板在点击时用 `window.open` 打开扩展页 `print.html`（ChatGPT 的 COOP 是 `same-origin-allow-popups`，新标签页保留 `opener`），打印页说“准备好了”以后，面板用 `postMessage` 把 Markdown 和图片 Blob 发过去，打印页排版后调用 `window.print()`。没有用 `chrome.debugger`（不会出现黄色调试条），**不需要新权限**：只把 `print.html` 加进 `web_accessible_resources`。打印页只接受来自 opener、来源是 chatgpt.com / chat.openai.com 的消息；扩展页的 CSP 不执行内联脚本，正文里的 HTML 一律转义。
- [x] **中文字体**：Chrome 把用到的系统字体以子集嵌入（微软雅黑、Segoe UI、Cascadia Mono、Cambria Math），pdf.js 读回的文字与原文一致，没有方块或乱码。所有字体都标记为已嵌入。
- [ ] **macOS 字体**：没有 Mac 可测。字体栈里有苹方、冬青黑体，Chrome 在 macOS 上同样嵌入子集，需要实测一次。
- [x] **分页**：
  - 超长卡片：Chrome 自己也会把高图切到多页，但切口位置随意（会切过文字）。改为在打印页里按“墨迹最少的一行”切成多张图：EDGE-03 的 2 万多像素卡片切成 9 段，切口都落在行间；第一段先填满当前页剩下的空间（至少四分之一页时）。
  - 长代码：`white-space: pre-wrap` 加 `overflow-wrap: anywhere`，300 字符的一行自动换行。
  - 宽表格：命名页 `@page wide { size: A4 landscape }` 可用。少列表格先只在含长串的单元格里断词，再缩小字号（最小 9px），仍放不下就单独一页横排（最小 8px），再不行才允许任意断词。`tests/fixtures/pdf-layout/` 的 20 列表格走到了横排页。
  - 背景色：`print-color-adjust: exact`，即使打印对话框里没勾“背景图形”也会印出提问气泡和代码块底色。

### 完整功能与检查

- [x] 0.11.0：`导出 PDF（打印）`按钮、`print.html`、`pdf-export.js`（Markdown 用随包的 marked 15.0.12 解析）。Markdown 和 ZIP 导出在 23 个原始对话上与 0.8.44 逐字节相同。
- [x] `scripts/pdf-check.cjs`：离线导出、无头 Chrome 打印、pdf.js 读回。检查每行文字、图片和卡片完整、链接数量与可点、字体嵌入与中文、页数和空白页。`tests/fixtures/` 下 27 个对话（11 个 EDGE、11 个 PRO、3 个界面数据文件夹、长卡片样本、版式样本）**0 错误**；PRO-03、PRO-10 各有一条提示（天城文、马拉雅拉姆文连写字形不在文字层里，见下）。
- [x] 测试：`tests/pdf-export.test.cjs`（分节、HTML 转义、公式、链接、横排样式、面板发给打印页的内容、打印页结构、权限，以及一次真实打印 EDGE-10）。
- [x] 表格行里代码或公式中的 `|`：`\\|` 在任何 GFM 查看器里都会切开单元格，超出表头列数的格子被丢掉（PRO-09 的“最大奇异值”等）。PDF 里把代码和公式里的 `|` 当内容保留，不丢字。Markdown 导出本身没改。
- [x] 0.11.1：卡片文字只有短行时排两栏；公式里的 `aligned` 环境、`&`、`\boxed` 去掉，`\\` 换行，`\in`、`\langle`、`\mathbb{R}` 等变成字符。
- [x] 人工核对 EDGE-01、EDGE-03、EDGE-09、EDGE-10 的 PDF（离线和实时各一份），截图和说明在主仓库的 `Output/pdf-test-output/0.11.1/`（不入库，见那里的 `REPORT.md`）。
- [x] 实时验收（0.11.1）：`window.__livePdf = true` 后用 `scripts/live/` 粘贴运行，面板点“导出 PDF”，发给打印页的内容经剪贴板交给 `receive.cjs`，由 `pdf-check.cjs` 用本分支的 `print.html` 打印检查。EDGE-01、03、09、10 都是 0 错误；EDGE-09 的搜索图和地图拿不到，是测试环境的限制（与 edge-loop 的实时核对相同）。
- [x] 用户实际点按钮（0.11.1）发现两个问题，0.11.2 修复：
  - 会打开一个新标签页，而且窄窗口里版面被截断。改为在 ChatGPT 页面里放一个看不见的框架（`print.html`）排版并调用打印，打印对话框直接在当前页面弹出；对话框关闭后框架自动移除。测试和实时代码包通过 `ChatExportPrintFrame` 提供框架窗口。
  - HT-01 这类图文列表卡片的图压在文字上：卡片图把 `width="100%"` 的图片画成默认的 180px，超出 124px 的列。`dil-render.js` 改为按列宽和图片比例画（只影响这类卡片的 PNG，Markdown 文字不变）；PDF 里的图文列表也改回与 ZIP 相同的表格写法，排成左图右文的列表。HT-01 已加进 `tests/fixtures/pdf-layout/`。
- [x] 用户在 0.11.2 上实测（HT-01“设计绿植列表”）：打印对话框直接在 ChatGPT 页面上弹出，没有新标签页；默认文件名“设计绿植列表-swift-0.11.2”；图文卡片左图右文、不再重叠。保存的 PDF 由用户自己的 Chrome（Skia m155）生成，3 页 A4，字体全部嵌入（微软雅黑、Segoe UI、Noto Sans SC），文字可提取，来源链接可点。打印对话框默认勾选“页眉和页脚”，会在页边印日期和标题，可以取消。
- [x] 0.11.3（用户要求）：去掉卡片图下面重复的“卡片文字”框。卡片文字改为卡片图后面一行约 1px 高的透明文字，留在阅读顺序里（不用绝对定位：那样会被画在整页内容之后，把跨页段落在文字层里切开）；有序列表的编号写成文字；卡片文字里卡片没画出的嵌入应用预览图和链接移到图下继续显示。EDGE-03 从 15 页减到 9 页。用户在 0.11.3 上实测 HT-01：卡片下没有重复的文字框，文字层仍按顺序可搜索。
- [x] 0.11.7（PR #15 验收）：Chrome 的页眉页脚。实测 Chrome 只在没有页面自己 margin box 的页边印页眉页脚（日期、标题、网址；标题在文字层里变成康熙部首，搜索不到），所以加一个空的 `@top-center`（下边已有页码）。`document.title` 改为对话标题，默认文件名与之一致。`pdf-check` 新增：文字层里不能出现康熙部首。
- [ ] 超长卡片的隐藏文字目前都在最后一段切片后面，搜索卡片里的字会跳到卡片结尾那一页。0.11.6 做过按切片分页，用户认为不需要，0.11.7 撤回；以后需要时可从提交 2e4c741 取回。
- [ ] 面板规范的“导出格式”一节（Markdown / HTML / PDF / 发送到 Obsidian）还没做；现在 PDF 是“下载 ZIP”旁边的一个按钮。和 HTML 一起改面板时再统一。

### 已知限制（不修）

- ZWJ 组合表情、天城文（नमस्ते 的 स्ते）、马拉雅拉姆文的连写字形显示正常，但 Chrome 没把它们写进文字层，复制、搜索会缺字；阿拉伯文复制出来是显示顺序。`pdf-check` 对这些文字只比较字符，缺一部分时记为提示而不是错误。
- 卡片文字在 PDF 里是看不见的文字（0.11.3 起），能搜索、复制，但不能在卡片图上直接框选。
- 公式是近似文字，不是排版公式。

## Phase 3（P2）：架构文档与上线后的更新计划

### 新增文档

- [ ] 在根目录写一份 Intelligent UI 技术报告，为以后适配和接入开源大模型做准备，内容包括：
  - DIL 架构：`model_dil_v2` 的 `code`、`constants`、`fallbackMarkdown`、`appData`，以及 DIL 源码与 `content.parts`；
  - 完整的输入输出规范：会话接口、files 和 interpreter 下载接口、`metadata.attachments`、`ada_visualizations`，以及导出 ZIP 的结构和 `manifest.json`；
  - 搜索结果的解析与渲染：`componentResults` 里的 AsyncImage、Rating、地图，图片下载，以及怎么画进卡片。

### 面板新规范（`design/panel-spec.md`）

- [ ] Obsidian 属性：YAML 写 title、source、created、model、tags，默认开，替换“来源：”那一行。`check.cjs` 和测试里检查开头的断言要跟着改。
- [ ] 完整归档默认不带 `ui/`，放到“开发者选项 → 附带界面数据”。
- [ ] 新开关：消息时间戳、思考过程、网页来源汇总、角色名称、文件名格式。文件名里要不要保留版本号，待用户确认。
- [ ] 按钮改名为「仅文字」(.md) 和「完整归档」(.zip)。HTML 先只占位；PDF 已在 0.11.0 实现（见上面“整段对话 PDF”）。
- [ ] 一键导入 Obsidian：现在只保留入口。

### 原有的上线后改进（原 TODO 全部保留）

#### 导出内容

- [ ] **重新生成的其他回答**：现在只导出当前显示的分支。可以考虑在 ui JSON 或附录里列出兄弟分支。
- [ ] **卡片交互状态**：服务器不保存 `view_state`，所以卡片图只能画默认状态，用户在页面上操作过的状态无法还原。（0.8.31 起，其他标签页、展开后才显示的文字等，会在每个状态单独切换后列进折叠块；多个状态组合起来的情况，以及滑块的其他取值，都还没有覆盖。）

#### 卡片图

- [ ] 样式是近似还原，可继续对照 chatgpt.com 校准。
- [ ] 图标表之外的图标显示为「•」；遇到新名称时补进 `ICONS`。
- [ ] 卡片公式只处理常见 LaTeX（分数、上下标、希腊字母、常用符号）；矩阵、多行公式等仍是近似文字。

#### 维护

- [x] 「从页面补充当前状态与截图」（0.6.3 的 DOM + 截图路径）体量很大，默认路径已覆盖它的大部分用途。确认无人使用后可以移除。（0.8.14 已移除，连同“选框补截图”和旧代码，存于 archive/legacy-0.6）
- [ ] 依赖 ChatGPT 内部接口和 DIL 格式；格式变化时以 `tests/fixtures/` 的真实数据回归测试定位问题。
