// =========================================
// js/db.js  — tiny IndexedDB helper
// =========================================
(function () {
  const DB_NAME = 'bookCrypt';
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('backups')) {
          const store = db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(storeName, mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const res = fn(store);
      t.oncomplete = () => resolve(res);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function addBackup(record) {
    return tx('backups', 'readwrite', (store) => {
      store.add(record);
    });
  }

  async function listBackupsDesc(limit = 50) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('backups', 'readonly');
      const store = t.objectStore('backups');
      const idx = store.index('createdAt');
      const cursorReq = idx.openCursor(null, 'prev'); // newest first
      const out = [];
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (c && out.length < limit) {
          out.push(c.value);
          c.continue();
        }
      };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
    });
  }

  async function countBackups() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('backups', 'readonly');
      const store = t.objectStore('backups');
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteOldest(n) {
    if (n <= 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('backups', 'readwrite');
      const store = t.objectStore('backups');
      const idx = store.index('createdAt');
      const cursorReq = idx.openCursor(); // ascending = oldest first
      let removed = 0;
      cursorReq.onsuccess = () => {
        const c = cursorReq.result;
        if (c && removed < n) {
          const key = c.primaryKey;
          store.delete(key);
          removed++;
          c.continue();
        }
      };
      t.oncomplete = () => resolve(removed);
      t.onerror = () => reject(t.error);
    });
  }

  window.DB = { openDB, addBackup, listBackupsDesc, countBackups, deleteOldest };
})();
