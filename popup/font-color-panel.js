// ============================================================
// 字体颜色面板逻辑（草稿模式 + 保存并应用）
// 配置存 chrome.storage.sync 键 FONT_COLOR.STORAGE_KEY（'fontColor'）
// content/font-color.js 监听 onChanged 自动应用，无需 sendMessage
// ============================================================
(function () {
  'use strict';

  var KEY = (typeof FONT_COLOR !== 'undefined' && FONT_COLOR.STORAGE_KEY) || 'fontColor';
  var DEFAULTS = (typeof FONT_COLOR !== 'undefined' && FONT_COLOR.DEFAULTS) || {
    enabled: false,
    lightColor: '#1f2733',
    darkColor: '#eef1f8'
  };

  var saved = { enabled: DEFAULTS.enabled, lightColor: DEFAULTS.lightColor, darkColor: DEFAULTS.darkColor };
  var draft = { enabled: DEFAULTS.enabled, lightColor: DEFAULTS.lightColor, darkColor: DEFAULTS.darkColor };

  var enabledEl = document.getElementById('fc-enabled');
  var lightPicker = document.getElementById('fc-light-picker');
  var lightInput = document.getElementById('fc-light-input');
  var darkPicker = document.getElementById('fc-dark-picker');
  var darkInput = document.getElementById('fc-dark-input');
  var saveBtn = document.getElementById('fc-save');

  // 颜色双绑：picker → input 直接同步；input → picker 解析校验后回写
  function bindColorPair(picker, input) {
    picker.addEventListener('input', function () {
      input.value = picker.value;
    });
    input.addEventListener('input', function () {
      var rgba = POWERMODE.parseColor(input.value);
      if (rgba) picker.value = POWERMODE.toHex(rgba);
    });
  }

  // 校验并归一化颜色：合法返回小写 hex，非法返回 null
  function normalizeColor(v) {
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!s) return null;
    if (!POWERMODE || !POWERMODE.parseColor || !POWERMODE.toHex) return null;
    var rgba = POWERMODE.parseColor(s);
    if (!rgba) return null;
    return POWERMODE.toHex(rgba);
  }

  function syncUI() {
    if (enabledEl) enabledEl.checked = draft.enabled;
    if (lightPicker) lightPicker.value = draft.lightColor;
    if (lightInput) lightInput.value = draft.lightColor;
    if (darkPicker) darkPicker.value = draft.darkColor;
    if (darkInput) darkInput.value = draft.darkColor;
  }

  function updateSaveState() {
    if (!saveBtn) return;
    var dirty = (draft.enabled !== saved.enabled) ||
                (normalizeColor(draft.lightColor) !== normalizeColor(saved.lightColor)) ||
                (normalizeColor(darkCopy()) !== normalizeColor(saved.darkColor));
    saveBtn.classList.toggle('dirty', dirty);
    saveBtn.classList.remove('saved');
  }
  function darkCopy() { return draft.darkColor; }

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

  function load() {
    try {
      chrome.storage.sync.get({ [KEY]: DEFAULTS }, function (data) {
        var cfg = data && data[KEY];
        if (!cfg) cfg = DEFAULTS;
        saved.enabled = !!cfg.enabled;
        saved.lightColor = normalizeColor(cfg.lightColor) || DEFAULTS.lightColor;
        saved.darkColor = normalizeColor(cfg.darkColor) || DEFAULTS.darkColor;
        draft.enabled = saved.enabled;
        draft.lightColor = saved.lightColor;
        draft.darkColor = saved.darkColor;
        syncUI();
        updateSaveState();
      });
    } catch (e) {
      syncUI();
      updateSaveState();
    }
  }

  function save() {
    try {
      var light = normalizeColor(draft.lightColor);
      var dark = normalizeColor(draft.darkColor);
      if (!light || !dark) {
        saveBtn.classList.remove('dirty');
        saveBtn.classList.add('save-error');
        saveBtn.textContent = '颜色格式无效';
        setTimeout(function () {
          saveBtn.classList.remove('save-error');
          saveBtn.textContent = '保存并应用';
          updateSaveState();
        }, 1600);
        return;
      }
      draft.lightColor = light;
      draft.darkColor = dark;
      chrome.storage.sync.set({ [KEY]: { enabled: draft.enabled, lightColor: light, darkColor: dark } }, function () {
        if (chrome.runtime.lastError) {
          saveBtn.classList.remove('dirty');
          saveBtn.classList.add('save-error');
          saveBtn.textContent = '保存失败，请重试';
          setTimeout(function () {
            saveBtn.classList.remove('save-error');
            saveBtn.textContent = '保存并应用';
            updateSaveState();
          }, 1600);
          return;
        }
        saved.enabled = draft.enabled;
        saved.lightColor = light;
        saved.darkColor = dark;
        syncUI();
        flashSaved();
      });
    } catch (e) { /* 忽略 */ }
  }

  if (enabledEl) {
    enabledEl.addEventListener('change', function () {
      draft.enabled = enabledEl.checked;
      updateSaveState();
    });
  }
  if (lightPicker && lightInput) bindColorPair(lightPicker, lightInput);
  if (darkPicker && darkInput) bindColorPair(darkPicker, darkInput);

  // 颜色输入变化只改草稿，不写 storage
  [lightPicker, lightInput, darkPicker, darkInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      if (el === lightPicker || el === lightInput) draft.lightColor = lightInput.value;
      if (el === darkPicker || el === darkInput) draft.darkColor = darkInput.value;
      updateSaveState();
    });
  });

  if (saveBtn) saveBtn.addEventListener('click', save);

  load();
})();
