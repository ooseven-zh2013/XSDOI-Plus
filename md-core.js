/**
 * md-core.js — Markdown 转换纯函数模块
 *
 * 设计原则：
 * 1. 零全局依赖：只操作「传入的节点」，不直接访问 document/window，方便单测。
 * 2. UMD 导出：既可作为 content script 注入（window.MDCore），
 *    也可在 Node + jsdom 中 `require('./md-core.js')` 直接单测。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MDCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // KaTeX 公式 → $tex$（提取 LaTeX 源码，而非解析渲染后的 HTML）
  function katexToText(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return root;
    const doc = root.ownerDocument || root;
    root.querySelectorAll('.katex').forEach(function (k) {
      const ann = k.querySelector('annotation[encoding="application/x-tex"]');
      const tex = ann ? ann.textContent.trim() : '';
      if (!tex) { k.remove(); return; } // 无源码的公式节点直接移除，避免产出空 $ $
      const isDisplay = !!k.closest('.katex-display');
      const span = doc.createElement('span');
      span.textContent = isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`;
      k.replaceWith(span);
    });
    return root;
  }

  // 精简 HTML → Markdown
  function toMarkdown(node) {
    if (!node) return '';
    if (node.nodeType === 3 /* TEXT_NODE */) return node.textContent.replace(/\u00a0/g, ' ');
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(toMarkdown).join('');

    switch (tag) {
      case 'p': return children.trim() + '\n\n';
      case 'br': return '\n';
      case 'h1': return '# ' + children.trim() + '\n\n';
      case 'h2': return '## ' + children.trim() + '\n\n';
      case 'h3': return '### ' + children.trim() + '\n\n';
      case 'h4': return '#### ' + children.trim() + '\n\n';
      case 'h5': return '##### ' + children.trim() + '\n\n';
      case 'h6': return '###### ' + children.trim() + '\n\n';
      case 'strong': case 'b': return '**' + children.trim() + '**';
      case 'em': case 'i': return '*' + children.trim() + '*';
      case 'code': {
        const txt = children.trim();
        // 内容含反引号时用双反引号包裹，避免提前闭合（CommonMark 规范）
        if (txt.includes('`')) {
          const open = txt.startsWith('`') ? '`` ' : '``';
          const close = txt.endsWith('`') ? ' ``' : '``';
          return open + txt + close;
        }
        return '`' + txt + '`';
      }
      case 'pre': return '\n```\n' + children.trim() + '\n```\n\n';
      case 'blockquote': return '> ' + children.trim().replace(/\n/g, '\n> ') + '\n\n';
      case 'hr': return '\n---\n\n';
      case 'li': return children.trim();
      case 'ul': {
        const items = Array.from(node.children).filter(function (c) { return c.tagName === 'LI'; })
          .map(function (li) { return '- ' + toMarkdown(li).trim(); }).join('\n');
        return '\n' + items + '\n\n';
      }
      case 'ol': {
        const items = Array.from(node.children).filter(function (c) { return c.tagName === 'LI'; })
          .map(function (li, i) { return (i + 1) + '. ' + toMarkdown(li).trim(); }).join('\n');
        return '\n' + items + '\n\n';
      }
      case 'img': {
        const src = node.getAttribute('src');
        const alt = node.getAttribute('alt') || '';
        return src ? `![${alt}](${src})` : '';
      }
      case 'a': {
        const href = node.getAttribute('href');
        const text = children.trim();
        return href ? `[${text}](${href})` : text;
      }
      case 'table': return tableToMarkdown(node);
      default: return children;
    }
  }

  // 表格 → Markdown（表头 th 行自动补分隔线，单元格内的 | 转义）
  function tableToMarkdown(table) {
    const rowEls = Array.from(table.querySelectorAll('tr'));
    const rows = rowEls.map(function (tr) {
      return Array.from(tr.children).map(function (cell) {
        return toMarkdown(cell).replace(/\|/g, '\\|').trim();
      });
    }).filter(function (cells) { return cells.length > 0; });
    if (!rows.length) return '';

    const colCount = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const pad = function (cells) {
      const out = cells.slice();
      while (out.length < colCount) out.push('');
      return '| ' + out.join(' | ') + ' |';
    };

    const firstCell = rowEls[0] && rowEls[0].children[0];
    const isHeader = firstCell && firstCell.tagName === 'TH';

    const lines = [pad(rows[0])];
    if (isHeader) lines.push('| ' + Array(colCount).fill('---').join(' | ') + ' |');
    for (let i = 1; i < rows.length; i++) lines.push(pad(rows[i]));
    return '\n' + lines.join('\n') + '\n\n';
  }

  // 组装最终 Markdown（纯函数：数据进、字符串出，不查 DOM）
  function buildMarkdown(meta, sections) {
    const title = (meta && meta.title) || '';
    const time = (meta && meta.time) || '';
    const space = (meta && meta.space) || '';
    const fileIO = (meta && meta.fileIO) || null;
    const desc = (sections && sections.desc) || '';
    const inputFmt = (sections && sections.inputFmt) || '';
    const outputFmt = (sections && sections.outputFmt) || '';
    const samples = (sections && sections.samples) || [];
    const hint = (sections && sections.hint) || '';

    const md = [];
    md.push(`# ${title}`, '', '## 限制', '');
    if (time) md.push(`- 时间限制：${time}`);
    if (space) md.push(`- 空间限制：${space}`);
    if (fileIO) {
      md.push('- 文件 IO：');
      if (fileIO.input) md.push(`  - 输入：${fileIO.input}`);
      if (fileIO.output) md.push(`  - 输出：${fileIO.output}`);
    }
    md.push('');
    if (desc) md.push('## 题目内容', '', desc, '');
    if (inputFmt) md.push('## 输入格式', '', inputFmt, '');
    if (outputFmt) md.push('## 输出格式', '', outputFmt, '');
    if (samples.length) {
      md.push('## 样例', '');
      samples.forEach(function (s) {
        md.push(`### 样例${s.n}`, '');
        if (s.input) md.push('#### 输入', '', '```txt\n' + s.input + '\n```');
        if (s.output) md.push('#### 输出', '', '```txt\n' + s.output + '\n```');
        md.push('');
      });
    }
    if (hint) md.push('## 提示', '', hint, '');
    return md.join('\n').trim() + '\n';
  }

  return { katexToText: katexToText, toMarkdown: toMarkdown, tableToMarkdown: tableToMarkdown, buildMarkdown: buildMarkdown };
}));
