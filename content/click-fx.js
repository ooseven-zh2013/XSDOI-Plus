// ==================== 鼠标点击特效 ====================
// 兼容性：监听全局 mousedown（仅左键），在点击坐标处爆发粒子，视觉对齐打字特效
// 独立运行环境（isolated world），不依赖 powermode 是否启用
(function () {
  'use strict';

  var config = Object.assign({}, CLICK_FX.DEFAULTS);
  var layer = null;
  var MAX_ACTIVE = 600; // 活跃粒子上限，超出清最旧，防卡顿

  // ==========================================
  // 配置加载与更新
  // ==========================================
  function loadConfigFromStorage(cb) {
    chrome.storage.sync.get(['clickeffect'], function (items) {
      if (items.clickeffect) {
        var s = items.clickeffect;
        if (typeof s.enabled === 'boolean') config.enabled = s.enabled;
        if (s.colorMode === 'solid' || s.colorMode === 'rainbow') config.colorMode = s.colorMode;
        if (typeof s.solidColor === 'string' && POWERMODE.parseColor(s.solidColor)) config.solidColor = s.solidColor;
        if (typeof s.particleCount === 'number' && s.particleCount >= 1 && s.particleCount <= 50) config.particleCount = s.particleCount;
        if (typeof s.particleSize === 'number' && s.particleSize >= 2 && s.particleSize <= 30) config.particleSize = s.particleSize;
        if (typeof s.spread === 'number' && s.spread >= 20 && s.spread <= 200) config.spread = s.spread;
        if (typeof s.lifeMs === 'number' && s.lifeMs >= 200 && s.lifeMs <= 2000) config.lifeMs = s.lifeMs;
      }
      if (cb) cb();
    });
  }

  // 随机彩虹色：随机色相，高饱和中亮度
  function randomRainbowColor() {
    return 'hsl(' + Math.floor(Math.random() * 360) + ', 90%, 60%)';
  }

  // 粒子颜色：单一颜色模式用用户色，否则彩虹随机
  function getParticleColor() {
    if (config.colorMode === 'solid' && POWERMODE.parseColor(config.solidColor)) {
      return config.solidColor;
    }
    return randomRainbowColor();
  }

  // 监听 popup 发送的配置更新
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message && message.type === CLICK_FX.MSG.config) {
      loadConfigFromStorage(function () {
        sendResponse({ ok: true });
      });
      return true; // 异步响应
    }
  });

  // ==========================================
  // 粒子层
  // ==========================================
  function ensureLayer() {
    if (layer && document.documentElement.contains(layer)) return;
    layer = document.getElementById('xsdoi-clickfx-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'xsdoi-clickfx-layer';
      layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99997;';
      document.documentElement.appendChild(layer);
    }
  }

  function spawnParticles(x, y) {
    if (!layer || !config.enabled) return;
    // 活跃粒子过多时清最旧，避免卡顿
    if (layer.childElementCount >= MAX_ACTIVE) {
      var oldest = layer.firstElementChild;
      if (oldest) layer.removeChild(oldest);
    }
    var n = config.particleCount;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('div');
      p.className = 'xsdoi-clickfx-particle';
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.width = config.particleSize + 'px';
      p.style.height = config.particleSize + 'px';
      // 随机方向 + 随机距离（在 spread 的 40%-100% 之间）
      var angle = Math.random() * Math.PI * 2;
      var dist = config.spread * (0.4 + Math.random() * 0.6);
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      p.style.setProperty('--life', config.lifeMs + 'ms');
      p.style.backgroundColor = getParticleColor();
      layer.appendChild(p);
      (function (node) {
        node.addEventListener('animationend', function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        });
      })(p);
    }
  }

  // ==========================================
  // 鼠标按下事件
  // ==========================================
  function onMouseDown(e) {
    if (!config.enabled) return;
    if (e.button !== 0) return; // 仅左键触发，避免右键菜单也冒粒子
    var x = e.clientX, y = e.clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    spawnParticles(x, y);
  }

  // ==========================================
  // 初始化
  // ==========================================
  function init() {
    ensureLayer();
    loadConfigFromStorage(function () {
      // 捕获阶段监听，确保页面内被 preventDefault 的元素也能触发
      document.addEventListener('mousedown', onMouseDown, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
