// ============================================================
// 网页桌宠 - content script（隔离世界）
//
// 在 xsdoi.com 所有页面注入一只可拖动的圆球桌宠（全局注入，不限路由）：
//   - 圆球外观：圆形容器，可显示用户自定义图片（storage.local 的
//     webPetImg，cover 裁剪）；未设置时显示默认表情球
//   - 随机散步：页面底部区域自由走动，边缘折返，偶有停顿
//   - 鼠标拖动：Pointer 抓取拖动，松手停住，靠近屏幕边缘自动吸附
//   - 显隐控制：读取 storage.sync 的 webPetEnabled（popup「桌宠」面板
//     开关），关闭即隐藏
//   - 持久化：开关、图片、位置（视口百分比）刷新后保持
// ============================================================

(function () {
  'use strict';

  var CONTAINER_ID = 'xsdoi-web-pet';
  var STYLE_ID = 'xsdoi-web-pet-style';
  var STORAGE_KEY = 'webPet';           // { x: %, y: % }
  var ENABLE_KEY = 'webPetEnabled';     // popup「桌宠」面板开关
  var IMG_KEY = 'webPetImg';            // 自定义图片 dataURL（storage.local）
  var CROP_KEY = 'webPetCrop';          // 裁剪参数 { scale, cx, cy }（popup 可视化裁剪器）

  var PET_SIZE = 56;   // 显示尺寸 px
  var MARGIN = 8;      // 与视口边缘的最小间距 px
  var SNAP = 40;       // 距边缘小于该值则吸附 px
  var WALK_STEP = 2;   // 散步每帧移动 px

  // 默认表情球（无自定义图片时显示；眼睛带 xsdoi-pet-eye class 便于眨眼）
  var SVG_FACE = [
    '<svg viewBox="0 0 32 32" width="56" height="56">',
    '<circle cx="16" cy="16" r="15" fill="#60a5fa"/>',
    '<circle class="xsdoi-pet-eye" cx="10.5" cy="14.5" r="3.4" fill="#1f2937"/>',
    '<circle class="xsdoi-pet-eye" cx="21.5" cy="14.5" r="3.4" fill="#1f2937"/>',
    '<circle cx="9.6" cy="13.4" r="1.1" fill="#dbeafe"/>',
    '<circle cx="20.6" cy="13.4" r="1.1" fill="#dbeafe"/>',
    '<path d="M12 21 Q16 24.5 20 21" stroke="#1f2937" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
    '<circle cx="6.5" cy="20.5" r="2.5" fill="#f9a8d4"/>',
    '<circle cx="25.5" cy="20.5" r="2.5" fill="#f9a8d4"/>',
    '</svg>'
  ].join('');

  // ---------- 样式 ----------
  var CSS_TEXT = [
    '#' + CONTAINER_ID + '{position:fixed;left:0;top:0;z-index:2147483000;width:' + PET_SIZE + 'px;height:' + PET_SIZE + 'px;pointer-events:none;will-change:transform;}',
    '#' + CONTAINER_ID + ' .xsdoi-pet-body{position:relative;width:100%;height:100%;border-radius:50%;overflow:hidden;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none;background:#60a5fa;box-shadow:0 2px 8px rgba(0,0,0,.18);}',
    '#' + CONTAINER_ID + '.xsdoi-pet-dragging .xsdoi-pet-body{cursor:grabbing;}',
    '#' + CONTAINER_ID + ' .xsdoi-pet-img{position:absolute;left:0;top:0;object-fit:cover;display:block;pointer-events:none;max-width:none;max-height:none;border:none;margin:0;padding:0;background:none;box-shadow:none;border-radius:0;filter:none;transform:none;transition:none;animation:none;opacity:1;visibility:visible;z-index:0;}',
    '#' + CONTAINER_ID + ' .xsdoi-pet-body svg{display:block;width:100%;height:100%;}',
    '#' + CONTAINER_ID + '.xsdoi-pet-walking .xsdoi-pet-body{animation:xsdoiPetWalk .45s ease-in-out infinite;}',
    '@keyframes xsdoiPetWalk{0%,100%{transform:translateY(0);}40%{transform:translateY(-6px);}70%{transform:translateY(-1px);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-jumping .xsdoi-pet-body{animation:xsdoiPetJump .5s ease;}',
    '@keyframes xsdoiPetJump{0%{transform:translateY(0) scale(1);}30%{transform:translateY(-22px) scale(1.06,.94);}55%{transform:translateY(0) scale(.94,1.06);}70%{transform:translateY(-5px) scale(1);}100%{transform:translateY(0) scale(1);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-idle .xsdoi-pet-body svg{animation:xsdoiPetBreathe 2.6s ease-in-out infinite;}',
    '@keyframes xsdoiPetBreathe{0%,100%{transform:scale(1);}50%{transform:scale(1.04);}}',
    '#' + CONTAINER_ID + ' .xsdoi-pet-eye{transform-box:fill-box;transform-origin:center;animation:xsdoiPetBlink 3.6s infinite;}',
    '@keyframes xsdoiPetBlink{0%,44%,56%,100%{transform:scaleY(1);}48%,52%{transform:scaleY(.08);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-bounce .xsdoi-pet-body{animation:xsdoiPetBounce .4s ease;}',
    '@keyframes xsdoiPetBounce{0%{transform:scale(1);}40%{transform:scale(.86);}100%{transform:scale(1);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-flying .xsdoi-pet-body{animation:xsdoiPetFly .55s ease-in;}',
    '@keyframes xsdoiPetFly{0%{transform:scale(1) rotate(0deg);}50%{transform:scale(.88,1.14) rotate(-8deg);}100%{transform:scale(1) rotate(0deg);}}'
  ].join('\n');

  // ---------- 状态 ----------
  var pet = null;      // 容器
  var body = null;     // 圆球本体
  var enabled = true;  // 是否显示（webPetEnabled）
  var pos = { x: 80, y: 85 }; // 视口百分比（容器左上角）

  var vw = 0, vh = 0;
  var px = 0, py = 0;

  var dragging = false;
  var pointerId = null;
  var dragDX = 0, dragDY = 0;
  var dragMoved = 0;

  var targetX = 0, targetY = 0;
  var waitUntil = 0;
  var nextJumpAt = 0;  // 下次随机跳跃时间戳
  var raf = 0;
  var customImg = null; // 自定义图片 dataURL（storage.local webPetImg）
  // 圆形裁剪参数：scale = 放大倍数（圆直径 = 容器/scale），cx/cy = 裁剪中心（图片坐标 0-1）
  var crop = { scale: 2, cx: 0.5, cy: 0.5 };

  // 抛物线飞行状态
  var flying = false;
  var flyVx = 0, flyVy = 0;  // 飞行初速度（px/frame）
  var G = 0.18;              // 重力加速度（px/frame²，~60fps）
  // 拖拽轨迹采样，用于估算松手速度
  var dragSamples = [];
  // 抛物线运动中的瞬时速度（updateParabola 内部使用，需先声明）
  var pxFly = 0, pyFly = 0, vxFly = 0, vyFly = 0;

  // 轨迹碰撞参数
  var COLLISION_RADIUS = PET_SIZE / 2 + 6; // 宠物碰撞半径
  var BOUNCE_DAMPING = 0.75;              // 反弹阻尼系数
  var SLIDE_FRICTION = 0.96;             // 滑行摩擦衰减
  var SLIDE_THRESHOLD = 0.7;              // 速度方向与轨迹方向夹角的 cos 阈值（>0.7 视为同向）

  // 规范化裁剪参数（兼容旧值/非法值）
  function normalizeCrop(v) {
    if (v && typeof v === 'object' && typeof v.scale === 'number') {
      return {
        scale: Math.max(1, Math.min(8, v.scale)),
        cx: (typeof v.cx === 'number') ? Math.max(0, Math.min(1, v.cx)) : 0.5,
        cy: (typeof v.cy === 'number') ? Math.max(0, Math.min(1, v.cy)) : 0.5
      };
    }
    return { scale: 2, cx: 0.5, cy: 0.5 };
  }

  // ---------- 基础工具 ----------
  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
  }

  function ensureContainer() {
    if (pet) return;
    pet = document.createElement('div');
    pet.id = CONTAINER_ID;
    pet.innerHTML = '<div class="xsdoi-pet-body"></div>';
    body = pet.querySelector('.xsdoi-pet-body');
    document.body.appendChild(pet);
    pet.addEventListener('pointerdown', onPointerDown);
    pet.addEventListener('pointercancel', function (e) {
      if (e.pointerId === pointerId) onPointerUp(e);
    });
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  // 渲染圆球内容：有自定义图片按裁剪参数定位显示，否则显示默认表情球
  function renderFace() {
    if (!body) return;
    if (customImg) {
      body.innerHTML = '<img class="xsdoi-pet-img" src="' + customImg + '" alt="">';
      var img = body.querySelector('.xsdoi-pet-img');
      if (img) {
        // 裁剪器里「圆直径 = 容器宽 / scale」，对应到宠物上即
        // 「裁剪区域放大后宽度 = 容器宽 × scale」；高度按原图宽高比换算
        // （h = w / ratio），两边与裁剪器视觉一一对应。当裁剪圆靠近图片
        // 边缘、放大后图片盖不满圆球时，按比例整体放大做兜底，保证任何
        // 裁剪位置圆球都被图片完全覆盖、不露出背景色
        var layout = function () {
          var ratio = (img.naturalWidth > 0 && img.naturalHeight > 0)
            ? img.naturalWidth / img.naturalHeight : 1;
          var w = PET_SIZE * crop.scale; // 裁剪区域放大后的宽度（= 圆直径的 scale 倍）
          var h = w / ratio;
          var k = 1;
          if (crop.cx > 0) k = Math.max(k, PET_SIZE / (2 * crop.cx * w));
          if (crop.cy > 0) k = Math.max(k, PET_SIZE / (2 * crop.cy * h));
          if (1 - crop.cx > 0) k = Math.max(k, PET_SIZE / (2 * (1 - crop.cx) * w));
          if (1 - crop.cy > 0) k = Math.max(k, PET_SIZE / (2 * (1 - crop.cy) * h));
          w *= k;
          h *= k;
          img.style.width = w + 'px';
          img.style.height = h + 'px';
          img.style.left = (PET_SIZE / 2 - crop.cx * w) + 'px';
          img.style.top = (PET_SIZE / 2 - crop.cy * h) + 'px';
        };
        if (img.complete && img.naturalWidth > 0) layout();
        else img.addEventListener('load', layout);
      }
    } else {
      body.innerHTML = SVG_FACE;
    }
  }

  function toPx() {
    px = pos.x / 100 * Math.max(1, vw - PET_SIZE);
    py = pos.y / 100 * Math.max(1, vh - PET_SIZE);
  }

  function applyPos() {
    pet.style.transform = 'translate(' + px + 'px,' + py + 'px)';
  }

  function clampToViewport() {
    px = Math.max(MARGIN, Math.min(vw - PET_SIZE - MARGIN, px));
    py = Math.max(MARGIN, Math.min(vh - PET_SIZE - MARGIN, py));
  }

  // ---------- 显隐（popup「桌宠」面板开关） ----------
  function applyVisibility() {
    if (!pet) return;
    pet.style.display = enabled ? 'block' : 'none';
  }

  function saveState() {
    pos.x = px / Math.max(1, vw - PET_SIZE) * 100;
    pos.y = py / Math.max(1, vh - PET_SIZE) * 100;
    chrome.storage.sync.set({ webPet: { x: pos.x, y: pos.y } });
  }

  // ---------- 随机散步（贴底走动） ----------
  // 底部地面线：宠物始终回到页面底部左右走动，不再满窗口乱飞
  function groundY() {
    return vh - PET_SIZE - MARGIN;
  }

  function pickTarget() {
    var x1 = MARGIN;
    var x2 = vw - PET_SIZE - MARGIN;
    targetX = x1 + Math.random() * (x2 - x1);
    targetY = groundY();
    pet.classList.toggle('xsdoi-pet-left', targetX < px);
  }

  // 走路过程中随机跳跃（蹦一下），不影响前进
  function maybeJump(now) {
    if (now < nextJumpAt) return;
    pet.classList.remove('xsdoi-pet-jumping');
    void pet.offsetWidth; // 重启动画
    pet.classList.add('xsdoi-pet-jumping');
    nextJumpAt = now + 1500 + Math.random() * 2000;
    setTimeout(function () {
      pet.classList.remove('xsdoi-pet-jumping');
    }, 500);
  }

  function step() {
    if (dragging) return;
    var now = Date.now();
    if (now < waitUntil) return;
    // 如果在抛物线飞行中，先处理物理模拟
    if (flying) {
      if (updateParabola()) return; // 已落地，等待下一帧进入散步逻辑
      applyPos();
      return;
    }
    var dx = targetX - px;
    var dy = targetY - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 3) {
      // 到达目标：休息 1.5~4s 再走
      pet.classList.remove('xsdoi-pet-walking');
      pet.classList.add('xsdoi-pet-idle');
      waitUntil = now + 1500 + Math.random() * 2500;
      pickTarget();
      return;
    }
    var s = Math.min(WALK_STEP, dist);
    px += dx / dist * s;
    py += dy / dist * s;
    pet.classList.add('xsdoi-pet-walking');
    pet.classList.remove('xsdoi-pet-idle');
    maybeJump(now);
    applyPos();
  }

  function loop() {
    step();
    raf = requestAnimationFrame(loop);
  }

  // ---------- 拖动 ----------
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    pointerId = e.pointerId;
    dragMoved = 0;
    dragDX = e.clientX - px;
    dragDY = e.clientY - py;
    try { pet.setPointerCapture(pointerId); } catch (err) {}
    pet.classList.add('xsdoi-pet-dragging');
    pet.classList.remove('xsdoi-pet-walking', 'xsdoi-pet-idle');
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    var nx = e.clientX - dragDX;
    var ny = e.clientY - dragDY;
    dragMoved = Math.max(dragMoved, Math.abs(nx - px) + Math.abs(ny - py));
    // 采样拖拽末速度（最近两帧的位置差）
    dragSamples.push({ x: nx, y: ny, t: Date.now() });
    if (dragSamples.length > 6) dragSamples.shift();
    px = nx;
    py = ny;
    clampToViewport();
    applyPos();
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    try { pet.releasePointerCapture(pointerId); } catch (err) {}
    pet.classList.remove('xsdoi-pet-dragging');
    snapToEdge();
    saveState();
    if (dragMoved < 6) {
      // 原地点击：弹一下反馈
      pet.classList.remove('xsdoi-pet-bounce');
      void pet.offsetWidth; // 重启动画
      pet.classList.add('xsdoi-pet-bounce');
      pet.classList.add('xsdoi-pet-idle');
      waitUntil = Date.now() + 1200;
    } else {
      waitUntil = 0;
      // 判断是否在空中（未贴底）：松手时 y < 地面线则启动抛物线
      var ground = groundY();
      if (py < ground - PET_SIZE / 2) {
        startParabolicFall();
      } else {
        pickTarget();
      }
    }
    dragSamples = []; // 清空采样（放在所有分支之后）
  }

  // 启动抛物线自由落体
  function startParabolicFall() {
    flying = true;
    vxFly = flyVx;
    vyFly = flyVy;
    pet.classList.remove('xsdoi-pet-idle', 'xsdoi-pet-walking');
    pet.classList.add('xsdoi-pet-flying');
    // 从拖拽采样估算初速度（最后两帧平均，转为 px/frame）
    if (dragSamples.length >= 2) {
      var a = dragSamples[dragSamples.length - 2];
      var b = dragSamples[dragSamples.length - 1];
      var dt = b.t - a.t;
      if (dt > 0) {
        flyVx = (b.x - a.x) / dt * 16;  // 归一化到 ~60fps
        flyVy = (b.y - a.y) / dt * 16;
      }
    }
    // 向左甩 → 正向 vx；向上甩 → vy 为负（屏幕坐标 y 向下为正）
    // 根据实际拖拽方向决定初速，不强制向上
    flyVy = flyVy * 0.6; // 阻尼：保留原方向，衰减到 60%
    // 幅度限制：防止小幅拖动产生过大的初速
    flyVy = Math.max(-8, Math.min(8, flyVy));
    flyVx = Math.max(-4, Math.min(4, flyVx));
    vxFly = flyVx;
    vyFly = flyVy;
  }

  // 抛物线物理模拟，每帧调用；返回 true 表示已落地
  function updateParabola() {
    if (!flying) return false;
    // 应用重力
    vxFly += 0; // 水平无阻力
    vyFly += G;
    px += vxFly;
    py += vyFly;
    // 边界处理
    clampToViewport();
    applyPos();
    // 检查轨迹碰撞
    checkTrailCollision();
    // 检查是否落地
    var ground = groundY();
    if (py >= ground) {
      py = ground;
      applyPos();
      flying = false;
      pet.classList.remove('xsdoi-pet-flying');
      // 落地弹跳反馈
      pet.classList.remove('xsdoi-pet-bounce');
      void pet.offsetWidth;
      pet.classList.add('xsdoi-pet-bounce');
      setTimeout(function () {
        pet.classList.remove('xsdoi-pet-bounce');
      }, 400);
      // 落地后重新选目标散步
      pickTarget();
      return true;
    }
    return false;
  }

  // ============================================
  // 轨迹碰撞检测与响应
  // ============================================
  // 获取宠物中心坐标
  function petCenter() {
    return { x: px + PET_SIZE / 2, y: py + PET_SIZE / 2 };
  }

  // 圆点模式：检测与活跃圆点的碰撞
  function checkDotCollision() {
    var dots = window.__xsdoiTrail && window.__xsdoiTrail.dots || [];
    var c = petCenter();
    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      if (!dot || !dot.style || dot.style.display === 'none') continue;
      var dotX = parseFloat(dot.style.left) + PET_SIZE / 2;
      var dotY = parseFloat(dot.style.top) + PET_SIZE / 2;
      var dotRadius = parseInt(dot.style.width) / 2 || 8;
      var dx = c.x - dotX;
      var dy = c.y - dotY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < COLLISION_RADIUS + dotRadius) {
        // 碰撞！计算反弹方向
        var nx = dx / dist;
        var ny = dy / dist;
        // 弹出宠物到碰撞位置外
        px = c.x - PET_SIZE / 2 - nx * (COLLISION_RADIUS + dotRadius + 2);
        py = c.y - PET_SIZE / 2 - ny * (COLLISION_RADIUS + dotRadius + 2);
        clampToViewport();
        applyPos();
        // 反弹速度：沿法线方向，保留切线分量
        var vDot = vxFly * nx + vyFly * ny;
        vxFly = (vxFly - 2 * vDot * nx) * BOUNCE_DAMPING;
        vyFly = (vyFly - 2 * vDot * ny) * BOUNCE_DAMPING;
        // 确保至少有一些速度（避免完全静止）
        var speed = Math.sqrt(vxFly * vxFly + vyFly * vyFly);
        if (speed < 0.5) {
          vxFly = nx * 2;
          vyFly = ny * 2;
        }
        pet.classList.add('xsdoi-pet-bounce');
        setTimeout(function() { pet.classList.remove('xsdoi-pet-bounce'); }, 300);
        return true;
      }
    }
    return false;
  }

  // 带状模式：检测与轨迹线的碰撞（线段-圆碰撞）
  function checkRibbonCollision() {
    var pts = window.__xsdoiTrail && window.__xsdoiTrail.points || [];
    if (pts.length < 2) return false;
    var c = petCenter();
    var minDist = Infinity;
    var closestPoint = null;
    var trailDir = null;

    // 找到最近的轨迹段
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i - 1];
      var p1 = pts[i];
      if (!p0._alpha || !p1._alpha || p0._alpha < 0.1 || p1._alpha < 0.1) continue;
      // 点到线段的距离
      var dx = p1.x - p0.x;
      var dy = p1.y - p0.y;
      var lenSq = dx * dx + dy * dy;
      var t = lenSq > 0 ? Math.max(0, Math.min(1, ((c.x - p0.x) * dx + (c.y - p0.y) * dy) / lenSq)) : 0;
      var projX = p0.x + dx * t;
      var projY = p0.y + dy * t;
      var dist = Math.sqrt((c.x - projX) * (c.x - projX) + (c.y - projY) * (c.y - projY));
      if (dist < minDist) {
        minDist = dist;
        closestPoint = { x: projX, y: projY };
        trailDir = { x: dx, y: dy };
      }
    }

    if (!closestPoint || minDist > COLLISION_RADIUS) return false;

    // 碰撞！计算响应
    var nx = (c.x - closestPoint.x) / minDist || 0;
    var ny = (c.y - closestPoint.y) / minDist || 1;

    // 推送宠物到碰撞位置外
    px = c.x - PET_SIZE / 2 - nx * (COLLISION_RADIUS + 2);
    py = c.y - PET_SIZE / 2 - ny * (COLLISION_RADIUS + 2);
    clampToViewport();
    applyPos();

    // 检测宠物速度方向与轨迹方向的夹角
    var trailLen = Math.sqrt(trailDir.x * trailDir.x + trailDir.y * trailDir.y);
    if (trailLen > 0) {
      var trailNx = trailDir.x / trailLen;
      var trailNy = trailDir.y / trailLen;
      var speed = Math.sqrt(vxFly * vxFly + vyFly * vyFly);
      var dotProduct = vxFly * trailNx + vyFly * trailNy;

      if (speed > 0 && dotProduct / speed > SLIDE_THRESHOLD) {
        // 方向接近 → 滑行：速度沿轨迹方向，保留切线分量
        var slideSpeed = Math.abs(dotProduct) * 0.8;
        vxFly = trailNx * slideSpeed;
        vyFly = trailNy * slideSpeed;
      } else {
        // 方向不接近 → 反弹：沿法线反弹
        var vDot = vxFly * nx + vyFly * ny;
        vxFly = (vxFly - 2 * vDot * nx) * BOUNCE_DAMPING;
        vyFly = (vyFly - 2 * vDot * ny) * BOUNCE_DAMPING;
      }
    } else {
      // 轨迹点静止，反弹
      vxFly = nx * 2;
      vyFly = ny * 2;
    }

    pet.classList.add('xsdoi-pet-bounce');
    setTimeout(function() { pet.classList.remove('xsdoi-pet-bounce'); }, 300);
    return true;
  }

  // 主碰撞检测入口
  function checkTrailCollision() {
    if (!window.__xsdoiTrail) return;
    var mode = window.__xsdoiTrail.mode;
    if (mode === 'dots') {
      checkDotCollision();
    } else if (mode === 'ribbon') {
      checkRibbonCollision();
    }
  }

  // 松手时靠近屏幕边缘则吸附贴边
  function snapToEdge() {
    var snapped = false;
    if (px < SNAP) { px = MARGIN; snapped = true; }
    else if (px > vw - PET_SIZE - SNAP) { px = vw - PET_SIZE - MARGIN; snapped = true; }
    if (py < SNAP) { py = MARGIN; snapped = true; }
    else if (py > vh - PET_SIZE - SNAP) { py = vh - PET_SIZE - MARGIN; snapped = true; }
    if (snapped) applyPos();
  }

  // ---------- 初始化 ----------
  function load() {
    chrome.storage.sync.get([STORAGE_KEY, ENABLE_KEY, CROP_KEY], function (items) {
      enabled = items[ENABLE_KEY] !== false;
      crop = normalizeCrop(items[CROP_KEY]);
      var sp = items[STORAGE_KEY];
      if (sp) {
        if (typeof sp.x === 'number') pos.x = sp.x;
        if (typeof sp.y === 'number') pos.y = sp.y;
      }
      ensureContainer();
      measure();
      toPx();
      clampToViewport();
      applyPos();
      applyVisibility();
      // 读取自定义图片（storage.local）
      chrome.storage.local.get([IMG_KEY], function (loc) {
        if (typeof loc[IMG_KEY] === 'string' && loc[IMG_KEY]) {
          customImg = loc[IMG_KEY];
        }
        renderFace();
        nextJumpAt = Date.now() + 1000;
        pickTarget();
        loop();
      });
    });
  }

  // popup 开关 / 图片变化时实时响应
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes[ENABLE_KEY]) {
      enabled = changes[ENABLE_KEY].newValue !== false;
      applyVisibility();
    }
    if (area === 'sync' && changes[CROP_KEY]) {
      crop = normalizeCrop(changes[CROP_KEY].newValue);
      renderFace();
    }
    if (area === 'local' && changes[IMG_KEY]) {
      var v = changes[IMG_KEY].newValue;
      customImg = (typeof v === 'string' && v) ? v : null;
      renderFace();
    }
  });

  window.addEventListener('resize', function () {
    measure();
    clampToViewport();
    applyPos();
  });

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  document.head.appendChild(style);

  load();
})();
