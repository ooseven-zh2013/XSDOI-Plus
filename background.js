// ============================================================
// background service worker（AC动画替换 + 背景替换 + 代码自动保存 共用）
//
// 三套存储互不干扰：
//   - AC 动画替换：IndexedDB 库 ac-replacer-media，固定 key 'video'
//   - 背景替换：IndexedDB 库 bg-replacer-media，key 'bg-media'（视频）/ 'bg-audio'（音频）
//   - 代码自动保存：OPFS（Origin Private File System），目录 backups/，
//     文件「题目ID-时间戳-原因.cpp.backup」
//
// 为什么需要它：content script 与 popup 分属不同 origin，
// 各自的 IndexedDB / OPFS 不互通；统一由本 worker（扩展 origin）中转。
// ============================================================

importScripts('constants.js', 'idb.js');

var AC = self.AC_REPLACER;
var BG = self.BG_REPLACER;

var acStore = self.IDB_STORE.createStore('ac-replacer-media');
var bgStore = self.IDB_STORE.createStore('bg-replacer-media');

// 背景替换：根据消息里的 key 决定读/清视频还是音频
function bgKey(msg) {
  return msg && msg.key === 'audio' ? 'bg-audio' : 'bg-media';
}

function clearMedia(store, key, sendResponse) {
  store.remove(key)
    .then(function () { sendResponse({ ok: true }); })
    .catch(function (e) { sendResponse({ ok: false, reason: String(e && e.message || e) }); });
  return true;
}

// ==================== 大文件分片读取（Port 流式，AC / BG 共用）====================
// AC 动画与背景替换的 store 现在都直接存 Blob（不再 base64）。content script
// 运行在页面 origin 读不到扩展 IndexedDB，故由本 worker 读 Blob 后分片推送，
// 每片 8MB 原始字节（base64 后约 10.7MB，远低于 64MB 消息上限）。

var BG_CHUNK_BYTES = 8 * 1024 * 1024;

function arrayBufferToBase64(buf) {
  var bytes = new Uint8Array(buf);
  var chunk = 0x8000; // 32KB，避免 String.fromCharCode.apply 栈溢出
  var parts = [];
  for (var i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
  }
  return btoa(parts.join(''));
}

async function streamBlob(store, port, key) {
  try {
    var rec = await store.get(key);
    if (!rec) {
      port.postMessage({ type: 'error', reason: 'not-found' });
      return;
    }
    var blob = rec.blob;
    if (!blob && typeof rec.data === 'string') {
      // 兼容旧版本存量的 base64 字符串记录（转成 Blob 再分片）
      var binary = atob(rec.data);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: rec.mime || '' });
    }
    if (!blob) {
      port.postMessage({ type: 'error', reason: 'not-found' });
      return;
    }
    port.postMessage({ type: 'meta', mime: blob.type || '', size: blob.size });

    for (var offset = 0; offset < blob.size; offset += BG_CHUNK_BYTES) {
      var slice = blob.slice(offset, Math.min(offset + BG_CHUNK_BYTES, blob.size));
      var buf = await slice.arrayBuffer();
      port.postMessage({ type: 'chunk', data: arrayBufferToBase64(buf) });
    }
    port.postMessage({ type: 'done' });
  } catch (e) {
    port.postMessage({ type: 'error', reason: String(e && e.message || e) });
  }
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name === 'bg-media-stream') {
    port.onMessage.addListener(function (msg) {
      if (msg && msg.type === BG.MSG.load) {
        streamBlob(bgStore, port, bgKey(msg));
      }
    });
  } else if (port.name === 'ac-media-stream') {
    port.onMessage.addListener(function (msg) {
      if (msg && msg.type === AC.MSG.videoLoad) {
        streamBlob(acStore, port, 'video');
      }
    });
  }
});

// ==================== 代码自动保存：OPFS ====================

var DIR_NAME = 'backups';

// 拿到（或创建）备份目录句柄
async function getBackupDir() {
  var root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle(DIR_NAME, { create: true });
}

