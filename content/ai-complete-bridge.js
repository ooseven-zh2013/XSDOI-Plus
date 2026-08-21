// ============================================================
// AI 代码补全 - isolated world 桥接层
// MAIN world 引擎没有 chrome API（拿不到 runtime / storage），
// 本桥接层负责：
//   1. 读 / 监听 storage.local 配置，经 xsdoi-ai-config 事件回推 MAIN world
//   2. 收 MAIN world 的 xsdoi-ai-request，走 chrome.runtime.connect
//      请求 background 的 SSE 流式中转，delta/done/error 转发回 MAIN world
// 请求 body（apiKey/model）由本层拼接，key 不经过 DOM 事件。
// ============================================================

(function () {
  'use strict';

  var AC = globalThis.AI_COMPLETE;
  if (!AC) return;

  var cfg = Object.assign({}, AC.DEFAULTS);
  var port = null;

  var SYSTEM_PROMPT =
    '你是 OI/ACM 竞赛代码补全助手。用户会给你光标之前的代码。' +
    '请只输出应该插入在光标位置之后的补全代码：纯代码，无解释，' +
    '无 markdown 代码块标记，不重复已有内容，保持与上下文一致的缩进和语言风格。';

  // ---------- 配置 ----------

  function loadConfig(cb) {
    chrome.storage.local.get(AC.DEFAULTS, function (res) {
      cfg.enabled = !!res.enabled;
      cfg.provider = res.provider || 'zhipu';
      cfg.apiKey = res.apiKey || '';
      cfg.model = res.model || 'glm-4-flash';
      cfg.debounceMs = (typeof res.debounceMs === 'number' && res.debounceMs >= 100 && res.debounceMs <= 5000)
        ? res.debounceMs : 500;
      cfg.maxLines = (typeof res.maxLines === 'number' && res.maxLines >= 1 && res.maxLines <= 100)
        ? res.maxLines : 20;
      cfg.maxPrefixChars = (typeof res.maxPrefixChars === 'number') ? res.maxPrefixChars : 2000;
      if (cb) cb();
    });
  }

  function broadcastConfig() {
    window.dispatchEvent(new CustomEvent('xsdoi-ai-config', { detail: {
      enabled: cfg.enabled,
      debounceMs: cfg.debounceMs,
      maxLines: cfg.maxLines,
      maxPrefixChars: cfg.maxPrefixChars,
    } }));
  }

  // ---------- 流式请求 ----------

  function fail(reason) {
    console.warn('[AI补全] bridge 拒绝请求: ' + reason);
    window.dispatchEvent(new CustomEvent('xsdoi-ai-error', { detail: { reason: reason } }));
  }

  function startStream(prefix) {
    if (!cfg.enabled) { fail('未启用'); return; }
    if (!cfg.apiKey) { fail('未配置 API Key'); return; }
    if (port) { try { port.disconnect(); } catch (e) {} port = null; }

    var myPort = chrome.runtime.connect({ name: AC.MSG.stream });
    port = myPort;
    console.log('[AI补全] bridge 已连接后台，model=' + cfg.model + ' hasKey=' + (!!cfg.apiKey));

    myPort.onMessage.addListener(function (m) {
      if (!m) return;
      if (m.type === 'delta') {
        window.dispatchEvent(new CustomEvent('xsdoi-ai-delta', { detail: { text: m.text } }));
      } else if (m.type === 'done') {
        try { myPort.disconnect(); } catch (e) {}
        if (port === myPort) port = null;
        window.dispatchEvent(new CustomEvent('xsdoi-ai-done', { detail: {} }));
      } else if (m.type === 'error') {
        try { myPort.disconnect(); } catch (e) {}
        if (port === myPort) port = null;
        window.dispatchEvent(new CustomEvent('xsdoi-ai-error', { detail: { reason: m.reason } }));
      }
    });

    // background 崩溃 / 超时断线兜底：通知引擎结束本轮
    myPort.onDisconnect.addListener(function () {
      if (port === myPort) port = null;
      window.dispatchEvent(new CustomEvent('xsdoi-ai-done', { detail: {} }));
    });

    myPort.postMessage({
      type: 'start',
      apiKey: cfg.apiKey,
      model: cfg.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prefix }
      ]
    });
  }

  function cancelStream() {
    if (port) { try { port.disconnect(); } catch (e) {} port = null; }
  }

  // ---------- 事件 ----------

  window.addEventListener('xsdoi-ai-request', function (e) {
    var d = e.detail || {};
    if (d.type === 'start') startStream(d.prefix);
    else if (d.type === 'cancel') cancelStream();
  });

  // MAIN world 就绪握手：回推一次当前配置
  window.addEventListener('xsdoi-ai-ready', function () {
    broadcastConfig();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.enabled || changes.provider || changes.apiKey || changes.model ||
        changes.debounceMs || changes.maxLines || changes.maxPrefixChars) {
      loadConfig(function () { broadcastConfig(); });
    }
  });

  // ---------- 初始化 ----------

  loadConfig(function () {
    console.log('[AI补全] bridge 初始化 enabled=' + cfg.enabled + ' hasKey=' + (!!cfg.apiKey) + ' model=' + cfg.model);
    broadcastConfig();
  });
})();
