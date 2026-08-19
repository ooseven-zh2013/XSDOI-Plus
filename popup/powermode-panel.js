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
        if (stored.colorPalette && stored.colorPalette.light && stored.colorPalette.dark) {
          config.colorPalette = stored.colorPalette;
        }
      }
      cb(config);
    });
  }

  function saveConfig(config, cb) {
    chrome.storage.sync.set({ powermode: config }, function () {
      if (chrome.runtime.lastError) {
        alert('保存失败: ' + chrome.runtime.lastError.message);
      } else {
        // 通知 content script 更新配置
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: POWERMODE.MSG.config });
          }
        });
        if (cb) cb();
      }
    });
  }

  function bindUI() {
    var enabledEl = document.getElementById('pm-enabled');
    var particleCountEl = document.getElementById('pm-particle-count');
    var comboResetMsEl = document.getElementById('pm-combo-reset-ms');
    var shakeOnComboEl = document.getElementById('pm-shake-on-combo');
    var thresholdsEl = document.getElementById('pm-combo-thresholds');
    var saveBtn = document.getElementById('pm-save');

    loadConfig(function (config) {
      enabledEl.checked = config.enabled;
      particleCountEl.value = config.particleCount;
      comboResetMsEl.value = config.comboResetMs;
      shakeOnComboEl.checked = config.shakeOnCombo;
      thresholdsEl.value = config.comboThresholds.join(',');
    });

    saveBtn.addEventListener('click', function () {
      var particleCount = parseInt(particleCountEl.value, 10);
      var comboResetMs = parseInt(comboResetMsEl.value, 10);
      var thresholdsStr = thresholdsEl.value.trim();

      if (isNaN(particleCount) || particleCount < 1 || particleCount > 50) {
        alert('粒子数量必须是 1-50 的整数');
        return;
      }
      if (isNaN(comboResetMs) || comboResetMs < 500 || comboResetMs > 5000) {
        alert('combo 重置时间必须是 500-5000 的整数（毫秒）');
        return;
      }

      var thresholds = [];
      if (thresholdsStr) {
        var parts = thresholdsStr.split(',').map(function (s) { return parseInt(s.trim(), 10); });
        thresholds = parts.filter(function (v) { return !isNaN(v) && v > 0; });
        thresholds.sort(function (a, b) { return a - b; });
      }

      var config = {
        enabled: enabledEl.checked,
        particleCount: particleCount,
        comboResetMs: comboResetMs,
        shakeOnCombo: shakeOnComboEl.checked,
        comboThresholds: thresholds.length > 0 ? thresholds : POWERMODE.DEFAULTS.comboThresholds,
        colorPalette: POWERMODE.DEFAULTS.colorPalette,  // 暂不暴露颜色配置
      };

      saveConfig(config, function () {
        alert('配置已保存');
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