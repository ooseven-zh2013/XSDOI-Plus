// ============================================================
// 板块美化面板逻辑
// 玻璃效果三选一（互斥）：acrylic 亚克力(毛玻璃) / liquid 液态玻璃 / none 仅透明化
// + 透明度滑块（三模式共有）+ 实验性真折射开关（仅液态玻璃显示）
// 兼容迁移：旧版只有 enabled 布尔 → true 映射 acrylic、false 映射 none
// ============================================================
(function () {
  'use strict';

  var DEFAULT_MODE = 'none';
  var DEFAULT_ALPHA = 0.55;
  var DEFAULT_REFRACT = false;
  var MODES = ['none', 'acrylic', 'liquid'];

  var MODE_TIPS = {
    none: '仅透明化：卡片半透明透出背景，不做模糊。',
    acrylic: '亚克力（毛玻璃）：半透明 + 背景模糊，经典毛玻璃质感。',
    liquid: '液态玻璃：背景保持清晰、不模糊，靠边缘高光与折射营造玻璃质感；可另开下方实验性真折射。'
  };

  // saved = 已持久化到 storage 的值；draft = 当前界面正在编辑的值
  var saved = { mode: DEFAULT_MODE, alpha: DEFAULT_ALPHA, refract: DEFAULT_REFRACT };
  var draft = { mode: DEFAULT_MODE, alpha: DEFAULT_ALPHA, refract: DEFAULT_REFRACT };

  function clamp(v) {
    v = parseFloat(v);
    if (isNaN(v)) return DEFAULT_ALPHA;
    return Math.min(1, Math.max(0, v));
  }

  function sanitizeMode(v) {
    return MODES.indexOf(v) >= 0 ? v : DEFAULT_MODE;
  }

  var modeGroup = document.getElementById('board-mode');
  var modeTip = document.getElementById('board-mode-tip');
  var alpha = document.getElementById('board-alpha');
  var alphaValue = document.getElementById('board-alpha-value');
  var refractRow = document.getElementById('board-refract-row');
  var refract = document.getElementById('board-refract');
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
    if (refract) refract.checked = draft.refract;
    // 实验性真折射仅在液态玻璃下可选
    if (refractRow) refractRow.style.display = draft.mode === 'liquid' ? '' : 'none';
  }

  // 判断 draft 与 saved 是否有差异，据此高亮「保存」按钮
  function updateSaveState() {
    if (!saveBtn) return;
    var dirty = (draft.mode !== saved.mode) ||
                (Math.abs(draft.alpha - saved.alpha) > 0.0001) ||
                (draft.refract !== saved.refract);
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
      chrome.storage.sync.get(['mode', 'enabled', 'alpha', 'refract'], function (data) {
        var mode = data.mode;
        if (!mode) {
          mode = (typeof data.enabled === 'boolean')
            ? (data.enabled ? 'acrylic' : 'none')
            : DEFAULT_MODE;
        }
        saved.mode = sanitizeMode(mode);
        saved.alpha = clamp(data.alpha);
        saved.refract = !!data.refract;
        draft.mode = saved.mode;
        draft.alpha = saved.alpha;
        draft.refract = saved.refract;
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
      chrome.storage.sync.set({ mode: draft.mode, alpha: draft.alpha, refract: draft.refract }, function () {
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
        saved.refract = draft.refract;
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

  // 把透明度规整到 0.01（对齐滑块 step）
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

    // 数字输入框：可直接输入 0~1 的数，输入过程实时改草稿，失焦/回车时规整
    alphaValue.addEventListener('input', function () {
      var raw = parseFloat(alphaValue.value);
      if (isNaN(raw)) return; // 空/非法内容，等 change 规整
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

  // ===== 实验性真折射开关：只改草稿 =====
  if (refract) {
    refract.addEventListener('change', function () {
      draft.refract = refract.checked;
      updateSaveState();
    });
  }

  // ===== 保存按钮 =====
  if (saveBtn) {
    saveBtn.addEventListener('click', save);
  }

  load();
})();
