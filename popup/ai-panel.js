// ============================================================
// AI 补全面板逻辑
// 交互对齐板块美化面板：草稿模式 + 保存按钮（有改动时高亮）；
// 配置存 chrome.storage.local（API Key 不进 sync，避免同步到云）。
// 额外提供「测试连接」：调 background 非流式验证 key / 模型。
// ============================================================
(function () {
  'use strict';

  var AC = globalThis.AI_COMPLETE;

  var DEFAULTS = {
    enabled: false,
    provider: 'zhipu',
    apiKey: '',
    model: 'glm-4-flash',
    debounceMs: 500,
    maxLines: 20
  };

  // saved = 已持久化；draft = 界面正在编辑
  var saved = Object.assign({}, DEFAULTS);
  var draft = Object.assign({}, DEFAULTS);

  var enabledEl = document.getElementById('ai-enabled');
  var keyEl = document.getElementById('ai-key');
  var modelEl = document.getElementById('ai-model');
  var debounceEl = document.getElementById('ai-debounce');
  var maxLinesEl = document.getElementById('ai-maxlines');
  var saveBtn = document.getElementById('ai-save');
  var testBtn = document.getElementById('ai-test');
  var statusEl = document.getElementById('ai-status');

  function clampInt(v, min, max, def) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  }

  function syncUI() {
    if (enabledEl) enabledEl.checked = draft.enabled;
    if (keyEl) keyEl.value = draft.apiKey;
    if (modelEl) modelEl.value = draft.model;
    if (debounceEl) debounceEl.value = draft.debounceMs;
    if (maxLinesEl) maxLinesEl.value = draft.maxLines;
  }

  function updateSaveState() {
    if (!saveBtn) return;
    var dirty = (draft.enabled !== saved.enabled) ||
                (draft.apiKey !== saved.apiKey) ||
                (draft.model !== saved.model) ||
                (draft.debounceMs !== saved.debounceMs) ||
                (draft.maxLines !== saved.maxLines);
    saveBtn.classList.toggle('dirty', dirty);
    saveBtn.classList.remove('saved');
  }

  function flashSaved() {
    if (!saveBtn) return;
    saveBtn.classList.remove('dirty');
    saveBtn.classList.add('saved');
    saveBtn.textContent = '已保存 ✓';
    setTimeout(function () {
      saveBtn.classList.remove('saved');
      saveBtn.textContent = '保存配置';
    }, 1200);
  }

  function load() {
    chrome.storage.local.get(DEFAULTS, function (data) {
      saved.enabled = !!data.enabled;
      saved.apiKey = data.apiKey || '';
      saved.model = data.model || 'glm-4-flash';
      saved.debounceMs = clampInt(data.debounceMs, 100, 5000, 500);
      saved.maxLines = clampInt(data.maxLines, 1, 100, 20);
      draft = Object.assign({}, saved);
      syncUI();
      updateSaveState();
    });
  }

  function save() {
    chrome.storage.local.set({
      enabled: !!draft.enabled,
      provider: 'zhipu',
      apiKey: draft.apiKey,
      model: draft.model,
      debounceMs: draft.debounceMs,
      maxLines: draft.maxLines
    }, function () {
      saved = Object.assign({}, draft);
      flashSaved();
    });
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function test() {
    if (!draft.apiKey) { setStatus('请先填写 API Key'); return; }
    setStatus('测试中…');
    if (testBtn) testBtn.disabled = true;
    chrome.runtime.sendMessage({
      type: AC.MSG.test,
      apiKey: draft.apiKey,
      model: draft.model || 'glm-4-flash'
    }, function (resp) {
      if (testBtn) testBtn.disabled = false;
      if (chrome.runtime.lastError) {
        setStatus('扩展错误：' + chrome.runtime.lastError.message);
        return;
      }
      if (resp && resp.ok) {
        setStatus('连接成功 ✓ 模型 ' + resp.model + ' 可用');
      } else {
        setStatus('失败：' + (resp && resp.reason ? resp.reason : '未知错误'));
      }
    });
  }

  // ===== 事件 =====
  if (enabledEl) enabledEl.addEventListener('change', function () {
    draft.enabled = enabledEl.checked;
    updateSaveState();
  });
  if (keyEl) keyEl.addEventListener('input', function () {
    draft.apiKey = keyEl.value.trim();
    updateSaveState();
  });
  if (modelEl) modelEl.addEventListener('input', function () {
    draft.model = modelEl.value.trim() || 'glm-4-flash';
    updateSaveState();
  });
  if (debounceEl) debounceEl.addEventListener('change', function () {
    draft.debounceMs = clampInt(debounceEl.value, 100, 5000, 500);
    debounceEl.value = draft.debounceMs;
    updateSaveState();
  });
  if (maxLinesEl) maxLinesEl.addEventListener('change', function () {
    draft.maxLines = clampInt(maxLinesEl.value, 1, 100, 20);
    maxLinesEl.value = draft.maxLines;
    updateSaveState();
  });
  if (saveBtn) saveBtn.addEventListener('click', save);
  if (testBtn) testBtn.addEventListener('click', test);

  load();
})();
