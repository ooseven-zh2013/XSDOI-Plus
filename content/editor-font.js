// ============================================================
// 编辑器字体设置 - content script（隔离世界）
//
// 1. 在「代码编辑器设置」popover 里注入「编辑器字体」选项：
//    选择预设字体（Consolas / Fira Code 等）或上传自定义字体（@font-face）。
// 2. Submission 详情页（.markdown-body.submission-detail）的代码块同步适配字体，
//    并在代码块 COPY 按钮旁提供「字体」入口，可随时切换。
// 应用方式：注入 CSS 覆盖编辑器与 submission 代码块的 font-family；
// submission 行号列（内联 !important 样式）用 JS 单独覆盖。
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
  var SUB_SEL = '.markdown-body.submission-detail'; // submission 代码块容器

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

  // 当前生效的 font-family 栈；默认字体时返回 null
  function fontStack(cfg) {
    if (cfg.type === 'custom' && cfg.customDataUrl) return '"' + CUSTOM_FAMILY + '", monospace';
    if (cfg.type === 'preset' && cfg.preset) return '"' + cfg.preset + '", monospace';
    return null;
  }

  function buildFontCSS(cfg) {
    var stack = fontStack(cfg);
    if (!stack) return '';
    var rules = [];
    var editorSel = '.vue-codemirror-wrap .CodeMirror, .vue-codemirror-wrap .CodeMirror pre';
    var subSel = SUB_SEL + ' pre, ' + SUB_SEL + ' pre code';
    if (cfg.type === 'custom' && cfg.customDataUrl) {
      rules.push('@font-face { font-family: "' + CUSTOM_FAMILY + '"; src: url("' + cfg.customDataUrl + '")' + formatHint(cfg.customDataUrl) + '; }');
    }
    rules.push(editorSel + ', ' + subSel + ' { font-family: ' + stack + ' !important; }');
    return rules.join('\n');
  }

  // submission 行号列带内联 !important 的 font-family，CSS 无法覆盖，用 JS 处理
  function applyLineNumberFont(stack) {
    var els = document.querySelectorAll(SUB_SEL + ' .pre-numbering');
    for (var i = 0; i < els.length; i++) {
      if (stack) {
        els[i].style.setProperty('font-family', stack, 'important');
      } else {
        els[i].style.removeProperty('font-family');
      }
    }
  }

  function applyFont(cfg) {
    var style = document.getElementById(STYLE_ID);
    var css = buildFontCSS(cfg);
    if (!css) {
      if (style) style.remove();
    } else {
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = css;
    }
    applyLineNumberFont(fontStack(cfg));
  }

  function loadAndApply() {
    chrome.storage.local.get({ editorFontType: 'default', editorFontPreset: '', editorFontCustomDataUrl: null }, function (res) {
      applyFont({ type: res.editorFontType, preset: res.editorFontPreset, customDataUrl: res.editorFontCustomDataUrl });
      refreshDropdownSelection();
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

  // ==================== 共享字体下拉 ====================

  // 构建字体下拉框（预设选项 + 上传自定义字体），popover 与 submission 入口共用。
  // onSelect(label)：选择完成后回调，宿主用它更新自己的显示文本。
  function createFontDropdown(onSelect) {
    var dropdown = document.createElement('div');
    dropdown.className = 'font-dropdown';
    dropdown.setAttribute('data-xsdoi-dd', '1');
    dropdown.style.display = 'none';

    PRESETS.forEach(function (p) {
      var op = document.createElement('div');
      op.className = 'font-option';
      op.setAttribute('data-font-value', p.value || '__default__');
      op.textContent = p.name;
      op.addEventListener('click', function (e) {
        e.stopPropagation();
        dropdown.style.display = 'none';
        chrome.storage.local.set({
          editorFontType: p.value === '' ? 'default' : 'preset',
          editorFontPreset: p.value
        });
        onSelect(p.name);
      });
      dropdown.appendChild(op);
    });

    // 隐藏的字体文件输入
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2';
    fileInput.style.display = 'none';

    var upOp = document.createElement('div');
    upOp.className = 'font-option';
    upOp.setAttribute('data-font-value', '__custom__');
    upOp.textContent = '上传自定义字体…';
    upOp.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.style.display = 'none';
      fileInput.value = '';
      fileInput.click();
    });
    dropdown.appendChild(upOp);
    dropdown.appendChild(fileInput);

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
          onSelect('自定义（' + f.name + '）');
        });
      };
      reader.readAsDataURL(f);
    });

    return dropdown;
  }

  // 按当前配置高亮页面上所有下拉框里的选中项
  function refreshDropdownSelection() {
    chrome.storage.local.get({ editorFontType: 'default', editorFontPreset: '', editorFontCustomName: '' }, function (res) {
      var val = res.editorFontType === 'custom' ? '__custom__'
        : res.editorFontType === 'preset' ? res.editorFontPreset : '__default__';
      var dds = document.querySelectorAll('.font-dropdown[data-xsdoi-dd="1"]');
      for (var i = 0; i < dds.length; i++) {
        var opts = dds[i].querySelectorAll('.font-option');
        for (var k = 0; k < opts.length; k++) {
          opts[k].classList.toggle('selected', opts[k].getAttribute('data-font-value') === val);
        }
      }
    });
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
      'html.theme-dark .font-option.selected { color:#66a6ff; }',
      // submission 页字体入口按钮（与 COPY 按钮同款，放在其左侧）
      '.markdown-body.submission-detail pre .xsdoi-font-btn { position:absolute; top:8px; right:100px; z-index:5; display:inline-flex; align-items:center; justify-content:center; gap:4px; min-width:64px; height:30px; padding:0 10px; margin:0; border:none; border-radius:6px; background-color:#2196f3; color:#fff; font-size:11px; font-weight:600; cursor:pointer; opacity:0; transition:opacity .15s ease,background-color .15s ease; }',
      '.markdown-body.submission-detail pre:hover .xsdoi-font-btn, .markdown-body.submission-detail pre .xsdoi-font-btn:focus { opacity:1; }',
      '.markdown-body.submission-detail pre .xsdoi-font-btn:hover { background-color:#1687df; outline:none; }',
      '.markdown-body.submission-detail pre .xsdoi-font-btn i { font-size:13px; }',
      // submission 代码块恒为深色背景，下拉框固定深色，定位在按钮下方
      '.markdown-body.submission-detail .font-dropdown { top:44px; left:auto; right:8px; min-width:150px; background:#1f2329; border-color:#4b5563; }',
      '.markdown-body.submission-detail .font-option { color:#d0d3d9; }',
      '.markdown-body.submission-detail .font-option:hover { background:#2a2e36; }',
      '.markdown-body.submission-detail .font-option.selected { color:#66a6ff; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ==================== 设置 UI 注入（编辑器设置 popover） ====================

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

    var dropdown = createFontDropdown(function (label) {
      input.value = label;
    });

    value.appendChild(inputWrap);
    value.appendChild(dropdown);

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

  // ==================== submission 页字体入口 ====================

  // 下拉默认 absolute 相对 pre 定位；pre 带 overflow 时可能被裁剪，
  // 展示前切成 fixed 按按钮位置摆放，收起时还原
  function positionDropdownFixed(dropdown, btn) {
    var r = btn.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.top = (r.bottom + 6) + 'px';
    dropdown.style.right = (window.innerWidth - r.right) + 'px';
    dropdown.style.left = 'auto';
    dropdown.style.zIndex = '2147483000';
  }

  function resetDropdownPosition(dropdown) {
    dropdown.style.position = '';
    dropdown.style.top = '';
    dropdown.style.right = '';
    dropdown.style.left = '';
  }

  // 按钮文字显示当前生效字体，用户一眼能看到自己选了什么
  function updateFontBtnText(btn) {
    chrome.storage.local.get({ editorFontType: 'default', editorFontPreset: '', editorFontCustomName: '' }, function (res) {
      var label = '默认';
      if (res.editorFontType === 'preset') {
        var found = null;
        for (var i = 0; i < PRESETS.length; i++) {
          if (PRESETS[i].value === res.editorFontPreset) { found = PRESETS[i]; break; }
        }
        label = found ? found.name : res.editorFontPreset;
      } else if (res.editorFontType === 'custom') {
        label = res.editorFontCustomName ? '自定义（' + res.editorFontCustomName + '）' : '自定义字体';
      }
      var span = btn.querySelector('span');
      if (span) span.textContent = label;
      btn.title = '当前字体：' + label + '（点击更改）';
    });
  }

  // 给单个 submission 代码块注入「字体」按钮（放在 COPY 按钮旁），点击弹出字体下拉
  function attachFontEntry(pre) {
    if (pre.querySelector('[data-font-entry="1"]')) return; // 已注入

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'xsdoi-font-btn';
    btn.setAttribute('data-font-entry', '1');
    btn.title = '更改代码字体';
    btn.setAttribute('aria-label', '更改代码字体');
    btn.innerHTML = '<i class="fa fa-font" aria-hidden="true"></i><span>默认</span>';

    var dropdown = createFontDropdown(function () {
      updateFontBtnText(btn); // 选择后立即刷新按钮文字
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown.style.display === 'none') {
        positionDropdownFixed(dropdown, btn);
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
        resetDropdownPosition(dropdown);
      }
    });

    // 点击下拉内部不收起（选项自身会收起）
    dropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    // 点击外部收起下拉
    document.addEventListener('click', function (e) {
      if (!pre.contains(e.target)) {
        dropdown.style.display = 'none';
        resetDropdownPosition(dropdown);
      }
    });

    pre.appendChild(dropdown);
    pre.appendChild(btn);
    updateFontBtnText(btn);
  }

  function injectSubmissionFontEntry() {
    var pres = document.querySelectorAll(SUB_SEL + ' pre');
    for (var i = 0; i < pres.length; i++) {
      attachFontEntry(pres[i]);
    }
  }

  // ==================== 初始化 ====================

  injectStyles();
  injectBuiltinFonts();
  loadAndApply();

  // 设置变化时实时应用，并刷新 submission 按钮上显示的当前字体
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.editorFontType || changes.editorFontPreset || changes.editorFontCustomDataUrl) {
      loadAndApply();
      var btns = document.querySelectorAll('.xsdoi-font-btn[data-font-entry="1"]');
      for (var i = 0; i < btns.length; i++) updateFontBtnText(btns[i]);
    }
  });

  // popover / submission 代码块可能延迟渲染，轮询注入设置 UI 与字体入口
  setInterval(function () {
    injectFontSetting();
    injectSubmissionFontEntry();
  }, 500);
})();
