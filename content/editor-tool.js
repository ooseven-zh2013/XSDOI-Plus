// ============================================================
// 编辑器右上角工具按钮 - content script（隔离世界）
//
// 在题目页编辑器右上角按钮组（#js-right-header .select-row.fl-right，
// 与「上传」「设置」并列）注入一个新按钮。
// 按钮复用页面原生 Element UI 小按钮样式（el-button--default el-button--small），
// 因此板块美化的亚克力透明样式（#js-right-header .el-button）自动生效，无需额外 CSS。
//
// 当前为占位实现：点击提示「功能开发中」。
// 具体功能由用户描述后填充到 btnClick 回调中。
// ============================================================

(function () {
  'use strict';

  // 防重复注入标记（打在按钮上）
  var BTN_ATTR = 'data-editor-tool-btn';
  // 占位图标：el-icon-more（三个点，表示「更多工具」），功能确定后再换
  var BTN_ICON = 'el-icon-more';
  // 占位提示文案
  var PLACEHOLDER_TIP = '功能开发中，敬请期待';

  // ---------- 等待按钮组出现（SPA 异步渲染） ----------
  function waitForBtnGroup(cb, timeout) {
    var t0 = Date.now();
    var timer = setInterval(function () {
      var header = document.getElementById('js-right-header');
      var group = header && header.querySelector('.select-row.fl-right');
      if (group) {
        clearInterval(timer);
        cb(group);
      } else if (Date.now() - t0 > (timeout || 10000)) {
        clearInterval(timer);
      }
    }, 200);
  }

  // ---------- 注入按钮 ----------
  function injectBtn(group) {
    if (group.querySelector('[' + BTN_ATTR + ']')) return; // 已注入

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'el-button el-tooltip el-button--default el-button--small';
    btn.setAttribute(BTN_ATTR, '1');
    btn.title = '编辑器工具';
    btn.innerHTML = '<i class="' + BTN_ICON + '"></i>';

    btn.addEventListener('click', function () {
      btnClick(btn);
    });

    group.appendChild(btn);
  }

  // ---------- 按钮点击回调（占位，功能待用户描述后实现） ----------
  function btnClick(btn) {
    showToast(PLACEHOLDER_TIP);
  }

  // ---------- 居中提示浮层（与 md-error-copy 同款风格） ----------
  function showToast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText =
      'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'z-index:2147483647;background:rgba(0,0,0,.82);' +
      'color:#fff;padding:10px 18px;border-radius:6px;font-size:14px;pointer-events:none;' +
      'transition:opacity .3s;';
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 300);
    }, 1200);
  }

  // 仅题目页才需要（编辑器右上角只在题目页出现），非题目页直接退出
  if (!/\/problem\//.test(location.pathname)) return;
  waitForBtnGroup(injectBtn);
})();
