// ============================================================
// 新赛道OI AC 动画替换 - content script
// 原理：
//   1. 站点在提交 Accepted 时，会在 <body> 下挂一个全屏 canvas 放烟花
//   2. 用 MutationObserver 逮到这个 canvas，作为「AC 了」的信号
//   3. 屏蔽原 canvas，换成自定义内容（图片+音频，或视频）淡入淡出
// ============================================================

(function () {
  'use strict';

  var AC = globalThis.AC_REPLACER;

  var config = { image: null, audio: null, video: null, videoMode: false, duration: 3000, fadeMs: 1000 };

  // 淡入/淡出时长（毫秒），0 表示无过渡
  function fadeMs() {
    var n = Number(config.fadeMs);
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }
  // 媒体需播放的毫秒数：停留 + 淡入淡出（2 * fadeMs）
  function mediaDurationNeeded(stayMs) {
    return Math.max(0, AC.normalizeDuration(stayMs)) + 2 * fadeMs();
  }
  var observer = null;
  var showing = false;        // 防止同一次 AC 重复触发
  var audio = null;           // 当前播放的音频实例
  var audioTimer = null;      // 音频截断定时器
  var blockedFirework = null; // 被屏蔽的原烟花 canvas，动画结束后清理

  // ---- 判断一个元素是不是原烟花的 canvas ----
  // 特征：全屏 fixed 定位 + 极高 z-index。站点可能微调具体数值，
  // 这里用阈值（>=90000）放宽，而不是死等 z-index === '99999'。
  function isFireworkCanvas(el) {
    if (el.tagName !== 'CANVAS') return false;
    var s = el.style;
    return s.position === 'fixed' && (parseInt(s.zIndex, 10) || 0) >= 90000;
  }

  // ---- 播放音频（data URL 或 http URL 都行）----
  function playAudio() {
    if (!config.audio) return;
    try {
      stopAudio();
      audio = new Audio(config.audio);
      audio.volume = 1;
      audio.play().catch(function () { /* 自动播放被拦时静默忽略 */ });
      // 只播「停留 N + 淡入淡出 2s」秒，到点截断
      audioTimer = setTimeout(stopAudio, mediaDurationNeeded(config.duration));
    } catch (e) { /* 忽略音频错误 */ }
  }

  // ---- 停止音频 ----
  function stopAudio() {
    if (audioTimer) { clearTimeout(audioTimer); audioTimer = null; }
    if (audio) {
      try { audio.pause(); } catch (e) {}
      audio = null;
    }
  }

  // ---- 创建全屏 overlay 容器 ----
  function createOverlay() {
    var overlay = document.createElement('div');
    var f = fadeMs();
    var initOpacity = f > 0 ? '0' : '1';
    var transition = f > 0 ? 'opacity ' + (f / 1000) + 's ease' : 'none';
    overlay.style.cssText =
      'position:fixed;inset:0;' +
      'display:flex;align-items:center;justify-content:center;' +
      'pointer-events:none;z-index:100000;' +
      'opacity:' + initOpacity + ';transition:' + transition + ';';
    document.body.appendChild(overlay);
    return overlay;
  }

  // ---- 触发淡入 ----
  function fadeIn(overlay) {
    if (fadeMs() <= 0) return; // 无过渡时 overlay 初始就是 opacity:1
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
      });
    });
  }

  // ---- 清理被屏蔽的原烟花 canvas，避免其在 DOM 中堆积 ----
  function removeBlockedFirework() {
    if (blockedFirework && blockedFirework.parentNode) {
      try { blockedFirework.remove(); } catch (e) {}
    }
    blockedFirework = null;
  }

  // ---- 调度淡出 + 完全淡出后停止媒体并移除 ----
  // 时间线：淡入 fadeMs + 停留 stay + 淡出 fadeMs
  function scheduleFadeOut(overlay, stay, onStopMedia) {
    var FADE = fadeMs();
    setTimeout(function () {
      overlay.style.opacity = '0'; // 淡出开始
    }, FADE + stay);

    setTimeout(function () {
      if (onStopMedia) onStopMedia(); // 停止媒体（音频/视频）
      overlay.remove();
      showing = false;
      removeBlockedFirework();
    }, 2 * FADE + stay);
  }

  // ---- 图片 + 音频模式 ----
  function showCustomImage() {
    if (showing) return;

    // 视频模式且配了视频 → 走视频
    if (config.videoMode && config.video) {
      showVideo();
      return;
    }

    if (!config.image) return;
    showing = true;

    var overlay = createOverlay();
    var img = document.createElement('img');
    img.src = config.image;
    img.draggable = false;
    img.style.cssText =
      'max-width:60vw;max-height:80vh;width:auto;height:auto;' +
      'object-fit:contain;user-select:none;';
    overlay.appendChild(img);

    var stay = AC.normalizeDuration(config.duration);

    // 加载超时兜底：图片既不 onload 也不 onerror 时，避免 showing 永久卡 true
    var cleanup = function () {
      clearTimeout(timeout);
      overlay.remove();
      showing = false;
      removeBlockedFirework();
    };
    var timeout = setTimeout(cleanup, AC.LIMITS.loadTimeoutMs);

    var start = function () {
      clearTimeout(timeout);
      fadeIn(overlay);
      playAudio(); // 淡入开始就播
      scheduleFadeOut(overlay, stay, stopAudio);
    };

    if (img.complete && img.naturalWidth > 0) {
      start(); // 已加载（data URL / 缓存），直接淡入
    } else {
      img.onload = start; // 远程图加载完再淡入
      img.onerror = cleanup;
    }
  }

  // ---- base64 → 字节数组 ----
  function base64ToBytes(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // ---- 从 background 分片读取 IndexedDB 视频，拼成 Blob ----
  // 每片单独解码成字节数组再拼接，避免分片边界处的 "=" padding 破坏 atob
  function loadIndexedVideo(cb) {
    var port = chrome.runtime.connect({ name: 'ac-media-stream' });
    var parts = [];
    var mime = 'video/mp4';
    var done = false;

    port.onMessage.addListener(function (msg) {
      if (!msg || done) return;
      if (msg.type === 'meta') {
        if (msg.mime) mime = msg.mime;
      } else if (msg.type === 'chunk') {
        parts.push(base64ToBytes(msg.data));
      } else if (msg.type === 'done') {
        done = true;
        port.disconnect();
        var total = 0;
        for (var i = 0; i < parts.length; i++) total += parts[i].length;
        var merged = new Uint8Array(total);
        var off = 0;
        for (var j = 0; j < parts.length; j++) {
          merged.set(parts[j], off);
          off += parts[j].length;
        }
        cb(new Blob([merged], { type: mime }));
      } else if (msg.type === 'error') {
        done = true;
        port.disconnect();
        cb(null);
      }
    });

    port.postMessage({ type: AC.MSG.videoLoad });
  }

  // ---- 视频模式 ----
  function showVideo() {
    if (showing) return;
    showing = true;

    var overlay = createOverlay();
    var video = document.createElement('video');
    video.playsInline = true;
    video.style.cssText =
      'max-width:60vw;max-height:80vh;width:auto;height:auto;' +
      'object-fit:contain;';
    overlay.appendChild(video);

    var stay = AC.normalizeDuration(config.duration);
    var objectUrl = null;

    // 加载超时兜底（含 metadata 一直不来 / IndexedDB 读取失败）
    var cleanup = function () {
      clearTimeout(timeout);
      try { video.pause(); } catch (e) {}
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      overlay.remove();
      showing = false;
      removeBlockedFirework();
    };
    var timeout = setTimeout(cleanup, AC.LIMITS.loadTimeoutMs);

    video.onloadedmetadata = function () {
      clearTimeout(timeout);
      // 短视频循环补足周期，长视频播到点截取
      video.loop = video.duration < mediaDurationNeeded(stay) / 1000;
      fadeIn(overlay);
      // 带声音播放（声音贯穿淡入 + 停留 + 淡出全程）；被自动播放策略拦截时回退静音，保证画面
      video.play().catch(function () {
        video.muted = true;
        video.play().catch(function () { /* 仍失败则放弃 */ });
      });
      scheduleFadeOut(overlay, stay, function () {
        try { video.pause(); } catch (e) {}
      });
    };
    video.onerror = cleanup;

    // 本地大文件走 IndexedDB（background 分片推送），URL / data URL 直接播
    if (config.video && config.video.__indexed) {
      loadIndexedVideo(function (blob) {
        if (!blob) {
          cleanup();
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        video.src = objectUrl;
      });
    } else {
      video.src = config.video;
    }
  }

  // ---- 当前有没有可显示的内容 ----
  function hasContent() {
    return (config.videoMode && config.video) || !!config.image;
  }

  // ---- 启动监听 ----
  function start() {
    if (!document.body) {
      setTimeout(start, 50);
      return;
    }
    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeType !== 1) continue; // 只要元素节点
          if (isFireworkCanvas(node)) {
            if (hasContent()) {
              node.style.display = 'none'; // 屏蔽原烟花
              blockedFirework = node;      // 记录，动画结束后清理
              showCustomImage();           // 显示自定义内容
            }
            // 没配内容时不动原烟花，保留默认动画
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- 加载配置 ----
  chrome.storage.local.get(AC.DEFAULTS, function (res) {
    config.image = res.image || null;
    config.audio = res.audio || null;
    config.video = res.video || null;
    config.videoMode = !!res.videoMode;
    config.duration = AC.normalizeDuration(res.duration);
    var fm = Number(res.fadeMs);
    if (!isFinite(fm) || fm < 0) fm = (res.fade === false ? 0 : AC.FADE_MS);
    config.fadeMs = fm;
    start();
  });

  // ---- 配置实时更新（用户在设置页保存后立即生效）----
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.image) config.image = changes.image.newValue || null;
    if (changes.audio) config.audio = changes.audio.newValue || null;
    if (changes.video) config.video = changes.video.newValue || null;
    if (changes.videoMode) config.videoMode = !!changes.videoMode.newValue;
    if (changes.duration) config.duration = AC.normalizeDuration(changes.duration.newValue);
    if (changes.fadeMs) {
      var fm2 = Number(changes.fadeMs.newValue);
      config.fadeMs = (isFinite(fm2) && fm2 >= 0) ? fm2 : 0;
    }
  });

  // ---- 测试播放：popup 里点「测试播放」会发这条消息过来 ----
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === AC.MSG.testPlay) {
      if (!hasContent()) {
        sendResponse({ ok: false, reason: 'no-image' });
        return;
      }
      showing = false; // 强制重置，确保测试一定能播
      showCustomImage();
      sendResponse({ ok: true });
    }
  });
})();
