// ============================================================
// 板块美化面板逻辑
// 玻璃效果三选一（互斥）：acrylic 亚克力(毛玻璃) / liquid 液态玻璃 / none 仅透明化
// + 透明度滑块、圆角滑块（三模式共有）
// + 边缘色散（chromatic aberration，仅液态玻璃可用，默认关）
// 兼容迁移：旧版只有 enabled 布尔 → true 映射 acrylic、false 映射 none
// ============================================================
(function () {
  'use strict';

  var DEFAULT_MODE = 'none';
  var DEFAULT_ALPHA = 0.55;
  var DEFAULT_ROUND = 0.5;
  var DEFAULT_AB_ON = false;
  var DEFAULT_AB = 0.50;
  var AB_MIN = 0.25;
  var AB_MAX = 0.70;
  var MODES = ['none', 'acrylic', 'liquid'];

  var MODE_TIPS = {
    none: '仅透明化：卡片半透明透出背景，不做模糊。',
    acrylic: '亚克力（毛玻璃）：半透明 + 背景模糊，经典毛玻璃质感。',
    liquid: '液态玻璃：背景保持清晰、不模糊，边缘高光 + 真实折射营造玻璃质感。'
  };

  var AB_DESC_ON = '只在卡片最外 2–6px 模拟真实玻璃的彩色边缘，关闭后一点痕迹都不留';
  var AB_DESC_LOCKED = '仅液态玻璃可用';

  // saved = 已持久化到 storage 的值；draft = 当前界面正在编辑的值
  var saved = { mode: DEFAULT_MODE, alpha: DEFAULT_ALPHA, round: DEFAULT_ROUND,
                abOn: DEFAULT_AB_ON, ab: DEFAULT_AB };
  var draft = { mode: DEFAULT_MODE, alpha: DEFAULT_ALPHA, round: DEFAULT_ROUND,
                abOn: DEFAULT_AB_ON, ab: DEFAULT_AB };

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

  function clampAb(v) {
    v = parseFloat(v);
    if (isNaN(v)) return DEFAULT_AB;
    return Math.min(AB_MAX, Math.max(AB_MIN, v));
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
  var abSwitch = document.getElementById('board-aberration');
  var abDesc = document.getElementById('ab-desc');
  var abRow = document.getElementById('ab-strength-row');
  var abRange = document.getElementById('board-ab-strength');
  var abValue = document.getElementById('board-ab-strength-value');
  var saveBtn = document.getElementById('board-save');

  // 当前模式下色散是否可用（仅液态玻璃）
  function abAvailable() {
    return draft.mode === 'liquid';
  }

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

    var usable = abAvailable();
    if (abSwitch) {
      abSwitch.checked = draft.abOn;
      abSwitch.setAttribute('aria-checked', draft.abOn ? 'true' : 'false');
      /* 视觉/读屏都按不可用处理，但**不用 disabled 属性** ——
         保留可聚焦性，读屏才会念到「仅液态玻璃可用」的说明。 */
      abSwitch.setAttribute('aria-disabled', usable ? 'false' : 'true');
    }
    if (abDesc) abDesc.textContent = usable ? AB_DESC_ON : AB_DESC_LOCKED;
    if (abRow) abRow.classList.toggle('is-disabled', !usable || !draft.abOn);
    if (abRange) {
      abRange.value = draft.ab;
      abRange.setAttribute('aria-valuetext', '弱 / ' + draft.ab.toFixed(2));
    }
    if (abValue) abValue.value = draft.ab.toFixed(2);

    if (typeof window.__xsdoiRefreshSliders === 'function') window.__xsdoiRefreshSliders();
  }

  // 判断 draft 与 saved 是否有差异，据此高亮「保存」按钮
  function updateSaveState() {
    if (!saveBtn) return;
    var dirty = (draft.mode !== saved.mode) ||
                (Math.abs(draft.alpha - saved.alpha) > 0.0001) ||
                (Math.abs(draft.round - saved.round) > 0.0001) ||
                (draft.abOn !== saved.abOn) ||
                (draft.abOn && Math.abs(draft.ab - saved.ab) > 0.0001);

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
      chrome.storage.sync.get(['mode', 'enabled', 'alpha', 'round', 'aberration'], function (data) {
        var mode = data.mode;
        if (!mode) {
          mode = (typeof data.enabled === 'boolean')
            ? (data.enabled ? 'acrylic' : 'none')
            : DEFAULT_MODE;
        }
        var ab = parseFloat(data.aberration);
        if (isNaN(ab) || ab <= 0) {
          saved.abOn = false;
          saved.ab = DEFAULT_AB;
        } else {
          saved.abOn = true;
          saved.ab = clampAb(ab);
        }
        saved.mode = sanitizeMode(mode);
        saved.alpha = clamp(data.alpha);
        saved.round = clampRound(data.round);
        draft.mode = saved.mode;
        draft.alpha = saved.alpha;
        draft.round = saved.round;
        draft.abOn = saved.abOn;
        draft.ab = saved.ab;
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
        round: draft.round,
        aberration: draft.abOn ? draft.ab : 0
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
        saved.abOn = draft.abOn;
        saved.ab = draft.ab;
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

  // ===== 圆角滑块：与透明度同一套约定（input 只改草稿，change 才规整回写）=====
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

  // ===== 边缘色散开关：仅液态玻璃可用 =====
  if (abSwitch) {
    abSwitch.addEventListener('change', function () {
      if (!abAvailable()) {
        // aria-disabled 状态下点开关不生效，状态回弹
        abSwitch.checked = draft.abOn;
        abSwitch.setAttribute('aria-checked', draft.abOn ? 'true' : 'false');
        return;
      }
      draft.abOn = abSwitch.checked;
      abSwitch.setAttribute('aria-checked', draft.abOn ? 'true' : 'false');
      if (abRow) abRow.classList.toggle('is-disabled', !abAvailable() || !draft.abOn);
      updateSaveState();
    });
  }

  // ===== 色散强度滑块 =====
  if (abRange && abValue) {
    abRange.addEventListener('input', function () {
      draft.ab = clampAb(abRange.value);
      abValue.value = draft.ab.toFixed(2);
      abRange.setAttribute('aria-valuetext', '弱 / ' + draft.ab.toFixed(2));
      updateSaveState();
    });

    abValue.addEventListener('input', function () {
      var raw = parseFloat(abValue.value);
      if (isNaN(raw)) return;
      draft.ab = clampAb(raw);
      abRange.setAttribute('aria-valuetext', '弱 / ' + draft.ab.toFixed(2));
      updateSaveState();
    });
    abValue.addEventListener('change', function () {
      var v = Math.round(clampAb(abValue.value) * 100) / 100;
      draft.ab = v;
      abRange.value = v;
      abValue.value = v.toFixed(2);
      abRange.setAttribute('aria-valuetext', '弱 / ' + v.toFixed(2));
      updateSaveState();
    });
  }

  // ===== 保存按钮 =====
  if (saveBtn) {
    saveBtn.addEventListener('click', save);
  }

  load();
})();
