// ============================================================
// AI 代码补全 - MAIN world content script
// 运行在页面主世界（manifest world:"MAIN"）：能直接拿 CodeMirror
// 实例做 ghost text（auto-save-main / lint-main 已验证的路径）。
//
// MAIN world 没有 chrome API，与隔离世界 bridge 用 CustomEvent 通信：
//   发: xsdoi-ai-request  { type:'start', prefix } / { type:'cancel' }
//       xsdoi-ai-ready    {}（初始化握手，请 bridge 回推配置）
//   收: xsdoi-ai-config   { enabled, debounceMs, maxLines, maxPrefixChars }
//       xsdoi-ai-delta    { text }
//       xsdoi-ai-done     {}
//       xsdoi-ai-error    { reason }
//
// ghost text 方案：replaceRange 插入建议文本 + markText 标灰
// （atomic 阻止光标进入），Tab 接受 / Esc 取消 / 继续输入自动消失。
// 不用 undo()，避免把用户自己的输入一起撤掉。
// ============================================================

(function () {
  'use strict';

  var AC = globalThis.AI_COMPLETE;
  if (!AC) return; // constants.js 未加载，静默退出

  var cfg = Object.assign({}, AC.DEFAULTS);
  var cm = null;
  var cmDoc = null;

  var ghost = null;          // { from, to, text, mark }
  var anchor = null;         // 请求发起时的光标位置
  var busy = false;
  var suppressChange = false;
  var pendingTimer = null;

  // ==================== CodeMirror 实例 ====================

  function findCM() {
    var wrap = document.querySelector('.vue-codemirror-wrap');
    if (!wrap) return null;
    var cmEl = wrap.querySelector('.CodeMirror');
    if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.getValue === 'function') {
      return cmEl.CodeMirror;
    }
    return null;
  }

  // ==================== CustomEvent 通信 ====================

  function emit(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
  }

  function applyConfig(c) {
    if (!c) return;
    if (typeof c.enabled === 'boolean') cfg.enabled = c.enabled;
    if (typeof c.debounceMs === 'number') cfg.debounceMs = c.debounceMs;
    if (typeof c.maxLines === 'number') cfg.maxLines = c.maxLines;
    if (typeof c.maxPrefixChars === 'number') cfg.maxPrefixChars = c.maxPrefixChars;
  }

  // ==================== 触发 ====================

  function schedule() {
    if (!cfg.enabled || !cmDoc || ghost || busy) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(requestCompletion, cfg.debounceMs);
  }

  // ==================== 请求补全 ====================

  function requestCompletion() {
    if (!cfg.enabled || busy || ghost || !cmDoc) return;
    var cursor = cmDoc.getCursor();
    var prefix = cmDoc.getRange({ line: 0, ch: 0 }, cursor);
    if (!prefix.trim()) return;
    if (prefix.length > cfg.maxPrefixChars) {
      prefix = prefix.slice(prefix.length - cfg.maxPrefixChars);
    }
    anchor = { line: cursor.line, ch: cursor.ch };
    busy = true;
    emit('xsdoi-ai-request', { type: 'start', prefix: prefix });
  }

  // ==================== ghost text ====================

  // 从 from 位置插入 text 后的结束位置（跨行计算，不依赖 posFromIndex）
  function posAfter(from, text) {
    var idx = text.indexOf('\n');
    if (idx === -1) return { line: from.line, ch: from.ch + text.length };
    var parts = text.split('\n');
    var last = parts[parts.length - 1];
    return { line: from.line + parts.length - 1, ch: last.length };
  }

  function markRange(from, to) {
    return cmDoc.markText(from, to, {
      className: 'xsdoi-ai-ghost',
      atomic: true,
      inclusiveLeft: false,
      inclusiveRight: false,
    });
  }

  function renderGhost(text) {
    if (!cmDoc || !anchor) return;
    if (!ghost) {
      // 第一个 delta 到达前用户已移动光标：放弃本次建议，不插错位置
      var cur = cmDoc.getCursor();
      if (cur.line !== anchor.line || cur.ch !== anchor.ch) {
        clearGhostState();
        return;
      }
      suppressChange = true;
      cmDoc.replaceRange(text, anchor);
      suppressChange = false;
      var to = posAfter(anchor, text);
      ghost = { from: anchor, to: to, text: text, mark: markRange(anchor, to) };
      cmDoc.setCursor(anchor);
      return;
    }
    suppressChange = true;
    cmDoc.replaceRange(text, ghost.from, ghost.to);
    suppressChange = false;
    var to2 = posAfter(ghost.from, text);
    if (ghost.mark) { try { ghost.mark.clear(); } catch (e) {} }
    ghost.mark = markRange(ghost.from, to2);
    ghost.to = to2;
    ghost.text = text;
    cmDoc.setCursor(ghost.from);
  }

  function clearGhostState() {
    if (ghost && ghost.mark) { try { ghost.mark.clear(); } catch (e) {} }
    if (busy) emit('xsdoi-ai-request', { type: 'cancel' });
    ghost = null;
    anchor = null;
    busy = false;
    if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  }

  // 取消建议：删除已插入的 ghost 文本（文本被用户改动破坏时只清状态）
  function cancelGhost() {
    if (!ghost) return;
    var g = ghost;
    clearGhostState();
    if (cmDoc) {
      suppressChange = true;
      try {
        var cur = cmDoc.getRange(g.from, g.to);
        if (cur === g.text || cur.indexOf(g.text) === 0) {
          cmDoc.replaceRange('', g.from, g.to);
        }
      } catch (e) {}
      suppressChange = false;
    }
  }

  // 接受建议：清除标记、光标跳末尾，稍后再触发下一段（连续补全）
  function acceptGhost() {
    if (!ghost || !cmDoc) return;
    var to = ghost.to;
    clearGhostState();
    cmDoc.setCursor(to);
    schedule();
  }

  // ==================== 流式回包 ====================

  function onDelta(e) {
    if (!busy || !e.detail || typeof e.detail.text !== 'string') return;
    var text = e.detail.text;
    var lines = text.split('\n').length - 1; // 换行数
    if (lines >= cfg.maxLines) {
      // 超行数：截断到 maxLines 行后结束本轮（保留已渲染部分），并断流省流量
      var parts = text.split('\n');
      renderGhost(parts.slice(0, cfg.maxLines).join('\n'));
      busy = false;
      emit('xsdoi-ai-request', { type: 'cancel' });
      return;
    }
    renderGhost(text);
  }

  function onDone() {
    busy = false;
  }

  function onError(e) {
    if (busy) cancelGhost();
    busy = false;
  }

  // ==================== CodeMirror 事件 ====================

  function onChange() {
    if (suppressChange) return;
    if (ghost) cancelGhost();
    schedule();
  }

  function onKeyDown(cmIns, e) {
    if (!ghost) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      acceptGhost();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelGhost();
    }
  }

  function onCursorActivity() {
    if (!ghost || !cmDoc) return;
    var c = cmDoc.getCursor();
    if (c.line !== ghost.from.line || c.ch !== ghost.from.ch) {
      cancelGhost();
    }
  }

  // ==================== 初始化 ====================

  function init() {
    var inst = findCM();
    if (!inst) return;
    cm = inst;
    cmDoc = cm.getDoc();
    cm.on('change', onChange);
    cm.on('keydown', onKeyDown);
    cm.on('cursorActivity', onCursorActivity);
  }

  window.addEventListener('xsdoi-ai-config', function (e) { applyConfig(e.detail); });
  window.addEventListener('xsdoi-ai-delta', onDelta);
  window.addEventListener('xsdoi-ai-done', onDone);
  window.addEventListener('xsdoi-ai-error', onError);

  // 等编辑器出现（SPA 异步渲染），并处理路由重建
  setInterval(function () {
    var inst = findCM();
    if (inst && inst !== cm) init();
  }, 500);

  // 请求 bridge 回推配置（防双方初始化时序颠倒）
  emit('xsdoi-ai-ready', {});
})();
