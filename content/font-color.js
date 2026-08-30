// ============================================================
// 全局字体颜色 - content script（隔离世界）
//
// 覆盖 xsdoi.com 的文字 CSS 变量（--text-strong/main/second/muted 等），
// 亮色模式默认黑、暗色模式默认白，用户可在 popup「字体颜色」面板自定义。
// 只改文字颜色变量，不影响彩色字体（品牌色/等级色等）与编辑器（CodeMirror）字体。
// ============================================================

(function () {
  'use strict';

  var STYLE_ID = 'xsdoi-font-color-style';

  // 颜色解析：支持 #rgb / #rrggbb / #rrggbbaa / rgb() / rgba()，返回 [r,g,b,a]（0-255）
  // 复用 POWERMODE.parseColor（constants.js 已注入），缺失时内置兜底
  function parseColor(str) {
    if (typeof POWERMODE !== 'undefined' && POWERMODE.parseColor) {
      return POWERMODE.parseColor(str);
    }
    return null;
  }

  // 生成覆盖文字变量的 CSS。用户色作为主文字（strong/main/title/regular），
  // 次要文字（second/muted/placeholder）用主色的不同透明度派生，保持层级感。
  function buildCSS(lightColor, darkColor) {
    var l = parseColor(lightColor) || [31, 39, 51, 1];   // 兜底亮色 #1f2733
    var d = parseColor(darkColor) || [238, 241, 248, 1]; // 兜底暗色 #eef1f8

    function rgba(c, alpha) {
      return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + alpha + ')';
    }

    function vars(c, prefix) {
      return [
        prefix + '--text-strong: ' + rgba(c, 1) + ';',
        prefix + '--text-main: ' + rgba(c, 1) + ';',
        prefix + '--text-title: ' + rgba(c, 1) + ';',
        prefix + '--text-regular: ' + rgba(c, 1) + ';',
        prefix + '--text-second: ' + rgba(c, 0.72) + ';',
        prefix + '--text-placeholder: ' + rgba(c, 0.55) + ';',
        prefix + '--text-muted: ' + rgba(c, 0.45) + ';'
      ].join('\n');
    }

    return [
      'html:not(.theme-dark) {',
      vars(l, '  '),
      '}',
      'html.theme-dark {',
      vars(d, '  '),
      '}'
    ].join('\n');
  }

  function apply() {
    try {
      if (!chrome.storage || !chrome.storage.sync) return;
      chrome.storage.sync.get(FONT_COLOR.STORAGE_KEY, function (data) {
        try {
          var cfg = data && data[FONT_COLOR.STORAGE_KEY];
          var el = document.getElementById(STYLE_ID);
          if (!cfg || !cfg.enabled) {
            if (el) el.remove();
            return;
          }
          var light = (typeof cfg.lightColor === 'string' && cfg.lightColor.trim()) ? cfg.lightColor.trim() : FONT_COLOR.DEFAULTS.lightColor;
          var dark = (typeof cfg.darkColor === 'string' && cfg.darkColor.trim()) ? cfg.darkColor.trim() : FONT_COLOR.DEFAULTS.darkColor;
          var css = buildCSS(light, dark);
          if (el) {
            el.textContent = css;
          } else {
            var s = document.createElement('style');
            s.id = STYLE_ID;
            s.textContent = css;
            (document.head || document.documentElement).appendChild(s);
          }
        } catch (e) { /* 忽略 */ }
      });
    } catch (e) { /* 上下文失效等静默 */ }
  }

  // 监听 popup 保存变化，无需刷新页面即可生效
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      if (changes[FONT_COLOR.STORAGE_KEY]) apply();
    });
  } catch (e) { /* 忽略 */ }

  // document_start 注入：尽早应用，避免首屏闪烁
  apply();
})();
