// ============================================================
// 板块美化面板逻辑
// 玻璃效果三选一（互斥）：acrylic 亚克力 / liquid 液态玻璃 / none 仅透明化
// + 透明度滑块、圆角滑块（三模式共有）
// 兼容迁移：旧版 enabled 布尔 → acrylic / none
// ============================================================
(function () {
  'use strict';

  var DEFAULT_MODE = 'none';
  var DEFAULT_ALPHA = 0.55;
  var DEFAULT_ROUND = 0.5;
  var MODES = ['none', 'acrylic', 'liquid'];

  var MODE_TIPS = {
    none: '仅透明化：卡片半透明透出背景，不做模糊。',
    acrylic: '亚克力（毛玻璃）：半透明 + 背景模糊，经典毛玻璃质感。',
    liquid: '液态玻璃：背景保持清晰、不模糊，边缘高光 + 真实折射营造玻璃质感。'
  };

  // saved = 已持久化到 storage 的值；draft = 当前界面正在编辑的值
  var saved = { mode: DEFAULT_MODE, alpha: DEFAULT_ALPHA, round: DEFAULT_ROUND };
  var draft = { mode: DEFAULT_MODE, alpha: DEFAULT_ALPHA, round: DEFAULT_ROUND };

  function clamp(v) {
    v = parseFloat(v);
    if (isNaN(v)) return DEFAULT_ALPHA;
    return Math.min(1, Math.max(0, v));
  }

  function clampRound(v) {
    v = parseFloat(v);
    if (isNaN(v)) return DEFAULT_ROUND;
    return Math.min(1, Math.max(0, v));
  }

  function sanitizeMode(v) {
    return MODES.indexOf(v) >= 0 ? v : DEFAULT_MODE;
  }

  var modeGroup = document.getElementById('board-mode');
  var modeTip = document.getElementById('board-mode-tip');
  var alpha = document.getElementById('board-alpha');
  var alphaValue = document.getElementById('board-alpha-value');
  var roundEl = document.getElementById('board-round');
  var roundValue = document.getElementById('board-round-value');
  var saveBtn = document.getElementById('board-save');

  // 把 draft 同步到界面控件
  function syncUI() {
    if (modeGroup) {
      var btns = modeGroup.querySelectorAll('.bg-fit');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === draft.mode);
      }
    }
    if (modeTip) modeTip.textContent = MODE_TIPS[draft.mode] || '';
    if (alpha) alpha.value = draft.alpha;
    if (alphaValue) alphaValue.value = draft.alpha.toFixed(2);
    if (roundEl) roundEl.value = draft.round;
    if (roundValue) roundValue.value = draft.round.toFixed(2);

    if (typeof window.__xsdoiRefreshSliders === 'function') window.__xsdoiRefreshSliders();
  }

  // 判断 draft 与 saved 是否有差异，据此高亮「保存」按钮
  function updateSaveState() {
    if (!saveBtn) return;
    var dirty = (draft.mode !== saved.mode) ||
                (Math.abs(draft.alpha - saved.alpha) > 0.0001) ||
                (Math.abs(draft.round - saved.round) > 0.0001);

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

  // 读取已保存配置，填充草稿与界面（含旧版 enabled 迁移）
  function load() {
    try {
      chrome.storage.sync.get(
        ['mode', 'enabled', 'alpha', 'round'], function (data) {
        var mode = data.mode;
        if (!mode) {
          mode = (typeof data.enabled === 'boolean')
            ? (data.enabled ? 'acrylic' : 'none')
            : DEFAULT_MODE;
        }
        saved.mode = sanitizeMode(mode);
        saved.alpha = clamp(data.alpha);
        saved.round = clampRound(data.round);
        draft.mode = saved.mode;
        draft.alpha = saved.alpha;
        draft.round = saved.round;
        syncUI();
        updateSaveState();
      });
    } catch (e) {
      syncUI();
      updateSaveState();
    }
  }

  // 保存并应用：一次性写入 storage（content script 监听 onChanged 自动应用）
  function save() {
    try {
      chrome.storage.sync.set({
        mode: draft.mode,
        alpha: draft.alpha,
        round: draft.round
      }, function () {
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
        saved.mode = draft.mode;
        saved.alpha = draft.alpha;
        saved.round = draft.round;
        flashSaved();
      });
    } catch (e) { /* 忽略 */ }
  }

  // ===== 玻璃效果三选一：只改草稿，不写 storage =====
  if (modeGroup) {
    modeGroup.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.bg-fit') : null;
      if (!btn) return;
      draft.mode = sanitizeMode(btn.getAttribute('data-mode'));
      syncUI();
      updateSaveState();
    });
  }

  function round2(v) {
    return Math.round(clamp(v) * 100) / 100;
  }

  // ===== 透明度滑块：只改草稿与数字，不写 storage =====
  if (alpha && alphaValue) {
    alpha.addEventListener('input', function () {
      draft.alpha = clamp(alpha.value);
      alphaValue.value = draft.alpha.toFixed(2);
      updateSaveState();
    });
    alphaValue.addEventListener('input', function () {
      var raw = parseFloat(alphaValue.value);
      if (isNaN(raw)) return;
      draft.alpha = clamp(raw);
      updateSaveState();
    });
    alphaValue.addEventListener('change', function () {
      var v = round2(alphaValue.value);
      draft.alpha = v;
      alpha.value = v;
      alphaValue.value = v.toFixed(2);
      updateSaveState();
    });
  }

  // ===== 圆角滑块：input 只改草稿，change 才规整回写 =====
  if (roundEl && roundValue) {
    roundEl.addEventListener('input', function () {
      draft.round = clampRound(roundEl.value);
      roundValue.value = draft.round.toFixed(2);
      updateSaveState();
    });
    roundValue.addEventListener('input', function () {
      var raw = parseFloat(roundValue.value);
      if (isNaN(raw)) return;
      draft.round = clampRound(raw);
      updateSaveState();
    });
    roundValue.addEventListener('change', function () {
      var v = Math.round(clampRound(roundValue.value) * 100) / 100;
      draft.round = v;
      roundEl.value = v;
      roundValue.value = v.toFixed(2);
      updateSaveState();
    });
  }

  if (saveBtn) saveBtn.addEventListener('click', save);

  load();
})();
