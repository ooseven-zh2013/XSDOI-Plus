(function () {
  'use strict';

  let currentSrc = '';
  let originalSrc = ''; // 首次替换前记录的原始图标 src，用于「清除/恢复」
  let hideLogo = false; // 隐藏开关状态：true 时不显示任何图片

  // 候选选择器：按优先级依次尝试，站点改版时便于扩展维护
  const SELECTOR_CANDIDATES = [
    '.logo img.el-image__inner',
    '.logo img',
    'a.logo img'
  ];

  // 从 storage 读取当前配置并应用（隐藏开关优先）
  function loadAndApply() {
    chrome.storage.local.get(['logoSource', 'logoUrl', 'hideLogo'], function (data) {
      applyState(data);
    });
  }

  function applyState(data) {
    hideLogo = !!data.hideLogo;

    // 只要找到了 logo 就记录原始 src，保证后续能还原网站默认图标
    const img = findLogoImg();
    if (img && !originalSrc) {
      originalSrc = img.getAttribute('src') || '';
    }

    // 隐藏开关开启：直接隐藏，不替换
    if (hideLogo) {
      currentSrc = '';
      if (img) img.style.display = 'none';
      return;
    }

    // 关闭开关：有设置还原设置，无设置还原网站默认
    const url = getReplacementUrl(data);
    if (url) {
      currentSrc = url;
      replaceLogo(url);
    } else {
      currentSrc = '';
      restoreOriginal();
    }
  }

  function getReplacementUrl(data) {
    if (data.logoSource === 'url' && data.logoUrl) {
      return data.logoUrl;
    }
    if (data.logoSource === 'upload' && data.logoUrl) {
      return data.logoUrl; // base64 data URL
    }
    if (data.logoSource === 'builtin' && data.logoUrl) {
      return data.logoUrl; // chrome.runtime.getURL()
    }
    return '';
  }

  function findLogoImg() {
    for (const selector of SELECTOR_CANDIDATES) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function replaceLogo(url) {
    const img = findLogoImg();
    if (!img) return;

    // 首次替换前记录原始 src，供后续恢复
    if (!originalSrc) {
      originalSrc = img.getAttribute('src') || '';
    }

    // 确保从隐藏状态恢复为可见
    img.style.display = '';

    // 防止频繁重复替换
    if (img.getAttribute('src') === url) return;

    img.src = url;
    img.style.objectFit = 'scale-down';

    // 图片加载失败时回退到原始图标
    img.onerror = function () {
      if (img.getAttribute('src') === url) {
        restoreOriginal();
      }
    };
  }

  function restoreOriginal() {
    const img = findLogoImg();
    if (!img) return;

    // 从隐藏状态恢复为可见
    img.style.display = '';

    if (originalSrc && img.getAttribute('src') !== originalSrc) {
      img.src = originalSrc;
    }
    img.style.objectFit = '';
  }

  // 首次加载
  loadAndApply();

  // 监听 storage 变更，popup 保存后立刻生效
  chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace !== 'local') return;
    if (changes.logoSource || changes.logoUrl || changes.hideLogo) {
      chrome.storage.local.get(['logoSource', 'logoUrl', 'hideLogo'], function (data) {
        applyState(data);
      });
    }
  });

  // 监听 DOM 变化 —— Vue SPA 切换页面可能导致 logo 元素重建（带防抖）
  let debounceTimer = null;
  const observer = new MutationObserver(function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      if (hideLogo) {
        // 隐藏状态下：DOM 重建后持续确保隐藏
        const img = findLogoImg();
        if (img) img.style.display = 'none';
      } else if (currentSrc) {
        replaceLogo(currentSrc);
      } else {
        loadAndApply();
      }
    }, 200);
  });

  function startObserving() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      setTimeout(startObserving, 50);
    }
  }
  startObserving();
})();
