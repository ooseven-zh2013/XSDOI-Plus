// ==================== 鼠标点击特效 ====================
// 兼容性：监听全局 mousedown（仅左键），在点击坐标处爆发粒子，视觉对齐打字特效
// 独立运行环境（isolated world），不依赖 powermode 是否启用
(function () {
  'use strict';

  var config = Object.assign({}, CLICK_FX.DEFAULTS);
  var layer = null;
  var MAX_ACTIVE = 600; // 活跃粒子上限，超出清最旧，防卡顿
  var imageBase64 = ''; // 自定义图片（base64 dataURL），从 storage.local 读取

  // ==========================================
  // 配置加载与更新
  // ==========================================
  function loadConfigFromStorage(cb) {
    chrome.storage.sync.get(['clickeffect'], function (items) {
      if (items.clickeffect) {
        var s = items.clickeffect;
        if (typeof s.enabled === 'boolean') config.enabled = s.enabled;
        if (s.effectType === 'particles' || s.effectType === 'image') config.effectType = s.effectType;
        if (s.colorMode === 'solid' || s.colorMode === 'rainbow') config.colorMode = s.colorMode;
        if (typeof s.solidColor === 'string' && POWERMODE.parseColor(s.solidColor)) config.solidColor = s.solidColor;
        if (typeof s.particleCount === 'number' && s.particleCount >= 1 && s.particleCount <= 50) config.particleCount = s.particleCount;
        if (typeof s.particleSize === 'number' && s.particleSize >= 2 && s.particleSize <= 30) config.particleSize = s.particleSize;
        if (typeof s.imageSize === 'number' && s.imageSize >= 2 && s.imageSize <= 200) config.imageSize = s.imageSize;
        if (typeof s.spread === 'number' && s.spread >= 20 && s.spread <= 200) config.spread = s.spread;
        if (typeof s.lifeMs === 'number' && s.lifeMs >= 200 && s.lifeMs <= 2000) config.lifeMs = s.lifeMs;
      }
      // 自定义图片单独存 storage.local（体积大，不进 sync）
      chrome.storage.local.get([CLICK_FX.IMG_KEY], function (localItems) {
        imageBase64 = (localItems && localItems[CLICK_FX.IMG_KEY]) || '';
        if (cb) cb();
      });
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

  // 爆发自定义图片：每次点击生成若干张用户图片，从光标处向外飞散并淡出
  // 图片模式若未设置图片，则回退为粒子，避免点了没反应
  function spawnImages(x, y) {
    if (!layer || !config.enabled) return;
    if (!imageBase64) { spawnParticles(x, y); return; }
    if (layer.childElementCount >= MAX_ACTIVE) {
      var oldest = layer.firstElementChild;
      if (oldest) layer.removeChild(oldest);
    }
    var n = config.particleCount;
    for (var i = 0; i < n; i++) {
      var img = document.createElement('img');
      img.className = 'xsdoi-clickfx-particle xsdoi-clickfx-image';
      img.src = imageBase64;
      img.style.left = x + 'px';
      img.style.top = y + 'px';
      img.style.width = config.imageSize + 'px';
      img.style.height = config.imageSize + 'px';
      var angle = Math.random() * Math.PI * 2;
      var dist = config.spread * (0.4 + Math.random() * 0.6);
      var rot = (Math.random() * 2 - 1) * 120; // 旋转 ±120°
      img.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      img.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      img.style.setProperty('--rot', rot + 'deg');
      img.style.setProperty('--life', config.lifeMs + 'ms');
      layer.appendChild(img);
      (function (node) {
        node.addEventListener('animationend', function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        });
      })(img);
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
    if (config.effectType === 'image') spawnImages(x, y);
    else spawnParticles(x, y);
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
