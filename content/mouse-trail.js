// ==================== 鼠标尾迹 ====================
// 全局监听 mousemove，在光标处生成尾迹。两种形态：
//   · dots    —— 离散淡出圆点（默认）
//   · ribbon  —— 跟随光标的连续彩色带（canvas 填充连续带，头不透明、尾渐隐、尾端收窄成尖）
// 颜色支持纯色 / 彩虹渐变（彩虹模式色相递增，形成顺滑渐变）。
// 触发源参考打字特效（Powermode），但监听的是 document 的 mousemove 而非编辑器 input。

(function () {
  'use strict';

  var config = Object.assign({}, MOUSE_TRAIL.DEFAULTS);
  var layer = null;             // 圆点模式的 DOM 层
  var canvas = null;            // 带状模式的 canvas
  var ctx = null;
  var lastSpawn = 0;
  var hue = 0;                  // 彩虹模式：全局色相，每个采样点递增
  var activeDots = [];          // 圆点模式：活跃点队列（防溢出）
  var MAX_DOTS = 400;
  var points = [];              // 带状模式：采样点缓冲 [{x,y,t,hue}]
  var rafId = null;             // 带状模式：requestAnimationFrame 句柄

  // ==========================================
  // 配置加载与更新
  // ==========================================
  function loadConfigFromStorage(cb) {
    chrome.storage.sync.get(['mousetrail'], function (items) {
      if (items.mousetrail) {
        var stored = items.mousetrail;
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
      console.log('[MouseTrail] 配置加载完成:', config);
      if (cb) cb();
    });
  }

  // 圆点颜色：单一颜色模式用用户色；彩虹模式色相递增，呈现顺滑渐变
  function colorForDot() {
    if (config.colorMode === 'solid' && POWERMODE.parseColor(config.solidColor)) {
      return config.solidColor;
    }
    hue = (hue + 5) % 360;
    return 'hsl(' + hue + ', 90%, 60%)';
  }

  // 纯色 + 透明度 → rgba 字符串（彩虹模式不调用）
  function solidWithAlpha(color, alpha) {
    var rgba = POWERMODE.parseColor(color);
    if (rgba) {
      return 'rgba(' + rgba[0] + ',' + rgba[1] + ',' + rgba[2] + ',' + (rgba[3] * alpha) + ')';
    }
    // config.solidColor 恒为合法颜色（DEFAULTS + 面板校验），正常不会走到这里；
    // 解析失败时直接退化回原始值，不再回退到固定纯色（#339af0）。
    return color;
  }

  // 两个色相的环形中点（处理 360→0 环绕）。
  // 朴素均值 (358+3)/2=180 会把红橙区的跨越点错算成青色（正是用户看到的“纯色段”）。
  function midHue(a, b) {
    var d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    var m = a + d / 2;
    m = ((m % 360) + 360) % 360;
    return m;
  }

  // 两个色相的线性插值（处理 360→0 环绕），用于带状插值时保持彩虹平滑
  function lerpHue(a, b, f) {
    var d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    var m = a + d * f;
    return ((m % 360) + 360) % 360;
  }

  // 监听 popup 发送的配置更新
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === MOUSE_TRAIL.MSG.config) {
      loadConfigFromStorage(function () {
        applyMode();
        sendResponse({ ok: true });
      });
      return true;  // 异步响应
    }
  });

  // 兜底：storage 变化时（无论 popup 的 sendMessage 是否成功抵达 content script）
  // 都重新加载并应用，避免「带状已显示但球状粒子残留」这类偶发竞态/消息丢失。
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes.mousetrail) {
      loadConfigFromStorage(function () {
        applyMode();
      });
    }
  });

  // ==========================================
  // DOM / Canvas 元素
  // ==========================================
  function ensureElements() {
    if (!layer || !document.documentElement.contains(layer)) {
      layer = document.getElementById('xsdoi-trail-layer');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'xsdoi-trail-layer';
        document.documentElement.appendChild(layer);
      }
    }
    if (!canvas || !document.documentElement.contains(canvas)) {
      canvas = document.getElementById('xsdoi-trail-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'xsdoi-trail-canvas';
        document.documentElement.appendChild(canvas);
      }
      ctx = canvas.getContext('2d');
      resizeCanvas();
    }
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ==========================================
  // 圆点模式
  // ==========================================
  function spawnDot(x, y) {
    if (!layer || !config.enabled || config.mode !== 'dots') return;
    var dot = document.createElement('div');
    dot.className = 'xsdoi-trail-dot';
    var size = config.size;
    dot.style.width = size + 'px';
    dot.style.height = size + 'px';
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    dot.style.backgroundColor = colorForDot();
    dot.style.setProperty('--life', config.lifeMs + 'ms');

    layer.appendChild(dot);
    activeDots.push(dot);
    // 防溢出：活跃点过多时强制移除最旧的
    if (activeDots.length > MAX_DOTS) {
      var old = activeDots.shift();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    dot.addEventListener('animationend', function () {
      if (dot.parentNode) dot.parentNode.removeChild(dot);
      var idx = activeDots.indexOf(dot);
      if (idx >= 0) activeDots.splice(idx, 1);
    });
  }

  // ==========================================
  // 带状模式（canvas 连续描边）
  // ==========================================
  function startRibbonLoop() {
    if (rafId == null && config.enabled && config.mode === 'ribbon' && ctx) {
      rafId = requestAnimationFrame(ribbonFrame);
    }
  }

  function stopRibbonLoop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    points = [];
    if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  // 清空圆点 DOM 层（切换到带状模式时调用，避免残留圆点）
  function clearDots() {
    if (layer) {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }
    activeDots = [];
  }

  // 按当前 config 应用模式。
  // 关键修复：带状模式不仅清空、还把圆点层 display:none，确保任何情况下（含切换竞态、
  // 旧圆点动画、sendMessage 丢失）球状粒子都绝不可见——只靠 removeChild 不够稳。
  function applyMode() {
    ensureElements();
    if (config.enabled && config.mode === 'ribbon') {
      layer.style.display = 'none';
      clearDots();
      canvas.style.display = '';
      startRibbonLoop();
    } else {
      layer.style.display = '';
      stopRibbonLoop();
      clearDots();
    }
  }

  function ribbonFrame() {
    if (!config.enabled || config.mode !== 'ribbon' || !ctx) {
      rafId = null;
      return;
    }
    var now = performance.now();
    // 丢弃过期点（比 lifeMs 更旧）
    while (points.length && now - points[0].t > config.lifeMs) points.shift();

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (points.length >= 2) drawRibbon(now);

    rafId = requestAnimationFrame(ribbonFrame);
  }

  // 连续丝带渲染：逐段以「粗描边 + 圆头」绘制（胶囊链）。
  // 相邻段在采样点处的圆头相互重叠，丝带在任意拐角都严丝合缝——不会像「梯形拼接」那样
  // 在曲线外缘留下亚像素缝隙（暗色页面下缝隙透出背景就成黑边）。
  // 颜色 / 透明度按段的中点平滑过渡，尾端随 alpha 收窄自然变细。
  function ribbonStrokeColor(p0, p1, alpha) {
    if (config.colorMode === 'solid' && POWERMODE.parseColor(config.solidColor)) {
      return solidWithAlpha(config.solidColor, alpha);
    }
    var mh = midHue(p0.hue, p1.hue); // 环形中点，处理 360→0 环绕
    return 'hsla(' + mh + ', 90%, 60%, ' + alpha + ')';
  }

  function ribbonFillColor(p) {
    if (config.colorMode === 'solid' && POWERMODE.parseColor(config.solidColor)) {
      return solidWithAlpha(config.solidColor, p._alpha);
    }
    return 'hsla(' + p.hue + ', 90%, 60%, ' + p._alpha + ')';
  }

  function drawRibbon(now) {
    var n = points.length;
    if (n < 1) return;
    var w2base = config.size / 2;

    // 预计算每个采样点的透明度、半宽（尾端收窄成尖）
    for (var i = 0; i < n; i++) {
      var p = points[i];
      var age = now - p.t;
      var alpha = 1 - age / config.lifeMs;
      if (alpha < 0) alpha = 0;
      if (alpha > 1) alpha = 1;
      p._alpha = alpha;
      p._w = w2base * (0.35 + 0.65 * alpha); // 半宽，尾端收窄
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 仅一个采样点（鼠标几乎不动）：直接画圆头
    if (n === 1) {
      var only = points[0];
      if (only._alpha > 0) {
        ctx.fillStyle = ribbonFillColor(only);
        ctx.beginPath();
        ctx.arc(only.x, only.y, only._w, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // 逐段描边：每段宽度 = 两端半宽之和（即全宽），圆头在采样点重叠 → 无缝丝带
    for (var i = 1; i < n; i++) {
      var p0 = points[i - 1], p1 = points[i];
      var midA = (p0._alpha + p1._alpha) / 2;
      if (midA <= 0) continue;
      ctx.strokeStyle = ribbonStrokeColor(p0, p1, midA);
      ctx.lineWidth = p0._w + p1._w; // 全宽 = 平均半宽 × 2
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  // ==========================================
  // 鼠标移动监听
  // ==========================================
  function onMouseMove(e) {
    if (!config.enabled) return;
    var now = performance.now();

    if (config.mode === 'ribbon') {
      // 带状：每次 mousemove 采样。鼠标移动越快、相邻采样点越远；
      // 若直接用「逐段圆头描边」，远距两点会变成「圆头+细线」的串珠/球状，而非连续丝带。
      // 因此在两点之间按线宽插值补点，保证任意相邻点距离 ≤ 线宽，圆头始终重叠 → 连续光滑丝带。
      hue = (hue + 5) % 360;
      var x = e.clientX, y = e.clientY, t = now;
      var last = points[points.length - 1];
      if (last) {
        var dx = x - last.x, dy = y - last.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var step = Math.max(1, config.size * 0.3); // 子步长 ≤ 最窄线宽，圆头必重叠无缝
        var n = Math.ceil(dist / step);
        if (n > 1) {
          for (var s = 1; s <= n; s++) {
            var f = s / n;
            points.push({
              x: last.x + dx * f,
              y: last.y + dy * f,
              t: t,
              hue: lerpHue(last.hue, hue, f),
            });
          }
        } else {
          points.push({ x: x, y: y, t: t, hue: hue });
        }
      } else {
        points.push({ x: x, y: y, t: t, hue: hue });
      }
      startRibbonLoop();
      return;
    }

    if (now - lastSpawn < config.intervalMs) return;
    lastSpawn = now;
    spawnDot(e.clientX, e.clientY);
  }

  // ==========================================
  // 初始化
  // ==========================================
  function init() {
    loadConfigFromStorage(function () {
      ensureElements();
      window.addEventListener('resize', resizeCanvas);
      // passive 避免阻塞滚动/交互
      document.addEventListener('mousemove', onMouseMove, { passive: true });
      applyMode();
      console.log('[MouseTrail] 已初始化');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // 暴露轨迹数据供桌宠碰撞检测（globalThis 在各 content script 间可见）
  window.__xsdoiTrail = {
    get dots() { return activeDots; },      // 圆点模式：活跃 DOM 元素数组
    get points() { return points; },         // 带状模式：采样点数组 [{x,y,t,hue,_alpha,_w}]
    get config() { return config; },         // 当前配置
    get mode() { return config.mode; },      // 'dots' | 'ribbon'
  };
})();
