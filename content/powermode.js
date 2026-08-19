// ==================== 编辑器打字特效（Powermode） ====================
// 兼容性：CodeMirror 5，监听 .vue-codemirror-wrap 下 CodeMirror 内部输入框的 input 事件
// 注意：源 textarea 是 Vue 绑定的隐藏源（display:none），用户输入发生在
// CodeMirror 自己创建的 .CodeMirror textarea 上，必须绑定它才有事件。

(function () {
  'use strict';

  // ==========================================
  // 配置与状态
  // ==========================================
  var config = Object.assign({}, POWERMODE.DEFAULTS);
  var combo = 0;
  var comboTimer = null;
  var textareaInstance = null;
  var particleLayer = null;
  var observer = null;
  var colorPalette = [];
  var currentComboLevel = 0;
  var comboDisplayEl = null;
  var comboHideTimer = null;

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
          // 确保 textarea 已绑定
          if (!textareaInstance && !bindTextarea()) {
            // 如果绑定失败，启动定时重试
            var retries = 0;
            var maxRetries = 10;
            var retryTimer = setInterval(function () {
              if (bindTextarea()) {
                clearInterval(retryTimer);
              } else if (++retries >= maxRetries) {
                clearInterval(retryTimer);
              }
            }, 500);
          }
        } else {
          // 关闭特效时解绑
          unbindTextarea();
        }
        sendResponse({ ok: true });
      });
      return true;  // 异步响应
    }
  });

  // ==========================================
  // Textarea 绑定
  // ==========================================
  function bindTextarea() {
    // 绑定 CodeMirror 内部真实接收输入的 textarea（源 textarea 为隐藏 Vue 源，不触发 input）
    var ta = document.querySelector('.vue-codemirror-wrap .CodeMirror textarea');
    if (!ta) {
      console.log('[Powermode] 找不到 .vue-codemirror-wrap .CodeMirror textarea');
      return false;
    }
    // 避免重复绑定
    if (ta === textareaInstance) return true;
    textareaInstance = ta;
    ta.addEventListener('input', handleTextareaInput);
    console.log('[Powermode] textarea 已绑定');
    return true;
  }

  function unbindTextarea() {
    if (textareaInstance) {
      textareaInstance.removeEventListener('input', handleTextareaInput);
      textareaInstance = null;
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
      updateComboDisplay();
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
  // Combo 显示
  // ==========================================
  function ensureComboDisplay() {
    if (comboDisplayEl && document.documentElement.contains(comboDisplayEl)) return;
    comboDisplayEl = document.getElementById('xsdoi-combo-display');
    if (!comboDisplayEl) {
      comboDisplayEl = document.createElement('div');
      comboDisplayEl.id = 'xsdoi-combo-display';
      comboDisplayEl.className = 'xsdoi-combo-display';
      comboDisplayEl.innerHTML = '<span class="xsdoi-combo-num">0</span><span class="xsdoi-combo-label">COMBO</span>';
      document.documentElement.appendChild(comboDisplayEl);
    }
  }

  function updateComboDisplay() {
    if (!comboDisplayEl) return;
    comboDisplayEl.querySelector('.xsdoi-combo-num').textContent = combo;
    // combo 等级决定颜色
    var colorIdx = Math.min(currentComboLevel, colorPalette.length - 1);
    comboDisplayEl.style.borderColor = colorPalette[colorIdx];
    comboDisplayEl.querySelector('.xsdoi-combo-num').style.color = colorPalette[colorIdx];
    // combo > 0 显示，归零隐藏
    if (combo > 0) {
      comboDisplayEl.classList.add('xsdoi-combo-active');
      // 重触发 pop 动画
      comboDisplayEl.classList.remove('xsdoi-combo-pop');
      void comboDisplayEl.offsetWidth;
      comboDisplayEl.classList.add('xsdoi-combo-pop');
      clearTimeout(comboHideTimer);
      comboHideTimer = setTimeout(function () {
        if (comboDisplayEl) comboDisplayEl.classList.remove('xsdoi-combo-active');
      }, config.comboResetMs);
    } else {
      clearTimeout(comboHideTimer);
      comboDisplayEl.classList.remove('xsdoi-combo-active');
    }
  }

  // ==========================================
  // Textarea input 事件处理
  // ==========================================
  function handleTextareaInput(e) {
    console.log('[Powermode] input 事件触发');
    if (!config.enabled) {
      console.log('[Powermode] 配置未启用，跳过');
      return;
    }
    // 过滤掉非输入类型的事件（如程序设置的 value）
    if (e.isTrusted === false) {
      console.log('[Powermode] 非用户输入，跳过');
      return;
    }
    // 获取光标坐标（尝试从 CodeMirror DOM 读取）
    var cmDiv = document.querySelector('.vue-codemirror-wrap .CodeMirror');
    var x = 0, y = 0;
    if (cmDiv) {
      var cursor = cmDiv.querySelector('.CodeMirror-cursors .CodeMirror-cursor');
      if (cursor) {
        var rect = cursor.getBoundingClientRect();
        x = rect.left;
        y = rect.top;
      }
    }
    if (x === 0 && y === 0) {
      // 兜底：从 textarea 读取
      var rect = textareaInstance.getBoundingClientRect();
      x = rect.left;
      y = rect.top;
    }
    console.log('[Powermode] 粒子坐标:', x, y, '生成', config.particleCount, '个粒子');
    spawnParticles(x, y);
    bumpCombo();
    updateComboDisplay();
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
        unbindTextarea();
        bindTextarea();
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
    var editorObserver = new MutationObserver(function (mutations, obs) {
      var wrapper = document.querySelector('.vue-codemirror-wrap');
      if (wrapper) {
        obs.disconnect();
        loadConfigFromStorage(function () {
          ensureParticleLayer();
          ensureComboDisplay();
          updateColorPalette();
          bindTextarea();
          observeEditor();
        });
      }
    });

    // 监听整个文档的子节点变化
    editorObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 兜底：5s 后如果还没找到，直接尝试一次
    setTimeout(function () {
      editorObserver.disconnect();
      loadConfigFromStorage(function () {
        ensureParticleLayer();
        ensureComboDisplay();
        updateColorPalette();
        bindTextarea();
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