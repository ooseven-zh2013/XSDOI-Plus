// ============================================================
// 网页桌宠设置面板 - popup
//
// 控制 storage.sync 的 webPetEnabled（显隐）与 storage.local 的
// webPetImg（自定义图片 dataURL），供 content/web-pet.js 读取。
// 图片上限 2MB（与点击特效一致，避免撑爆 storage.local 配额）。
// ============================================================

(function () {
  'use strict';

  var ENABLE_KEY = 'webPetEnabled';
  var IMG_KEY = 'webPetImg';
  var IMG_MAX_BYTES = 2 * 1024 * 1024;

  var enabledEl = document.getElementById('pet-enabled');
  var pickBtn = document.getElementById('pet-img-pick');
  var clearBtn = document.getElementById('pet-img-clear');
  var fileInput = document.getElementById('pet-img-file');
  var preview = document.getElementById('pet-preview');

  // ---------- 加载当前状态 ----------
  function load() {
    chrome.storage.sync.get([ENABLE_KEY], function (sync) {
      enabledEl.checked = sync[ENABLE_KEY] !== false;
    });
    chrome.storage.local.get([IMG_KEY], function (loc) {
      var v = loc[IMG_KEY];
      if (typeof v === 'string' && v) {
        showPreview(v);
      } else {
        showEmpty();
      }
    });
  }

  // ---------- 预览 ----------
  function showPreview(dataUrl) {
    preview.innerHTML = '<img src="' + dataUrl + '" alt="桌宠图片">';
  }

  function showEmpty() {
    preview.innerHTML = '<span>未设置<br>显示默认表情球</span>';
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
      chrome.storage.local.set({ webPetImg: dataUrl }, function () {
        showPreview(dataUrl);
      });
    };
    reader.readAsDataURL(file);
    fileInput.value = '';
  });

  // ---------- 清除图片 ----------
  clearBtn.addEventListener('click', function () {
    chrome.storage.local.remove(IMG_KEY, function () {
      showEmpty();
    });
  });

  load();
})();
