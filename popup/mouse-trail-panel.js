// ==================== 鼠标尾迹配置面板 ====================
(function () {
  'use strict';

  var storageKey = 'mousetrail';

  function loadConfig(cb) {
    chrome.storage.sync.get([storageKey], function (items) {
      var config = Object.assign({}, MOUSE_TRAIL.DEFAULTS);
      if (items[storageKey]) {
        var stored = items[storageKey];
        if (typeof stored.enabled === 'boolean') config.enabled = stored.enabled;
        if (stored.mode === 'dots' || stored.mode === 'ribbon') config.mode = stored.mode;
        if (stored.colorMode === 'solid' || stored.colorMode === 'rainbow') {
          config.colorMode = stored.colorMode;
        }
        if (typeof stored.solidColor === 'string' && POWERMODE.parseColor(stored.solidColor)) {
          config.solidColor = stored.solidColor;
        }
        if (typeof stored.size === 'number' && stored.size >= 2 && stored.size <= 40) {
          config.size = stored.size;
        }
        if (typeof stored.lifeMs === 'number' && stored.lifeMs >= 200 && stored.lifeMs <= 3000) {
          config.lifeMs = stored.lifeMs;
        }
        if (typeof stored.intervalMs === 'number' && stored.intervalMs >= 8 && stored.intervalMs <= 200) {
          config.intervalMs = stored.intervalMs;
        }
      }
      cb(config);
    });
  }

  function saveConfig(config, cb) {
    chrome.storage.sync.set({ mousetrail: config }, function () {
      if (chrome.runtime.lastError) {
        if (cb) cb(chrome.runtime.lastError.message);
      } else {
        // 通知 content script 热更新配置
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: MOUSE_TRAIL.MSG.config });
          }
        });
        if (cb) cb(null);
      }
    });
  }

  var flashTimer = null;

  // 保存按钮反馈：与打字特效面板一致，按钮内联显示状态，不弹窗
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
    var enabledEl = document.getElementById('mt-enabled');
    var sizeEl = document.getElementById('mt-size');
    var lifeEl = document.getElementById('mt-life');
    var intervalEl = document.getElementById('mt-interval');
    var saveBtn = document.getElementById('mt-save');

    var colorTabs = document.querySelectorAll('#mt-color-tabs .bg-tab');
    var colorPanels = document.querySelectorAll('#view-mousetrail .pm-color-panel');
    var solidPickerEl = document.getElementById('mt-solid-picker');
    var solidInputEl = document.getElementById('mt-solid-input');
    var currentColorMode = 'rainbow';

    var modeTabs = document.querySelectorAll('#mt-mode-tabs .bg-tab');
    var currentMode = 'dots';

    function switchModeTab(mode) {
      currentMode = mode;
      modeTabs.forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-mtmode') === mode);
      });
      // 生成间隔仅用于圆点模式控密度；带状每次 mousemove 都采样，无需间隔，故隐藏该行
      var intervalRow = document.getElementById('mt-interval-row');
      if (intervalRow) intervalRow.style.display = (mode === 'ribbon') ? 'none' : '';
    }

    modeTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        switchModeTab(t.getAttribute('data-mtmode'));
      });
    });

    function switchColorTab(mode) {
      currentColorMode = mode;
      colorTabs.forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-mttab') === mode);
      });
      colorPanels.forEach(function (p) {
        p.classList.toggle('active', p.id === 'mt-panel-' + mode);
      });
    }

    colorTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        switchColorTab(t.getAttribute('data-mttab'));
      });
    });

    bindColorPair(solidPickerEl, solidInputEl);

    loadConfig(function (config) {
      enabledEl.checked = config.enabled;
      sizeEl.value = config.size;
      lifeEl.value = config.lifeMs;
      intervalEl.value = config.intervalMs;
      solidInputEl.value = config.solidColor;
      var rgba = POWERMODE.parseColor(config.solidColor);
      if (rgba) solidPickerEl.value = POWERMODE.toHex(rgba);
      switchColorTab(config.colorMode);
      switchModeTab(config.mode);
    });

    saveBtn.addEventListener('click', function () {
      var size = parseInt(sizeEl.value, 10);
      var life = parseInt(lifeEl.value, 10);
      var interval = parseInt(intervalEl.value, 10);

      if (isNaN(size) || size < 2 || size > 40) {
        flashSaveBtn(saveBtn, 'save-error', '大小须为 2-40');
        return;
      }
      if (isNaN(life) || life < 200 || life > 3000) {
        flashSaveBtn(saveBtn, 'save-error', '时长须为 200-3000');
        return;
      }
      if (isNaN(interval) || interval < 8 || interval > 200) {
        flashSaveBtn(saveBtn, 'save-error', '间隔须为 8-200');
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
        mode: currentMode,
        colorMode: currentColorMode,
        solidColor: solidColor || MOUSE_TRAIL.DEFAULTS.solidColor,
        size: size,
        lifeMs: life,
        intervalMs: interval,
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
