// ============================================================
// 新赛道OI-背景替换 - content script
// 原理：在 body 最底层插入 z-index:-1 的固定背景层。
//   - 图片 / gif：cover / contain 用 <img>（object-fit），repeat 用 background 平铺
//   - 视频：<video autoplay loop muted playsinline>，本地大文件走 IndexedDB
//   - 纯色：background-color 纯色壁纸（仅图片/纯色模式，视频模式禁用）
// ============================================================

(function () {
  'use strict';

  var BG = globalThis.BG_REPLACER;

  var LAYER_ID = 'xsdoi-bg-layer';

  // ---- 获取 / 创建背景层 ----
  function getLayer() {
    var el = document.getElementById(LAYER_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = LAYER_ID;
      el.style.cssText =
        'position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;';
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }

  function removeLayer() {
    var el = document.getElementById(LAYER_ID);
    if (el) el.remove();
  }

  // ---- 图片 / gif ----
  function applyImage(l, src, fit) {
    l.innerHTML = '';
    l.style.backgroundImage = 'none';

    if (fit === 'repeat') {
      l.style.backgroundImage = 'url("' + src + '")';
      l.style.backgroundSize = 'auto';
      l.style.backgroundRepeat = 'repeat';
      l.style.backgroundPosition = '0 0';
      return;
    }

    var img = document.createElement('img');
    img.src = src;
    img.draggable = false;
    img.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'object-fit:' + (fit === 'contain' ? 'contain' : 'cover') + ';';
    l.appendChild(img);
  }

  // ---- 纯色壁纸 ----
  function applyColor(l, color) {
    l.innerHTML = '';
    l.style.backgroundImage = 'none';
    l.style.backgroundColor = color || '#0e1018';
  }

  // ---- 渐变壁纸 ----
  function applyGradient(l, from, to, dir) {
    l.innerHTML = '';
    l.style.backgroundColor = 'transparent';
    var angle = {
      'left-right': 'to right',
      'top-bottom': 'to bottom',
      'tl-br': 'to bottom right',
      'tr-bl': 'to bottom left'
    }[dir] || 'to right';
    l.style.backgroundImage =
      'linear-gradient(' + angle + ', ' + (from || '#0e1018') + ', ' + (to || '#2d8cf0') + ')';
  }

  // ---- base64 → Blob ----
  function base64ToBlob(b64, type) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }

  // ---- 从 background 分片读取 IndexedDB 大文件（视频 / 音频）----
  function loadIndexedMedia(key, fallbackMime, cb) {
    var port = chrome.runtime.connect({ name: 'bg-media-stream' });
    var chunks = [];
    var mime = fallbackMime;
    var done = false;

    port.onMessage.addListener(function (msg) {
      if (!msg || done) return;
      if (msg.type === 'meta') {
        if (msg.mime) mime = msg.mime;
      } else if (msg.type === 'chunk') {
        chunks.push(msg.data);
      } else if (msg.type === 'done') {
        done = true;
        port.disconnect();
        cb(base64ToBlob(chunks.join(''), mime));
      } else if (msg.type === 'error') {
        done = true;
        port.disconnect();
      }
    });

    port.postMessage({ type: BG.MSG.load, key: key });
  }

  // ---- 视频 ----
  function applyVideo(l, src, fit) {
    l.innerHTML = '';
    l.style.backgroundImage = 'none';

    var video = document.createElement('video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;      // muted 才能自动播放
    video.playsInline = true;
    video.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;' +
      'object-fit:' + (fit === 'contain' ? 'contain' : 'cover') + ';';
    l.appendChild(video);

    if (src && src.__indexed) {
      // 本地大文件从 IndexedDB 分片读取
      loadIndexedMedia('bg-media', 'video/mp4', function (blob) {
        video.src = URL.createObjectURL(blob);
      });
    } else {
      video.src = src;
    }
  }

  // ==================== 背景音乐（仅图片模式）====================
  var currentAudio = null;

  function stopAudio() {
    if (currentAudio) {
      try { currentAudio.pause(); } catch (e) {}
      currentAudio = null;
    }
  }

  // 自动播放被浏览器拦截时，等用户第一次点击/按键/触摸后自动开始
  function unlockThenPlay(audio) {
    function cleanup() {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    }
    function unlock() {
      if (audio !== currentAudio) { cleanup(); return; }
      audio.play().catch(function () { /* 仍失败则放弃 */ });
      cleanup();
    }
    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, true);
  }

  function tryPlay(audio) {
    audio.play().then(function () {
      // 播放成功，循环由 loop 属性接管
    }).catch(function () {
      // 被拦截：等首次用户交互后重试
      if (audio === currentAudio) unlockThenPlay(audio);
    });
  }

  function playAudio(src) {
    stopAudio();
    if (!src) return;

    var audio = new Audio();
    audio.loop = true;      // 后台循环播放
    audio.volume = 1;
    audio.preload = 'auto';
    currentAudio = audio;

    if (src && src.__indexed) {
      // 本地大文件从 IndexedDB 分片读取（key='audio'）
      loadIndexedMedia('bg-audio', 'audio/mpeg', function (blob) {
        audio.src = URL.createObjectURL(blob);
        tryPlay(audio);
      });
    } else {
      audio.src = src;
      tryPlay(audio);
    }
  }

  // ---- 背景音乐开关（纯色/渐变/图片模式共用）----
  function playOrStop(audioSrc) {
    if (audioSrc) {
      playAudio(audioSrc);
    } else {
      stopAudio();
    }
  }

  // ---- 应用配置 ----
  function apply(config) {
    var type = config.bgType;
    var src = config.bgSrc;
    var fit = config.bgFit || 'cover';
    var color = config.bgColor;
    var color2 = config.bgColor2;
    var direction = config.bgDirection;

    if (!type || type === 'none') {
      removeLayer();
      stopAudio();
      return;
    }
    // 纯色/渐变模式不需要 src；图片 / 视频必须有 src
    if (type !== 'color' && type !== 'gradient' && !src) {
      removeLayer();
      stopAudio();
      return;
    }
    if (!document.body) return; // body 未就绪，等下次回调

    var l = getLayer();
    if (type === 'video') {
      applyVideo(l, src, fit);
      stopAudio(); // 视频模式不播背景音乐
    } else if (type === 'color') {
      applyColor(l, color);
      playOrStop(config.bgAudio);
    } else if (type === 'gradient') {
      applyGradient(l, color, color2, direction);
      playOrStop(config.bgAudio);
    } else {
      applyImage(l, src, fit);
      playOrStop(config.bgAudio);
    }
  }

  function load() {
    chrome.storage.local.get(BG.DEFAULTS, function (res) {
      apply({
        bgType: res.bgType,
        bgSrc: res.bgSrc,
        bgFit: res.bgFit,
        bgAudio: res.bgAudio,
        bgColor: res.bgColor,
        bgColor2: res.bgColor2,
        bgDirection: res.bgDirection,
      });
    });
  }

  // ---- 启动：document_start 时 body 可能未就绪，轮询等 body ----
  var started = false;
  function ensureBody(cb) {
    if (document.body) { cb(); return; }
    var n = 0;
    var t = setInterval(function () {
      if (document.body) {
        clearInterval(t);
        cb();
      } else if (++n > 200) {
        clearInterval(t); // 5s 兜底
      }
    }, 25);
  }

  ensureBody(function () {
    if (started) return;
    started = true;
    load();
  });

  // ---- 配置实时更新 ----
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.bgType || changes.bgSrc || changes.bgFit || changes.bgAudio ||
        changes.bgColor || changes.bgColor2 || changes.bgDirection) {
      load();
    }
  });
})();
