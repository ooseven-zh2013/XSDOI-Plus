// ============================================================
// 编辑器字体设置 - content script（隔离世界）
//
// 在「代码编辑器设置」popover 里注入「编辑器字体」选项：
//   选择预设字体（Consolas / Fira Code 等）或上传自定义字体（@font-face）。
// 应用方式：注入 CSS 覆盖 .vue-codemirror-wrap .CodeMirror 的 font-family。
// ============================================================

(function () {
  'use strict';

  var PRESETS = [
    { name: '默认', value: '' },
    { name: 'Consolas', value: 'Consolas' },
    { name: 'Fira Code', value: 'Fira Code' },
    { name: 'JetBrains Mono', value: 'JetBrains Mono' },
    { name: 'Source Code Pro', value: 'Source Code Pro' },
    { name: 'Courier New', value: 'Courier New' }
  ];
  var CUSTOM_FAMILY = 'XSDOI-Custom-Font';
  var STYLE_ID = 'xsdoi-font-style';
  var MAX_FONT_BYTES = 15 * 1024 * 1024; // 15MB

  // 内置字体：预设里系统不自带的字体，扩展打包 woff2 用 @font-face 注册，
  // 保证选择后一定显示（不再依赖系统是否安装）。
  var BUILTIN_FONTS = {
    'Fira Code': 'fonts/fira-code-400.woff2',
    'JetBrains Mono': 'fonts/jetbrains-mono-400.woff2',
    'Source Code Pro': 'fonts/source-code-pro-400.woff2'
  };

  // ==================== 字体应用 ====================

  // 根据 data URL 的 MIME 推断 @font-face 的 format 提示
  function formatHint(dataUrl) {
    if (dataUrl.indexOf('woff2') !== -1) return ' format("woff2")';
    if (dataUrl.indexOf('woff') !== -1) return ' format("woff")';
    if (dataUrl.indexOf('otf') !== -1) return ' format("opentype")';
    return ' format("truetype")';
  }

  function buildFontCSS(cfg) {
    var rules = [];
    var sel = '.vue-codemirror-wrap .CodeMirror, .vue-codemirror-wrap .CodeMirror pre';
    if (cfg.type === 'custom' && cfg.customDataUrl) {
      rules.push('@font-face { font-family: "' + CUSTOM_FAMILY + '"; src: url("' + cfg.customDataUrl + '")' + formatHint(cfg.customDataUrl) + '; }');
      rules.push(sel + ' { font-family: "' + CUSTOM_FAMILY + '", monospace !important; }');
    } else if (cfg.type === 'preset' && cfg.preset) {
      rules.push(sel + ' { font-family: "' + cfg.preset + '", monospace !important; }');
    }
    return rules.join('\n');
  }

  function applyFont(cfg) {
    var style = document.getElementById(STYLE_ID);
    var css = buildFontCSS(cfg);
    if (!css) {
      if (style) style.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  function loadAndApply() {
    chrome.storage.local.get({ editorFontType: 'default', editorFontPreset: '', editorFontCustomDataUrl: null }, function (res) {
      applyFont({ type: res.editorFontType, preset: res.editorFontPreset, customDataUrl: res.editorFontCustomDataUrl });
    });
  }

  // 注册内置字体（@font-face），src 指向扩展内置 woff2
  function injectBuiltinFonts() {
    if (document.getElementById('xsdoi-font-face')) return;
    var rules = [];
    for (var family in BUILTIN_FONTS) {
      if (!BUILTIN_FONTS.hasOwnProperty(family)) continue;
      var url = chrome.runtime.getURL(BUILTIN_FONTS[family]);
      rules.push('@font-face { font-family: "' + family + '"; src: url("' + url + '") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }');
    }
    var style = document.createElement('style');
    style.id = 'xsdoi-font-face';
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
  }

  // ==================== 设置 UI 样式 ====================

  function injectStyles() {
    if (document.getElementById('xsdoi-font-ui-style')) return;
    var style = document.createElement('style');
    style.id = 'xsdoi-font-ui-style';
    style.textContent = [
      '.font-dropdown { position:absolute; z-index:2000; top:100%; left:0; min-width:100%; background:#fff; border:1px solid #e4e7ed; border-radius:4px; box-shadow:0 2px 12px rgba(0,0,0,0.12); padding:6px 0; margin-top:4px; box-sizing:border-box; }',
      '.font-option { padding:6px 16px; font-size:13px; color:#606266; cursor:pointer; white-space:nowrap; }',
      '.font-option:hover { background:#f5f7fa; }',
      '.font-option.selected { color:#409eff; font-weight:600; }',
      'html.theme-dark .font-dropdown { background:#1f2329; border-color:#4b5563; }',
      'html.theme-dark .font-option { color:#d0d3d9; }',
      'html.theme-dark .font-option:hover { background:#2a2e36; }',
      'html.theme-dark .font-option.selected { color:#66a6ff; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ==================== 设置 UI 注入 ====================

  function injectFontSetting() {
    var pop = null;
    var pops = document.querySelectorAll('.el-popover');
    for (var i = 0; i < pops.length; i++) {
      if (pops[i].querySelector('.setting-title')) { pop = pops[i]; break; }
    }
    if (!pop) return;
    if (pop.querySelector('[data-font-setting="1"]')) return; // 已注入

    // 从现有 setting-item 上读 Vue 的 scope 属性名（如 data-v-0b9112ac）
    var existing = pop.querySelector('.setting-item');
    var scopeAttr = null;
    if (existing) {
      var attrs = existing.attributes;
      for (var i = 0; i < attrs.length; i++) {
        if (attrs[i].name.indexOf('data-v-') === 0) { scopeAttr = attrs[i].name; break; }
      }
    }

    var item = document.createElement('div');
    item.className = 'setting-item';
    item.setAttribute('data-font-setting', '1');
    if (scopeAttr) item.setAttribute(scopeAttr, '');

    var name = document.createElement('span');
    name.className = 'setting-item-name';
    if (scopeAttr) name.setAttribute(scopeAttr, '');
    name.innerHTML = '<i class="fa fa-font"></i>'
      + '<span style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;">编辑器字体</span>';

    // 下拉框
    var value = document.createElement('div');
    value.className = 'el-select setting-item-value el-select--small';
    value.setAttribute('data-font-select', '1');
    if (scopeAttr) value.setAttribute(scopeAttr, '');
    value.style.position = 'relative';

    var input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.autocomplete = 'off';
    input.placeholder = '请选择';
    input.className = 'el-input__inner';

    var inputWrap = document.createElement('div');
    inputWrap.className = 'el-input el-input--small el-input--suffix';
    inputWrap.appendChild(input);
    var suffix = document.createElement('span');
    suffix.className = 'el-input__suffix';
    suffix.innerHTML = '<span class="el-input__suffix-inner"><i class="el-select__caret el-input__icon el-icon-arrow-up"></i></span>';
    inputWrap.appendChild(suffix);

    var dropdown = document.createElement('div');
    dropdown.className = 'font-dropdown';
    dropdown.style.display = 'none';

    function markSelected(sel) {
      var opts = dropdown.querySelectorAll('.font-option');
      for (var k = 0; k < opts.length; k++) opts[k].classList.remove('selected');
      if (sel) sel.classList.add('selected');
    }

    // 预设字体选项
    PRESETS.forEach(function (p) {
      var op = document.createElement('div');
      op.className = 'font-option';
      op.textContent = p.name;
      op.addEventListener('click', function (e) {
        e.stopPropagation();
        input.value = p.name;
        markSelected(op);
        dropdown.style.display = 'none';
        chrome.storage.local.set({
          editorFontType: p.value === '' ? 'default' : 'preset',
          editorFontPreset: p.value
        });
      });
      dropdown.appendChild(op);
    });

    // 上传自定义字体选项
    var upOp = document.createElement('div');
    upOp.className = 'font-option';
    upOp.textContent = '上传自定义字体…';
    upOp.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.style.display = 'none';
      fileInput.value = '';
      fileInput.click();
    });
    dropdown.appendChild(upOp);

    value.appendChild(inputWrap);
    value.appendChild(dropdown);

    // 隐藏的字体文件输入
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    fileInput.style.display = 'none';
    value.appendChild(fileInput);

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      if (f.size > MAX_FONT_BYTES) {
        alert('字体文件太大，请控制在 15MB 以内');
        fileInput.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var ext = (f.name.split('.').pop() || 'ttf').toLowerCase();
        var mime = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext] || 'font/ttf';
        var base64 = (reader.result || '').split(',')[1] || '';
        if (!base64) { fileInput.value = ''; return; }
        var dataUrl = 'data:' + mime + ';base64,' + base64;
        chrome.storage.local.set({
          editorFontType: 'custom',
          editorFontCustomName: f.name,
          editorFontCustomDataUrl: dataUrl
        }, function () {
          input.value = '自定义（' + f.name + '）';
          markSelected(null);
          loadAndApply();
        });
      };
      reader.readAsDataURL(f);
    });

    // 点击展开/收起下拉
    inputWrap.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.style.display = (dropdown.style.display === 'none') ? 'block' : 'none';
    });

    // 点击外部收起下拉
    document.addEventListener('click', function (e) {
      if (!value.contains(e.target)) dropdown.style.display = 'none';
    });

    item.appendChild(name);
    item.appendChild(value);
    pop.appendChild(item);

    // 回填当前选择
    chrome.storage.local.get({ editorFontType: 'default', editorFontPreset: '', editorFontCustomName: '' }, function (res) {
      if (res.editorFontType === 'preset') {
        var found = null;
        for (var i = 0; i < PRESETS.length; i++) {
          if (PRESETS[i].value === res.editorFontPreset) { found = PRESETS[i]; break; }
        }
        input.value = found ? found.name : res.editorFontPreset;
      } else if (res.editorFontType === 'custom') {
        input.value = res.editorFontCustomName ? '自定义（' + res.editorFontCustomName + '）' : '自定义字体';
      } else {
        input.value = '默认';
      }
    });
  }

  // ==================== 初始化 ====================

  injectStyles();
  injectBuiltinFonts();
  loadAndApply();

  // 设置变化时实时应用
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.editorFontType || changes.editorFontPreset || changes.editorFontCustomDataUrl) {
      loadAndApply();
    }
  });

  // popover 可能延迟渲染，轮询注入设置 UI
  setInterval(injectFontSetting, 500);
})();
