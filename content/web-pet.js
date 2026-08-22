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
    '@keyframes xsdoiPetBounce{0%{transform:scale(1);}40%{transform:scale(.86);}100%{transform:scale(1);}}'
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
      pickTarget();
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
