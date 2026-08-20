// ==================== 打字特效配置面板 ====================
(function () {
  'use strict';

  var storageKey = 'powermode';

  function loadConfig(cb) {
    chrome.storage.sync.get([storageKey], function (items) {
      var config = Object.assign({}, POWERMODE.DEFAULTS);
      if (items[storageKey]) {
        var stored = items[storageKey];
        if (typeof stored.enabled === 'boolean') config.enabled = stored.enabled;
        if (typeof stored.particlesEnabled === 'boolean') config.particlesEnabled = stored.particlesEnabled;
        if (typeof stored.comboEnabled === 'boolean') config.comboEnabled = stored.comboEnabled;
        if (typeof stored.particleCount === 'number' && stored.particleCount > 0 && stored.particleCount <= 50) {
          config.particleCount = stored.particleCount;
        }
        if (typeof stored.comboResetMs === 'number' && stored.comboResetMs >= 500 && stored.comboResetMs <= 5000) {
          config.comboResetMs = stored.comboResetMs;
        }
        if (typeof stored.shakeOnCombo === 'boolean') config.shakeOnCombo = stored.shakeOnCombo;
        if (Array.isArray(stored.comboThresholds) && stored.comboThresholds.length > 0) {
          config.comboThresholds = stored.comboThresholds;
        }
        if (stored.colorMode === 'solid' || stored.colorMode === 'rainbow') {
          config.colorMode = stored.colorMode;
        }
        if (typeof stored.solidColor === 'string' && POWERMODE.parseColor(stored.solidColor)) {
          config.solidColor = stored.solidColor;
        }
      }
      cb(config);
    });
  }

  function saveConfig(config, cb) {
    chrome.storage.sync.set({ powermode: config }, function () {
      if (chrome.runtime.lastError) {
        if (cb) cb(chrome.runtime.lastError.message);
      } else {
        // 通知 content script 更新配置
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: POWERMODE.MSG.config });
          }
        });
        if (cb) cb(null);
      }
    });
  }

  var flashTimer = null;

  // 保存按钮反馈：与板块美化一致，按钮内联显示状态，不弹窗
  function flashSaveBtn(saveBtn, cls, text) {
    saveBtn.classList.remove('saved', 'save-error', 'dirty');
    saveBtn.classList.add(cls);
    saveBtn.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      saveBtn.classList.remove('saved', 'save-error');
      saveBtn.textContent = '保存配置';
    }, 1200);
  }

  // 绑定「颜色图 + 文本框」双向同步：选色回写文本框，文本合法时回写选色器
  function bindColorPair(pickerEl, inputEl) {
    pickerEl.addEventListener('input', function () {
      inputEl.value = pickerEl.value;
    });
    inputEl.addEventListener('input', function () {
      var rgba = POWERMODE.parseColor(inputEl.value);
      if (rgba) pickerEl.value = POWERMODE.toHex(rgba);
    });
  }

  function bindUI() {
    var enabledEl = document.getElementById('pm-enabled');
    var particlesEl = document.getElementById('pm-particles');
    var comboEl = document.getElementById('pm-combo');
    var particleCountEl = document.getElementById('pm-particle-count');
    var comboResetMsEl = document.getElementById('pm-combo-reset-ms');
    var shakeOnComboEl = document.getElementById('pm-shake-on-combo');
    var thresholdsEl = document.getElementById('pm-combo-thresholds');
    var saveBtn = document.getElementById('pm-save');

    var colorTabs = document.querySelectorAll('#pm-color-tabs .bg-tab');
    var colorPanels = document.querySelectorAll('.pm-color-panel');
    var solidPickerEl = document.getElementById('pm-solid-picker');
    var solidInputEl = document.getElementById('pm-solid-input');
    var currentColorMode = 'rainbow';

    function switchColorTab(mode) {
      currentColorMode = mode;
      colorTabs.forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-pmtab') === mode);
      });
      colorPanels.forEach(function (p) {
        p.classList.toggle('active', p.id === 'pm-panel-' + mode);
      });
    }

    colorTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        switchColorTab(t.getAttribute('data-pmtab'));
      });
    });

    enabledEl.addEventListener('change', syncSubEnabled);

    bindColorPair(solidPickerEl, solidInputEl);

    // 总开关关闭时置灰子开关（保留勾选状态，重新打开总开关后恢复）
    function syncSubEnabled() {
      var disabled = !enabledEl.checked;
      particlesEl.disabled = disabled;
      comboEl.disabled = disabled;
    }

    loadConfig(function (config) {
      enabledEl.checked = config.enabled;
      particlesEl.checked = config.particlesEnabled;
      comboEl.checked = config.comboEnabled;
      syncSubEnabled();
      particleCountEl.value = config.particleCount;
      comboResetMsEl.value = config.comboResetMs;
      shakeOnComboEl.checked = config.shakeOnCombo;
      thresholdsEl.value = config.comboThresholds.join(',');
      solidInputEl.value = config.solidColor;
      var rgba = POWERMODE.parseColor(config.solidColor);
      if (rgba) solidPickerEl.value = POWERMODE.toHex(rgba);
      switchColorTab(config.colorMode);
    });

    saveBtn.addEventListener('click', function () {
      var particleCount = parseInt(particleCountEl.value, 10);
      var comboResetMs = parseInt(comboResetMsEl.value, 10);
      var thresholdsStr = thresholdsEl.value.trim();

      if (isNaN(particleCount) || particleCount < 1 || particleCount > 50) {
        flashSaveBtn(saveBtn, 'save-error', '粒子数量须为 1-50');
        return;
      }
      if (isNaN(comboResetMs) || comboResetMs < 500 || comboResetMs > 5000) {
        flashSaveBtn(saveBtn, 'save-error', '重置时间须为 500-5000');
        return;
      }

      // 单一颜色模式：校验颜色格式（#hex / rgb() / rgba()）
      var solidColor = null;
      if (currentColorMode === 'solid') {
        solidColor = solidInputEl.value.trim();
        if (!POWERMODE.parseColor(solidColor)) {
          flashSaveBtn(saveBtn, 'save-error', '颜色格式无效');
          return;
        }
      }

      var thresholds = [];
      if (thresholdsStr) {
        var parts = thresholdsStr.split(',').map(function (s) { return parseInt(s.trim(), 10); });
        thresholds = parts.filter(function (v) { return !isNaN(v) && v > 0; });
        thresholds.sort(function (a, b) { return a - b; });
      }

      var config = {
        enabled: enabledEl.checked,
        particlesEnabled: particlesEl.checked,
        comboEnabled: comboEl.checked,
        particleCount: particleCount,
        comboResetMs: comboResetMs,
        shakeOnCombo: shakeOnComboEl.checked,
        comboThresholds: thresholds.length > 0 ? thresholds : POWERMODE.DEFAULTS.comboThresholds,
        colorMode: currentColorMode,
        solidColor: solidColor || POWERMODE.DEFAULTS.solidColor,
      };

      saveConfig(config, function (err) {
        if (err) {
          flashSaveBtn(saveBtn, 'save-error', '保存失败，请重试');
        } else {
          flashSaveBtn(saveBtn, 'saved', '已保存 ✓');
        }
      });
    });
  }

  // DOM 加载完成后绑定
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }
})();
