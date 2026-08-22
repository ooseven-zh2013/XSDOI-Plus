(function () {
  'use strict';

  var BTN_ID = '__xsdoi_copy_md_btn__';
  var BTN_LABEL = '复制MD';
  var LOG_PREFIX = '[XSDOI-MD]';

  // 页面结构选择器集中管理：xsdoi.com 改版时只需改这里
  var SELECTORS = {
    tab: '#tab-2',
    resultPane: '#pane-result',
    statusTitle: '.status-title',
    compileTitle: '.ce-title',
    compileBody: '.el-card__body pre',
    fieldItem: '.tj-res-item',
    fieldName: '.name',
    fieldValue: 'textarea'
  };

  // ---------- 工具 ----------

  // 规范化文本：去掉 &nbsp;、折叠连续空白、trim
  function norm(el) {
    if (!el) return '';
    return (el.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 按 .tj-res-item 里的 label（自测输入 / 预期输出 / 实际输出）取值
  function getField(label) {
    var items = document.querySelectorAll(SELECTORS.fieldItem);
    for (var i = 0; i < items.length; i++) {
      var nameEl = items[i].querySelector(SELECTORS.fieldName);
      if (nameEl && norm(nameEl) === label) {
        var ta = items[i].querySelector(SELECTORS.fieldValue);
        // v-model 绑定的值在 DOM property 上，必须读 .value
        return ta ? (ta.value || '') : '';
      }
    }
    return '';
  }

  // 值为空时跳过整段，避免生成空的 ```txt``` 代码块
  function fieldBlock(title, value) {
    if (!value) return '';
    return '# ' + title + '\n\n```txt\n' + value + '\n```';
  }

  function buildMarkdown() {
    var pane = SELECTORS.resultPane;

    // 编译失败场景：结果区里是 el-card，标题是 .ce-title，详情在 .el-card__body pre
    var ceTitleEl = document.querySelector(pane + ' ' + SELECTORS.compileTitle);
    if (ceTitleEl) {
      var ceTitle = norm(ceTitleEl);
      var preEl = document.querySelector(pane + ' ' + SELECTORS.compileBody);
      var reason = preEl ? (preEl.textContent || '').replace(/\u00a0/g, ' ').trim() : '';
      return '# ' + ceTitle + '\n\n```txt\n' + reason + '\n```';
    }

    // 正常判题场景
    var statusEl = document.querySelector(pane + ' ' + SELECTORS.statusTitle);
    var status = norm(statusEl);
    var parts = ['# 运行状态\n\n' + status];
    parts.push(fieldBlock('自测输入', getField('自测输入')));
    parts.push(fieldBlock('预期输出', getField('预期输出')));
    parts.push(fieldBlock('实际输出', getField('实际输出')));
    return parts.filter(function (s) { return s !== ''; }).join('\n\n');
  }

  // ---------- 剪贴板 ----------

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    // execCommand 已废弃，此处仅作为 Clipboard API 不可用时的降级方案
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  // ---------- 提示浮层 ----------

  function showToast(msg, isWarn) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'z-index:2147483647;background:' + (isWarn ? 'rgba(230,150,0,.92)' : 'rgba(0,0,0,.82)') + ';' +
      'color:#fff;padding:10px 18px;border-radius:6px;font-size:14px;pointer-events:none;' +
      'transition:opacity .3s;';
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, 1200);
  }

  // ---------- 按钮 ----------

  function createBtn() {
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = BTN_LABEL;
    btn.style.cssText =
      'display:inline-flex;align-items:center;height:28px;padding:0 12px;' +
      'margin:4px 0 0 8px;border:1px solid #2d8cf0;border-radius:4px;' +
      'background:transparent;color:#2d8cf0;font-size:13px;cursor:pointer;';
    btn.addEventListener('mouseenter', function () {
      btn.style.background = '#2d8cf0';
      btn.style.color = '#fff';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.background = 'transparent';
      btn.style.color = '#2d8cf0';
    });
    btn.addEventListener('click', function () {
      // 编译失败和正常判题都可能存在，任一有结果即可复制
      var pane = SELECTORS.resultPane;
      var hasResult =
        document.querySelector(pane + ' ' + SELECTORS.statusTitle) ||
        document.querySelector(pane + ' ' + SELECTORS.compileTitle);
      if (!hasResult) {
        showToast('未找到运行结果，请先运行自测', true);
        return;
      }
      var md = buildMarkdown();
      copyText(md).then(function (ok) {
        showToast(ok ? '已复制 Markdown' : '复制失败', !ok);
      });
    });
    return btn;
  }

  // ---------- 注入 ----------

  function inject() {
    if (document.getElementById(BTN_ID)) return;
    // 「运行自测」tab（#tab-2）的父级 el-tabs__nav，把按钮追加到它末尾
    var tab = document.querySelector(SELECTORS.tab);
    var nav = tab ? tab.parentElement : null;
    if (!nav) return; // 抽屉未打开时静默跳过，MutationObserver 会兜底
    nav.appendChild(createBtn());
  }

  // Vue 是动态渲染，自测抽屉打开时 DOM 才出现，用 MutationObserver 兜底
  // 用 requestAnimationFrame 合并同一帧内的多次变更，避免频繁触发 inject
  var pending = false;
  var observer = new MutationObserver(function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      inject();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  inject();
})();
