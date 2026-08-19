// ============================================================
// 共享常量与工具（AC动画替换 + 背景替换 共用）
// 只放纯数据与纯函数，不依赖 DOM / chrome API。
// 挂载两个全局：AC_REPLACER（AC动画）、BG_REPLACER（背景替换），
// 各运行环境（content script / popup / service worker）通过
// importScripts 或 <script> 顺序加载后引用。
// ============================================================

// ==================== AC 动画替换 ====================
(function (global) {
  'use strict';

  var FADE_MS = 1000; // 淡入、淡出各 1 秒

  var DEFAULTS = {
    image: null,
    audio: null,
    video: null,
    videoMode: false,
    duration: 3000, // 停留毫秒
    fadeMs: FADE_MS, // 淡入/淡出时长（毫秒），0 表示无过渡
    mode: 'image', // 'image' | 'video' | 'folder'（文件夹随机播放）
    folderFilter: 'both', // 仅 folder 模式：'image' | 'video' | 'both'
    folderReady: false,   // 文件夹是否已设置（供面板 / testPlay 判断；实际 blob 在 IndexedDB）
  };

  var LIMITS = {
    mediaBytes: 8 * 1024 * 1024,   // 图片/音频上限 8MB
    videoBytes: 100 * 1024 * 1024, // 视频上限 100MB
    loadTimeoutMs: 10000,          // 媒体加载超时 10s
  };

  var MSG = {
    testPlay: 'test-play',
    videoSave: 'video-save',
    videoLoad: 'video-load',
    videoClear: 'video-clear',
    folderManifest: 'folder-manifest', // 取文件夹文件清单（含 kind）
    folderFile: 'folder-file',         // 按 id 拉取单个文件 blob 分片
    folderClear: 'folder-clear',       // 清除整个文件夹
  };

  // 时长归一化：非法/缺失 → 默认 3000ms；合法值（含 0）原样返回
  function normalizeDuration(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 3000;
  }

  // 媒体需要播放的最短毫秒数：停留 + 淡入淡出（2 * fadeMs，缺省用 FADE_MS）
  function mediaDurationNeededMs(durationMs, fadeMs) {
    var f = (typeof fadeMs === 'number' && isFinite(fadeMs)) ? Math.max(0, fadeMs) : FADE_MS;
    return Math.max(0, normalizeDuration(durationMs)) + 2 * f;
  }

  global.AC_REPLACER = {
    FADE_MS: FADE_MS,
    DEFAULTS: DEFAULTS,
    LIMITS: LIMITS,
    MSG: MSG,
    normalizeDuration: normalizeDuration,
    mediaDurationNeededMs: mediaDurationNeededMs,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ==================== 背景替换 ====================
(function (global) {
  'use strict';

  var BG = {
    // 配置默认值
    DEFAULTS: {
      bgType: 'none', // 'none' | 'image' | 'video' | 'color' | 'gradient'
      bgSrc: null,    // data URL / http URL / { __indexed: true }（本地视频标记）
      bgFit: 'cover', // 'cover' | 'contain' | 'repeat'（repeat 仅图片）
      bgAudio: null,  // 背景音乐（仅图片/纯色/渐变模式），data URL / http URL / { __indexed: true }
      bgColor: null,  // 纯色 / 渐变起始色，'#RRGGBB' / '#RRGGBBAA' / 'rgba(...)'
      bgColor2: null, // 渐变结束色，'#RRGGBB' / '#RRGGBBAA' / 'rgba(...)'
      bgDirection: 'left-right', // 渐变方向：left-right / top-bottom / tl-br / tr-bl
    },
    // 消息类型（content script / popup 与 background 通信）
    MSG: {
      save: 'bg-media-save',
      load: 'bg-media-load',
      clear: 'bg-media-clear',
    },
    // 大小上限
    MAX_IMAGE_BYTES: 8 * 1024 * 1024,    // 图片 / gif 上限 8MB
    MAX_AUDIO_BYTES: 8 * 1024 * 1024,    // 背景音乐上限 8MB
    MAX_VIDEO_BYTES: 100 * 1024 * 1024,  // 视频上限 100MB
  };

  global.BG_REPLACER = BG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
