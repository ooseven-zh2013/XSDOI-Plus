(() => {
  'use strict';

  // 仅在题目详情页生效（路由 /problem/xxx）
  if (!/\/problem\//.test(location.pathname)) return;

  // md-core.js 由 manifest 先于本文件注入；未加载时静默退出，避免报错
  const MDC = window.MDCore;
  if (!MDC) return;

  const BTN_ID = 'md-copy-btn';

  // ---------- 集中管理站点 DOM 选择器（站点改版时只需改这里） ----------
  const SELECTORS = {
    problemContent: '#problem-content',
    panelTitle: '#pane-problemDetail .panel-title',
    titleLink: '.problem-title-link',
    questionIntrSpan: '#pane-problemDetail .question-intr > span',
    problemTag: '#pane-problemDetail .problem-tag .el-tag',
    sectionTitle: '#problem-content > p.title',
    hintContent: '#pane-problemDetail .hint-content',
    example: '#problem-content .flex-container.example',
    exampleInputPre: '.example-input pre',
    exampleOutputPre: '.example-output pre',
    exampleTitle: '.example-input .title',
    appMount: '#app'
  };

  // ---------- 等待元素出现（SPA 异步渲染） ----------
  function waitFor(selector, timeout = 8000) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) { clearInterval(timer); resolve(el); }
        else if (Date.now() - t0 > timeout) { clearInterval(timer); reject(new Error('timeout: ' + selector)); }
      }, 200);
    });
  }

  // ---------- 提取标题（兼容公开题 <span> 与作业题 <a.problem-title-link> 两种结构） ----------
  function getTitle() {
    const panelTitle = document.querySelector(SELECTORS.panelTitle);
    if (!panelTitle) return '';
    const link = panelTitle.querySelector(SELECTORS.titleLink);
    if (link) return link.textContent.trim();
    const span = panelTitle.querySelector(':scope > span');
    return span ? span.textContent.trim() : '';
  }

  // ---------- 读取「文件 IO」的输入/输出文件名（可能不存在） ----------
  // 文件名在「文件 IO」标签的 popover 表格里（输入文件 / 输出文件）
  async function getFileIO() {
    const ioTag = Array.from(document.querySelectorAll(SELECTORS.problemTag))
      .find(t => /文件/.test(t.textContent));
    if (!ioTag) return null;

    const pid = ioTag.getAttribute('aria-describedby');
    let popover = pid ? document.getElementById(pid) : null;
    // 兜底：popover 未预渲染时触发 hover，并异步等待 Vue 完成渲染（而非同步重查）
    if (!popover && pid) {
      ioTag.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
      try {
        popover = await waitFor('#' + CSS.escape(pid), 1000);
      } catch (e) {
        return null;
      }
    }
    if (!popover) return null;

    let input = '';
    let output = '';
    popover.querySelectorAll('tbody tr').forEach(tr => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 2) {
        const key = tds[0].textContent.trim();
        const val = tds[1].textContent.trim();
        if (/输入/.test(key)) input = val;
        else if (/输出/.test(key)) output = val;
      }
    });
    return (input || output) ? { input, output } : null;
  }

  // ---------- 提取标题 / 时间 / 空间 / 文件 IO ----------
  async function getMeta() {
    const spans = Array.from(document.querySelectorAll(SELECTORS.questionIntrSpan))
      .map(s => s.textContent.trim()).filter(Boolean);
    const time = spans.find(s => s.includes('时间'));
    const space = spans.find(s => s.includes('空间'));
    return {
      title: getTitle(),
      time: time ? time.replace(/时间限制[：:]\s*/, '').trim() : '',
      space: space ? space.replace(/空间限制[：:]\s*/, '').trim() : '',
      fileIO: await getFileIO()
    };
  }

  // ---------- 提取正文段（题目描述 / 输入格式 / 输出格式） ----------
  function extractSection(sectionTitle) {
    let target = null;
    document.querySelectorAll(SELECTORS.sectionTitle).forEach(t => {
      if (t.textContent.trim() === sectionTitle) {
        const next = t.nextElementSibling;
        if (next && next.classList.contains('md-content')) target = next;
      }
    });
    if (!target) return '';
    const clone = target.cloneNode(true);
    MDC.katexToText(clone);
    return MDC.toMarkdown(clone).trim();
  }

  // ---------- 提取提示 ----------
  function extractHint() {
    const el = document.querySelector(SELECTORS.hintContent);
    if (!el) return '';
    const clone = el.cloneNode(true);
    MDC.katexToText(clone);
    return MDC.toMarkdown(clone).trim();
  }

  // ---------- 提取样例（仅提取数据，Markdown 组装交给 md-core） ----------
  function extractSamples() {
    const samples = [];
    document.querySelectorAll(SELECTORS.example).forEach((ex, i) => {
      const inp = ex.querySelector(SELECTORS.exampleInputPre);
      const out = ex.querySelector(SELECTORS.exampleOutputPre);
      const titleEl = ex.querySelector(SELECTORS.exampleTitle);
      const n = titleEl ? (titleEl.textContent.match(/\d+/) || [i + 1])[0] : (i + 1);
      const input = inp ? inp.textContent.trim() : '';
      const output = out ? out.textContent.trim() : '';
      if (input || output) samples.push({ n, input, output });
    });
    return samples;
  }

  // ---------- 汇总所有正文段 ----------
  function extractSections() {
    return {
      desc: extractSection('题目描述'),
      inputFmt: extractSection('输入格式'),
      outputFmt: extractSection('输出格式'),
      samples: extractSamples(),
      hint: extractHint()
    };
  }

  // ---------- 复制到剪贴板（双保险） ----------
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  }

  // ---------- 按钮 ----------
  function createButton() {
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = '复制Markdown版本';
    Object.assign(btn.style, {
      display: 'inline-block',
      marginBottom: '8px',
      padding: '6px 14px',
      background: '#2d8cf0',
      color: '#ffffff',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '13px',
      lineHeight: '1.5'
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  async function onClick(e) {
    const btn = e.currentTarget;
    const flash = (msg, color) => {
      btn.textContent = msg;
      btn.style.background = color;
      setTimeout(() => { btn.textContent = '复制Markdown版本'; btn.style.background = '#2d8cf0'; }, 2000);
    };
    try {
      await waitFor(SELECTORS.problemContent);
      const meta = await getMeta();
      const sections = extractSections();
      const hasBody = sections.desc || sections.inputFmt || sections.outputFmt
        || sections.samples.length || sections.hint;
      if (!hasBody) { flash('未找到题目内容', '#ed4014'); return; }
      const md = MDC.buildMarkdown(meta, sections);
      const ok = await copyText(md);
      if (ok) flash('已复制！', '#19be6b');
      else flash('复制失败', '#ed4014');
    } catch (err) {
      flash('题目未加载，请稍候', '#ff9900');
    }
  }

  // ---------- 在标题上方插入按钮（含 SPA 切换后的重建） ----------
  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    const panelTitle = document.querySelector(SELECTORS.panelTitle);
    if (!panelTitle) return;
    const btn = createButton();
    panelTitle.insertAdjacentElement('beforebegin', btn);
  }

  ensureButton();

  // 观察 DOM 变化重建按钮：按钮已存在时快速返回，rAF 节流合并高频变更
  const mount = document.querySelector(SELECTORS.appMount) || document.body;
  let scheduled = false;
  new MutationObserver(() => {
    if (document.getElementById(BTN_ID)) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensureButton();
    });
  }).observe(mount, { childList: true, subtree: true });
})();
