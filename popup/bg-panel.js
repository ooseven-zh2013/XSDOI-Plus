// ============================================================
// 背景替换 - 设置面板逻辑（移植自原「背景图片替换」popup.js）
// 变更点：所有元素 id 与类名加 bg- 前缀，避免与其它面板冲突；
// 其余逻辑原样保留。
// ============================================================

(function () {
  'use strict';

  var BG = globalThis.BG_REPLACER;
  var bgStore = globalThis.IDB_STORE.createStore('bg-replacer-media');

  // ---- DOM ----
  var tabs = document.querySelectorAll('.bg-tab');
  var panels = document.querySelectorAll('.bg-panel');

  var imgUrl = document.getElementById('bg-img-url');
  var imgApply = document.getElementById('bg-img-apply-url');
  var imgPick = document.getElementById('bg-img-pick');
  var imgFile = document.getElementById('bg-img-file');
  var imgPreview = document.getElementById('bg-img-preview');

  var videoUrl = document.getElementById('bg-video-url');
  var videoApply = document.getElementById('bg-video-apply-url');
  var videoPick = document.getElementById('bg-video-pick');
  var videoFile = document.getElementById('bg-video-file');
  var videoPreview = document.getElementById('bg-video-preview');

  var colorPicker = document.getElementById('bg-color-picker');
  var colorInput = document.getElementById('bg-color-input');
  var colorApply = document.getElementById('bg-color-apply');
  var colorClear = document.getElementById('bg-color-clear');
  var colorStatus = document.getElementById('bg-color-status');

  var gradFromPicker = document.getElementById('bg-grad-from-picker');
  var gradFromInput = document.getElementById('bg-grad-from-input');
  var gradToPicker = document.getElementById('bg-grad-to-picker');
  var gradToInput = document.getElementById('bg-grad-to-input');
  var gradientDirs = document.querySelectorAll('#bg-gradient-dirs .bg-fit');
  var gradientApply = document.getElementById('bg-gradient-apply');
  var gradientClear = document.getElementById('bg-gradient-clear');
  var gradientStatus = document.getElementById('bg-gradient-status');

  var clearBtn = document.getElementById('bg-clear');
  var statusEl = document.getElementById('bg-status');
  var currentEl = document.getElementById('bg-current');

  var imgFitBtns = document.querySelectorAll('#bg-panel-image .bg-fit');
  var videoFitBtns = document.querySelectorAll('#bg-panel-video .bg-fit');

  var currentFit = 'cover';
  var currentDir = 'left-right';

  // ---- 状态提示 ----
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

  // ---- tab 切换 ----
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      panels.forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('bg-panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ---- 显示方式高亮 ----
  function highlightFit() {
    imgFitBtns.forEach(function (b) {
      b.classList.toggle('active', b.dataset.fit === currentFit);
    });
    videoFitBtns.forEach(function (b) {
      var target = currentFit === 'contain' ? 'contain' : 'cover';
      b.classList.toggle('active', b.dataset.fit === target);
    });
  }

  function setFit(fit) {
    currentFit = fit;
    highlightFit();
    chrome.storage.local.set({ bgFit: fit });
  }

  imgFitBtns.forEach(function (b) {
    b.addEventListener('click', function () { setFit(b.dataset.fit); });
  });
  videoFitBtns.forEach(function (b) {
    b.addEventListener('click', function () { setFit(b.dataset.fit); });
  });

  // ---- 预览 ----
  function renderPreview(container, src, isVideo) {
    container.innerHTML = '';
    if (!src) {
      container.innerHTML = '<span>还没有背景</span>';
      return;
    }
    if (isVideo) {
      if (typeof src !== 'string') {
        container.innerHTML = '<span>本地视频已保存</span>';
        return;
      }
      var v = document.createElement('video');
      v.muted = true;
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.style.cssText = 'max-width:100%;max-height:120px;';
      v.src = src;
      container.appendChild(v);
    } else {
      var img = document.createElement('img');
      img.src = src;
      img.style.cssText = 'max-width:100%;max-height:120px;';
      container.appendChild(img);
    }
  }

  // ---- 图片：应用 URL ----
  imgApply.addEventListener('click', function () {
    var url = imgUrl.value.trim();
    if (!url) { setStatus('请输入图片链接', 'error'); return; }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      imgUrl.value = url;
    }
    var probe = new Image();
    probe.onload = function () {
      chrome.storage.local.set({ bgType: 'image', bgSrc: url }, function () {
        renderPreview(imgPreview, url, false);
        setStatus('背景已保存，去 xsdoi.com 查看', 'success');
        loadCurrent();
      });
    };
    probe.onerror = function () { setStatus('链接加载失败，检查一下', 'error'); };
    probe.src = url;
  });

  // ---- 图片：上传 ----
  imgPick.addEventListener('click', function () { imgFile.click(); });

  imgFile.addEventListener('change', function () {
    var f = imgFile.files && imgFile.files[0];
    if (!f) return;
    if (!f.type || f.type.indexOf('image/') !== 0) {
      setStatus('请选择图片文件', 'error');
      imgFile.value = '';
      return;
    }
    if (f.size > BG.MAX_IMAGE_BYTES) {
      setStatus('图片不能超过 8MB，请压缩后重试', 'error');
      imgFile.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      chrome.storage.local.set({ bgType: 'image', bgSrc: dataUrl }, function () {
        renderPreview(imgPreview, dataUrl, false);
        setStatus('背景已保存，去 xsdoi.com 查看', 'success');
        loadCurrent();
      });
    };
    reader.readAsDataURL(f);
  });

  // ---- 视频：应用 URL ----
  videoApply.addEventListener('click', function () {
    var url = videoUrl.value.trim();
    if (!url) { setStatus('请输入视频链接', 'error'); return; }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
      videoUrl.value = url;
    }
    var probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = function () {
      chrome.storage.local.set({ bgType: 'video', bgSrc: url }, function () {
        renderPreview(videoPreview, url, true);
        setStatus('背景已保存，去 xsdoi.com 查看', 'success');
        loadCurrent();
      });
    };
    probe.onerror = function () { setStatus('视频链接加载失败，检查一下', 'error'); };
    probe.src = url;
  });

  // ---- 消息封装 ----
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

  // ---- 探测本地视频能否解码播放 ----
  function probeVideo(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var v = document.createElement('video');
      v.muted = true;
      v.preload = 'auto';
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
        var c = v.error && v.error.code;
        var code = c === 3 ? 'DECODE_FAIL' : 'SRC_NOT_SUPPORTED';
        finish({ code: code });
      };
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

  // ---- 视频：上传 ----
  videoPick.addEventListener('click', function () { videoFile.click(); });

  videoFile.addEventListener('change', async function () {
    var f = videoFile.files && videoFile.files[0];
    if (!f) return;
    if (f.size > BG.MAX_VIDEO_BYTES) {
      setStatus('视频太大，请控制在 100MB 以内（大视频建议用云链接）', 'error');
      videoFile.value = '';
      return;
    }
    try {
      await probeVideo(f);
      await bgStore.put('bg-media', { mime: f.type || 'video/mp4', blob: f });
      await chrome.storage.local.set({ bgType: 'video', bgSrc: { __indexed: true } });
      videoPreview.innerHTML = '<span>本地视频已保存</span>';
      setStatus('视频背景已保存', 'success');
      loadCurrent();
    } catch (e) {
      videoFile.value = '';
      var code = e && e.code;
      if (code === 'SRC_NOT_SUPPORTED') {
        setStatus('视频编码浏览器不支持（常见 HEVC/H.265），请转成 H.264 的 mp4 或 VP8/VP9 的 webm', 'error');
      } else if (code === 'DECODE_FAIL' || code === 'TIMEOUT') {
        setStatus('视频文件无法解码，可能是损坏 / 截断 / 格式异常，请重新转码', 'error');
      } else {
        setStatus('视频保存失败，请重试', 'error');
      }
    }
  });

  // ---- 音频面板工厂：两个 tab（图片 / 渐变）各一份，共用 bgAudio ----
  var audioPanels = [];

  function syncAudio(src) {
    audioPanels.forEach(function (p) { p.render(src); });
    if (src && typeof src === 'string' && src.indexOf('data:') !== 0) {
      audioPanels.forEach(function (p) { p.urlEl.value = src; });
    }
  }

  function makeAudioPanel(prefix) {
    var aUrl = document.getElementById(prefix + '-url');
    var aApply = document.getElementById(prefix + '-apply-url');
    var aPick = document.getElementById(prefix + '-pick');
    var aFile = document.getElementById(prefix + '-file');
    var aClear = document.getElementById(prefix + '-clear');
    var aStatus = document.getElementById(prefix + '-status');

    function render(src) {
      if (!src) { aStatus.textContent = '未设置背景音乐'; return; }
      if (src && src.__indexed) aStatus.textContent = '已设置（本地音频）';
      else if (typeof src === 'string' && src.indexOf('data:') === 0) aStatus.textContent = '已设置（本地音频）';
      else aStatus.textContent = '已设置（链接）';
    }

    aApply.addEventListener('click', function () {
      var url = aUrl.value.trim();
      if (!url) { setStatus('请输入音频链接', 'error'); return; }
      if (!/^https?:\/\//i.test(url)) { url = 'https://' + url; aUrl.value = url; }
      var probe = new Audio();
      probe.preload = 'metadata';
      probe.onloadedmetadata = function () {
        chrome.storage.local.set({ bgAudio: url }, function () {
          syncAudio(url);
          setStatus('背景音乐已保存', 'success');
        });
      };
      probe.onerror = function () { setStatus('音频链接加载失败，检查一下', 'error'); };
      probe.src = url;
    });

    aPick.addEventListener('click', function () { aFile.click(); });

    aFile.addEventListener('change', async function () {
      var f = aFile.files && aFile.files[0];
      if (!f) return;
      if (f.size > BG.MAX_AUDIO_BYTES) {
        setStatus('音频不能超过 8MB，请压缩后重试', 'error');
        aFile.value = '';
        return;
      }
      try {
        await bgStore.put('bg-audio', { mime: f.type || 'audio/mpeg', blob: f });
        await chrome.storage.local.set({ bgAudio: { __indexed: true } });
        syncAudio({ __indexed: true });
        setStatus('背景音乐已保存', 'success');
      } catch (e) {
        aFile.value = '';
        setStatus('音频保存失败，请重试', 'error');
      }
    });

    aClear.addEventListener('click', function () {
      sendMessage({ type: BG.MSG.clear, key: 'audio' }).catch(function () { /* 忽略 */ });
      chrome.storage.local.remove(['bgAudio'], function () {
        aUrl.value = '';
        aFile.value = '';
        syncAudio(null);
        setStatus('已清除背景音乐', 'info');
      });
    });

    return { render: render, urlEl: aUrl, fileEl: aFile };
  }

  audioPanels.push(makeAudioPanel('bg-audio'));   // 图片 tab
  audioPanels.push(makeAudioPanel('bg-gaudio'));  // 渐变 tab

  // ---- 颜色解析：rgb/rgba 转大写 hex；hex 限制 6 位，少了补 0 ----
  function parseColor(str) {
    if (!str) return null;
    var s = String(str).trim().toLowerCase();

    var m = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9]*\.?[0-9]+)\s*)?\)$/);
    if (m) {
      var r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
      var a = (m[4] === undefined || m[4] === '') ? 1 : parseFloat(m[4]);
      if (r > 255 || g > 255 || b > 255 || a < 0 || a > 1) return null;
      if (a >= 1) {
        return '#' + pad2(r) + pad2(g) + pad2(b);
      }
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    var h = s.replace(/^#/, '').replace(/[^0-9a-f]/g, '');
    if (!h) return null;
    while (h.length < 6) h += '0';
    h = h.slice(0, 6);
    return '#' + h.toUpperCase();
  }

  function pad2(n) {
    var h = n.toString(16).toUpperCase();
    return h.length < 2 ? '0' + h : h;
  }

  function dirText(dir) {
    var m = { 'left-right': '左-右', 'top-bottom': '上-下', 'tl-br': '左上-右下', 'tr-bl': '右上-左下' };
    return m[dir] || dir;
  }

  // ---- 色板 ↔ 输入框联动 ----
  function bindColorLink(picker, input) {
    picker.addEventListener('input', function () {
      input.value = picker.value.toUpperCase();
    });
    input.addEventListener('input', function () {
      var c = parseColor(input.value);
      if (c && /^#[0-9a-fA-F]{6}$/i.test(c)) {
        picker.value = c.toLowerCase();
      }
    });
  }
  bindColorLink(colorPicker, colorInput);
  bindColorLink(gradFromPicker, gradFromInput);
  bindColorLink(gradToPicker, gradToInput);

  // ---- 纯色：应用（图片 tab）----
  colorApply.addEventListener('click', function () {
    var raw = (colorInput.value || '').trim() || colorPicker.value;
    var c = parseColor(raw);
    if (!c) {
      setStatus('颜色格式不对，支持 #00AAFF 或 rgba(0,170,255,1)', 'error');
      return;
    }
    colorInput.value = c;
    if (/^#[0-9a-fA-F]{6}$/.test(c)) colorPicker.value = c;
    chrome.storage.local.set({ bgType: 'color', bgColor: c }, function () {
      colorStatus.textContent = '纯色：' + c;
      setStatus('纯色壁纸已应用', 'success');
      loadCurrent();
    });
  });

  // ---- 纯色：清除（图片 tab）----
  colorClear.addEventListener('click', function () {
    chrome.storage.local.get(['bgType'], function (res) {
      var updates = { bgColor: null };
      if (res.bgType === 'color') updates.bgType = 'none';
      chrome.storage.local.set(updates, function () {
        colorInput.value = '';
        colorPicker.value = '#0e1018';
        colorStatus.textContent = '未设置';
        setStatus('已清除纯色', 'info');
        loadCurrent();
      });
    });
  });

  // ---- 渐变方向选择 ----
  gradientDirs.forEach(function (b) {
    b.addEventListener('click', function () {
      gradientDirs.forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      currentDir = b.dataset.dir;
    });
  });

  // ---- 渐变：应用（渐变 tab）----
  gradientApply.addEventListener('click', function () {
    var raw1 = (gradFromInput.value || '').trim() || gradFromPicker.value;
    var c1 = parseColor(raw1);
    if (!c1) {
      setStatus('起始色格式不对，支持 #00AAFF 或 rgba(0,170,255,1)', 'error');
      return;
    }
    gradFromInput.value = c1;
    if (/^#[0-9a-fA-F]{6}$/.test(c1)) gradFromPicker.value = c1;

    var raw2 = (gradToInput.value || '').trim() || gradToPicker.value;
    var c2 = parseColor(raw2);
    if (!c2) {
      setStatus('结束色格式不对，支持 #00AAFF 或 rgba(0,170,255,1)', 'error');
      return;
    }
    gradToInput.value = c2;
    if (/^#[0-9a-fA-F]{6}$/.test(c2)) gradToPicker.value = c2;

    chrome.storage.local.set({ bgType: 'gradient', bgColor: c1, bgColor2: c2, bgDirection: currentDir }, function () {
      gradientStatus.textContent = '渐变：' + c1 + ' → ' + c2 + '（' + dirText(currentDir) + '）';
      setStatus('渐变壁纸已应用', 'success');
      loadCurrent();
    });
  });

  // ---- 渐变：清除（渐变 tab）----
  gradientClear.addEventListener('click', function () {
    chrome.storage.local.get(['bgType'], function (res) {
      var updates = { bgColor2: null };
      if (res.bgType === 'gradient') updates.bgType = 'none';
      chrome.storage.local.set(updates, function () {
        gradFromInput.value = '';
        gradFromPicker.value = '#0e1018';
        gradToInput.value = '';
        gradToPicker.value = '#2d8cf0';
        gradientStatus.textContent = '未设置';
        setStatus('已清除渐变', 'info');
        loadCurrent();
      });
    });
  });

  // ---- 清除 ----
  clearBtn.addEventListener('click', function () {
    sendMessage({ type: BG.MSG.clear }).catch(function () { /* 忽略 */ });
    chrome.storage.local.remove(['bgType', 'bgSrc', 'bgFit', 'bgColor', 'bgColor2', 'bgDirection'], function () {
      currentFit = 'cover';
      highlightFit();
      renderPreview(imgPreview, '', false);
      renderPreview(videoPreview, '', true);
      imgUrl.value = '';
      videoUrl.value = '';
      imgFile.value = '';
      videoFile.value = '';
      setStatus('已清除背景，恢复原紫色光晕', 'info');
      loadCurrent();
    });
  });

  // ---- 回填当前配置 ----
  function loadCurrent() {
    chrome.storage.local.get(BG.DEFAULTS, function (res) {
      currentFit = res.bgFit || 'cover';
      highlightFit();

      syncAudio(res.bgAudio);

      if (res.bgColor) {
        colorInput.value = res.bgColor;
        if (/^#[0-9a-fA-F]{6}$/.test(res.bgColor)) colorPicker.value = res.bgColor;
      }

      if (res.bgColor) {
        gradFromInput.value = res.bgColor;
        if (/^#[0-9a-fA-F]{6}$/.test(res.bgColor)) gradFromPicker.value = res.bgColor;
      }
      if (res.bgColor2) {
        gradToInput.value = res.bgColor2;
        if (/^#[0-9a-fA-F]{6}$/.test(res.bgColor2)) gradToPicker.value = res.bgColor2;
      }
      currentDir = res.bgDirection || 'left-right';
      gradientDirs.forEach(function (x) {
        x.classList.toggle('active', x.dataset.dir === currentDir);
      });

      var type = res.bgType;
      var src = res.bgSrc;

      if (type === 'color') {
        colorStatus.textContent = res.bgColor ? '纯色：' + res.bgColor : '未设置';
        gradientStatus.textContent = '未设置';
        currentEl.innerHTML = '当前状态：<strong>纯色壁纸</strong> — 已生效';
        return;
      }
      if (type === 'gradient') {
        gradientStatus.textContent = '渐变：' + (res.bgColor || '') + ' → ' + (res.bgColor2 || '') + '（' + dirText(currentDir) + '）';
        colorStatus.textContent = '未设置';
        currentEl.innerHTML = '当前状态：<strong>渐变壁纸</strong> — 已生效';
        return;
      }

      if (!type || type === 'none' || !src) {
        colorStatus.textContent = '未设置';
        gradientStatus.textContent = '未设置';
        currentEl.innerHTML = '当前状态：<strong>未设置</strong> — 显示原背景';
        return;
      }

      var typeText = type === 'video' ? '视频' : '图片';
      var isIndexed = src && src.__indexed;
      var srcText = isIndexed ? '本地视频'
        : (typeof src === 'string' && src.indexOf('data:') === 0 ? '本地文件' : '链接');
      currentEl.innerHTML = '当前状态：<strong>' + typeText + '</strong>（' + srcText + '）— 已生效';

      if (type === 'video') {
        if (isIndexed) {
          videoPreview.innerHTML = '<span>本地视频已保存</span>';
        } else {
          renderPreview(videoPreview, src, true);
          if (typeof src === 'string' && src.indexOf('data:') !== 0) {
            videoUrl.value = src;
          }
        }
      } else {
        renderPreview(imgPreview, src, false);
        if (typeof src === 'string' && src.indexOf('data:') !== 0) {
          imgUrl.value = src;
        }
      }
    });
  }

  loadCurrent();
})();
