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
//   - 双击宠物：打开聊天窗口，支持 Markdown + LaTeX，多会话管理，系统提示词可编辑
// ============================================================

(function () {
  'use strict';

  var CONTAINER_ID = 'xsdoi-web-pet';
  var STYLE_ID = 'xsdoi-web-pet-style';
  var STORAGE_KEY = 'webPet';           // { x: %, y: % }
  var ENABLE_KEY = 'webPetEnabled';     // popup「桌宠」面板开关
  var IMG_KEY = 'webPetImg';            // 自定义图片 dataURL（storage.local）
  var CROP_KEY = 'webPetCrop';          // 裁剪参数 { scale, cx, cy }（popup 可视化裁剪器）

  // 聊天相关 storage keys
  var SESSIONS_KEY = 'webPetSessions';          // {id, name, createdAt, updatedAt, messages[]}
  var CURRENT_SESSION_KEY = 'webPetCurrentSessionId';
  var SYSTEM_PROMPT_KEY = 'webPetSystemPrompt';
  var API_CONFIG_KEYS = ['webPetApiUrl', 'webPetModel', 'webPetApiKey'];

  // 默认系统提示词
  var DEFAULT_SYSTEM_PROMPT = [
    '你是一名编程助手，你需要用简体中文回答用户的消息（哪怕用户说的是英文）。',
    '你的回答需要遵循 Markdown 格式。',
    '公式格式用 LaTeX：行内公式用 $...$，独立公式用 $$...$$。',
    '代码块用 ``` 包裹，并注明编程语言，例如：\n```cpp\n// 代码\n```\n当用户没有指明编程语言时，默认使用 C++14。',
    '回答要清晰、简洁、有帮助。'
  ].join(' ');

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
    '#' + CONTAINER_ID + '.xsdoi-pet-idle .xsdoi-pet-body svg{animation:xsdoiPetBreathe 2.6s ease-in-out infinite;}',
    '@keyframes xsdoiPetBreathe{0%,100%{transform:scale(1);}50%{transform:scale(1.04);}}',
    '#' + CONTAINER_ID + ' .xsdoi-pet-eye{transform-box:fill-box;transform-origin:center;animation:xsdoiPetBlink 3.6s infinite;}',
    '@keyframes xsdoiPetBlink{0%,44%,56%,100%{transform:scaleY(1);}48%,52%{transform:scaleY(.08);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-bounce .xsdoi-pet-body{animation:xsdoiPetBounce .4s ease;}',
    '@keyframes xsdoiPetBounce{0%{transform:scale(1);}40%{transform:scale(.86);}100%{transform:scale(1);}}',
    '#' + CONTAINER_ID + '.xsdoi-pet-flying .xsdoi-pet-body{animation:xsdoiPetFly .55s ease-in;}',
    '@keyframes xsdoiPetFly{0%{transform:scale(1) rotate(0deg);}50%{transform:scale(.88,1.14) rotate(-8deg);}100%{transform:scale(1) rotate(0deg);}}',
    '#xsdoi-deepseek-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;display:flex;justify-content:center;align-items:center;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-card{position:relative;width:90vw;max-width:900px;height:90vh;max-height:700px;margin:auto;background:rgba(15,15,25,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:16px;display:flex;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-sidebar{width:200px;flex-shrink:0;border-right:1px solid rgba(255,255,255,0.1);display:flex;flex-direction:column;background:rgba(0,0,0,0.2);}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-sidebar-header{padding:12px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-sidebar-title{color:#fff;font-size:14px;font-weight:600;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-new-btn{width:24px;height:24px;border:none;background:rgba(96,165,250,0.8);color:#fff;border-radius:6px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-new-btn:hover{background:rgba(96,165,250,1);}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-list{flex:1;overflow-y:auto;padding:8px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item{padding:8px 12px;border-radius:8px;cursor:pointer;color:rgba(255,255,255,0.7);font-size:13px;margin-bottom:4px;word-break:break-all;display:flex;justify-content:space-between;align-items:center;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item:hover{background:rgba(255,255,255,0.1);}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item.active{background:rgba(96,165,250,0.3);color:#fff;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item .session-name{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:8px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item .session-preview{display:block;font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item .session-delete{width:20px;height:20px;border:none;background:transparent;color:rgba(255,255,255,0.4);border-radius:4px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item .session-delete:hover{background:rgba(243,139,168,0.3);color:#f38ba8;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item .session-rename{width:20px;height:20px;border:none;background:transparent;color:rgba(255,255,255,0.4);border-radius:4px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item .session-rename:hover{background:rgba(96,165,250,0.3);color:#60a5fa;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-session-item .session-actions{display:flex;align-items:center;gap:2px;flex-shrink:0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-main{flex:1;display:flex;flex-direction:column;min-width:0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-title{color:#fff;font-size:15px;font-weight:600;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-header-actions{display:flex;gap:8px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-icon-btn{width:28px;height:28px;border:none;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);border-radius:6px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-icon-btn:hover{background:rgba(255,255,255,0.2);color:#fff;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.6;word-break:break-word;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg.user{align-self:flex-end;background:rgba(96,165,250,0.6);color:#fff;border-radius:12px 12px 4px 12px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg.bot{align-self:flex-start;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.9);border-radius:12px 12px 12px 4px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg p{margin:0 0 8px 0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg p:last-child{margin-bottom:0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg pre{background:rgba(0,0,0,0.3);padding:12px;border-radius:8px;overflow-x:auto;margin:8px 0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg code{font-family:"Courier New",monospace;font-size:13px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg :not(pre) > code{background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px;font-size:13px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg h1,#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg h2,#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg h3,#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg h4{margin:12px 0 8px 0;font-size:16px;color:#fff;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg ul,#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg ol{margin:8px 0;padding-left:20px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg li{margin:4px 0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg table{border-collapse:collapse;width:100%;margin:8px 0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg th,#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg td{border:1px solid rgba(255,255,255,0.2);padding:6px 10px;text-align:left;font-size:13px;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-messages .xsdoi-ds-msg th{background:rgba(255,255,255,0.1);}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-input{padding:12px;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:8px;flex-shrink:0;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-input textarea{flex:1;padding:10px 14px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;font-size:14px;outline:none;resize:none;line-height:1.5;font-family:inherit;min-height:44px;max-height:140px;box-sizing:border-box;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-input button{padding:10px 20px;background:rgba(96,165,250,0.8);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-input button:disabled{opacity:0.5;cursor:not-allowed;}',
    '#xsdoi-deepseek-overlay .ds-typing{display:inline-block;animation:xsdoiDsBlink 1s steps(2) infinite;color:rgba(255,255,255,0.6);}',
    '@keyframes xsdoiDsBlink{0%,100%{opacity:1;}50%{opacity:0;}}',
    '#xsdoi-deepseek-overlay .xsdoi-ds-close{position:absolute;top:12px;right:12px;width:32px;height:32px;z-index:10;}',
    '#xsdoi-deepseek-overlay .katex{font-size:1em;}',
    '#xsdoi-deepseek-overlay .katex-display{margin:8px 0;overflow-x:auto;}',
    '#xsdoi-ds-prompt-modal{position:absolute;top:0;left:0;width:100%;height:100%;z-index:20;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;}',
    '#xsdoi-ds-prompt-modal .ds-prompt-box{background:rgba(20,20,30,0.98);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:20px;width:90%;max-width:500px;display:flex;flex-direction:column;gap:12px;}',
    '#xsdoi-ds-prompt-modal .ds-prompt-title{color:#fff;font-size:16px;font-weight:600;}',
    '#xsdoi-ds-prompt-modal textarea{width:100%;height:200px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;padding:12px;font-size:14px;resize:vertical;outline:none;font-family:monospace;}',
    '#xsdoi-ds-prompt-modal .ds-prompt-input{width:100%;box-sizing:border-box;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:#fff;padding:10px 12px;font-size:14px;outline:none;}',
    '#xsdoi-ds-prompt-modal .ds-prompt-input:focus{border-color:rgba(96,165,250,0.7);}',
    '#xsdoi-ds-prompt-modal .ds-prompt-actions{display:flex;justify-content:flex-end;gap:8px;}',
    '#xsdoi-ds-prompt-modal .ds-prompt-btn{padding:8px 16px;border-radius:6px;border:none;cursor:pointer;font-size:14px;}',
    '#xsdoi-ds-prompt-modal .ds-prompt-btn.cancel{background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);}',
    '#xsdoi-ds-prompt-modal .ds-prompt-btn.save{background:rgba(96,165,250,0.8);color:#fff;}',
    '#xsdoi-ds-empty{text-align:center;padding:40px 20px;color:rgba(255,255,255,0.4);font-size:14px;}'
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
  var raf = 0;
  var customImg = null; // 自定义图片 dataURL（storage.local webPetImg）
  // 圆形裁剪参数：scale = 放大倍数（圆直径 = 容器/scale），cx/cy = 裁剪中心（图片坐标 0-1）
  var crop = { scale: 2, cx: 0.5, cy: 0.5 };

  // 抛物线飞行状态
  var flying = false;
  var flyVx = 0, flyVy = 0;  // 飞行初速度（px/frame）
  var G = 0.15;              // 重力加速度（px/frame²，~60fps）
  // 拖拽轨迹采样，用于估算松手速度
  var dragSamples = [];
  // 抛物线运动中的瞬时速度（updateParabola 内部使用，需先声明）
  var pxFly = 0, pyFly = 0, vxFly = 0, vyFly = 0;

  // 轨迹碰撞参数
  var COLLISION_RADIUS = PET_SIZE / 2 + 4; // 宠物碰撞半径（减小避免穿模）
  var BOUNCE_DAMPING = 0.9;              // 反弹阻尼系数
  var BOUNCE_FORCE = 1.3;                // 反弹力倍增（30% 能量增益，过高会放大水平速度）
  var MAX_BOUNCE_VY = -18;               // 最大向上反弹速度
  var COLLISION_COOLDOWN = 6;            // 碰撞冷却帧数（避免反弹瞬移）
  var collisionCooldown = 0;             // 当前冷却计时器

  // 聊天状态
  var sessions = {};    // {sessionId: {id, name, createdAt, updatedAt, messages:[]}}
  var currentSessionId = null;
  var chatCfg = { apiUrl: 'https://api.deepseek.com', model: 'deepseek-chat', apiKey: '' };
  var systemPrompt = DEFAULT_SYSTEM_PROMPT;
  var loadedMarked = false;
  var loadedKaTeX = false;

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
    // 双击检测（pointerdown 时间戳，避开 setPointerCapture 拦截 dblclick）
    var lastDownTime = 0;
    pet.addEventListener('pointerdown', function (e) {
      var now = Date.now();
      if (now - lastDownTime < 350 && e.pointerType === 'mouse') {
        // 双击：打开聊天窗口
        lastDownTime = 0;
        openChat();
        return;
      }
      lastDownTime = now;
      onPointerDown(e);
    });
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
        var layout = function () {
          var ratio = (img.naturalWidth > 0 && img.naturalHeight > 0)
            ? img.naturalWidth / img.naturalHeight : 1;
          var w = PET_SIZE * crop.scale;
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
    var bounced = {};
    var oldPx = px, oldPy = py;
    px = Math.max(MARGIN, Math.min(vw - PET_SIZE - MARGIN, px));
    py = Math.max(MARGIN, Math.min(vh - PET_SIZE - MARGIN, py));
    if (px === MARGIN && oldPx < MARGIN) bounced.left = true;
    if (px === vw - PET_SIZE - MARGIN && oldPx > vw - PET_SIZE - MARGIN) bounced.right = true;
    if (py === MARGIN && oldPy < MARGIN) bounced.top = true;
    if (py === vh - PET_SIZE - MARGIN && oldPy > vh - PET_SIZE - MARGIN) bounced.bottom = true;
    return bounced;
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

  function step() {
    if (dragging) return;
    var now = Date.now();
    if (now < waitUntil) return;
    if (collisionCooldown > 0) collisionCooldown--;
    if (flying) {
      if (updateParabola()) return;
      applyPos();
      return;
    }
    // 散步时不响应鼠标尾迹（避免贴底走动时被尾迹弹跳）
    var dx = targetX - px;
    var dy = targetY - py;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 3) {
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
      pet.classList.remove('xsdoi-pet-bounce');
      void pet.offsetWidth;
      pet.classList.add('xsdoi-pet-bounce');
      pet.classList.add('xsdoi-pet-idle');
      waitUntil = Date.now() + 1200;
    } else {
      waitUntil = 0;
      var ground = groundY();
      if (py < ground - PET_SIZE / 2) {
        startParabolicFall();
      } else {
        pickTarget();
      }
    }
    dragSamples = [];
  }

  function startParabolicFall() {
    flying = true;
    vxFly = flyVx;
    vyFly = flyVy;
    pet.classList.remove('xsdoi-pet-idle', 'xsdoi-pet-walking');
    pet.classList.add('xsdoi-pet-flying');
    if (dragSamples.length >= 2) {
      var a = dragSamples[dragSamples.length - 2];
      var b = dragSamples[dragSamples.length - 1];
      var dt = b.t - a.t;
      if (dt > 0) {
        flyVx = (b.x - a.x) / dt * 16;
        flyVy = (b.y - a.y) / dt * 16;
      }
    }
    flyVy = flyVy * 0.6;
    flyVy = Math.max(-8, Math.min(8, flyVy));
    flyVx = Math.max(-4, Math.min(4, flyVx));
    vxFly = flyVx;
    vyFly = flyVy;
  }

  function updateParabola() {
    if (!flying) return false;
    vxFly += 0;
    vyFly += G;
    px += vxFly;
    py += vyFly;
    var bounds = clampToViewport();
    if (bounds.left || bounds.right) vxFly = -vxFly * BOUNCE_DAMPING;
    if (bounds.top) vyFly = -vyFly * BOUNCE_DAMPING;
    applyPos();
    checkTrailCollision();
    var ground = groundY();
    if (py >= ground) {
      py = ground;
      applyPos();
      flying = false;
      pet.classList.remove('xsdoi-pet-flying');
      pet.classList.remove('xsdoi-pet-bounce');
      void pet.offsetWidth;
      pet.classList.add('xsdoi-pet-bounce');
      setTimeout(function () {
        pet.classList.remove('xsdoi-pet-bounce');
      }, 400);
      pickTarget();
      return true;
    }
    return false;
  }

  // ============================================
  // 轨迹碰撞检测与响应
  // ============================================
  function petCenter() {
    return { x: px + PET_SIZE / 2, y: py + PET_SIZE / 2 };
  }

  function checkDotCollision() {
    if (collisionCooldown > 0) return;
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
        var nx = dx / dist;
        var ny = dy / dist;
        var pushDist = COLLISION_RADIUS + dotRadius + 1;
        px = c.x - PET_SIZE / 2 + nx * pushDist;
        py = c.y - PET_SIZE / 2 + ny * pushDist;
        clampToViewport();
        applyPos();
        var vDot = vxFly * nx + vyFly * ny;
        if (vDot < 0) {
          vxFly = (vxFly - 2 * vDot * nx) * BOUNCE_DAMPING * BOUNCE_FORCE;
          vyFly = (vyFly - 2 * vDot * ny) * BOUNCE_DAMPING * BOUNCE_FORCE;
        }
        vyFly = Math.max(MAX_BOUNCE_VY, vyFly);
        var speed = Math.sqrt(vxFly * vxFly + vyFly * vyFly);
        if (speed < 0.5) {
          vxFly = nx * 3;
          vyFly = ny * 3;
        }
        pet.classList.add('xsdoi-pet-bounce');
        setTimeout(function() { pet.classList.remove('xsdoi-pet-bounce'); }, 300);
        collisionCooldown = COLLISION_COOLDOWN;
        return true;
      }
    }
    return false;
  }

  function checkRibbonCollision() {
    if (collisionCooldown > 0) return;
    var pts = window.__xsdoiTrail && window.__xsdoiTrail.points || [];
    if (pts.length < 2) return false;
    var c = petCenter();
    var minDist = Infinity;
    var closestPoint = null;

    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i - 1];
      var p1 = pts[i];
      if (!p0._alpha || !p1._alpha || p0._alpha < 0.1 || p1._alpha < 0.1) continue;
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
      }
    }

    if (!closestPoint || minDist > COLLISION_RADIUS) return false;

    var nx = (c.x - closestPoint.x) / minDist || 0;
    var ny = (c.y - closestPoint.y) / minDist || 1;

    var pushDist = COLLISION_RADIUS + 1;
    px = c.x - PET_SIZE / 2 + nx * pushDist;
    py = c.y - PET_SIZE / 2 + ny * pushDist;
    clampToViewport();
    applyPos();

    var vDotN = vxFly * nx + vyFly * ny;
    if (vDotN < 0) {
      vxFly = (vxFly - 2 * vDotN * nx) * BOUNCE_DAMPING * BOUNCE_FORCE;
      vyFly = (vyFly - 2 * vDotN * ny) * BOUNCE_DAMPING * BOUNCE_FORCE;
    }

    vyFly = Math.max(MAX_BOUNCE_VY, vyFly);
    var newSpeed = Math.sqrt(vxFly * vxFly + vyFly * vyFly);
    if (newSpeed < 0.5) {
      vxFly = nx * 3;
      vyFly = ny * 3;
    }

    pet.classList.add('xsdoi-pet-bounce');
    setTimeout(function() { pet.classList.remove('xsdoi-pet-bounce'); }, 300);
    collisionCooldown = COLLISION_COOLDOWN;
    return true;
  }

  function checkTrailCollision() {
    if (!window.__xsdoiTrail) return;
    var mode = window.__xsdoiTrail.mode;
    if (mode === 'dots') {
      checkDotCollision();
    } else if (mode === 'ribbon') {
      checkRibbonCollision();
    }
  }

  function snapToEdge() {
    var snapped = false;
    if (px < SNAP) { px = MARGIN; snapped = true; }
    else if (px > vw - PET_SIZE - SNAP) { px = vw - PET_SIZE - MARGIN; snapped = true; }
    if (py < SNAP) { py = MARGIN; snapped = true; }
    else if (py > vh - PET_SIZE - SNAP) { py = vh - PET_SIZE - MARGIN; snapped = true; }
    if (snapped) applyPos();
  }

  // ============================================================
  // 聊天系统
  // ============================================================

  // 加载会话数据
  function loadSessions(callback) {
    chrome.storage.sync.get([SESSIONS_KEY, CURRENT_SESSION_KEY, SYSTEM_PROMPT_KEY, API_CONFIG_KEYS[0], API_CONFIG_KEYS[1], API_CONFIG_KEYS[2]], function (items) {
      sessions = items[SESSIONS_KEY] || {};
      currentSessionId = items[CURRENT_SESSION_KEY] || null;
      systemPrompt = items[SYSTEM_PROMPT_KEY] || DEFAULT_SYSTEM_PROMPT;
      chatCfg = {
        apiUrl: (items[API_CONFIG_KEYS[0]] && items[API_CONFIG_KEYS[0]].trim()) || 'https://api.deepseek.com',
        model: (items[API_CONFIG_KEYS[1]] && items[API_CONFIG_KEYS[1]].trim()) || 'deepseek-chat',
        apiKey: (items[API_CONFIG_KEYS[2]] && items[API_CONFIG_KEYS[2]].trim()) || ''
      };
      // 如果当前会话不存在，创建新会话
      if (!currentSessionId || !sessions[currentSessionId]) {
        createNewSession();
      }
      if (callback) callback();
    });
  }

  // 创建新会话
  function createNewSession() {
    var id = 'session_' + Date.now();
    var now = new Date().toLocaleString('zh-CN');
    sessions[id] = {
      id: id,
      name: '新会话 ' + Object.keys(sessions).length,
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    currentSessionId = id;
    chrome.storage.sync.set({
      [SESSIONS_KEY]: sessions,
      [CURRENT_SESSION_KEY]: id
    });
    return id;
  }

  // 保存会话
  function saveCurrentSession() {
    if (!currentSessionId || !sessions[currentSessionId]) return;
    sessions[currentSessionId].updatedAt = new Date().toLocaleString('zh-CN');
    chrome.storage.sync.set({
      [SESSIONS_KEY]: sessions,
      [CURRENT_SESSION_KEY]: currentSessionId
    });
  }

  // 生成 Markdown + LaTeX 渲染的 HTML
  function renderMessage(text) {
    if (!loadedMarked || !loadedKaTeX) return text;
    // CDN 加载失败时标志位也会被置 true，但全局对象不存在，需额外防御
    if (typeof marked === 'undefined' || typeof katex === 'undefined') return text;
    // 先用 marked 渲染 Markdown
    var html = marked.parse(text);
    // 再用 KaTeX 渲染 LaTeX
    html = html.replace(/\$\$([^$]+)\$\$/g, function (_, math) {
      try {
        return '<span class="katex-display">' + katex.renderToString(math.trim(), { displayMode: true }) + '</span>';
      } catch (e) {
        return '<code>' + math + '</code>';
      }
    });
    html = html.replace(/\$([^$]+)\$/g, function (_, math) {
      try {
        return katex.renderToString(math.trim(), { displayMode: false });
      } catch (e) {
        return '<code>' + math + '</code>';
      }
    });
    return html;
  }

  // marked 和 KaTeX 已通过 manifest content_scripts 静态注入（隔离世界内直接可用），
  // 无需再动态加载 CDN 脚本（MV3 CSP 禁止 content script 从外部域名加载 JS）。
  function loadChatLibraries(callback) {
    loadedMarked = true;
    loadedKaTeX = true;
    // marked 需要配置无风险模式
    if (typeof marked !== 'undefined' && typeof marked.setOptions === 'function') {
      marked.setOptions({ breaks: true, gfm: true });
    }
    if (callback) callback();
  }

  // 打开聊天窗口
  function openChat() {
    if (document.getElementById('xsdoi-deepseek-overlay')) return;

    loadSessions(function () {
      var overlay = document.createElement('div');
      overlay.id = 'xsdoi-deepseek-overlay';

      overlay.innerHTML = [
        '<div class="xsdoi-ds-backdrop"></div>',
        '<div class="xsdoi-ds-card">',
          '<button class="xsdoi-ds-close" title="关闭">×</button>',
          '<div class="xsdoi-ds-sidebar">',
            '<div class="xsdoi-ds-sidebar-header">',
              '<span class="xsdoi-ds-sidebar-title">会话</span>',
              '<button class="xsdoi-ds-new-btn" title="新建会话">+</button>',
            '</div>',
            '<div class="xsdoi-ds-session-list"></div>',
          '</div>',
          '<div class="xsdoi-ds-main">',
            '<div class="xsdoi-ds-header">',
              '<span class="xsdoi-ds-title">聊天</span>',
              '<div class="xsdoi-ds-header-actions"></div>',
            '</div>',
            '<div class="xsdoi-ds-messages" id="xsdoi-ds-messages"></div>',
            '<div class="xsdoi-ds-input">',
              '<textarea id="xsdoi-ds-input" placeholder="输入消息... (Enter 换行, Ctrl+Enter 发送)" autocomplete="off" rows="2"></textarea>',
              '<button id="xsdoi-ds-send">发送</button>',
            '</div>',
          '</div>',
        '</div>',
      ].join('');

      document.body.appendChild(overlay);

      var messagesDiv = overlay.querySelector('.xsdoi-ds-messages');
      var input = overlay.querySelector('#xsdoi-ds-input');
      var sendBtn = overlay.querySelector('#xsdoi-ds-send');
      var closeBtn = overlay.querySelector('.xsdoi-ds-close');
      var newBtn = overlay.querySelector('.xsdoi-ds-new-btn');
      var sessionList = overlay.querySelector('.xsdoi-ds-session-list');

      // 统一渲染会话列表（含重命名/删除按钮）
      renderSessionList(sessionList);

      // 更新新建按钮状态（空会话时禁用）
      function updateNewBtnState() {
        var session = sessions[currentSessionId];
        var isEmpty = !session || session.messages.length === 0;
        newBtn.disabled = isEmpty;
        newBtn.style.opacity = isEmpty ? '0.4' : '1';
        newBtn.title = isEmpty ? '当前会话为空，请先发送消息' : '新建会话';
      }

      // 加载标记和 KaTeX
      loadChatLibraries(function () {
        // 渲染当前会话的消息
        renderCurrentSession(messagesDiv);
        updateNewBtnState();
      });

      // 关闭按钮
      closeBtn.addEventListener('click', function () {
        overlay.remove();
      });
      overlay.querySelector('.xsdoi-ds-backdrop').addEventListener('click', function () {
        overlay.remove();
      });

      // 新建会话
      newBtn.addEventListener('click', function () {
        createNewSession();
        renderSessionList(sessionList);
        renderCurrentSession(messagesDiv);
        updateNewBtnState();
      });

      // 会话切换
      sessionList.addEventListener('click', function (e) {
        // 删除按钮
        var deleteBtn = e.target.closest('.session-delete');
        if (deleteBtn) {
          e.stopPropagation();
          var sid = deleteBtn.closest('.xsdoi-ds-session-item').dataset.sessionId;
          if (Object.keys(sessions).length <= 1) {
            // 最后一个会话，清空消息而不是删除（重置为默认名）
            sessions[sid].messages = [];
            sessions[sid].name = '新会话';
            saveCurrentSession();
            renderSessionList(sessionList);
            renderCurrentSession(messagesDiv);
            updateNewBtnState();
            return;
          }
          delete sessions[sid];
          if (currentSessionId === sid) {
            // 切换到第一个存在的会话
            var remaining = Object.keys(sessions);
            currentSessionId = remaining.length > 0 ? remaining[0] : null;
            if (!currentSessionId) {
              createNewSession();
            }
          }
          saveCurrentSession();
          renderSessionList(sessionList);
          renderCurrentSession(messagesDiv);
          updateNewBtnState();
          return;
        }
        // 切换会话
        var item = e.target.closest('.xsdoi-ds-session-item');
        if (!item) return;
        currentSessionId = item.dataset.sessionId;
        renderSessionList(sessionList);
        renderCurrentSession(messagesDiv);
        updateNewBtnState();
      });

      // 发送消息
      sendBtn.addEventListener('click', sendMessage);
      // Enter 换行，Ctrl/Meta+Enter 发送
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          sendMessage();
        }
      });

      // 输入框自动聚焦
      input.focus();

      function sendMessage() {
        var text = input.value.trim();
        if (!text) return;

        try {
          // 检查 API Key
          if (!chatCfg.apiKey) {
            appendMessage(messagesDiv, '请先在 popup「网页桌宠」中设置 API Key', 'bot');
            return;
          }

          // 添加用户消息
          appendMessage(messagesDiv, text, 'user');
          input.value = '';
          sendBtn.disabled = true;
          sendBtn.textContent = '...';

          // 保存到会话
          var session = sessions[currentSessionId];
          session.messages.push({ role: 'user', content: text });
          saveCurrentSession();
          renderSessionList(sessionList);

          // 构建消息列表（包含历史上下文）
          var messages = [
            { role: 'system', content: systemPrompt }
          ];
          // 只保留最近 20 条消息作为上下文（避免 token 过多）
          var recentMessages = session.messages.slice(-20);
          messages = messages.concat(recentMessages);

          var apiBase = chatCfg.apiUrl.trim().replace(/\/v1\/?$/, '');
          var botDiv = null;    // 流式输出的 bot 消息（懒创建）
          var fullReply = '';   // 完整回复（流结束后保存）

          // 滚动：仅在用户接近底部时自动跟随
          function scrollIfNearBottom() {
            var nearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < 60;
            if (nearBottom) messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }

          // 更新流式输出内容（带闪烁光标）
          function renderBotStream() {
            if (!botDiv) return;
            botDiv.innerHTML = renderMessage(fullReply.trim().replace(/\n{2,}/g, '\n\n')) + '<span class="ds-typing">▍</span>';
            scrollIfNearBottom();
          }

          fetch(apiBase + '/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + chatCfg.apiKey
            },
            body: JSON.stringify({
              model: chatCfg.model.trim() || 'deepseek-chat',
              messages: messages,
              temperature: 0.7,
              stream: true
            })
          })
          .then(function (res) {
            if (!res.ok) {
              return res.json().then(function (data) {
                throw new Error((data.error && data.error.message) || ('HTTP ' + res.status));
              });
            }
            // 服务端不支持流式时降级为 JSON 一次性返回
            var ct = res.headers.get('content-type') || '';
            if (ct.indexOf('text/event-stream') === -1) {
              return res.json().then(function (data) {
                if (data.error) throw new Error(data.error.message);
                fullReply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
                if (fullReply) {
                  botDiv = document.createElement('div');
                  botDiv.className = 'xsdoi-ds-msg bot';
                  messagesDiv.appendChild(botDiv);
                  botDiv.innerHTML = renderMessage(fullReply.trim().replace(/\n{2,}/g, '\n\n'));
                  scrollIfNearBottom();
                }
              });
            }
            // 流式：逐块读取 SSE（text/event-stream）
            var reader = res.body.getReader();
            var decoder = new TextDecoder('utf-8');
            var buffer = '';
            function pump() {
              return reader.read().then(function (result) {
                if (result.done) return;
                buffer += decoder.decode(result.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop();
                for (var i = 0; i < lines.length; i++) {
                  var line = lines[i].trim();
                  if (line.indexOf('data:') !== 0) continue;
                  var data = line.slice(5).trim();
                  if (data === '[DONE]') continue;
                  try {
                    var json = JSON.parse(data);
                    var delta = json.choices && json.choices[0] && json.choices[0].delta;
                    var content = delta && delta.content;
                    if (content) {
                      fullReply += content;
                      if (!botDiv) {
                        botDiv = document.createElement('div');
                        botDiv.className = 'xsdoi-ds-msg bot';
                        messagesDiv.appendChild(botDiv);
                      }
                      renderBotStream();
                    }
                  } catch (e) { /* 忽略不完整的 JSON 行 */ }
                }
                return pump();
              });
            }
            return pump();
          })
          .then(function () {
            // 流结束：保存完整回复到会话
            if (fullReply) {
              session.messages.push({ role: 'assistant', content: fullReply });
              saveCurrentSession();
              renderSessionList(sessionList);
            }
          })
          .catch(function (err) {
            console.error('[XSDOI] chat error:', err);
            if (fullReply) {
              // 已有部分内容：附上错误提示
              fullReply += '\n\n> ⚠️ ' + err.message;
              if (botDiv) {
                botDiv.innerHTML = renderMessage(fullReply.trim().replace(/\n{2,}/g, '\n\n'));
                scrollIfNearBottom();
              }
            } else {
              appendMessage(messagesDiv, '请求失败: ' + err.message, 'bot');
            }
          })
          .finally(function () {
            // 移除打字光标，显示最终内容
            if (botDiv && fullReply) {
              botDiv.innerHTML = renderMessage(fullReply.trim().replace(/\n{2,}/g, '\n\n'));
            }
            sendBtn.disabled = false;
            sendBtn.textContent = '发送';
            input.focus();
          });
        } catch (err) {
          // 兜底：任何同步异常都显示出来，避免「点了没反应」
          console.error('[XSDOI] sendMessage:', err);
          sendBtn.disabled = false;
          sendBtn.textContent = '发送';
          appendMessage(messagesDiv, '发送出错: ' + (err && err.message ? err.message : err), 'bot');
        }
      }

      function appendMessage(container, text, role) {
        // 往容器加消息时移除空态占位（发送消息开始对话）
        var emptyEl = container.querySelector('#xsdoi-ds-empty');
        if (emptyEl) emptyEl.remove();
        var div = document.createElement('div');
        div.className = 'xsdoi-ds-msg ' + (role === 'user' ? 'user' : 'bot');
        div.innerHTML = renderMessage(text.trim().replace(/\n{2,}/g, '\n\n'));
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
      }

      function renderCurrentSession(container) {
        container.innerHTML = '';
        var session = sessions[currentSessionId];
        if (!session || session.messages.length === 0) {
          container.innerHTML = '<div id="xsdoi-ds-empty">发送消息开始对话</div>';
          return;
        }
        for (var i = 0; i < session.messages.length; i++) {
          var msg = session.messages[i];
          appendMessage(container, msg.content, msg.role);
        }
      }

      function renderSessionList(container) {
        container.innerHTML = '';
        var sessionOrder = Object.keys(sessions).sort(function (a, b) {
          return sessions[b].updatedAt.localeCompare(sessions[a].updatedAt);
        });
        for (var i = 0; i < sessionOrder.length; i++) {
          var sid = sessionOrder[i];
          var s = sessions[sid];
          var isActive = sid === currentSessionId ? ' active' : '';
          var preview = '';
          if (s.messages.length > 0) {
            var lastMsg = s.messages[s.messages.length - 1];
            preview = lastMsg.content.substring(0, 30) + (lastMsg.content.length > 30 ? '...' : '');
          }
          var item = document.createElement('div');
          item.className = 'xsdoi-ds-session-item' + isActive;
          item.dataset.sessionId = sid;
          item.innerHTML = '<div style="flex:1;min-width:0;">' +
            '<span class="session-name">' + escapeHtml(s.name) + '</span>' +
            (preview ? '<span class="session-preview">' + escapeHtml(preview) + '</span>' : '') +
            '</div>' +
            '<div class="session-actions">' +
              '<button class="session-rename" title="重命名会话">✎</button>' +
              '<button class="session-delete" title="删除会话">×</button>' +
            '</div>';
          item.querySelector('.session-rename').addEventListener('click', function (e) {
            e.stopPropagation();
            renameSession(item.dataset.sessionId);
          });
          item.querySelector('.session-delete').addEventListener('click', function (e) {
            e.stopPropagation();
            var sid = item.dataset.sessionId;
            if (Object.keys(sessions).length <= 1) {
              // 最后一个会话：清空消息并重置为默认名（而不是保留旧名字）
              sessions[sid].messages = [];
              sessions[sid].name = '新会话';
              saveCurrentSession();
              renderSessionList(sessionList);
              renderCurrentSession(messagesDiv);
              updateNewBtnState();
              return;
            }
            delete sessions[sid];
            if (currentSessionId === sid) {
              var remaining = Object.keys(sessions);
              currentSessionId = remaining.length > 0 ? remaining[0] : null;
              if (!currentSessionId) {
                createNewSession();
              }
            }
            saveCurrentSession();
            renderSessionList(sessionList);
            renderCurrentSession(messagesDiv);
            updateNewBtnState();
          });
          item.addEventListener('click', function () {
            currentSessionId = this.dataset.sessionId;
            renderSessionList(container);
            renderCurrentSession(messagesDiv);
          });
          container.appendChild(item);
        }
      }

      // 重命名会话（弹窗输入新名称）
      function renameSession(sid) {
        var session = sessions[sid];
        if (!session) return;
        var modal = document.createElement('div');
        modal.id = 'xsdoi-ds-prompt-modal';
        modal.innerHTML =
          '<div class="ds-prompt-box">' +
            '<div class="ds-prompt-title">重命名会话</div>' +
            '<input class="ds-prompt-input" type="text" value="' + escapeHtml(session.name) + '" maxlength="40" autocomplete="off" placeholder="输入新的会话名称...">' +
            '<div class="ds-prompt-actions">' +
              '<button class="ds-prompt-btn cancel">取消</button>' +
              '<button class="ds-prompt-btn save">保存</button>' +
            '</div>' +
          '</div>';
        overlay.appendChild(modal);
        var input = modal.querySelector('.ds-prompt-input');
        input.focus();
        input.select();
        function close() { modal.remove(); }
        function save() {
          var name = input.value.trim();
          if (name) {
            sessions[sid].name = name;
            saveCurrentSession();
            renderSessionList(sessionList);
          }
          close();
        }
        modal.querySelector('.cancel').addEventListener('click', close);
        modal.querySelector('.save').addEventListener('click', save);
        modal.addEventListener('click', function (e) {
          if (e.target === modal) close();
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          else if (e.key === 'Escape') close();
        });
      }
    });
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
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
      chrome.storage.local.get([IMG_KEY], function (loc) {
        if (typeof loc[IMG_KEY] === 'string' && loc[IMG_KEY]) {
          customImg = loc[IMG_KEY];
        }
        renderFace();
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
