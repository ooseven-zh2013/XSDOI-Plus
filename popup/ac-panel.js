// ============================================================
// AC 动画面板逻辑（移植自原「AC动画替换」options.js）
// 元素 id 与合并后的 popup.html 完全对齐，逻辑原样保留。
// ============================================================

(function () {
  'use strict';

  var AC = globalThis.AC_REPLACER;
  var acStore = globalThis.IDB_STORE.createStore('ac-replacer-media');

  var fileInput = document.getElementById('file');
  var btnPick = document.getElementById('btn-pick');
  var btnClear = document.getElementById('btn-clear');
  var btnTest = document.getElementById('btn-test');
  var urlInput = document.getElementById('url');
  var btnApplyUrl = document.getElementById('btn-apply-url');
  var preview = document.getElementById('preview');
  var durationInput = document.getElementById('duration');
  var toast = document.getElementById('toast');

  var fileAudio = document.getElementById('file-audio');
  var btnPickAudio = document.getElementById('btn-pick-audio');
  var btnClearAudio = document.getElementById('btn-clear-audio');
  var audioUrlInput = document.getElementById('audio-url');
  var btnApplyAudioUrl = document.getElementById('btn-apply-audio-url');
  var audioStatus = document.getElementById('audio-status');

  var videoModeInput = document.getElementById('video-mode');
  var fadeInput = document.getElementById('ac-fade');
  var mediaBlocks = document.getElementById('media-blocks');
  var videoBlock = document.getElementById('video-block');
  var fileVideo = document.getElementById('file-video');
  var btnPickVideo = document.getElementById('btn-pick-video');
  var btnClearVideo = document.getElementById('btn-clear-video');
  var videoUrlInput = document.getElementById('video-url');
  var btnApplyVideoUrl = document.getElementById('btn-apply-video-url');
  var videoStatus = document.getElementById('video-status');

  var toastTimer = null;
  var durationSaveTimer = null;

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  // ---- 封装 chrome.runtime.sendMessage 为 Promise ----
  function sendMessage(msg) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(msg, function (resp) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, reason: chrome.runtime.lastError.message });
        } else {
          resolve(resp);
        }
      });
    });
  }

  // ---- 回填已保存的配置 ----
  chrome.storage.local.get(AC.DEFAULTS, function (res) {
    if (res.image) {
      renderPreview(res.image);
      if (typeof res.image === 'string' && !res.image.startsWith('data:')) {
        urlInput.value = res.image; // 是云链接则回填到输入框
      }
    }
    if (res.audio) {
      updateAudioStatus(res.audio);
      if (typeof res.audio === 'string' && !res.audio.startsWith('data:')) {
        audioUrlInput.value = res.audio;
      }
    }
    if (res.video) {
      updateVideoStatus(res.video);
      if (typeof res.video === 'string' && !res.video.startsWith('data:')) {
        videoUrlInput.value = res.video;
      }
    }
    videoModeInput.checked = !!res.videoMode;
    applyVideoMode(!!res.videoMode);
    var fm0 = Number(res.fadeMs);
    if (!isFinite(fm0) || fm0 < 0) fm0 = (res.fade === false ? 0 : AC.FADE_MS);
    fadeInput.value = fm0 / 1000;
    durationInput.value = AC.normalizeDuration(res.duration) / 1000;
  });

  // ---- 预览 ----
  function renderPreview(dataUrl) {
    if (!dataUrl) {
      preview.innerHTML = '<span class="placeholder">还没有图片</span>';
      return;
    }
    var img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '预览';
    preview.innerHTML = '';
    preview.appendChild(img);
  }

  // ---- 选择图片 ----
  btnPick.addEventListener('click', function () { fileInput.click(); });

  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    if (f.size > AC.LIMITS.mediaBytes) {
      showToast('图片太大，请压缩到 8MB 以内');
      fileInput.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      chrome.storage.local.set({ image: dataUrl }, function () {
        renderPreview(dataUrl);
        showToast('图片已保存');
      });
    };
    reader.readAsDataURL(f);
  });

  // ---- 清除图片 ----
  btnClear.addEventListener('click', function () {
    chrome.storage.local.set({ image: null }, function () {
      renderPreview(null);
      fileInput.value = '';
      urlInput.value = '';
      showToast('已清除图片');
    });
  });

  // ---- 应用云链接 ----
  btnApplyUrl.addEventListener('click', function () {
    var url = urlInput.value.trim();
    if (!url) {
      showToast('请输入图片链接');
      return;
    }
    // 没写协议自动补 https://
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      urlInput.value = url;
    }
    // 先探测一下链接能不能加载
    var probe = new Image();
    probe.onload = function () {
      chrome.storage.local.set({ image: url }, function () {
        renderPreview(url);
        showToast('云链接已保存');
      });
    };
    probe.onerror = function () {
      showToast('链接加载失败，检查一下');
    };
    probe.src = url;
  });

  // ---- 音频状态显示 ----
  function updateAudioStatus(src) {
    if (!src) {
      audioStatus.textContent = '未设置音频';
      return;
    }
    audioStatus.textContent = src.startsWith('data:')
      ? '已设置（本地 mp3）'
      : '已设置（云链接）';
  }

  // ---- 校验音频时长并保存（需 ≥ 停留时长 + 2 秒）----
  function checkAndSaveAudio(src) {
    var needSec = AC.mediaDurationNeededMs(
      parseFloat(durationInput.value) * 1000,
      parseFloat(fadeInput.value) * 1000
    ) / 1000;
    var a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = function () {
      var dur = a.duration;
      if (isFinite(dur) && dur < needSec) {
        showToast(
          '音频太短：需 ≥ ' + needSec.toFixed(1) + ' 秒（当前 ' + dur.toFixed(1) + 's），换长音频或缩短显示时长'
        );
        return;
      }
      chrome.storage.local.set({ audio: src }, function () {
        updateAudioStatus(src);
        showToast('音频已保存');
      });
    };
    a.onerror = function () { showToast('音频读取失败，检查一下'); };
    a.src = src;
  }

  // ---- 选择音频 ----
  btnPickAudio.addEventListener('click', function () { fileAudio.click(); });

  fileAudio.addEventListener('change', function () {
    var f = fileAudio.files && fileAudio.files[0];
    if (!f) return;
    if (f.size > AC.LIMITS.mediaBytes) {
      showToast('音频太大，请压缩到 8MB 以内');
      fileAudio.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      checkAndSaveAudio(reader.result);
    };
    reader.readAsDataURL(f);
  });

  // ---- 清除音频 ----
  btnClearAudio.addEventListener('click', function () {
    chrome.storage.local.set({ audio: null }, function () {
      updateAudioStatus(null);
      fileAudio.value = '';
      audioUrlInput.value = '';
      showToast('已清除音频');
    });
  });

  // ---- 应用音频云链接 ----
  btnApplyAudioUrl.addEventListener('click', function () {
    var url = audioUrlInput.value.trim();
    if (!url) {
      showToast('请输入音频链接');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      audioUrlInput.value = url;
    }
    checkAndSaveAudio(url);
  });

  // ---- 视频模式开关 ----
  function applyVideoMode(on) {
    videoBlock.style.display = on ? '' : 'none';
    mediaBlocks.style.display = on ? 'none' : '';
  }
  videoModeInput.addEventListener('change', function () {
    var on = videoModeInput.checked;
    applyVideoMode(on);
    chrome.storage.local.set({ videoMode: on }, function () {
      showToast(on ? '已开启视频模式' : '已关闭视频模式');
    });
  });

  // ---- 淡入淡出时长（秒，0 = 无过渡）----
  var fadeSaveTimer = null;
  function saveFade() {
    var sec = parseFloat(fadeInput.value);
    if (isNaN(sec) || sec < 0) sec = 0;
    fadeInput.value = sec;
    chrome.storage.local.set({ fadeMs: Math.round(sec * 1000) }, function () {
      showToast(sec === 0 ? '已关闭淡入淡出' : '淡入淡出时长已保存');
    });
  }
  fadeInput.addEventListener('input', function () {
    clearTimeout(fadeSaveTimer);
    fadeSaveTimer = setTimeout(saveFade, 400);
  });
  fadeInput.addEventListener('change', function () {
    clearTimeout(fadeSaveTimer);
    saveFade();
  });

  // ---- 视频状态显示 ----
  function updateVideoStatus(src) {
    if (!src) {
      videoStatus.textContent = '未设置视频';
      return;
    }
    if (src && src.__indexed) {
      videoStatus.textContent = '已设置（本地视频）';
      return;
    }
    videoStatus.textContent = src.startsWith('data:')
      ? '已设置（本地视频）'
      : '已设置（云链接）';
  }

  // ---- 探测本地视频能否被浏览器实际播放（loadeddata 仍不够，HEVC 能加载数据但解码器拒绝，必须真 play）----
  function probeVideo(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
      // 必须 append 进 DOM 并保持 active，浏览器才会真正加载+解码；否则 src 不支持时 onerror 都不会触发
      v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(v);
      var settled = false;
      var timer = setTimeout(function () { finish({ code: 'TIMEOUT' }); }, 12000);
      function finish(err) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { v.pause(); } catch (e) {}
        try { v.remove(); } catch (e) {}
        URL.revokeObjectURL(url);
        if (err) reject(err); else resolve();
      }
      v.onerror = function () {
        // 4 = MEDIA_ERR_SRC_NOT_SUPPORTED，3 = MEDIA_ERR_DECODE
        var c = v.error && v.error.code;
        var code = c === 3 ? 'DECODE_FAIL' : 'SRC_NOT_SUPPORTED';
        finish({ code: code });
      };
      // canplay 后真 play() 一次：HEVC 这种「数据能加载、解码器不存在」的会在 play() 时被解码器拒绝
      v.oncanplay = function () {
        v.play().then(function () {
          finish(null);
        }).catch(function () {
          finish({ code: 'SRC_NOT_SUPPORTED' });
        });
      };
      v.src = url;
    });
  }

  // ---- 选择视频（本地大文件 → IndexedDB，避免 base64 膨胀）----
  btnPickVideo.addEventListener('click', function () { fileVideo.click(); });

  fileVideo.addEventListener('change', async function () {
    var f = fileVideo.files && fileVideo.files[0];
    if (!f) return;
    if (f.size > AC.LIMITS.videoBytes) {
      showToast('视频太大，请控制在 100MB 以内（大视频建议用云链接）');
      fileVideo.value = '';
      return;
    }
    try {
      // 先探测能否解码，浏览器解不了的（HEVC / 容器不兼容）直接拦下，避免「保存成功却播不了」
      await probeVideo(f);
      // 直写扩展 IndexedDB（popup 与 background 同 origin），绕开 64MB 消息上限
      await acStore.put('video', { mime: f.type || 'video/mp4', blob: f });
      // storage 只存标记，真正数据在 IndexedDB
      await chrome.storage.local.set({ video: { __indexed: true } });
      updateVideoStatus({ __indexed: true });
      showToast('视频已保存');
    } catch (e) {
      fileVideo.value = '';
      var code = e && e.code;
      if (code === 'SRC_NOT_SUPPORTED') {
        showToast('视频编码浏览器不支持（常见 HEVC/H.265），请转成 H.264 的 mp4 或 VP8/VP9 的 webm');
      } else if (code === 'DECODE_FAIL' || code === 'TIMEOUT') {
        showToast('视频文件无法解码，可能是损坏 / 截断 / 格式异常，请重新转码');
      } else {
        showToast('视频保存失败，请重试');
      }
    }
  });

  // ---- 清除视频 ----
  btnClearVideo.addEventListener('click', async function () {
    try {
      await sendMessage({ type: AC.MSG.videoClear });
    } catch (e) { /* 忽略 */ }
    chrome.storage.local.set({ video: null }, function () {
      updateVideoStatus(null);
      fileVideo.value = '';
      videoUrlInput.value = '';
      showToast('已清除视频');
    });
  });

  // ---- 应用视频云链接 ----
  btnApplyVideoUrl.addEventListener('click', function () {
    var url = videoUrlInput.value.trim();
    if (!url) {
      showToast('请输入视频链接');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      videoUrlInput.value = url;
    }
    var probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = function () {
      chrome.storage.local.set({ video: url }, function () {
        updateVideoStatus(url);
        showToast('视频云链接已保存');
      });
    };
    probe.onerror = function () {
      showToast('视频链接加载失败，检查一下');
    };
    probe.src = url;
  });

  // ---- 设置秒数（input 实时保存 + 防抖）----
  function saveDuration() {
    var sec = parseFloat(durationInput.value);
    if (isNaN(sec) || sec < 0) sec = 0;
    if (sec > 60) sec = 60;
    durationInput.value = sec;
    chrome.storage.local.set({ duration: Math.round(sec * 1000) }, function () {
      showToast('时长已保存');
    });
  }
  durationInput.addEventListener('input', function () {
    clearTimeout(durationSaveTimer);
    durationSaveTimer = setTimeout(saveDuration, 400);
  });
  durationInput.addEventListener('change', function () {
    clearTimeout(durationSaveTimer);
    saveDuration();
  });

  // ---- 测试播放：发消息给当前页面的 content script ----
  btnTest.addEventListener('click', function () {
    chrome.storage.local.get({ image: null, video: null, videoMode: false }, function (res) {
      var hasContent = (res.videoMode && res.video) || res.image;
      if (!hasContent) {
        showToast(res.videoMode ? '请先设置视频' : '请先选择图片');
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab || !tab.id) {
          showToast('找不到当前页面');
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: AC.MSG.testPlay }, function (resp) {
          if (chrome.runtime.lastError) {
            // content script 不在该页 → 当前页不是 xsdoi.com
            showToast('当前页面不是 OJ，去 xsdoi.com 再试');
            return;
          }
          if (resp && resp.ok) {
            window.close(); // 关闭弹窗，让用户看到页面上的效果
          } else {
            showToast('播放失败，请重试');
          }
        });
      });
    });
  });
})();
