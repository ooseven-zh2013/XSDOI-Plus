// ============================================================
// 图标替换面板逻辑（移植自原「页面图标替换」popup.js）
// 变更点：
//   1. 二级 tab 类名 .tab/.panel → .sub-tab/.sub-panel
//   2. 内置图标路径 builtin-logo.png → assets/builtin-logo.png
// ============================================================
(function () {
  'use strict';

  // ===== DOM 引用 =====
  const tabs = document.querySelectorAll('.sub-tab');
  const panels = document.querySelectorAll('.sub-panel');
  const urlInput = document.getElementById('urlInput');
  const previewUrl = document.getElementById('preview-url');
  const saveUrlBtn = document.getElementById('saveUrl');
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const previewUpload = document.getElementById('preview-upload');
  const saveUploadBtn = document.getElementById('saveUpload');
  const clearUploadBtn = document.getElementById('clearUpload');
  const applyBuiltinBtn = document.getElementById('applyBuiltin');
  const hideToggle = document.getElementById('hideToggle');
  const statusEl = document.getElementById('status');
  const currentStateEl = document.getElementById('currentState');

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  let uploadedDataUrl = '';
  let hideEnabled = false; // 隐藏开关状态，用于禁用设置区

  // ===== 二级标签切换 =====
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      panels.forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ===== 状态提示 =====
  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (type || '');
    if (type === 'success' || type === 'error') {
      setTimeout(function () {
        if (statusEl.textContent === msg) {
          statusEl.textContent = '';
          statusEl.className = 'status';
        }
      }, 2500);
    }
  }

  // ===== 用 DOM API 渲染图片预览，避免 innerHTML 拼接的 XSS 风险 =====
  function renderPreview(container, src, hideOnError) {
    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    if (hideOnError) {
      // 用 DOM 属性绑定，而非内联 onerror（会被 MV3 CSP 拦截）
      img.onerror = function () { img.style.display = 'none'; };
    }
    container.appendChild(img);
  }

  // ===== 根据隐藏开关启用/禁用设置区 =====
  function updateSettingsDisabled() {
    const disabled = hideEnabled;
    urlInput.disabled = disabled;
    saveUrlBtn.disabled = disabled;
    applyBuiltinBtn.disabled = disabled;
    uploadZone.classList.toggle('disabled', disabled);
    saveUploadBtn.disabled = disabled || !uploadedDataUrl;
    clearUploadBtn.disabled = disabled || !uploadedDataUrl;
  }

  // ===== 加载当前配置 =====
  function loadCurrentConfig() {
    chrome.storage.local.get(['logoSource', 'logoUrl', 'hideLogo'], function (data) {
      hideEnabled = !!data.hideLogo;
      hideToggle.checked = hideEnabled;
      updateSettingsDisabled();

      // 隐藏开关开启时优先显示隐藏状态
      if (data.hideLogo) {
        currentStateEl.innerHTML = '当前状态：<strong>已隐藏</strong> — 页面不显示 logo';
        return;
      }

      if (!data.logoSource || !data.logoUrl) {
        currentStateEl.innerHTML = '当前状态：<strong>未设置</strong> — 显示原始图标';
        return;
      }
      const sourceText = data.logoSource === 'url' ? 'URL 链接'
        : data.logoSource === 'upload' ? '上传图片'
        : data.logoSource === 'builtin' ? '内置暗色图标'
        : '未知';
      currentStateEl.innerHTML =
        '当前状态：<strong>' + sourceText + '</strong> — 替换已生效';

      // 回填对应输入框
      if (data.logoSource === 'url') {
        urlInput.value = data.logoUrl;
        renderPreview(previewUrl, data.logoUrl, true);
      } else if (data.logoSource === 'upload') {
        uploadedDataUrl = data.logoUrl;
        renderPreview(previewUpload, data.logoUrl, false);
        updateSettingsDisabled();
      }
    });
  }

  // ===== URL 模式：保存 =====
  saveUrlBtn.addEventListener('click', function () {
    const url = urlInput.value.trim();
    if (!url) {
      setStatus('请输入图片 URL', 'error');
      return;
    }
    // 简单校验
    if (!/^https?:\/\/.+/.test(url)) {
      setStatus('URL 格式不正确，需以 http:// 或 https:// 开头', 'error');
      return;
    }
    chrome.storage.local.set({ logoSource: 'url', logoUrl: url }, function () {
      setStatus('已保存，刷新 xsdoi.com 页面即可看到效果', 'success');
      loadCurrentConfig();
    });
  });

  // ===== 上传模式：选择文件 =====
  uploadZone.addEventListener('click', function () {
    fileInput.click();
  });

  uploadZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    uploadZone.style.borderColor = '#cba6f7';
  });

  uploadZone.addEventListener('dragleave', function () {
    uploadZone.style.borderColor = '#45475a';
  });

  uploadZone.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadZone.style.borderColor = '#45475a';
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener('change', function () {
    const file = fileInput.files[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      setStatus('请选择图片文件', 'error');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus('图片不能超过 5MB，请压缩后重试', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
      uploadedDataUrl = e.target.result;
      renderPreview(previewUpload, uploadedDataUrl, false);
      updateSettingsDisabled();
      setStatus('图片已加载，点击保存生效', 'info');
    };
    reader.readAsDataURL(file);
  }

  saveUploadBtn.addEventListener('click', function () {
    if (!uploadedDataUrl) return;
    chrome.storage.local.set({ logoSource: 'upload', logoUrl: uploadedDataUrl }, function () {
      setStatus('已保存，刷新 xsdoi.com 页面即可看到效果', 'success');
      loadCurrentConfig();
    });
  });

  clearUploadBtn.addEventListener('click', function () {
    uploadedDataUrl = '';
    previewUpload.innerHTML = '';
    fileInput.value = '';
    updateSettingsDisabled();
    chrome.storage.local.remove(['logoSource', 'logoUrl'], function () {
      setStatus('已清除，恢复原始图标', 'info');
      loadCurrentConfig();
    });
  });

  // ===== 快速应用：内置暗色图标 =====
  applyBuiltinBtn.addEventListener('click', function () {
    const url = chrome.runtime.getURL('assets/builtin-logo.png');
    chrome.storage.local.set({ logoSource: 'builtin', logoUrl: url }, function () {
      applyBuiltinBtn.classList.add('active');
      applyBuiltinBtn.textContent = '已应用';
      setStatus('已应用内置暗色图标，刷新 xsdoi.com 页面即可看到效果', 'success');
      setTimeout(function () {
        applyBuiltinBtn.classList.remove('active');
        applyBuiltinBtn.textContent = '应用';
      }, 1500);
      loadCurrentConfig();
    });
  });

  // ===== 隐藏 Logo 开关 =====
  hideToggle.addEventListener('change', function () {
    hideEnabled = hideToggle.checked;
    updateSettingsDisabled();
    chrome.storage.local.set({ hideLogo: hideToggle.checked }, function () {
      setStatus(
        hideToggle.checked ? '已开启隐藏，页面 logo 已隐藏' : '已关闭隐藏，恢复图标',
        'success'
      );
      loadCurrentConfig();
    });
  });

  // ===== 页面加载 =====
  loadCurrentConfig();
})();
