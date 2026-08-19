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
      console.log('[Powermode] 配置加载完成:', config);
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
        if (config.enabled) {
          // 确保 CodeMirror 实例已绑定
          if (!cmInstance && !bindCM()) {
            // 如果绑定失败，启动定时重试
            var retries = 0;
            var maxRetries = 10;
            var retryTimer = setInterval(function () {
              if (bindCM()) {
                clearInterval(retryTimer);
              } else if (++retries >= maxRetries) {
                clearInterval(retryTimer);
              }
            }, 500);
          }
        }
        sendResponse({ ok: true });
      });
      return true;  // 异步响应
    }
  });

  // ==========================================
  // CodeMirror 实例获取
  // ==========================================
  function getCM() {
    var wrapper = document.querySelector('.vue-codemirror-wrap');
    if (!wrapper) {
      console.log('[Powermode] 找不到 .vue-codemirror-wrap');
      return null;
    }
    var cmDiv = wrapper.querySelector('.CodeMirror');
    if (!cmDiv) {
      console.log('[Powermode] 找不到 .CodeMirror');
      return null;
    }
    if (!cmDiv.CodeMirror) {
      console.log('[Powermode] .CodeMirror 没有 .CodeMirror 属性');
      return null;
    }
    return cmDiv.CodeMirror;
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
    console.log('[Powermode] change 事件触发:', changeObj.origin);
    if (!config.enabled) {
      console.log('[Powermode] 配置未启用，跳过');
      return;
    }
    if (changeObj.origin !== '+input') {
      console.log('[Powermode] origin 不是 +input，跳过:', changeObj.origin);
      return;
    }
    var coords = instance.cursorCoords(null, 'window');
    console.log('[Powermode] 光标坐标:', coords, '生成', config.particleCount, '个粒子');
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
    // 等待 .vue-codemirror-wrap 出现
    var observer = new MutationObserver(function (mutations, obs) {
      var wrapper = document.querySelector('.vue-codemirror-wrap');
      if (wrapper) {
        obs.disconnect();
        loadConfigFromStorage(function () {
          ensureParticleLayer();
          updateColorPalette();
          bindCM();
          observeEditor();
        });
      }
    });

    // 监听整个文档的子节点变化
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 兜底：5s 后如果还没找到，直接尝试一次
    setTimeout(function () {
      observer.disconnect();
      loadConfigFromStorage(function () {
        ensureParticleLayer();
        updateColorPalette();
        bindCM();
        observeEditor();
      });
    }, 5000);
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();