// 把代码写入 OPFS
async function saveToOpfs(code, filename) {
  var dir = await getBackupDir();
  var file = await dir.getFileHandle(filename, { create: true });
  var w = await file.createWritable();
  await w.write(code);
  await w.close();
}

// 找某个题目 ID 最新的备份（文件名「题目ID-时间戳-原因.cpp.backup」，时间戳补零后字典序即时间序）
async function findLatestBackup(problemId) {
  var dir = await getBackupDir();
  var prefix = problemId + '-';
  var latest = null;
  for await (var entry of dir.entries()) {
    var name = entry[0];
    if (entry[1].kind === 'file' && name.indexOf(prefix) === 0) {
      if (latest === null || name > latest) latest = name;
    }
  }
  if (latest === null) return null;
  var file = await dir.getFileHandle(latest);
  var f = await file.getFile();
  return { filename: latest, content: await f.text() };
}

// 解析文件名「题目ID-YYYY-MM-DD-HH-mm-ss-原因.cpp.backup」→ { time, reason }
function parseFilename(name, problemId) {
  var body = name.slice(problemId.length + 1); // 「YYYY-MM-DD-HH-mm-ss-原因.cpp.backup」
  var time = body.slice(0, 19);                 // 「YYYY-MM-DD-HH-mm-ss」
  var reason = body.slice(20, body.length - '.cpp.backup'.length); // 「原因」
  return { time: time, reason: reason };
}

// 列出某题目 ID 的所有备份（按时间倒序，最新在前）
async function listBackupsByProblem(problemId) {
  var dir = await getBackupDir();
  var prefix = problemId + '-';
  var list = [];
  for await (var entry of dir.entries()) {
    var name = entry[0];
    if (entry[1].kind === 'file' && name.indexOf(prefix) === 0) {
      var info = parseFilename(name, problemId);
      list.push({ filename: name, time: info.time, reason: info.reason });
    }
  }
  list.sort(function (a, b) { return b.time.localeCompare(a.time); });
  return list;
}

// 读取某个备份文件的内容
async function getBackup(filename) {
  var dir = await getBackupDir();
  var file = await dir.getFileHandle(filename);
  var f = await file.getFile();
  return f.text();
}

// 删除某个备份文件
async function deleteBackup(filename) {
  var dir = await getBackupDir();
  await dir.removeEntry(filename);
}

function pad(n) { return String(n).padStart(2, '0'); }

// 时间戳：年-月-日-时-分-秒（补零）
function timestampStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + '-' + pad(d.getHours()) + '-' + pad(d.getMinutes()) + '-' + pad(d.getSeconds());
}

// 清除某题目 ID 的所有备份
async function clearAllBackups(problemId) {
  var dir = await getBackupDir();
  var prefix = problemId + '-';
  var names = [];
  for await (var entry of dir.entries()) {
    var name = entry[0];
    if (entry[1].kind === 'file' && name.indexOf(prefix) === 0) {
      names.push(name);
    }
  }
  for (var i = 0; i < names.length; i++) {
    await dir.removeEntry(names[i]);
  }
  return names.length;
}

// 自动备份：若该题最新备份原因是「自动备份」则覆盖（删旧建新），否则新建一份「自动备份」
async function autoBackup(problemId, code) {
  var dir = await getBackupDir();
  var prefix = problemId + '-';
  var latest = null;
  for await (var entry of dir.entries()) {
    var name = entry[0];
    if (entry[1].kind === 'file' && name.indexOf(prefix) === 0) {
      if (latest === null || name > latest) latest = name;
    }
  }
  if (latest !== null) {
    var info = parseFilename(latest, problemId);
    if (info.reason === '自动备份') {
      await dir.removeEntry(latest);
    }
  }
  var filename = problemId + '-' + timestampStr() + '-自动备份.cpp.backup';
  await saveToOpfs(code, filename);
  return filename;
}

// 导出所有备份 → { filename: content }
async function exportAll() {
  var dir = await getBackupDir();
  var result = {};
  for await (var entry of dir.entries()) {
    var name = entry[0];
    if (entry[1].kind === 'file') {
      var file = await dir.getFileHandle(name);
      var f = await file.getFile();
      result[name] = await f.text();
    }
  }
  return result;
}

