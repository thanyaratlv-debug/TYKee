// ==========================================================================
// db.js — ชั้นเก็บข้อมูลด้วย IndexedDB
// รองรับคำศัพท์หลักหมื่นคำ + สถานะ SRS + รายการโปรด + log สถิติ ทำงานออฟไลน์ 100%
// ==========================================================================

const DB_NAME = "thayakiiDB";
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains("words")) {
        const s = db.createObjectStore("words", { keyPath: "id" });
        s.createIndex("level", "level", { unique: false });
      }
      if (!db.objectStoreNames.contains("progress")) {
        const s = db.createObjectStore("progress", { keyPath: "wordId" });
        s.createIndex("due", "due", { unique: false });
        s.createIndex("state", "state", { unique: false });
      }
      if (!db.objectStoreNames.contains("favorites")) {
        db.createObjectStore("favorites", { keyPath: "wordId" });
      }
      if (!db.objectStoreNames.contains("reviewList")) {
        db.createObjectStore("reviewList", { keyPath: "wordId" });
      }
      if (!db.objectStoreNames.contains("reviewLog")) {
        const s = db.createObjectStore("reviewLog", { keyPath: "id", autoIncrement: true });
        s.createIndex("timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames)
      ? storeNames.map((n) => t.objectStore(n))
      : t.objectStore(storeNames);
    let result;
    Promise.resolve(fn(stores, t))
      .then((r) => { result = r; })
      .catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  // ---------- words ----------
  async putWords(words) {
    return tx("words", "readwrite", (store) => {
      words.forEach((w) => store.put(w));
    });
  },
  async getAllWords() {
    return tx("words", "readonly", (store) => reqToPromise(store.getAll()));
  },
  async countWords() {
    return tx("words", "readonly", (store) => reqToPromise(store.count()));
  },
  async getWord(id) {
    return tx("words", "readonly", (store) => reqToPromise(store.get(id)));
  },

  // ---------- progress (SRS state) ----------
  async getProgress(wordId) {
    return tx("progress", "readonly", (store) => reqToPromise(store.get(wordId)));
  },
  async putProgress(p) {
    return tx("progress", "readwrite", (store) => store.put(p));
  },
  async getAllProgress() {
    return tx("progress", "readonly", (store) => reqToPromise(store.getAll()));
  },
  async getDueProgress(nowTs) {
    const all = await this.getAllProgress();
    return all.filter((p) => p.due <= nowTs);
  },

  // ---------- favorites ----------
  async toggleFavorite(wordId) {
    return tx("favorites", "readwrite", async (store) => {
      const existing = await reqToPromise(store.get(wordId));
      if (existing) { store.delete(wordId); return false; }
      store.put({ wordId, addedAt: Date.now() });
      return true;
    });
  },
  async isFavorite(wordId) {
    return tx("favorites", "readonly", (store) => reqToPromise(store.get(wordId))).then(Boolean);
  },
  async getAllFavorites() {
    return tx("favorites", "readonly", (store) => reqToPromise(store.getAll()));
  },

  // ---------- review list ("เก็บไว้อ่านใหม่") ----------
  async toggleReviewMark(wordId) {
    return tx("reviewList", "readwrite", async (store) => {
      const existing = await reqToPromise(store.get(wordId));
      if (existing) { store.delete(wordId); return false; }
      store.put({ wordId, addedAt: Date.now() });
      return true;
    });
  },
  async isMarkedForReview(wordId) {
    return tx("reviewList", "readonly", (store) => reqToPromise(store.get(wordId))).then(Boolean);
  },
  async getAllReviewMarks() {
    return tx("reviewList", "readonly", (store) => reqToPromise(store.getAll()));
  },
  async removeReviewMark(wordId) {
    return tx("reviewList", "readwrite", (store) => store.delete(wordId));
  },
  async removeFavorite(wordId) {
    return tx("favorites", "readwrite", (store) => store.delete(wordId));
  },

  // ---------- review log (สำหรับสถิติ) ----------
  async logReview(wordId, rating) {
    return tx("reviewLog", "readwrite", (store) => {
      store.add({ wordId, rating, timestamp: Date.now() });
    });
  },
  async getLogSince(sinceTs) {
    const all = await tx("reviewLog", "readonly", (store) => reqToPromise(store.getAll()));
    return all.filter((r) => r.timestamp >= sinceTs);
  },
  async getAllLog() {
    return tx("reviewLog", "readonly", (store) => reqToPromise(store.getAll()));
  },

  // ---------- settings ----------
  async getSetting(key, fallback = null) {
    const r = await tx("settings", "readonly", (store) => reqToPromise(store.get(key)));
    return r ? r.value : fallback;
  },
  async setSetting(key, value) {
    return tx("settings", "readwrite", (store) => store.put({ key, value }));
  },
};
