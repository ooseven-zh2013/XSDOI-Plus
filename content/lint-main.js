// ============================================================
// 语法错误检测 - MAIN world content script
//
// 用 tree-sitter（web-tree-sitter + C++ grammar）解析 CodeMirror 里的代码，
// 把语法错误标成红色波浪下划线。运行在页面主世界（manifest world:"MAIN"），
// 才能拿到 CodeMirror 实例。
//
// 依赖（按 manifest 里 content_scripts 的加载顺序）：
//   lib/web-tree-sitter.js   —— 全局 TreeSitter（Parser 类）
//   lib/tree-sitter-wasm.js  —— 全局 __TS_RUNTIME_WASM_B64__ / __TS_CPP_WASM_B64__
// ============================================================

(function () {
  'use strict';

  var TreeSitter = globalThis.TreeSitter;
  var RUNTIME_B64 = globalThis.__TS_RUNTIME_WASM_B64__;
  var CPP_B64 = globalThis.__TS_CPP_WASM_B64__;

  var DEBOUNCE_MS = 500;          // 代码变更后防抖
  var ERROR_CLASS = 'xsdoi-lint-error';      // 红色波浪
  var WARNING_CLASS = 'xsdoi-lint-warning';  // 黄色波浪（预留）

  var parser = null;   // tree-sitter parser
  var cm = null;       // CodeMirror 实例
  var cmDoc = null;    // CodeMirror Doc
  var markers = [];    // 当前 markText 的 marker
  var lintTimer = null;
  var ready = false;

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // 注入波浪线样式（error 红 / warning 黄），用 SVG 波浪 data URL 平铺
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

  // 找到 CodeMirror 实例（页面挂在 .CodeMirror 元素上的 expando）
  function findCM() {
    var wrap = document.querySelector('.vue-codemirror-wrap');
    if (!wrap) return null;
    var cmEl = wrap.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.markText === 'function') {
      return cmEl.CodeMirror;
    }
    return null;
  }

  // 收集语法问题：ERROR 节点（无法归约的 token）+ MISSING 节点（缺 token）
  function collectProblems(node, out) {
    if (node.isError || node.isMissing) {
      out.push({
        isError: node.isError,
        isMissing: node.isMissing,
        start: node.startPosition,
        end: node.endPosition
      });
    }
    for (var i = 0; i < node.childCount; i++) collectProblems(node.child(i), out);
  }

  // tree-sitter 坐标（row/column，0 起）→ CodeMirror 范围（line/ch）
  // 零宽问题（MISSING）向右扩 1 字符，行尾则标前一个字符，保证可见
  function toRange(p, doc) {
    var from = { line: p.start.row, ch: p.start.column };
    var to = { line: p.end.row, ch: p.end.column };
    if (from.line === to.line && from.ch === to.ch) {
      var lineLen = doc.getLine(from.line).length;
      if (from.ch < lineLen) {
        to.ch = from.ch + 1;
      } else if (from.ch > 0) {
        from.ch = from.ch - 1;
      }
    }
    return { from: from, to: to };
  }

  function clearMarkers() {
    for (var i = 0; i < markers.length; i++) {
      try { markers[i].clear(); } catch (e) { /* 编辑器已销毁 */ }
    }
    markers = [];
  }

  function runLint() {
    if (!ready || !parser || !cmDoc) return;
    clearMarkers();
    var code;
    try { code = cmDoc.getValue(); } catch (e) { return; }
    if (!code) return;

    var tree;
    try { tree = parser.parse(code); } catch (e) { return; }

    var problems = [];
    collectProblems(tree.rootNode, problems);

    for (var i = 0; i < problems.length; i++) {
      var r = toRange(problems[i], cmDoc);
      if (r.from.line === r.to.line && r.from.ch === r.to.ch) continue;
      // tree-sitter 的 ERROR/MISSING 都是语法错误（红波浪）；warning 通道预留
      var cls = ERROR_CLASS;
      try {
        markers.push(cmDoc.markText(r.from, r.to, { className: cls }));
      } catch (e) { /* 忽略单个标记失败 */ }
    }
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

  function waitForEditor(cb, tries) {
    tries = tries || 0;
    var inst = findCM();
    if (inst) { cb(inst); return; }
    if (tries >= 100) return;
    setTimeout(function () { waitForEditor(cb, tries + 1); }, 100);
  }

  async function initTreeSitter() {
    if (!TreeSitter || !RUNTIME_B64 || !CPP_B64) return;
    try {
      await TreeSitter.init({ wasmBinary: b64ToBytes(RUNTIME_B64) });
      var Lang = await TreeSitter.Language.load(b64ToBytes(CPP_B64));
      parser = new TreeSitter();
      parser.setLanguage(Lang);
      ready = true;
      waitForEditor(initLint);
    } catch (e) {
      console.warn('[语法检测] tree-sitter 初始化失败:', e);
    }
  }

  injectStyles();
  initTreeSitter();

  // SPA 路由切换可能重建 CodeMirror 实例，轮询检测并重新绑定
  setInterval(function () {
    if (!ready) return;
    var inst = findCM();
    if (inst && inst !== cm) initLint(inst);
  }, 500);
})();
