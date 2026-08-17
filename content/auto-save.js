(function () {
  'use strict';

  // 触发保存的按钮文字：在线自测抽屉里的「运行自测」按钮、提交区的「提交评测」按钮
  var TRIGGER_TEXTS = ['运行自测', '提交评测'];

  // 备份原因（「自动备份」为后续自动备份功能预留）
  var REASONS = {
    ONLINE_TEST: '在线自测',
    SUBMIT: '提交评测',
    MANUAL: '手动备份',
    AUTO: '自动备份'
  };

  // 自动备份模式（设置下拉框选中值）：null / 关闭备份 / 定时备份 / 更改后备份
  var autoBackupMode = null;
  // 上次检测的代码（用于变更检测）
  var lastAutoBackupCode = null;
  // 自动备份防抖定时器
  var autoBackupTimer = null;
  // 定时备份定时器
  var timedBackupTimer = null;
  // 定时备份间隔（秒），默认 60
  var timedBackupInterval = 60;

  // 在点击事件路径上找「运行自测」/「提交评测」按钮，返回命中的按钮文字。
  // 用整个子树的 textContent（trim 后精确等于关键词）匹配，点按钮图标/边缘也能命中，
  // 且不会误匹配包含更多文字的大容器。
  function findTrigger(e) {
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (el && el.nodeType === 1) {
        var t = (el.textContent || '').replace(/\s+/g, '').trim();
        if (TRIGGER_TEXTS.indexOf(t) !== -1) return t;
      }
    }
    return null;
  }

  // 从 URL 提取题目 ID：取 pathname（去掉首尾 /），把剩余 / 替换为 .
  // 如 /problem/C10-1 -> problem.C10-1
  function getProblemId() {
    var p = location.pathname.replace(/^\/+|\/+$/g, '');
    if (!p) return null;
    return p.replace(/\//g, '.');
  }

  // 从编辑器取代码（main.js 主世界已同步到 textarea 的 value）
  function getCode() {
    var ta = document.querySelector('.vue-codemirror-wrap textarea');
    if (ta && ta.value) return ta.value;
    return '';
  }

  // 把代码写回编辑器（写入 textarea，main.js 会同步回 CodeMirror）
  function setCode(code) {
    var ta = document.querySelector('.vue-codemirror-wrap textarea');
    if (ta) ta.value = code;
    lastAutoBackupCode = code; // autoFill 写入不算代码变更，避免误触发自动备份
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // 保存时间戳：年(4)-月(2)-日(2)-时(2,24h)-分(2)-秒(2)，不足补零
  function getTimestampStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + '-' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
  }

  function save(reason) {
    var code = getCode();
    if (!code) {
      console.warn('[自动保存] 未取到代码，跳过');
      return;
    }
    var pid = getProblemId() || 'unknown';
    var filename = pid + '-' + getTimestampStr() + '-' + reason + '.cpp.backup';
    chrome.runtime.sendMessage({ type: 'SAVE_CODE', code: code, filename: filename }, function (resp) {
      if (chrome.runtime.lastError) {
        console.error('[自动保存] 发送失败: ' + chrome.runtime.lastError.message);
      } else if (resp && !resp.ok) {
        console.error('[自动保存] 保存失败: ' + (resp.error || '未知错误'));
      } else {
        console.log('[自动保存] 已保存: ' + filename);
      }
    });
  }

  // 等待编辑器就绪后执行回调（最多约 10 秒）
  function waitForEditor(cb, tries) {
    tries = tries || 0;
    var ta = document.querySelector('.vue-codemirror-wrap textarea');
    if (ta) {
      cb();
      return;
    }
    if (tries >= 100) return;
    setTimeout(function () { waitForEditor(cb, tries + 1); }, 100);
  }

  // 自动恢复该题目最新的备份
  function autoFill() {
    var pid = getProblemId();
    if (!pid) return;
    waitForEditor(function () {
      chrome.runtime.sendMessage({ type: 'FIND_LATEST_BACKUP', problemId: pid }, function (resp) {
        if (chrome.runtime.lastError) {
          console.warn('[自动保存] 自动填充通信失败:', chrome.runtime.lastError.message);
          return;
        }
        if (resp && resp.ok && resp.content) {
          setCode(resp.content);
        }
      });
    });
  }

  // 执行一次「自动备份」（覆盖逻辑由 background 处理）
  function doAutoBackup() {
    var pid = getProblemId();
    var code = getCode();
    if (!pid || !code) return;
    chrome.runtime.sendMessage({ type: 'AUTO_BACKUP', problemId: pid, code: code }, function (resp) {
      if (chrome.runtime.lastError) {
        console.error('[自动保存] 自动备份失败: ' + chrome.runtime.lastError.message);
      } else if (resp && !resp.ok) {
        console.error('[自动保存] 自动备份失败: ' + (resp.error || '未知错误'));
      } else {
        console.log('[自动保存] 自动备份完成: ' + (resp && resp.filename));
      }
    });
  }

  // 防抖：代码变更后延迟 1.5s 再备份
  function scheduleAutoBackup() {
    if (autoBackupTimer) clearTimeout(autoBackupTimer);
    autoBackupTimer = setTimeout(doAutoBackup, 1500);
  }

  // 检测代码变更（仅「更改后备份」模式下生效）
  function checkAutoBackup() {
    if (autoBackupMode !== '更改后备份') return;
    var code = getCode();
    if (!code) return;
    if (lastAutoBackupCode === null) {
      lastAutoBackupCode = code; // 首次只记录，不触发
      return;
    }
    if (code !== lastAutoBackupCode) {
      lastAutoBackupCode = code;
      scheduleAutoBackup();
    }
  }

  // 启动定时备份：每隔 seconds 秒新建一份「自动备份」（不覆盖）
  function startTimedBackup(seconds) {
    stopTimedBackup();
    seconds = parseInt(seconds, 10);
    if (!seconds || seconds < 1) return;
    timedBackupTimer = setInterval(function () {
      save(REASONS.AUTO);
    }, seconds * 1000);
  }

  // 停止定时备份
  function stopTimedBackup() {
    if (timedBackupTimer) {
      clearInterval(timedBackupTimer);
      timedBackupTimer = null;
    }
  }

  // 找到「提交评测」按钮
  function findSubmitBtn() {
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if ((btns[i].textContent || '').replace(/\s+/g, '').trim() === '提交评测') {
        return btns[i];
      }
    }
    return null;
  }

  // 找到提交区的「在线自测」按钮（el-tag，文字含「在线自测」）
  function findSelfTestBtn() {
    var els = document.querySelectorAll('.tj-btn');
    for (var i = 0; i < els.length; i++) {
      if ((els[i].textContent || '').indexOf('在线自测') !== -1) {
        return els[i];
      }
    }
    return null;
  }

  // 注入「备份代码」按钮，用 flex 让三个按钮紧挨：备份代码 | 在线自测 | 提交评测
  function injectBackupBtn() {
    var selfTest = findSelfTestBtn();
    if (!selfTest) return;
    var container = selfTest.parentNode;
    if (!container || container.querySelector('[data-backup-btn="1"]')) return; // 已注入，跳过

    var submit = findSubmitBtn();

    // 容器改 flex，靠右紧挨
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'flex-end';
    container.style.gap = '8px';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'el-button el-button--default el-button--small';
    btn.setAttribute('data-backup-btn', '1');
    btn.style.order = '1';
    btn.style.margin = '0';

    var span = document.createElement('span');
    span.textContent = '备份代码';
    btn.appendChild(span);

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      save(REASONS.MANUAL);
      var old = span.textContent;
      span.textContent = '已备份';
      setTimeout(function () { span.textContent = old; }, 1500);
    });

    // flex 下按 order 排列：备份代码(1) 在线自测(2) 提交评测(3)
    selfTest.style.order = '2';
    if (submit) submit.style.order = '3';

    container.insertBefore(btn, selfTest);
  }

  // 在代码编辑器设置 popover 里加「自动备份」选项（下拉框占位，暂不填）
  function injectAutoBackupSetting() {
    var pop = null;
    var pops = document.querySelectorAll('.el-popover');
    for (var i = 0; i < pops.length; i++) {
      if (pops[i].querySelector('.setting-title')) { pop = pops[i]; break; }
    }
    if (!pop) return;
    if (pop.querySelector('[data-auto-backup-setting="1"]')) return; // 已注入

    // 从现有 setting-item 上读 Vue 的 scope 属性名（如 data-v-0b9112ac），
    // 不挂这个属性的话，Vue 的 scoped CSS 不生效，会排版错乱。
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
    item.setAttribute('data-auto-backup-setting', '1');
    if (scopeAttr) item.setAttribute(scopeAttr, '');

    var name = document.createElement('span');
    name.className = 'setting-item-name';
    if (scopeAttr) name.setAttribute(scopeAttr, '');
    // 图标用 fa（与其他三项一致），文字用独立 span 包裹并显式系统字体，
    // 避免 fa 的 FontAwesome 字体回退污染中文（之前的「自 动 备 份」就是这个问题）。
    name.innerHTML = '<i class="fa fa-clock-o"></i>'
      + '<span style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;">自动备份</span>';

    var OPTIONS = [
      { value: '关闭备份', tip: '不自动备份，节省磁盘空间，但代码丢失风险较高' },
      { value: '定时备份', tip: '按设定的时间间隔自动备份，在磁盘占用与备份及时性之间取得平衡' },
      { value: '更改后备份', tip: '代码改动后自动备份，仅保留最新一份、磁盘占用小，几乎不会丢失代码' }
    ];

    // 「备份间隔」输入框（选中「定时备份」时显示）
    var intervalItem = document.createElement('div');
    intervalItem.className = 'setting-item';
    intervalItem.setAttribute('data-timed-interval', '1');
    if (scopeAttr) intervalItem.setAttribute(scopeAttr, '');
    intervalItem.style.display = 'none';

    var intervalName = document.createElement('span');
    intervalName.className = 'setting-item-name';
    if (scopeAttr) intervalName.setAttribute(scopeAttr, '');
    intervalName.innerHTML = '<i class="fa fa-clock-o"></i>'
      + '<span style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;">备份间隔</span>';

    var intervalValue = document.createElement('div');
    intervalValue.className = 'setting-item-value';
    if (scopeAttr) intervalValue.setAttribute(scopeAttr, '');

    var intervalInput = document.createElement('input');
    intervalInput.type = 'number';
    intervalInput.min = '1';
    intervalInput.value = '60';
    intervalInput.className = 'el-input__inner';
    intervalInput.style.width = '90px';
    intervalInput.style.marginRight = '6px';

    var intervalUnit = document.createElement('span');
    intervalUnit.textContent = '秒';

    intervalValue.appendChild(intervalInput);
    intervalValue.appendChild(intervalUnit);

    intervalItem.appendChild(intervalName);
    intervalItem.appendChild(intervalValue);

    // 间隔输入变化时重启定时器
    intervalInput.addEventListener('change', function () {
      timedBackupInterval = parseInt(intervalInput.value, 10) || 60;
      chrome.storage.local.set({ timedBackupInterval: timedBackupInterval });
      if (autoBackupMode === '定时备份') {
        startTimedBackup(intervalInput.value);
      }
    });

    var value = document.createElement('div');
    value.className = 'el-select setting-item-value el-select--small';
    value.setAttribute('data-auto-backup-select', '1');
    if (scopeAttr) value.setAttribute(scopeAttr, '');
    value.style.position = 'relative';

    // 输入框（只读，显示当前选中项）
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

    // 下拉选项列表
    var dropdown = document.createElement('div');
    dropdown.className = 'auto-backup-dropdown';
    dropdown.style.display = 'none';
    OPTIONS.forEach(function (opt) {
      var op = document.createElement('div');
      op.className = 'auto-backup-option';
      op.textContent = opt.value;
      op.setAttribute('title', opt.tip); // 悬浮提示
      op.addEventListener('click', function (e) {
        e.stopPropagation();
        input.value = opt.value;
        autoBackupMode = opt.value;
        var opts = dropdown.querySelectorAll('.auto-backup-option');
        for (var k = 0; k < opts.length; k++) opts[k].classList.remove('selected');
        op.classList.add('selected');
        dropdown.style.display = 'none';
        if (opt.value === '定时备份') {
          intervalItem.style.display = '';
          startTimedBackup(intervalInput.value);
        } else {
          intervalItem.style.display = 'none';
          stopTimedBackup();
        }
        // 持久化选中模式与间隔
        chrome.storage.local.set({ autoBackupMode: opt.value, timedBackupInterval: timedBackupInterval });
      });
      dropdown.appendChild(op);
    });

    value.appendChild(inputWrap);
    value.appendChild(dropdown);

    // 点击输入框展开/收起下拉
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
    pop.appendChild(intervalItem);

    // 恢复持久化的配置（刷新页面后保持选中状态）
    chrome.storage.local.get(['autoBackupMode', 'timedBackupInterval'], function (data) {
      var mode = data.autoBackupMode;
      if (!mode) return;
      autoBackupMode = mode;
      input.value = mode;
      var opts = dropdown.querySelectorAll('.auto-backup-option');
      for (var k = 0; k < opts.length; k++) {
        if (opts[k].textContent === mode) opts[k].classList.add('selected');
      }
      if (data.timedBackupInterval) {
        timedBackupInterval = data.timedBackupInterval;
        intervalInput.value = data.timedBackupInterval;
      }
      if (mode === '定时备份') {
        intervalItem.style.display = '';
        startTimedBackup(intervalInput.value);
      }
    });
  }

  // === 备份历史 ===

  // 注入亮色/暗色适配样式
  function injectStyles() {
    if (document.getElementById('bh-style')) return;
    var style = document.createElement('style');
    style.id = 'bh-style';
    style.textContent = [
      '[data-backup-panel="1"] { background:#fff; min-height:200px; }',
      '.bh-panel-title { font-size:14px; font-weight:600; color:#1f2329; }',
      '.bh-item { display:flex; align-items:center; justify-content:space-between; padding:9px 4px; border-bottom:1px solid #f0f1f2; }',
      '.bh-time { font-family:Consolas,monospace; font-size:13px; color:#1f2329; }',
      '.bh-reason { font-size:13px; color:#8a919f; }',
      '.bh-actions { display:flex; align-items:center; gap:6px; }',
      '.bh-empty { color:#999; padding:24px 0; text-align:center; }',
      '.bh-error { color:#e6a23c; padding:24px 0; text-align:center; }',
      'html.theme-dark [data-backup-panel="1"] { background:#1f2329; }',
      'html.theme-dark .bh-panel-title { color:#e6e8eb; }',
      'html.theme-dark .bh-item { border-bottom-color:#33363d; }',
      'html.theme-dark .bh-time { color:#d0d3d9; }',
      'html.theme-dark .bh-reason { color:#9aa1ad; }',
      'html.theme-dark .bh-empty { color:#6b7280; }',
      'html.theme-dark [data-backup-btn="1"] { background:transparent; border-color:#4b5563; color:#d0d3d9; }',
      '.auto-backup-dropdown { position:absolute; z-index:2000; top:100%; left:0; min-width:100%; background:#fff; border:1px solid #e4e7ed; border-radius:4px; box-shadow:0 2px 12px rgba(0,0,0,0.12); padding:6px 0; margin-top:4px; box-sizing:border-box; }',
      '.auto-backup-option { padding:6px 16px; font-size:13px; color:#606266; cursor:pointer; white-space:nowrap; }',
      '.auto-backup-option:hover { background:#f5f7fa; }',
      '.auto-backup-option.selected { color:#409eff; font-weight:600; }',
      'html.theme-dark .auto-backup-dropdown { background:#1f2329; border-color:#4b5563; }',
      'html.theme-dark .auto-backup-option { color:#d0d3d9; }',
      'html.theme-dark .auto-backup-option:hover { background:#2a2e36; }',
      'html.theme-dark .auto-backup-option.selected { color:#66a6ff; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    cb(ok);
  }

  function copyText(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { cb(true); },
        function () { fallbackCopy(text, cb); }
      );
    } else {
      fallbackCopy(text, cb);
    }
  }

  // 「YYYY-MM-DD-HH-mm-ss」→「YYYY-MM-DD HH:mm:ss」
  function formatTime(t) {
    if (t.length < 19) return t;
    return t.slice(0, 10) + ' ' + t.slice(11).replace(/-/g, ':');
  }

  function copyBackup(filename, btn) {
    chrome.runtime.sendMessage({ type: 'GET_BACKUP', filename: filename }, function (resp) {
      if (chrome.runtime.lastError) {
        btn.textContent = '失败';
        setTimeout(function () { btn.textContent = '复制代码'; }, 1200);
        return;
      }
      if (!resp || !resp.ok) {
        btn.textContent = '读取失败';
        alert('读取失败，可能该备份正在被自动备份覆盖。请稍等几秒后点击「刷新」重试。');
        setTimeout(function () { btn.textContent = '复制代码'; }, 1200);
        return;
      }
      copyText(resp.content, function (ok) {
        btn.textContent = ok ? '已复制' : '失败';
        setTimeout(function () { btn.textContent = '复制代码'; }, 1200);
      });
    });
  }

  // 在题目描述 tab 栏右侧注入「备份历史」tab + 覆盖面板
  function injectBackupHistoryTab() {
    var tabsEl = document.querySelector('.el-tabs--border-card');
    if (!tabsEl || tabsEl.querySelector('[data-backup-tab="1"]')) return;
    var nav = tabsEl.querySelector('.el-tabs__nav');
    if (!nav) return;

    // tab 项
    var tab = document.createElement('div');
    tab.className = 'el-tabs__item is-top';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('data-backup-tab', '1');
    tab.innerHTML = '<span><i class="fa fa-history"></i> 备份历史</span>';

    // 原生内容容器（切换时隐藏/恢复它）
    var contentEl = tabsEl.querySelector('.el-tabs__content');

    // 面板（正常流，放在 el-tabs 后面；点「备份历史」时隐藏原生内容、显示面板，实现切换而非覆盖）
    var panel = document.createElement('div');
    panel.setAttribute('data-backup-panel', '1');
    panel.style.cssText = 'display:none;overflow-y:auto;padding:16px;box-sizing:border-box;';

    // 标题栏：标题 + 刷新按钮
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;';
    var title = document.createElement('div');
    title.className = 'bh-panel-title';
    title.textContent = '备份历史';
    var refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'el-button el-button--default el-button--mini';
    refreshBtn.textContent = '刷新';
    var clearAllBtn = document.createElement('button');
    clearAllBtn.type = 'button';
    clearAllBtn.className = 'el-button el-button--danger el-button--mini';
    clearAllBtn.textContent = '一键清除';
    var barRight = document.createElement('div');
    barRight.style.cssText = 'display:flex;align-items:center;gap:6px;';
    barRight.appendChild(refreshBtn);
    barRight.appendChild(clearAllBtn);
    bar.appendChild(title);
    bar.appendChild(barRight);

    // 列表容器
    var listBox = document.createElement('div');
    listBox.setAttribute('data-bh-list', '1');

    panel.appendChild(bar);
    panel.appendChild(listBox);

    // 插入到 el-tabs 后面（兄弟节点）
    tabsEl.parentNode.insertBefore(panel, tabsEl.nextSibling);

    function render(list) {
      title.textContent = (list && list.length) ? '备份历史（' + list.length + ' 条）' : '备份历史';
      if (!list || list.length === 0) {
        listBox.innerHTML = '<div class="bh-empty">该题目还没有备份</div>';
        return;
      }
      var html = '';
      list.forEach(function (item) {
        html += '<div class="bh-item">'
          + '<span>'
          + '<span class="bh-time">' + formatTime(item.time) + '</span>'
          + '　<span class="bh-reason">' + escapeHtml(item.reason) + '</span>'
          + '</span>'
          + '<span class="bh-actions">'
          + '<button class="el-button el-button--default el-button--mini bh-copy-btn" data-filename="' + escapeHtml(item.filename) + '" type="button">复制代码</button>'
          + '<button class="el-button el-button--danger el-button--mini bh-delete-btn" data-filename="' + escapeHtml(item.filename) + '" type="button">删除</button>'
          + '</span>'
          + '</div>';
      });
      listBox.innerHTML = html;

      // 绑定复制
      var copyBtns = listBox.querySelectorAll('.bh-copy-btn');
      for (var i = 0; i < copyBtns.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            copyBackup(btn.getAttribute('data-filename'), btn);
          });
        })(copyBtns[i]);
      }

      // 绑定删除
      var delBtns = listBox.querySelectorAll('.bh-delete-btn');
      for (var i = 0; i < delBtns.length; i++) {
        (function (btn) {
          btn.addEventListener('click', function () {
            var filename = btn.getAttribute('data-filename');
            if (!confirm('确定删除这个备份吗？')) return;
            chrome.runtime.sendMessage({ type: 'DELETE_BACKUP', filename: filename }, function (resp) {
              if (chrome.runtime.lastError) {
                console.error('[自动保存] 删除失败: ' + chrome.runtime.lastError.message);
                return;
              }
              if (resp && resp.ok) {
                loadList();
              } else {
                console.error('[自动保存] 删除失败: ' + (resp && resp.error ? resp.error : '未知错误'));
              }
            });
          });
        })(delBtns[i]);
      }
    }

    function loadList() {
      var pid = getProblemId();
      if (!pid) {
        listBox.innerHTML = '<div class="bh-empty">无法识别题目 ID</div>';
        return;
      }
      chrome.runtime.sendMessage({ type: 'LIST_BACKUPS_BY_PROBLEM', problemId: pid }, function (resp) {
        if (chrome.runtime.lastError) {
          listBox.innerHTML = '<div class="bh-error">读取失败：' + chrome.runtime.lastError.message + '<br><br>请确认扩展已在 edge://extensions 重新加载</div>';
          return;
        }
        if (resp && resp.ok) render(resp.list);
        else render([]);
      });
    }

    refreshBtn.addEventListener('click', function () {
      loadList();
    });

    clearAllBtn.addEventListener('click', function () {
      var pid = getProblemId();
      if (!pid) return;
      if (!confirm('确定清除该题目的所有备份吗？此操作不可恢复。')) return;
      chrome.runtime.sendMessage({ type: 'CLEAR_ALL_BACKUPS', problemId: pid }, function (resp) {
        if (chrome.runtime.lastError) {
          console.error('[自动保存] 一键清除失败: ' + chrome.runtime.lastError.message);
          return;
        }
        if (resp && resp.ok) {
          loadList();
        } else {
          console.error('[自动保存] 一键清除失败: ' + (resp && resp.error ? resp.error : '未知错误'));
        }
      });
    });

    function show() {
      if (contentEl) contentEl.style.display = 'none';
      panel.style.display = 'block';
      var items = nav.querySelectorAll('.el-tabs__item');
      for (var i = 0; i < items.length; i++) {
        if (items[i] !== tab) items[i].classList.remove('is-active');
      }
      tab.classList.add('is-active');
      loadList();
    }

    function hide() {
      if (contentEl) contentEl.style.display = '';
      panel.style.display = 'none';
      tab.classList.remove('is-active');
    }

    tab.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (panel.style.display === 'block') hide();
      else show();
    });

    // 点击原生 tab 时隐藏面板
    nav.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('.el-tabs__item') : null;
      if (t && t !== tab) hide();
    });

    nav.appendChild(tab);
  }

  // 点击「运行自测」「提交评测」→ 按原因保存
  document.addEventListener('click', function (e) {
    var hit = findTrigger(e);
    if (hit === '运行自测') save(REASONS.ONLINE_TEST);
    else if (hit === '提交评测') save(REASONS.SUBMIT);
  }, true);

  // 注入亮色/暗色适配样式
  injectStyles();

  // 页面加载时自动填充
  autoFill();

  // 每 500ms：确保备份按钮/备份历史 tab 已注入 + 检测题目 ID 变化（SPA 路由切换）
  var lastPid = getProblemId();
  setInterval(function () {
    injectBackupBtn();
    injectBackupHistoryTab();
    injectAutoBackupSetting();
    checkAutoBackup();
    var pid = getProblemId();
    if (pid !== lastPid) {
      lastPid = pid;
      if (pid) autoFill();
    }
  }, 500);
})();
