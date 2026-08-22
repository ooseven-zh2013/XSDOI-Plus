// ============================================================
// 编辑器右上角工具按钮 - content script（隔离世界）
//
// 在题目页编辑器右上角按钮组（#js-right-header .select-row.fl-right，
// 与「上传」「设置」并列）注入一个新按钮。
// 按钮复用页面原生 Element UI 小按钮样式（el-button--default el-button--small），
// 因此板块美化的亚克力透明样式（#js-right-header .el-button）自动生效，无需额外 CSS。
//
// 按钮语义：显示 / 隐藏开关。图标随状态切换：
//   - 启用（显示）：fa-eye（睁眼）
//   - 关闭（隐藏）：fa-eye-slash（闭眼）
// 状态持久化到 chrome.storage.sync（key: editorToolEnabled，默认启用）。
// 具体控制对象待用户描述后挂接到 onStateChange 回调。
// ============================================================

(function () {
  'use strict';

  // 防重复注入标记（打在按钮上）
  var BTN_ATTR = 'data-editor-tool-btn';
  // 状态持久化 key（将来控制的具体功能可直接读取）
  var STORAGE_KEY = 'editorToolEnabled';
  // 图标：页面已引入 Font Awesome，直接复用 fa-eye / fa-eye-slash
  var ICON_ON = 'fa fa-eye';
  var ICON_OFF = 'fa fa-eye-slash';

  // 开关状态（默认启用 = 睁眼）
  var enabled = true;

  // ---------- 状态读取（从 storage.sync 恢复） ----------
  function loadState(cb) {
    chrome.storage.sync.get([STORAGE_KEY], function (items) {
      if (typeof items[STORAGE_KEY] === 'boolean') {
        enabled = items[STORAGE_KEY];
      }
      cb();
    });
  }

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

  // ---------- 渲染图标与提示（随状态） ----------
  function render(btn) {
    btn.setAttribute('data-editor-tool-state', enabled ? 'on' : 'off');
    btn.title = enabled ? '已启用（显示）' : '已停用（隐藏）';
    var i = btn.querySelector('i');
    if (i) i.className = enabled ? ICON_ON : ICON_OFF;
  }

  // ---------- 注入按钮 ----------
  function injectBtn(group) {
    if (group.querySelector('[' + BTN_ATTR + ']')) return; // 已注入

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'el-button el-tooltip el-button--default el-button--small';
    btn.setAttribute(BTN_ATTR, '1');
    btn.innerHTML = '<i></i>';

    btn.addEventListener('click', function () {
      enabled = !enabled;
      chrome.storage.sync.set({ editorToolEnabled: enabled });
      render(btn);
      onStateChange(enabled);
    });

    group.appendChild(btn);
    render(btn);
  }

  // ---------- 状态变更钩子（占位：控制的具体对象待用户描述后实现） ----------
  function onStateChange(state) {
    // state === true  → 启用（睁眼）
    // state === false → 关闭（闭眼）
  }

  // 仅题目页才需要（编辑器右上角只在题目页出现），非题目页直接退出
  if (!/\/problem\//.test(location.pathname)) return;
  loadState(function () {
    waitForBtnGroup(injectBtn);
  });
})();
