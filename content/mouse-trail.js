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

  // 监听 popup 发送的配置更新
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === MOUSE_TRAIL.MSG.config) {
      loadConfigFromStorage(function () {
        ensureElements();
        if (config.enabled && config.mode === 'ribbon') {
          clearDots();
          startRibbonLoop();
        } else {
          stopRibbonLoop();
          clearDots();
        }
        sendResponse({ ok: true });
      });
      return true;  // 异步响应
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

  // 连续丝带渲染：把尾迹做成「四边形带（quad ribbon）」。
  // 相邻采样点之间填一个梯形（左缘→右缘→右缘→左缘），梯形之间共享边、严丝合缝拼成一条丝带，
  // 不像逐段 stroke() 那样在转角处露出平头矩形缺口，也不会出现圆头珍珠感。
  // 颜色 / 透明度按梯形中点平滑过渡，头部补圆头。
  function drawRibbon(now) {
    var n = points.length;
    if (n < 1) return;
    var w2base = config.size / 2;
    var left = [];
    var right = [];

    // 预计算每个采样点的透明度、宽度（尾端收窄成尖）、左右法向偏移
    for (var i = 0; i < n; i++) {
      var p = points[i];
      var age = now - p.t;
      var alpha = 1 - age / config.lifeMs;
      if (alpha < 0) alpha = 0;
      if (alpha > 1) alpha = 1;
      p._alpha = alpha;
      var w = w2base * (0.35 + 0.65 * alpha); // 尾端收窄，形成自然尖尾
      p._w = w;

      // 切线（中心差分，端点用单侧差分）
      var ax, ay;
      if (i === 0) { ax = points[1].x - p.x; ay = points[1].y - p.y; }
      else if (i === n - 1) { ax = p.x - points[i - 1].x; ay = p.y - points[i - 1].y; }
      else { ax = points[i + 1].x - points[i - 1].x; ay = points[i + 1].y - points[i - 1].y; }
      var len = Math.hypot(ax, ay) || 1;
      var nx = -ay / len, ny = ax / len; // 法向（垂直于切线）
      left.push({ x: p.x + nx * w, y: p.y + ny * w });
      right.push({ x: p.x - nx * w, y: p.y - ny * w });
    }

    // 逐段填梯形，相邻梯形共享边 → 连续丝带
    for (var i = 1; i < n; i++) {
      var p0 = points[i - 1], p1 = points[i];
      var midA = (p0._alpha + p1._alpha) / 2;
      if (midA <= 0) continue;
      var color;
      if (config.colorMode === 'solid' && POWERMODE.parseColor(config.solidColor)) {
        color = solidWithAlpha(config.solidColor, midA);
      } else {
        var mh = midHue(p0.hue, p1.hue); // 环形中点，处理 360→0 环绕
        color = 'hsla(' + mh + ', 90%, 60%, ' + midA + ')';
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(left[i - 1].x, left[i - 1].y);
      ctx.lineTo(left[i].x, left[i].y);
      ctx.lineTo(right[i].x, right[i].y);
      ctx.lineTo(right[i - 1].x, right[i - 1].y);
      ctx.closePath();
      ctx.fill();
    }

    // 头部（光标处）补圆头，避免平头切边突兀
    var head = points[n - 1];
    if (head._alpha > 0) {
      var hc;
      if (config.colorMode === 'solid' && POWERMODE.parseColor(config.solidColor)) {
        hc = solidWithAlpha(config.solidColor, head._alpha);
      } else {
        hc = 'hsla(' + head.hue + ', 90%, 60%, ' + head._alpha + ')';
      }
      ctx.fillStyle = hc;
      ctx.beginPath();
      ctx.arc(head.x, head.y, head._w, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ==========================================
  // 鼠标移动监听
  // ==========================================
  function onMouseMove(e) {
    if (!config.enabled) return;
    var now = performance.now();

    if (config.mode === 'ribbon') {
      // 带状：每次 mousemove 都采样，保证丝带连续光滑。
      // 生成间隔（intervalMs）仅用于圆点模式控制密度，带状不应用。
      hue = (hue + 5) % 360;
      points.push({ x: e.clientX, y: e.clientY, t: now, hue: hue });
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
      if (config.enabled && config.mode === 'ribbon') startRibbonLoop();
      console.log('[MouseTrail] 已初始化');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
