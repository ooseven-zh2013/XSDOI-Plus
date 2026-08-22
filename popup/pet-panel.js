// ============================================================
// 网页桌宠设置面板 - popup
//
// 控制 storage.sync 的 webPetEnabled（显隐）与 webPetCrop（裁剪参数），
// storage.local 的 webPetImg（自定义图片 dataURL），供 content/web-pet.js 读取。
// 开关与裁剪为草稿模式：界面调整不写 storage，点「保存配置」立即应用并持久化；
// 选择 / 清除图片仍立即生效。
//
// 裁剪交互：原图上套一个可拖动、可缩放的圆，
//   - 拖动圆内部 → 移动裁剪中心
//   - 拖动右下角小点 → 缩放圆（裁剪范围）
// 圆即表示圆形裁剪区域，换算为 { scale, cx, cy } 存储：
//   scale = 放大倍数（圆直径 = 圆球容器 / scale）
//   cx/cy = 裁剪中心在图片上的位置（0-1）
// 图片上限 2MB（与点击特效一致，避免撑爆 storage.local 配额）。
// ============================================================

(function () {
  'use strict';

  var ENABLE_KEY = 'webPetEnabled';
  var IMG_KEY = 'webPetImg';
  var CROP_KEY = 'webPetCrop';
  var IMG_MAX_BYTES = 2 * 1024 * 1024;
  var DEFAULT_CROP = { scale: 2, cx: 0.5, cy: 0.5 };
  var SCALE_MIN = 1;
  var SCALE_MAX = 8;
  var MIN_R = 8; // 圆最小半径 px

  var enabledEl = document.getElementById('pet-enabled');
  var pickBtn = document.getElementById('pet-img-pick');
  var clearBtn = document.getElementById('pet-img-clear');
  var fileInput = document.getElementById('pet-img-file');
  var cropper = document.getElementById('pet-cropper');
  var cropImg = document.getElementById('pet-crop-img');
  var mask = document.getElementById('pet-crop-mask');
  var circle = document.getElementById('pet-crop-circle');
  var handle = document.getElementById('pet-crop-handle');

  var currentCrop = Object.assign({}, DEFAULT_CROP); // 界面草稿值（保存时才应用）
  var savedCrop = Object.assign({}, DEFAULT_CROP);   // 已持久化值
  var savedEnabled = true;
  var hasImg = false;

  // 图片在裁剪器中的 contain 显示区域（容器坐标）
  var disp = { offsetX: 0, offsetY: 0, w: 0, h: 0 };
  // 圆状态（容器坐标）
  var ox = 85, oy = 85, R = 42;

  // ---------- 加载当前状态 ----------
  function load() {
    chrome.storage.sync.get([ENABLE_KEY, CROP_KEY], function (sync) {
      enabledEl.checked = sync[ENABLE_KEY] !== false;
      if (sync[CROP_KEY] && typeof sync[CROP_KEY] === 'object') {
        var c = sync[CROP_KEY];
        if (typeof c.scale === 'number') currentCrop.scale = c.scale;
        if (typeof c.cx === 'number') currentCrop.cx = c.cx;
        if (typeof c.cy === 'number') currentCrop.cy = c.cy;
      }
      savedEnabled = enabledEl.checked;
      savedCrop = Object.assign({}, currentCrop);
      updateSaveState();
    });
    chrome.storage.local.get([IMG_KEY], function (loc) {
      var v = loc[IMG_KEY];
      if (typeof v === 'string' && v) {
        hasImg = true;
        setupCropper(v);
      } else {
        showEmpty();
      }
    });
  }

  // ---------- 空态 ----------
  function showEmpty() {
    cropper.style.display = 'none';
  }

  // ---------- 裁剪器几何 ----------
  // 图片 contain 显示区域（自然尺寸 → 容器内的 offset/尺寸）
  function computeDisplay() {
    var CW = cropper.clientWidth;
    var CH = cropper.clientHeight;
    var nw = cropImg.naturalWidth || 1;
    var nh = cropImg.naturalHeight || 1;
    var fit = Math.min(CW / nw, CH / nh);
    disp.w = nw * fit;
    disp.h = nh * fit;
    disp.offsetX = (CW - disp.w) / 2;
    disp.offsetY = (CH - disp.h) / 2;
  }

  // crop 参数 → 圆位置
  function applyCropToCircle() {
    computeDisplay();
    // 视图隐藏时容器宽高为 0，此时不算圆的几何，保留上一次有效状态
    if (disp.w <= 0 || disp.h <= 0) return;
    R = Math.max(MIN_R, disp.w / (2 * currentCrop.scale));
    ox = disp.offsetX + currentCrop.cx * disp.w;
    oy = disp.offsetY + currentCrop.cy * disp.h;
    clampCircle();
    renderCircle();
  }

  // 圆位置 → crop 参数
  function applyCircleToCrop() {
    currentCrop.scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, disp.w / (2 * R)));
    currentCrop.cx = Math.max(0, Math.min(1, (ox - disp.offsetX) / disp.w));
    currentCrop.cy = Math.max(0, Math.min(1, (oy - disp.offsetY) / disp.h));
    // 以换算后的参数重画圆，保持圆与 disp/scale 同步，避免残留旧几何
    applyCropToCircle();
  }

  // 圆不越界
  function clampCircle() {
    if (disp.w <= 0 || disp.h <= 0) return;
    var maxR = Math.min(disp.w, disp.h) / 2;
    R = Math.max(MIN_R, Math.min(maxR, R));
    ox = Math.max(disp.offsetX + R, Math.min(disp.offsetX + disp.w - R, ox));
    oy = Math.max(disp.offsetY + R, Math.min(disp.offsetY + disp.h - R, oy));
  }

  function renderCircle() {
    circle.style.left = (ox - R) + 'px';
    circle.style.top = (oy - R) + 'px';
    circle.style.width = (2 * R) + 'px';
    circle.style.height = (2 * R) + 'px';
    // 圈外压暗，圈内为选中区域
    mask.style.clipPath = 'circle(' + R + 'px at ' + ox + 'px ' + oy + 'px)';
  }

  // ---------- 拖动 / 缩放 ----------
  var mode = null;       // 'move' | 'resize'
  var pointerId = null;
  var startX = 0, startY = 0;
  var startOx = 0, startOy = 0;
  var draftTimer = null;

  circle.addEventListener('pointerdown', function (e) {
    mode = (e.target === handle) ? 'resize' : 'move';
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startOx = ox;
    startOy = oy;
    try { circle.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });

  circle.addEventListener('pointermove', function (e) {
    if (!mode || e.pointerId !== pointerId) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    if (mode === 'move') {
      ox = startOx + dx;
      oy = startOy + dy;
    } else {
      // 缩放：圆心不动，半径 = 圆心到鼠标距离
      var rect = cropper.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      R = Math.max(MIN_R, Math.sqrt((mx - ox) * (mx - ox) + (my - oy) * (my - oy)));
    }
    clampCircle();
    renderCircle();
    scheduleDraft();
  });

  function endDrag(e) {
    if (!mode || e.pointerId !== pointerId) return;
    mode = null;
    try { circle.releasePointerCapture(pointerId); } catch (err) {}
    applyCircleToCrop();
    updateSaveState();
  }

  circle.addEventListener('pointerup', endDrag);
  circle.addEventListener('pointercancel', endDrag);

  // 拖动过程中防抖换算草稿参数并刷新保存按钮状态（不写 storage）
  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      applyCircleToCrop();
      updateSaveState();
    }, 100);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // ---------- 保存按钮（草稿模式：点击立即应用并持久化） ----------
  var saveBtn = document.getElementById('pet-save');
  var flashTimer = null;

  // 保存按钮反馈：与其他面板一致，按钮内联显示状态，不弹窗
  function flashSaveBtn(cls, text) {
    saveBtn.classList.remove('saved', 'save-error', 'dirty');
    saveBtn.classList.add(cls);
    saveBtn.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      saveBtn.classList.remove('saved', 'save-error');
      saveBtn.textContent = '保存配置';
    }, 1200);
  }

  // 草稿与已保存值有差异时高亮保存按钮
  function updateSaveState() {
    var dirty = (enabledEl.checked !== savedEnabled) ||
      Math.abs(currentCrop.scale - savedCrop.scale) > 0.0001 ||
      Math.abs(currentCrop.cx - savedCrop.cx) > 0.0001 ||
      Math.abs(currentCrop.cy - savedCrop.cy) > 0.0001;
    saveBtn.classList.toggle('dirty', dirty);
    saveBtn.classList.remove('saved');
  }

  enabledEl.addEventListener('change', updateSaveState);

  saveBtn.addEventListener('click', function () {
    applyCircleToCrop();
    var next = {
      scale: round2(currentCrop.scale),
      cx: round2(currentCrop.cx),
      cy: round2(currentCrop.cy)
    };
    chrome.storage.sync.set({ webPetEnabled: enabledEl.checked, webPetCrop: next }, function () {
      if (chrome.runtime.lastError) {
        flashSaveBtn('save-error', '保存失败，请重试');
        return;
      }
      savedEnabled = enabledEl.checked;
      savedCrop = next;
      currentCrop = Object.assign({}, next);
      updateSaveState();
      flashSaveBtn('saved', '已保存 ✓');
    });
  });

  // ---------- 图片上传 ----------
  pickBtn.addEventListener('click', function () {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (file.size > IMG_MAX_BYTES) {
      alert('图片过大：请选择 2MB 以内的图片');
      fileInput.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      hasImg = true;
      chrome.storage.local.set({ webPetImg: dataUrl }, function () {
        setupCropper(dataUrl);
      });
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  // ---------- 清除图片 ----------
  clearBtn.addEventListener('click', function () {
    hasImg = false;
    chrome.storage.local.remove(IMG_KEY, function () {
      showEmpty();
      cropImg.removeAttribute('src');
    });
  });

  // 图片加载完成后初始化圆（位置/大小按保存的裁剪参数）
  function setupCropper(dataUrl) {
    cropImg.src = dataUrl;
  }
  cropImg.addEventListener('load', function () {
    cropper.style.display = 'block';
    applyCropToCircle();
  });

  // popup 打开默认停在首个视图，宠物视图隐藏时容器宽度为 0，
  // 图片若在隐藏期间加载完成，圆的几何会算成全 0（圆框钉在左上角、
  // 拖动也被零尺寸钳死）。监听容器尺寸变化，一旦可见就重算圆。
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () {
      if (hasImg && cropper.style.display !== 'none') applyCropToCircle();
    }).observe(cropper);
  } else {
    var petNav = document.querySelector('.nav-item[data-view="pet"]');
    if (petNav) {
      petNav.addEventListener('click', function () {
        if (hasImg && cropper.style.display !== 'none') applyCropToCircle();
      });
    }
  }

  load();
})();