// 导入备份（同名覆盖）
async function importAll(files) {
  var dir = await getBackupDir();
  var count = 0;
  for (var name in files) {
    if (!files.hasOwnProperty(name)) continue;
    var file = await dir.getFileHandle(name, { create: true });
    var w = await file.createWritable();
    await w.write(files[name]);
    await w.close();
    count++;
  }
  return count;
}

// 统计每个题目 ID 的备份数量 → [{ problemId, count }]
async function listSummary() {
  var dir = await getBackupDir();
  var counts = {};
  for await (var entry of dir.entries()) {
    var name = entry[0];
    if (entry[1].kind !== 'file') continue;
    var idx = name.indexOf('-');
    if (idx <= 0) continue;
    var pid = name.slice(0, idx);
    counts[pid] = (counts[pid] || 0) + 1;
  }
  var list = Object.keys(counts).map(function (pid) {
    return { problemId: pid, count: counts[pid] };
  });
  list.sort(function (a, b) { return a.problemId.localeCompare(b.problemId); });
  return list;
}

// 清空全部备份
async function clearAll() {
  var dir = await getBackupDir();
  var names = [];
  for await (var entry of dir.entries()) {
    if (entry[1].kind === 'file') names.push(entry[0]);
  }
  for (var i = 0; i < names.length; i++) {
    await dir.removeEntry(names[i]);
  }
  return names.length;
}

// ==================== 消息分发 ====================

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return false;

  // ===== AC 动画替换：清除视频 =====
  // 上传由 popup 直写 IndexedDB，读取走 onConnect 分片，故只保留 clear
  if (msg.type === AC.MSG.videoClear) return clearMedia(acStore, 'video', sendResponse);

  // ===== 背景替换：清除（视频 / 音频）=====
  // 上传由 popup 直写 IndexedDB，读取走 onConnect 分片，故只保留 clear
  if (msg.type === BG.MSG.clear) return clearMedia(bgStore, bgKey(msg), sendResponse);

  // ===== 代码自动保存：OPFS =====
  if (msg.type === 'SAVE_CODE') {
    if (!msg.code || !msg.filename) return false;
    saveToOpfs(msg.code, msg.filename).then(
      function () { sendResponse({ ok: true }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'FIND_LATEST_BACKUP') {
    if (!msg.problemId) return false;
    findLatestBackup(msg.problemId).then(
      function (result) {
        sendResponse({
          ok: true,
          filename: result ? result.filename : null,
          content: result ? result.content : null
        });
      },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'LIST_BACKUPS_BY_PROBLEM') {
    if (!msg.problemId) return false;
    listBackupsByProblem(msg.problemId).then(
      function (list) { sendResponse({ ok: true, list: list }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'GET_BACKUP') {
    if (!msg.filename) return false;
    getBackup(msg.filename).then(
      function (content) { sendResponse({ ok: true, content: content }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'DELETE_BACKUP') {
    if (!msg.filename) return false;
    deleteBackup(msg.filename).then(
      function () { sendResponse({ ok: true }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'CLEAR_ALL_BACKUPS') {
    if (!msg.problemId) return false;
    clearAllBackups(msg.problemId).then(
      function (count) { sendResponse({ ok: true, count: count }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'AUTO_BACKUP') {
    if (!msg.problemId || !msg.code) return false;
    autoBackup(msg.problemId, msg.code).then(
      function (filename) { sendResponse({ ok: true, filename: filename }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'EXPORT_ALL') {
    exportAll().then(
      function (files) { sendResponse({ ok: true, files: files }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'IMPORT_ALL') {
    if (!msg.files) return false;
    importAll(msg.files).then(
      function (count) { sendResponse({ ok: true, count: count }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'CLEAR_ALL') {
    clearAll().then(
      function (count) { sendResponse({ ok: true, count: count }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  if (msg.type === 'LIST_SUMMARY') {
    listSummary().then(
      function (list) { sendResponse({ ok: true, list: list }); },
      function (err) { sendResponse({ ok: false, error: String(err) }); }
    );
    return true;
  }

  return false;
});
