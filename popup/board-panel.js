// ============================================================
// 板块美化面板逻辑（移植自原「板块显示美化」popup.js）
// 变更点：控件 id 加 board- 前缀，避免与其它面板冲突。
// 其余逻辑（草稿模式 + 保存并应用）原样保留。
// ============================================================
(function () {
  'use strict';

  var DEFAULT_ALPHA = 0.55;
  var DEFAULT_ENABLED = true;

  // saved = 已持久化到 storage 的值；draft = 当前界面正在编辑的值
  var saved = { enabled: DEFAULT_ENABLED, alpha: DEFAULT_ALPHA };
  var draft = { enabled: DEFAULT_ENABLED, alpha: DEFAULT_ALPHA };

  function clamp(v) {
    v = parseFloat(v);
    if (isNaN(v)) return DEFAULT_ALPHA;
    return Math.min(1, Math.max(0, v));
  }

  var toggle = document.getElementById('board-toggle');
  var alpha = document.getElementById('board-alpha');
  var alphaValue = document.getElementById('board-alpha-value');
  var saveBtn = document.getElementById('board-save');

  // 把 draft 同步到界面控件
  function syncUI() {
    if (toggle) toggle.checked = draft.enabled;
    if (alpha) alpha.value = draft.alpha;
    if (alphaValue) alphaValue.textContent = draft.alpha.toFixed(2);
  }

  // 判断 draft 与 saved 是否有差异，据此高亮「保存」按钮
  function updateSaveState() {
    if (!saveBtn) return;
    var dirty = (draft.enabled !== saved.enabled) ||
                (Math.abs(draft.alpha - saved.alpha) > 0.0001);
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
      saveBtn.textContent = '保存并应用';
    }, 1200);
  }

  // 读取已保存配置，填充草稿与界面
  function load() {
    try {
      chrome.storage.sync.get({ enabled: DEFAULT_ENABLED, alpha: DEFAULT_ALPHA }, function (data) {
        saved.enabled = !!data.enabled;
        saved.alpha = clamp(data.alpha);
        draft.enabled = saved.enabled;
        draft.alpha = saved.alpha;
        syncUI();
        updateSaveState();
      });
    } catch (e) {
      syncUI();
      updateSaveState();
    }
  }

  // 保存并应用：一次性写入 storage（content.js 监听 onChanged 自动应用）
  function save() {
    try {
      chrome.storage.sync.set({ enabled: draft.enabled, alpha: draft.alpha }, function () {
        if (chrome.runtime.lastError) {
          if (saveBtn) {
            saveBtn.classList.remove('dirty');
            saveBtn.classList.add('save-error');
            saveBtn.textContent = '保存失败，请重试';
            setTimeout(function () {
              saveBtn.classList.remove('save-error');
              saveBtn.textContent = '保存并应用';
              updateSaveState();
            }, 1600);
          }
          return;
        }
        saved.enabled = draft.enabled;
        saved.alpha = draft.alpha;
        flashSaved();
      });
    } catch (e) { /* 忽略 */ }
  }

  // ===== 开关：只改草稿，不写 storage =====
  if (toggle) {
    toggle.addEventListener('change', function () {
      draft.enabled = toggle.checked;
      updateSaveState();
    });
  }

  // ===== 透明度滑块：只改草稿与数字，不写 storage =====
  if (alpha && alphaValue) {
    alpha.addEventListener('input', function () {
      draft.alpha = clamp(alpha.value);
      alphaValue.textContent = draft.alpha.toFixed(2);
      updateSaveState();
    });
  }

  // ===== 保存按钮 =====
  if (saveBtn) {
    saveBtn.addEventListener('click', save);
  }

  load();
})();
