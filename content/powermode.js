// ==================== 编辑器打字特效（Powermode） ====================
// 兼容性：CodeMirror 5，监听 .vue-codemirror-wrap 下的 .CodeMirror 实例

(function () {
  'use strict';

  // ==========================================
  // 配置与状态
  // ==========================================
  var config = Object.assign({}, POWERMODE.DEFAULTS);
  var combo = 0;
  var comboTimer = null;
  var cmInstance = null;
  var particleLayer = null;
  var observer = null;
  var colorPalette = [];
  var currentComboLevel = 0;

  // ==========================================
  // 配置加载与更新
  // ==========================================
  function loadConfigFromStorage(cb) {
    chrome.storage.sync.get(['powermode'], function (items) {
      if (items.powermode) {
        var stored = items.powermode;
        config.enabled = typeof stored.enabled === 'boolean' ? stored.enabled : config.enabled;
        if (typeof stored.particleCount === 'number' && stored.particleCount > 0 && stored.particleCount <= 50) {
          config.particleCount = stored.particleCount;
        }
        if (typeof stored.comboResetMs === 'number' && stored.comboResetMs >= 500 && stored.comboResetMs <= 5000) {
          config.comboResetMs = stored.comboResetMs;
        }
        if (typeof stored.shakeOnCombo === 'boolean') {
          config.shakeOnCombo = stored.shakeOnCombo;
        }
        if (Array.isArray(stored.comboThresholds) && stored.comboThresholds.length > 0) {
          config.comboThresholds = stored.comboThresholds;
        }
        if (stored.colorPalette && stored.colorPalette.light && stored.colorPalette.dark) {
          config.colorPalette = stored.colorPalette;
        }
      }
      updateColorPalette();
      if (cb) cb();
    });
  }

  function updateColorPalette() {
    var isDark = document.documentElement.classList.contains('theme-dark') ||
                  document.body.classList.contains('theme-dark');
    colorPalette = config.colorPalette[isDark ? 'dark' : 'light'];
  }

  // 监听 popup 发送的配置更新
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === POWERMODE.MSG.config) {
      loadConfigFromStorage(function () {
        if (!config.enabled && cmInstance) {
          cmInstance.off('change', handleCodeMirrorChange);
        } else if (config.enabled && cmInstance) {
          cmInstance.on('change', handleCodeMirrorChange);
        }
      });
      sendResponse({ ok: true });
    }
  });

  // ==========================================
  // CodeMirror 实例获取
  // ==========================================
  function getCM() {
    var wrapper = document.querySelector('.vue-codemirror-wrap');
    if (!wrapper) return null;
    var cmDiv = wrapper.querySelector('.CodeMirror');
    return cmDiv ? cmDiv.CodeMirror : null;
  }

  function bindCM() {
    cmInstance = getCM();
    if (!cmInstance) return false;
    // 避免重复绑定
    cmInstance.off('change', handleCodeMirrorChange);
    if (config.enabled) {
      cmInstance.on('change', handleCodeMirrorChange);
    }
    return true;
  }

  function unbindCM() {
    if (cmInstance) {
      cmInstance.off('change', handleCodeMirrorChange);
      cmInstance = null;
    }
  }

  // ==========================================
  // 粒子层
  // ==========================================
  function ensureParticleLayer() {
    if (particleLayer && document.documentElement.contains(particleLayer)) return;
    particleLayer = document.getElementById('xsdoi-particle-layer');
    if (!particleLayer) {
      particleLayer = document.createElement('div');
      particleLayer.id = 'xsdoi-particle-layer';
      particleLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;';
      document.documentElement.appendChild(particleLayer);
    }
  }

  function spawnParticles(x, y) {
    if (!particleLayer || !config.enabled) return;
    var count = config.particleCount;
    for (var i = 0; i < count; i++) {
      var p = document.createElement('div');
      p.className = 'xsdoi-particle';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      // 随机方向
      var angle = Math.random() * Math.PI * 2;
      var dist = 20 + Math.random() * 40;
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      // 颜色
      var colorIdx = Math.min(currentComboLevel, colorPalette.length - 1);
      p.style.backgroundColor = colorPalette[colorIdx];
      particleLayer.appendChild(p);
      // 600ms 后移除
      setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 600);
    }
  }

  // ==========================================
  // Combo 计数
  // ==========================================
  function bumpCombo() {
    combo++;
    clearTimeout(comboTimer);
    comboTimer = setTimeout(function () {
      combo = 0;
      currentComboLevel = 0;
      removeComboUI();
    }, config.comboResetMs);

    // 计算 combo 等级
    var oldLevel = currentComboLevel;
    currentComboLevel = 0;
    for (var i = 0; i < config.comboThresholds.length; i++) {
      if (combo >= config.comboThresholds[i]) {
        currentComboLevel = i + 1;
      } else {
        break;
      }
    }

    updateComboUI();

    // combo 升级时触发额外效果
    if (currentComboLevel > oldLevel && config.shakeOnCombo) {
      shakeScreen();
    }
  }

  // ==========================================
  // 屏幕抖动
  // ==========================================
  function shakeScreen() {
    var wrap = document.querySelector('.vue-codemirror-wrap');
    if (!wrap) return;
    wrap.classList.add('xsdoi-shake');
    setTimeout(function () {
      wrap.classList.remove('xsdoi-shake');
    }, 200);
  }

  // ==========================================
  // CodeMirror change 事件处理
  // ==========================================
  function handleCodeMirrorChange(instance, changeObj) {
    if (!config.enabled) return;
    if (changeObj.origin !== '+input') return;  // 只管真实打字
    var coords = instance.cursorCoords(null, 'window');
    spawnParticles(coords.left, coords.top);
    bumpCombo();
  }

  // ==========================================
  // 编辑器重建监听（MutationObserver）
  // ==========================================
  function observeEditor() {
    if (observer) return;
    observer = new MutationObserver(function (mutations) {
      var hasCMChange = mutations.some(function (m) {
        if (m.type !== 'childList') return false;
        for (var i = 0; i < m.addedNodes.length; i++) {
          var node = m.addedNodes[i];
          if (node.nodeType === Node.ELEMENT_NODE &&
              (node.classList && node.classList.contains('vue-codemirror-wrap') ||
               node.querySelector && node.querySelector('.vue-codemirror-wrap'))) {
            return true;
          }
        }
        return false;
      });
      if (hasCMChange) {
        unbindCM();
        bindCM();
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // ==========================================
  // 初始化
  // ==========================================
  function init() {
    loadConfigFromStorage(function () {
      ensureParticleLayer();
      updateColorPalette();
      if (bindCM()) {
        observeEditor();
      } else {
        // 延迟 1s 再试（SPA 可能有延迟加载）
        setTimeout(function () {
          if (bindCM()) observeEditor();
        }, 1000);
      }
    });

    // 兜底检查（确保粒子层存在）
    setInterval(function () {
      ensureParticleLayer();
    }, 5000);
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();