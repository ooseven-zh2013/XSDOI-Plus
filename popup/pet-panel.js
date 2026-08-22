// ============================================================
// 网页桌宠设置面板 - popup
//
// 控制 storage.sync 的 webPetEnabled（显隐）与 webPetCrop（裁剪参数），
// storage.local 的 webPetImg（自定义图片 dataURL），供 content/web-pet.js 读取。
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
  var preview = document.getElementById('pet-preview');
  var cropper = document.getElementById('pet-cropper');
  var cropImg = document.getElementById('pet-crop-img');
  var mask = document.getElementById('pet-crop-mask');
  var circle = document.getElementById('pet-crop-circle');
  var handle = document.getElementById('pet-crop-handle');

  var currentCrop = Object.assign({}, DEFAULT_CROP);
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
    });
    chrome.storage.local.get([IMG_KEY], function (loc) {
      var v = loc[IMG_KEY];
      if (typeof v === 'string' && v) {
        hasImg = true;
        showPreview(v);
        setupCropper(v);
      } else {
        showEmpty();
      }
    });
  }

  // ---------- 预览（最终效果小圆球） ----------
  function showPreview(dataUrl) {
    preview.innerHTML = '<img src="' + dataUrl + '" alt="桌宠图片">';
  }

  function showEmpty() {
    preview.innerHTML = '<span>未设置<br>显示默认表情球</span>';
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
  }

  // 圆不越界
  function clampCircle() {
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
  var saveTimer = null;

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
    scheduleSave();
  });

  function endDrag(e) {
    if (!mode || e.pointerId !== pointerId) return;
    mode = null;
    try { circle.releasePointerCapture(pointerId); } catch (err) {}
    clearTimeout(saveTimer);
    saveCrop();
  }

  circle.addEventListener('pointerup', endDrag);
  circle.addEventListener('pointercancel', endDrag);

  // 拖动过程中防抖保存（200ms）
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCrop, 200);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function saveCrop() {
    applyCircleToCrop();
    chrome.storage.sync.set({
      webPetCrop: {
        scale: round2(currentCrop.scale),
        cx: round2(currentCrop.cx),
        cy: round2(currentCrop.cy)
      }
    });
  }

  // ---------- 显隐开关 ----------
  enabledEl.addEventListener('change', function () {
    chrome.storage.sync.set({ webPetEnabled: enabledEl.checked });
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
        showPreview(dataUrl);
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

  load();
})();
