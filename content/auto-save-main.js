(function () {
  'use strict';

  // 本脚本运行在页面主世界（manifest 里 world: "MAIN"），
  // 能直接访问 CodeMirror 实例（页面挂到 .CodeMirror 元素上的 expando）。
  // 职责：把 CodeMirror 内容与隐藏 textarea 双向同步，
  // 因为 textarea 的 value 是标准 DOM 属性，隔离世界的 content.js 能读写。

  function getCm() {
    var wrap = document.querySelector('.vue-codemirror-wrap');
    if (!wrap) return null;
    var cmEl = wrap.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.getValue === 'function') {
      return cmEl.CodeMirror;
    }
    return null;
  }

  function getTa() {
    return document.querySelector('.vue-codemirror-wrap textarea');
  }

  var lastSynced = null;
  var lastCm = null;

  function sync() {
    var cm = getCm();
    var ta = getTa();
    if (!cm || !ta) return;

    if (cm !== lastCm) {
      // 新的编辑器实例：重置同步状态
      lastCm = cm;
      lastSynced = null;
      // 首次同步时，若 textarea 已被外部写入，以 textarea 为准
      if (ta.value && ta.value !== cm.getValue()) {
        cm.setValue(ta.value);
        lastSynced = ta.value;
        return;
      }
    }

    // CodeMirror -> textarea
    var v = cm.getValue();
    if (v !== lastSynced) {
      ta.value = v;
      lastSynced = v;
    }

    // textarea -> CodeMirror（外部写入回填）
    if (ta.value !== cm.getValue()) {
      cm.setValue(ta.value);
      lastSynced = ta.value;
    }
  }

  setInterval(sync, 300);
  sync();
})();
