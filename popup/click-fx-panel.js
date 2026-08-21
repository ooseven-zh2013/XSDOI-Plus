// ==================== 鼠标点击特效配置面板 ====================
(function () {
  'use strict';

  var storageKey = 'clickeffect';

  function loadConfig(cb) {
    chrome.storage.sync.get([storageKey], function (items) {
      var config = Object.assign({}, CLICK_FX.DEFAULTS);
      if (items[storageKey]) {
        var s = items[storageKey];
        if (typeof s.enabled === 'boolean') config.enabled = s.enabled;
        if (s.colorMode === 'solid' || s.colorMode === 'rainbow') config.colorMode = s.colorMode;
        if (typeof s.solidColor === 'string' && POWERMODE.parseColor(s.solidColor)) config.solidColor = s.solidColor;
        if (typeof s.particleCount === 'number' && s.particleCount >= 1 && s.particleCount <= 50) config.particleCount = s.particleCount;
        if (typeof s.particleSize === 'number' && s.particleSize >= 2 && s.particleSize <= 30) config.particleSize = s.particleSize;
        if (typeof s.spread === 'number' && s.spread >= 20 && s.spread <= 200) config.spread = s.spread;
        if (typeof s.lifeMs === 'number' && s.lifeMs >= 200 && s.lifeMs <= 2000) config.lifeMs = s.lifeMs;
      }
      cb(config);
    });
  }

  function saveConfig(config, cb) {
    chrome.storage.sync.set({ clickeffect: config }, function () {
      if (chrome.runtime.lastError) {
        if (cb) cb(chrome.runtime.lastError.message);
      } else {
        // 通知 content script 更新配置
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: CLICK_FX.MSG.config });
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
    var enabledEl = document.getElementById('cfx-enabled');
    var particleCountEl = document.getElementById('cfx-particle-count');
    var particleSizeEl = document.getElementById('cfx-particle-size');
    var spreadEl = document.getElementById('cfx-spread');
    var lifeEl = document.getElementById('cfx-life');
    var saveBtn = document.getElementById('cfx-save');

    // 颜色 tab 限定在点击特效视图内，避免与背景/打字/尾迹面板共用 .bg-tab 串台
    var colorTabs = document.querySelectorAll('#cfx-color-tabs .bg-tab');
    var colorPanels = document.querySelectorAll('#view-clickfx .pm-color-panel');
    var solidPickerEl = document.getElementById('cfx-solid-picker');
    var solidInputEl = document.getElementById('cfx-solid-input');
    var currentColorMode = 'rainbow';

    function switchColorTab(mode) {
      currentColorMode = mode;
      colorTabs.forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-cfxtab') === mode);
      });
      colorPanels.forEach(function (p) {
        p.classList.toggle('active', p.id === 'cfx-panel-' + mode);
      });
    }

    colorTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        switchColorTab(t.getAttribute('data-cfxtab'));
      });
    });

    bindColorPair(solidPickerEl, solidInputEl);

    loadConfig(function (config) {
      enabledEl.checked = config.enabled;
      particleCountEl.value = config.particleCount;
      particleSizeEl.value = config.particleSize;
      spreadEl.value = config.spread;
      lifeEl.value = config.lifeMs;
      solidInputEl.value = config.solidColor;
      var rgba = POWERMODE.parseColor(config.solidColor);
      if (rgba) solidPickerEl.value = POWERMODE.toHex(rgba);
      switchColorTab(config.colorMode);
    });

    saveBtn.addEventListener('click', function () {
      var particleCount = parseInt(particleCountEl.value, 10);
      var particleSize = parseInt(particleSizeEl.value, 10);
      var spread = parseInt(spreadEl.value, 10);
      var lifeMs = parseInt(lifeEl.value, 10);

      if (isNaN(particleCount) || particleCount < 1 || particleCount > 50) {
        flashSaveBtn(saveBtn, 'save-error', '粒子数量须为 1-50');
        return;
      }
      if (isNaN(particleSize) || particleSize < 2 || particleSize > 30) {
        flashSaveBtn(saveBtn, 'save-error', '粒子大小须为 2-30');
        return;
      }
      if (isNaN(spread) || spread < 20 || spread > 200) {
        flashSaveBtn(saveBtn, 'save-error', '扩散范围须为 20-200');
        return;
      }
      if (isNaN(lifeMs) || lifeMs < 200 || lifeMs > 2000) {
        flashSaveBtn(saveBtn, 'save-error', '存活时长须为 200-2000');
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

      var config = {
        enabled: enabledEl.checked,
        colorMode: currentColorMode,
        solidColor: solidColor || CLICK_FX.DEFAULTS.solidColor,
        particleCount: particleCount,
        particleSize: particleSize,
        spread: spread,
        lifeMs: lifeMs,
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
