// ============================================================
// 共享 IndexedDB 封装（popup / background 共用，按库名隔离）
// 挂载 globalThis.IDB_STORE。
//
// 用途：大文件跨环境存储的中转站。
//   - popup 与 background 同属扩展 origin（chrome-extension://id），
//     可直接读写同一库，无需经过消息传递（绕开 64MB 消息上限）。
//   - content script 运行在页面 origin，读不到扩展的 IndexedDB，
//     只能由 background 读 Blob 后分片推送给它。
//
// value 结构由调用方决定，支持 Blob 等结构化克隆类型，
// 因此无需再转 base64 字符串（也避免了 33% 体积膨胀）。
// ============================================================

(function (global) {
  'use strict';

  function createStore(dbName) {
    var STORE = 'media';
    var DB_VERSION = 1;
    var dbPromise = null;

    function openDB() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(function (resolve, reject) {
        var req = indexedDB.open(dbName, DB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      return dbPromise;
    }

    function put(key, value) {
      return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(value, key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    }

    function get(key) {
      return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readonly');
          var req = tx.objectStore(STORE).get(key);
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        });
      });
    }

    function remove(key) {
      return openDB().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error); };
        });
      });
    }

    return { put: put, get: get, remove: remove };
  }

  global.IDB_STORE = { createStore: createStore };
})(typeof globalThis !== 'undefined' ? globalThis : this);
