// ============================================================
// 网页桌宠 - content script（隔离世界）
//
// 在题目页注入一只可拖动的桌宠：
//   - 三套形象：像素猫 / 几何小精灵 / 代码小人（点击桌宠循环切换）
//   - 随机散步：页面底部区域自由走动，边缘折返，偶有停顿
//   - 鼠标拖动：Pointer 抓取拖动，松手停住，靠近屏幕边缘自动吸附
//   - 显隐联动：读取 storage.sync 的 editorToolEnabled（编辑器右上角
//     睁眼/闭眼按钮），睁眼显示 / 闭眼隐藏
//   - 持久化：形象、位置（视口百分比）存 storage.sync，刷新后保持
// ============================================================

(function () {
  'use strict';

  var CONTAINER_ID = 'xsdoi-web-pet';
  var STYLE_ID = 'xsdoi-web-pet-style';
  var STORAGE_KEY = 'webPet';           // { kind: 0-2, x: %, y: % }
  var ENABLE_KEY = 'editorToolEnabled'; // 与编辑器右上角按钮共用

  var PET_SIZE = 56;   // 显示尺寸 px
  var MARGIN = 8;      // 与视口边缘的最小间距 px
  var SNAP = 40;       // 距边缘小于该值则吸附 px
  var WALK_STEP = 2;   // 散步每帧移动 px
  var CLICK_DIST = 6;  // 拖动位移小于该值视为「点击」（切换形象）

  // ---------- 三套形象 SVG（viewBox 0 0 32 32） ----------
  // 眼睛元素统一带 xsdoi-pet-eye class，便于眨眼动画

  var SVG_PIXEL = [
    '<svg viewBox="0 0 32 32" width="56" height="56" shape-rendering="crispEdges">',
    '<path d="M6 11 L10 3 L14 11 Z" fill="#f59e0b"/>',
    '<path d="M18 11 L22 3 L26 11 Z" fill="#f59e0b"/>',
    '<rect x="5" y="8" width="22" height="21" rx="4" fill="#f59e0b"/>',
    '<rect class="xsdoi-pet-eye" x="9" y="14" width="5" height="5" fill="#1f2937"/>',
    '<rect class="xsdoi-pet-eye" x="18" y="14" width="5" height="5" fill="#1f2937"/>',
    '<rect x="13" y="20" width="6" height="4" fill="#1f2937"/>',
    '<rect x="7" y="22" width="4" height="3" fill="#fff7ed"/>',
    '<rect x="21" y="22" width="4" height="3" fill="#fff7ed"/>',
    '</svg>'
  ].join('');

  var SVG_GEOM = [
    '<svg viewBox="0 0 32 32" width="56" height="56">',
    '<path d="M16 1 L19.5 7 L16 10.5 L12.5 7 Z" fill="#93c5fd"/>',
    '<circle cx="16" cy="17" r="12" fill="#60a5fa"/>',
    '<circle class="xsdoi-pet-eye" cx="11" cy="15" r="3.2" fill="#1f2937"/>',
    '<circle class="xsdoi-pet-eye" cx="21" cy="15" r="3.2" fill="#1f2937"/>',
    '<circle cx="10.2" cy="14" r="1.1" fill="#dbeafe"/>',
    '<circle cx="20.2" cy="14" r="1.1" fill="#dbeafe"/>',
    '<path d="M12 21.5 Q16 24.5 20 21.5" stroke="#1f2937" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    '<circle cx="7" cy="20.5" r="2.4" fill="#f9a8d4"/>',
    '<circle cx="25" cy="20.5" r="2.4" fill="#f9a8d4"/>',
    '</svg>'
  ].join('');

  var SVG_CODE = [
    '<svg viewBox="0 0 32 32" width="56" height="56">',
    '<circle cx="16" cy="14" r="11" fill="#34d399"/>',
    '<text class="xsdoi-pet-eye" x="10" y="18" font-family="Consolas,monospace" font-size="9.5" font-weight="bold" fill="#064e3b">{</text>',
    '<text class="xsdoi-pet-eye" x="19" y="18" font-family="Consolas,monospace" font-size="9.5" font-weight="bold" fill="#064e3b">}</text>',
    '<rect x="14.5" y="25.5" width="3" height="5" fill="#064e3b"/>',
    '</svg>'
  ].join('');

  var KINDS = [SVG_PIXEL, SVG_GEOM, SVG_CODE];

  // ---------- 样式 ----------
  var CSS_TEXT = [
    '#' + CONTAINER_ID + '{position:fixed;left:0;top:0;z-index:2147483000;width:' + PET_SIZE + 'px;height:' + PET_SIZE + 'px;pointer-events:none;will-change:transform;}',
    '#' + CONTAINER_ID + ' .xsdoi-pet-body{width:100%;height:100%;pointer-events:auto;cursor:grab;user-select:none;-webkit-user-select:none;}',
    '#' + CONTAINER_ID + '.xsdoi-pet-dragging .xsdoi-pet-body{cursor:grabbing;}',
    '#' + CONTAINER_ID + '.xsdoi-pet-walking .xsdoi-pet-body{animation:xsdoiPetWalk .5s ease-in-out infinite alternate;}',
    '@keyframes xsdoiPetWalk{from{transform:translateY(0);}to{transform:translateY(-4px);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-idle .xsdoi-pet-body svg{animation:xsdoiPetBreathe 2.6s ease-in-out infinite;}',
    '@keyframes xsdoiPetBreathe{0%,100%{transform:scale(1);}50%{transform:scale(1.05);}}',
    '#' + CONTAINER_ID + ' .xsdoi-pet-eye{transform-box:fill-box;transform-origin:center;animation:xsdoiPetBlink 3.6s infinite;}',
    '@keyframes xsdoiPetBlink{0%,44%,56%,100%{transform:scaleY(1);}48%,52%{transform:scaleY(.08);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-left .xsdoi-pet-body svg{transform:scaleX(-1);}',
    '#' + CONTAINER_ID + ' svg{display:block;}'
  ].join('\n');

  // ---------- 状态 ----------
  var pet = null;      // 容器
  var body = null;     // 可交互本体
  var kind = 0;        // 当前形象
  var enabled = true;  // 是否显示（editorToolEnabled）
  var pos = { x: 80, y: 85 }; // 视口百分比（容器左上角）

  var vw = 0, vh = 0;  // 视口尺寸
  var px = 0, py = 0;  // 当前像素位置（容器左上角）

  var dragging = false;
  var pointerId = null;
  var dragDX = 0, dragDY = 0;
  var dragMoved = 0;

  var targetX = 0, targetY = 0; // 散步目标（px）
  var waitUntil = 0;            // 到达目标后的休息截止时间戳
  var raf = 0;

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

  function renderKind() {
    body.innerHTML = KINDS[kind];
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

  // ---------- 显隐联动（编辑器右上角睁眼/闭眼按钮） ----------
  function applyVisibility() {
    if (!pet) return;
    pet.style.display = enabled ? 'block' : 'none';
  }

  function cycleKind() {
    kind = (kind + 1) % KINDS.length;
    renderKind();
    saveState();
  }

  function saveState() {
    pos.x = px / Math.max(1, vw - PET_SIZE) * 100;
    pos.y = py / Math.max(1, vh - PET_SIZE) * 100;
    chrome.storage.sync.set({
      webPet: { kind: kind, x: pos.x, y: pos.y }
    });
  }

  // ---------- 随机散步 ----------
  function pickTarget() {
    var x1 = MARGIN;
    var x2 = vw - PET_SIZE - MARGIN;
    var y1 = Math.max(MARGIN, vh * 0.55);
    var y2 = vh - PET_SIZE - MARGIN;
    targetX = x1 + Math.random() * (x2 - x1);
    targetY = y1 + Math.random() * (y2 - y1);
    pet.classList.toggle('xsdoi-pet-left', targetX < px);
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
    if (dragMoved < CLICK_DIST) {
      // 原地点击 → 切换形象
      cycleKind();
      pet.classList.add('xsdoi-pet-idle');
      waitUntil = Date.now() + 1200;
    } else {
      // 拖完接着散步
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
    chrome.storage.sync.get([STORAGE_KEY, ENABLE_KEY], function (items) {
      enabled = items[ENABLE_KEY] !== false;
      var sp = items[STORAGE_KEY];
      if (sp) {
        if (typeof sp.kind === 'number') kind = sp.kind % KINDS.length;
        if (typeof sp.x === 'number') pos.x = sp.x;
        if (typeof sp.y === 'number') pos.y = sp.y;
      }
      ensureContainer();
      renderKind();
      measure();
      toPx();
      clampToViewport();
      applyPos();
      applyVisibility();
      pickTarget();
      loop();
    });
  }

  // 按钮状态变化时实时显隐
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'sync' && changes[ENABLE_KEY]) {
      enabled = changes[ENABLE_KEY].newValue !== false;
      applyVisibility();
    }
  });

  window.addEventListener('resize', function () {
    measure();
    clampToViewport();
    applyPos();
  });

  // 仅题目页生效（与编辑器右上角按钮同步）
  if (!/\/problem\//.test(location.pathname)) return;

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  document.head.appendChild(style);

  load();
})();
