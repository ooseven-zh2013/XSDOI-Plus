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
        if (typeof s.imageSize === 'number' && s.imageSize >= 2 && s.imageSize <= 200) config.imageSize = s.imageSize;
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

    // 特效类型切换：圆球粒子 / 自定义图片，互相切换显示对应面板
    var typeTabs = document.querySelectorAll('#cfx-type-tabs .bg-tab');
    var colorBlockEl = document.getElementById('cfx-color-block');
    var imageBlockEl = document.getElementById('cfx-image-block');
    var imageFileEl = document.getElementById('cfx-image-file');
    var imagePickEl = document.getElementById('cfx-image-pick');
    var imageClearEl = document.getElementById('cfx-image-clear');
    var imagePreviewEl = document.getElementById('cfx-image-preview');
    // 数量 / 大小标签在不同特效类型下显示不同的文案
    var countNameEl = document.getElementById('cfx-count-name');
    var countDescEl = document.getElementById('cfx-count-desc');
    var sizeNameEl = document.getElementById('cfx-size-name');
    var sizeDescEl = document.getElementById('cfx-size-desc');
    var currentType = 'particles';
    var currentConfig = null; // 已加载的完整配置，用于切换类型时回填各自尺寸

    function switchTypeTab(mode) {
      currentType = mode;
      typeTabs.forEach(function (t) {
        t.classList.toggle('active', t.getAttribute('data-cfxtype') === mode);
      });
      colorBlockEl.style.display = (mode === 'particles') ? '' : 'none';
      imageBlockEl.style.display = (mode === 'image') ? '' : 'none';
      // 图片模式用独立的 imageSize（上限 200），粒子模式用 particleSize（上限 30），复用同一个输入框
      var sizeVal = (mode === 'image')
        ? (currentConfig ? currentConfig.imageSize : CLICK_FX.DEFAULTS.imageSize)
        : (currentConfig ? currentConfig.particleSize : CLICK_FX.DEFAULTS.particleSize);
      particleSizeEl.max = (mode === 'image') ? 200 : 30;
      particleSizeEl.value = sizeVal;
      if (mode === 'image') {
        countNameEl.textContent = '图片数量';
        countDescEl.textContent = '每次点击爆发几张图片（1-50）';
        sizeNameEl.textContent = '图片大小';
        sizeDescEl.textContent = '每张图片的边长像素（2-200）';
      } else {
        countNameEl.textContent = '粒子数量';
        countDescEl.textContent = '每次点击爆发的粒子数（1-50）';
        sizeNameEl.textContent = '粒子大小';
        sizeDescEl.textContent = '直径像素（2-30）';
      }
    }

    typeTabs.forEach(function (t) {
      t.addEventListener('click', function () {
        switchTypeTab(t.getAttribute('data-cfxtype'));
      });
    });

    // 读取已存的自定义图片并预览
    chrome.storage.local.get([CLICK_FX.IMG_KEY], function (localItems) {
      var b64 = localItems && localItems[CLICK_FX.IMG_KEY];
      if (b64) {
        imagePreviewEl.src = b64;
        imagePreviewEl.style.display = 'block';
      }
    });

    // 选择图片按钮：触发隐藏的 file input（与背景/AC 模块一致，用样式化按钮而非原生 input）
    imagePickEl.addEventListener('click', function () { imageFileEl.click(); });

    // 上传图片：校验体积后存 storage.local，并立即让 content script 重载
    imageFileEl.addEventListener('change', function () {
      var file = imageFileEl.files && imageFileEl.files[0];
      if (!file) return;
      if (file.size > CLICK_FX.IMG_MAX_BYTES) {
        flashSaveBtn(saveBtn, 'save-error', '图片超过 2MB');
        imageFileEl.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        chrome.storage.local.set({ [CLICK_FX.IMG_KEY]: dataUrl }, function () {
          if (chrome.runtime.lastError) {
            flashSaveBtn(saveBtn, 'save-error', '图片保存失败');
            return;
          }
          imagePreviewEl.src = dataUrl;
          imagePreviewEl.style.display = 'block';
          chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: CLICK_FX.MSG.config });
            }
          });
        });
      };
      reader.onerror = function () {
        flashSaveBtn(saveBtn, 'save-error', '图片读取失败');
      };
      reader.readAsDataURL(file);
      imageFileEl.value = '';
    });

    // 清除图片
    imageClearEl.addEventListener('click', function () {
      chrome.storage.local.remove([CLICK_FX.IMG_KEY], function () {
        imagePreviewEl.src = '';
        imagePreviewEl.style.display = 'none';
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: CLICK_FX.MSG.config });
          }
        });
      });
    });

    bindColorPair(solidPickerEl, solidInputEl);

    loadConfig(function (config) {
      currentConfig = config;
      enabledEl.checked = config.enabled;
      particleCountEl.value = config.particleCount;
      spreadEl.value = config.spread;
      lifeEl.value = config.lifeMs;
      solidInputEl.value = config.solidColor;
      var rgba = POWERMODE.parseColor(config.solidColor);
      if (rgba) solidPickerEl.value = POWERMODE.toHex(rgba);
      switchColorTab(config.colorMode);
      switchTypeTab(config.effectType); // 内部按当前类型回填 particleSize / imageSize
    });

    saveBtn.addEventListener('click', function () {
      var particleCount = parseInt(particleCountEl.value, 10);
      var particleSize = parseInt(particleSizeEl.value, 10);
      var spread = parseInt(spreadEl.value, 10);
      var lifeMs = parseInt(lifeEl.value, 10);
      // 图片模式尺寸上限 200，粒子模式上限 30
      var sizeMax = (currentType === 'image') ? 200 : 30;
      var sizeErr = (currentType === 'image') ? '图片大小须为 2-200' : '粒子大小须为 2-30';

      if (isNaN(particleCount) || particleCount < 1 || particleCount > 50) {
        flashSaveBtn(saveBtn, 'save-error', '粒子数量须为 1-50');
        return;
      }
      if (isNaN(particleSize) || particleSize < 2 || particleSize > sizeMax) {
        flashSaveBtn(saveBtn, 'save-error', sizeErr);
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

      // 图片模式：必须先上传图片，否则点了没反应
      if (currentType === 'image') {
        chrome.storage.local.get([CLICK_FX.IMG_KEY], function (localItems) {
          if (!(localItems && localItems[CLICK_FX.IMG_KEY])) {
            flashSaveBtn(saveBtn, 'save-error', '请先上传图片');
            return;
          }
          commitConfig();
        });
        return;
      }
      commitConfig();

      function commitConfig() {
        var config = {
          enabled: enabledEl.checked,
          effectType: currentType,
          colorMode: currentColorMode,
          solidColor: solidColor || CLICK_FX.DEFAULTS.solidColor,
          particleCount: particleCount,
          // 当前类型对应的尺寸写入对应字段，另一种类型沿用上次保存的值，互不影响
          particleSize: (currentType === 'particles') ? particleSize
            : (currentConfig ? currentConfig.particleSize : CLICK_FX.DEFAULTS.particleSize),
          imageSize: (currentType === 'image') ? particleSize
            : (currentConfig ? currentConfig.imageSize : CLICK_FX.DEFAULTS.imageSize),
          spread: spread,
          lifeMs: lifeMs,
        };

        saveConfig(config, function (err) {
          if (err) {
            flashSaveBtn(saveBtn, 'save-error', '保存失败，请重试');
          } else {
            currentConfig = config; // 同步内存，避免切换类型后回显并覆盖刚改的值
            flashSaveBtn(saveBtn, 'saved', '已保存 ✓');
          }
        });
      }
    });
  }

  // DOM 加载完成后绑定
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUI);
  } else {
    bindUI();
  }
})();
