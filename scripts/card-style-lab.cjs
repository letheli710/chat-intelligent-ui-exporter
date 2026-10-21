// Experiment: other ways to write a "picture list" card (rows of image + title + text)
// into Markdown instead of one PNG. Reads an export folder and writes compare.md next to
// its conversation.md, showing each candidate layout for the picture-list cards found.
// Usage: node scripts/card-style-lab.cjs <export folder>
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = require('../extension/dil-render');
const dir = path.resolve(process.argv[2]);
const exec = (code, scope) => vm.runInNewContext(code, {...scope}, {timeout:1000});

// Rows that hold one image and some text become items {src, alt, title, text}.
function pictureItems(tree) {
  const items = [];
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const kids = node.children || [], images = kids.filter(k => k?.type === 'image');
    if (node.type === 'row' && images.length === 1) {
      const md = R.toMarkdown({type:'Fragment', props:{}, children:kids.filter(k => k?.type !== 'image')}).split('\n').filter(l => l.trim());
      items.push({src:images[0].props.src, alt:images[0].props.alt || '', title:(md.shift() || '').replace(/^\*\*(.*)\*\*$/, '$1'), text:md.join(' ')});
      return;
    }
    kids.forEach(walk);
  })(tree);
  return items;
}

const variants = {
  'A 表格：左列缩略图，右列标题和说明': (items, local) => ['| 图片 | 内容 |', '| --- | --- |', ...items.map(i => `| ![${i.alt.replace(/[|[\]]/g, ' ')}\\|120](${local(i.src)}) | **${i.title.replace(/\|/g, '\\|')}**<br>${i.text.replace(/\|/g, '\\|')} |`)].join('\n'),
  'B 列表：每项前面一张小图，文字可编辑': (items, local) => items.map(i => `- ![${i.alt.replace(/[|[\]]/g, ' ')}|96](${local(i.src)}) **${i.title}**\n  ${i.text}`).join('\n'),
  'C Callout：每项一个可折叠卡片，图片在里面': (items, local) => items.map(i => `> [!example]+ ${i.title}\n> ![${i.alt.replace(/[|[\]]/g, ' ')}|200](${local(i.src)})\n>\n> ${i.text}`).join('\n\n'),
  'D 小标题 + 图 + 段落：最普通的 Markdown': (items, local) => items.map(i => `#### ${i.title}\n\n![${i.alt.replace(/[|[\]]/g, ' ')}|240](${local(i.src)})\n\n${i.text}`).join('\n\n'),
  'E HTML 图文并排（Obsidian 和 VS Code 都认 HTML）': (items, local) => items.map(i => `<div style="display:flex;gap:12px;align-items:flex-start;margin:8px 0"><img src="${local(i.src)}" width="120" style="border-radius:8px;object-fit:cover;aspect-ratio:5/4"><div><b>${i.title}</b><br>${i.text}</div></div>`).join('\n')
};

const out = ['# 图文卡片的其他写法（实验）', '', '同一张卡片，分别用 PNG（当前做法）和几种 Markdown 写法呈现。缩略图宽度用 Obsidian 的 `![alt|宽度](路径)` 写法；E 用 HTML。', ''];
let found = 0;
for (const file of fs.readdirSync(path.join(dir, 'ui')).filter(f => f.endsWith('.json'))) {
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'ui', file), 'utf8'));
  const local = url => record.localAssets?.[url] || url;
  let card = 0;
  for (const segment of R.segments(R.evaluate({...record.dil, contentReferences:record.contentReferences}, exec))) {
    if (segment.kind !== 'card') continue;card++;
    const items = pictureItems(segment.tree);
    if (items.length < 2) continue;
    found++;
    const png = `assets/card-${record.messageId}-${card}.png`;
    out.push(`---`, '', `## 卡片 ${found}：${items.map(i => i.title).join(' / ').slice(0, 60)}`, '', '### 当前：整张卡片画成 PNG', '', fs.existsSync(path.join(dir, png)) ? `![交互卡片](${png})` : '（PNG 不在这个导出里）', '');
    for (const [name, write] of Object.entries(variants)) out.push(`### ${name}`, '', write(items, local), '');
  }
}
fs.writeFileSync(path.join(dir, 'compare.md'), out.join('\n'));
console.log(`picture-list cards: ${found} -> ${path.join(dir, 'compare.md')}`);
