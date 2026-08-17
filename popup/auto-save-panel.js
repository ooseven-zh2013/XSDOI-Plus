// ============================================================
// 代码备份面板逻辑（移植自原「编辑器自动保存」popup.js）
// 变更点：元素 id 加 backup- 前缀，避免与其它面板冲突；
// status 类名改用 as-status，其余逻辑原样保留。
// ============================================================

var backupStatusEl = document.getElementById('backup-status');
var backupExportBtn = document.getElementById('backup-export');
var backupImportBtn = document.getElementById('backup-import');
var backupClearBtn = document.getElementById('backup-clear');
var backupFileInput = document.getElementById('backup-file-input');
var backupSummaryEl = document.getElementById('backup-summary');

function asPad(n) { return String(n).padStart(2, '0'); }

function asSetStatus(text, type) {
  backupStatusEl.textContent = text;
  backupStatusEl.className = 'as-status' + (type ? ' ' + type : '');
}

function asDateStr() {
  var d = new Date();
  return d.getFullYear() + '-' + asPad(d.getMonth() + 1) + '-' + asPad(d.getDate());
}

function asSend(msg) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage(msg, function (resp) {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp);
    });
  });
}

// 渲染「题目ID：备份数量」列表
function renderBackupSummary() {
  asSend({ type: 'LIST_SUMMARY' }).then(function (resp) {
    if (!resp || !resp.ok || !resp.list || resp.list.length === 0) {
      backupSummaryEl.innerHTML = '<div class="as-sum-empty">暂无备份</div>';
      return;
    }
    backupSummaryEl.innerHTML = '';
    resp.list.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'as-sum-item';
      var pid = document.createElement('span');
      pid.className = 'as-pid';
      pid.textContent = item.problemId;
      var cnt = document.createElement('span');
      cnt.className = 'as-cnt';
      cnt.textContent = item.count + ' 个备份';
      row.appendChild(pid);
      row.appendChild(cnt);
      backupSummaryEl.appendChild(row);
    });
  });
}

// 导出：读全部备份 → 打成 JSON → 触发下载
backupExportBtn.addEventListener('click', function () {
  backupExportBtn.disabled = true;
  asSetStatus('正在导出…');
  asSend({ type: 'EXPORT_ALL' }).then(function (resp) {
    if (!resp || !resp.ok) {
      asSetStatus('导出失败：' + (resp && resp.error ? resp.error : '未知错误'), 'err');
      backupExportBtn.disabled = false;
      return;
    }
    var files = resp.files || {};
    var keys = Object.keys(files);
    if (keys.length === 0) {
      asSetStatus('没有可导出的备份');
      backupExportBtn.disabled = false;
      return;
    }
    var payload = {
      format: 'xsdoi-code-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      backups: files
    };
    var json = JSON.stringify(payload, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '新赛道代码备份-' + asDateStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    asSetStatus('已导出 ' + keys.length + ' 个备份', 'ok');
    backupExportBtn.disabled = false;
  });
});

// 导入：选文件 → 解析 JSON → 写入
backupImportBtn.addEventListener('click', function () {
  backupFileInput.value = '';
  backupFileInput.click();
});

backupFileInput.addEventListener('change', function () {
  var file = backupFileInput.files && backupFileInput.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      asSetStatus('导入失败：不是有效的 JSON 文件', 'err');
      return;
    }
    var files = data && data.backups;
    if (!files || typeof files !== 'object') {
      asSetStatus('导入失败：文件格式不正确', 'err');
      return;
    }
    backupImportBtn.disabled = true;
    asSetStatus('正在导入…');
    asSend({ type: 'IMPORT_ALL', files: files }).then(function (resp) {
      backupImportBtn.disabled = false;
      if (!resp || !resp.ok) {
        asSetStatus('导入失败：' + (resp && resp.error ? resp.error : '未知错误'), 'err');
        return;
      }
      asSetStatus('已导入 ' + resp.count + ' 个备份', 'ok');
      renderBackupSummary();
    });
  };
  reader.readAsText(file);
});

// 清空全部
backupClearBtn.addEventListener('click', function () {
  if (!confirm('确定清空所有题目的全部备份吗？此操作不可恢复。')) return;
  backupClearBtn.disabled = true;
  asSetStatus('正在清空…');
  asSend({ type: 'CLEAR_ALL' }).then(function (resp) {
    backupClearBtn.disabled = false;
    if (!resp || !resp.ok) {
      asSetStatus('清空失败：' + (resp && resp.error ? resp.error : '未知错误'), 'err');
      return;
    }
    asSetStatus('已清空 ' + resp.count + ' 个备份', 'ok');
    renderBackupSummary();
  });
});

// 打开面板时渲染列表
renderBackupSummary();
