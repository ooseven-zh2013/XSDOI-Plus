// ============================================================
// 代码语法/语义错误检测 - MAIN world content script
//
// 通过 godbolt（Compiler Explorer）公开 API 用真 gcc 编译代码，
// 把 error 标成红色波浪下划线（含宏展开后的错误、未声明标识符等）。
// 运行在页面主世界（manifest world:"MAIN"），才能拿到 CodeMirror 实例。
// 用页面 fetch 直连 godbolt（xsdoi 无 CSP，godbolt CORS 为 *）。
//
// 只做 error（severity>=3）；warning 是附属、暂不处理（godbolt API 也不返回）。
// ============================================================

(function () {
  'use strict';

  var API_URL = 'https://godbolt.org/api/compiler/g122/compile';
  var OPTIONS = '-fsyntax-only -Wall -std=c++17';
  var DEBOUNCE_MS = 800;   // 代码变更后防抖（远程编译有延迟）
  var ERROR_CLASS = 'xsdoi-lint-error';
  var WARNING_CLASS = 'xsdoi-lint-warning'; // 预留

  var cm = null;
  var cmDoc = null;
  var markers = [];
  var lintTimer = null;
  var seq = 0;  // 请求序号，丢弃过期响应

  function injectStyles() {
    if (document.getElementById('xsdoi-lint-style')) return;
    var style = document.createElement('style');
    style.id = 'xsdoi-lint-style';
    function wave(hex) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="3" viewBox="0 0 6 3">' +
        '<path d="M0 2.5 L1.5 0.5 L3 2.5 L4.5 0.5 L6 2.5" fill="none" stroke="#' + hex + '" stroke-width="1"/></svg>';
      return 'url("data:image/svg+xml;base64,' + btoa(svg) + '")';
    }
    style.textContent =
      '.' + ERROR_CLASS + ' { background-image:' + wave('e5484d') + '; background-repeat:repeat-x; background-position:left bottom; padding-bottom:2px; }' +
      '.' + WARNING_CLASS + ' { background-image:' + wave('e6a23c') + '; background-repeat:repeat-x; background-position:left bottom; padding-bottom:2px; }';
    document.head.appendChild(style);
  }

  function findCM() {
    var wrap = document.querySelector('.vue-codemirror-wrap');
    if (!wrap) return null;
    var cmEl = wrap.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.markText === 'function') {
      return cmEl.CodeMirror;
    }
    return null;
  }

  function clearMarkers() {
    for (var i = 0; i < markers.length; i++) {
      try { markers[i].clear(); } catch (e) { /* 编辑器已销毁 */ }
    }
    markers = [];
  }

  // 把诊断画到编辑器（只画 error：severity>=3，红色波浪）
  function drawDiagnostics(diags) {
    clearMarkers();
    if (!cmDoc) return;
    for (var i = 0; i < diags.length; i++) {
      var d = diags[i];
      if (d.severity < 3) continue; // 忽略 warning(2) / note(1)
      var line = d.line - 1;
      if (line < 0 || line >= cmDoc.lineCount()) continue;
      var lineText = cmDoc.getLine(line);
      var lineLen = lineText.length;
      if (lineLen === 0) continue;
      var ch = Math.max(0, Math.min(d.column - 1, lineLen - 1));
      // godbolt 只给 line/column（错误起始位置），没有 token 长度。
      // 向后扫描标识符 token（字母/数字/下划线），标红整个 token（如 retur）而非单个字符
      var endCh = ch;
      while (endCh < lineLen && /[A-Za-z0-9_]/.test(lineText.charAt(endCh))) {
        endCh++;
      }
      if (endCh === ch) endCh = ch + 1; // 非标识符（如符号），至少标红 1 个字符
      var from = { line: line, ch: ch };
      var to = { line: line, ch: endCh };
      try {
        markers.push(cmDoc.markText(from, to, { className: ERROR_CLASS }));
      } catch (e) { /* 忽略单个标记失败 */ }
    }
  }

  function runLint() {
    if (!cmDoc) return;
    var code;
    try { code = cmDoc.getValue(); } catch (e) { return; }
    if (!code.trim()) { clearMarkers(); return; }

    var mySeq = ++seq;
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ source: code, options: OPTIONS })
    }).then(function (resp) {
      return resp.json();
    }).then(function (data) {
      if (mySeq !== seq) return; // 过期响应丢弃
      var diags = [];
      var stderr = (data && data.stderr) || [];
      for (var i = 0; i < stderr.length; i++) {
        var tag = stderr[i].tag;
        if (tag && tag.line) {
          diags.push({
            line: tag.line,
            column: tag.column || 1,
            severity: tag.severity || 3,
            text: tag.text || ''
          });
        }
      }
      drawDiagnostics(diags);
    }).catch(function () { /* 网络错误静默 */ });
  }

  function scheduleLint() {
    if (lintTimer) clearTimeout(lintTimer);
    lintTimer = setTimeout(runLint, DEBOUNCE_MS);
  }

  function initLint(cmInstance) {
    cm = cmInstance;
    cmDoc = cm.getDoc();
    cm.on('change', scheduleLint);
    runLint();
  }

  injectStyles();

  function waitForEditor(cb, tries) {
    tries = tries || 0;
    var inst = findCM();
    if (inst) { cb(inst); return; }
    if (tries >= 100) return;
    setTimeout(function () { waitForEditor(cb, tries + 1); }, 100);
  }
  waitForEditor(initLint);

  // SPA 路由切换可能重建 CodeMirror 实例
  setInterval(function () {
    var inst = findCM();
    if (inst && inst !== cm) initLint(inst);
  }, 500);
})();
