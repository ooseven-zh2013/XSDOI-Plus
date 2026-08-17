(() => {
  'use strict';

  const BTN_TEXT = '复制Cpp格式';
  const BTN_COPIED_TEXT = '已复制';
  const BTN_CLASS = 'xsoj-copy-cpp-btn';
  const BTN_COLOR = 'rgb(45,140,240)';
  const BTN_COLOR_DONE = 'rgb(29,158,117)';

  // 判断是否为「文件 IO」弹层：需同时包含「输入文件」「输出文件」两张表项
  function isFileIOPopover(el) {
    if (!el || el.nodeType !== 1) return false;
    if (!el.classList.contains('el-popover')) return false;
    const text = el.textContent || '';
    return text.indexOf('输入文件') !== -1 && text.indexOf('输出文件') !== -1;
  }

  // 从「文件 IO」弹层表格中提取输入/输出文件名
  function extractFileNames(popover) {
    const table = popover.querySelector('table');
    if (!table) return null;

    let inputFile = '';
    let outputFile = '';
    const rows = table.querySelectorAll('tr');
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < 2) continue;
      const label = (cells[0].textContent || '').trim();
      const value = (cells[1].textContent || '').trim();
      if (label === '输入文件') inputFile = value;
      else if (label === '输出文件') outputFile = value;
    }
    if (!inputFile && !outputFile) return null;
    return { inputFile: inputFile, outputFile: outputFile };
  }

  // 复制文本到剪贴板：优先 Clipboard API，失败降级 execCommand
  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        // 忽略，走降级分支
      }
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  // 在文件输入/输出名表格下方插入按钮（幂等，避免重复插入）
  function ensureButton(popover) {
    if (popover.querySelector('.' + BTN_CLASS)) return;

    const table = popover.querySelector('table');
    if (!table) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BTN_CLASS;
    btn.textContent = BTN_TEXT;
    btn.setAttribute('style', [
      'display:inline-block',
      'margin-top:8px',
      'padding:6px 14px',
      'background:' + BTN_COLOR,
      'color:#ffffff',
      'border:none',
      'border-radius:6px',
      'cursor:pointer',
      'font-size:13px',
      'line-height:1.5'
    ].join(';'));

    btn.addEventListener('click', async () => {
      const files = extractFileNames(popover);
      if (!files) {
        console.warn('[新赛道OI扩展] 未识别到输入/输出文件名');
        return;
      }
      const text = 'freopen("' + files.inputFile + '", "r", stdin);\nfreopen("' + files.outputFile + '", "w", stdout);';
      const ok = await copyText(text);
      if (ok) {
        btn.textContent = BTN_COPIED_TEXT;
        btn.style.background = BTN_COLOR_DONE;
        setTimeout(() => {
          btn.textContent = BTN_TEXT;
          btn.style.background = BTN_COLOR;
        }, 1200);
      }
    });

    // 紧邻表格之后插入，保证位于文件名下方
    table.insertAdjacentElement('afterend', btn);
  }

  function handlePopover(el) {
    if (isFileIOPopover(el)) ensureButton(el);
  }

  // 扫描页面中已存在的弹层
  function scan() {
    const list = document.querySelectorAll('.el-popover');
    for (let i = 0; i < list.length; i++) {
      handlePopover(list[i]);
    }
  }

  if (document.body) {
    scan();
  }

  // 监听 DOM 变化：比赛页路由切换 / Vue 异步渲染会重建组件
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const nodes = m.addedNodes;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.nodeType !== 1) continue;
        if (isFileIOPopover(node)) {
          ensureButton(node);
        } else if (node.querySelectorAll) {
          const inner = node.querySelectorAll('.el-popover');
          for (let j = 0; j < inner.length; j++) {
            handlePopover(inner[j]);
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
