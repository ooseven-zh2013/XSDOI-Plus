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

// ==================== 编辑器打字特效（Powermode） ====================
(function (global) {
  'use strict';

  var DEFAULTS = {
    enabled: false,         // 总开关：关闭后粒子和 combo 全部失效
    particlesEnabled: true, // 粒子动画独立开关（enabled 为 true 时生效）
    comboEnabled: true,     // combo 计数独立开关（enabled 为 true 时生效）
    particleCount: 6,       // 每次打字生成的粒子数
    comboResetMs: 1500,     // 连打中断时间（毫秒）
    shakeOnCombo: true,     // combo 达到阈值时是否抖动屏幕
    comboThresholds: [10, 50, 100],  // combo 阈值，触发不同效果
    colorMode: 'rainbow',   // 粒子颜色模式：'solid' 单一颜色 | 'rainbow' 彩虹随机
    solidColor: '#339af0',  // 单一颜色模式的粒子颜色（支持 #hex / rgba()）
  };

  var MSG = {
    config: 'powermode-config',  // popup → content script：更新配置
  };

  // ---------- 颜色工具（纯函数，content / popup 共用） ----------
  // 支持 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba()，成功返回 [r,g,b,a]，失败返回 null
  function parseColor(str) {
    if (typeof str !== 'string') return null;
    var s = str.trim();
    var m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      var a = h.length === 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1;
      return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16), a];
    }
    m = s.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i);
    if (m) {
      var ra = 1;
      if (m[4] !== undefined) ra = m[4].indexOf('%') >= 0 ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      return [+m[1], +m[2], +m[3], isNaN(ra) ? 1 : ra];
    }
    return null;
  }

  // [r,g,b,a] → #rrggbb（供颜色选择器回写）
  function toHex(rgba) {
    function h(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }
    return '#' + h(rgba[0]) + h(rgba[1]) + h(rgba[2]);
  }

  global.POWERMODE = {
    DEFAULTS: DEFAULTS,
    MSG: MSG,
    parseColor: parseColor,
    toHex: toHex,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ==================== 鼠标尾迹 ====================
// 颜色工具（parseColor / toHex）直接复用 POWERMODE 上的实现
(function (global) {
  'use strict';

  var DEFAULTS = {
    enabled: false,         // 总开关：关闭后光标不再产生拖尾
    mode: 'dots',           // 尾迹形态：'dots' 离散圆点 | 'ribbon' 连续彩色带
    colorMode: 'rainbow',   // 尾迹颜色模式：'solid' 单一颜色 | 'rainbow' 彩虹渐变
    solidColor: '#339af0',  // 单一颜色模式的尾迹颜色（支持 #hex / rgba()）
    size: 10,               // 圆点直径 / 带状线宽（px），2-40
    lifeMs: 600,            // 尾迹存活/淡出时长（ms），200-3000
    intervalMs: 16,         // 最小采样间隔（ms），控制密度，8-200
  };

  var MSG = {
    config: 'mousetrail-config',  // popup → content script：更新配置
  };

  global.MOUSE_TRAIL = {
    DEFAULTS: DEFAULTS,
    MSG: MSG,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// ==================== 鼠标点击特效 ====================
// 颜色工具（parseColor / toHex）直接复用 POWERMODE 上的实现
(function (global) {
  'use strict';

  var DEFAULTS = {
    enabled: false,         // 总开关：关闭后点击不再产生粒子
    effectType: 'particles',// 爆发类型：'particles' 圆球粒子 | 'image' 自定义图片
    colorMode: 'rainbow',   // 粒子颜色模式：'solid' 单一颜色 | 'rainbow' 彩虹随机
    solidColor: '#339af0',  // 单一颜色模式的粒子颜色（支持 #hex / rgba()）
    particleCount: 12,      // 每次点击爆发的粒子/图片数（1-50）
    particleSize: 8,        // 粒子直径（px），2-30
    imageSize: 60,          // 图片边长（px），2-200（图片模式单独放宽，不共用粒子上限）
    spread: 70,             // 扩散半径（px），20-200
    lifeMs: 600,            // 每个粒子/图片的存活/淡出时长（ms），200-2000
  };

  var MSG = {
    config: 'clickfx-config',  // popup → content script：更新配置
  };

  // 自定义图片以 base64 存于 chrome.storage.local（图片较大，不进 storage.sync）
  var IMG_KEY = 'clickeffect_image';
  // 上传图片体积上限（bytes），超出提醒用户，避免撑爆 storage.local 配额
  var IMG_MAX_BYTES = 2 * 1024 * 1024;

  global.CLICK_FX = {
    DEFAULTS: DEFAULTS,
    MSG: MSG,
    IMG_KEY: IMG_KEY,
    IMG_MAX_BYTES: IMG_MAX_BYTES,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
