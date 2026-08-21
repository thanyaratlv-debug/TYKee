const CACHE_NAME = "thayakii-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./js/db.js",
  "./js/srs.js",
  "./js/api.js",
  "./js/audio.js",
  "./js/notifications.js",
  "./js/stats.js",
  "./js/gestures.js",
  "./js/app.js",
  "./data/words-n5.json",
  "./data/words-n4.json",
  "./data/words-n3.json",
  "./data/words-n2.json",
  "./data/words-n1.json",
  "./data/categories.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first แล้วอัปเดตแคชในพื้นหลังถ้ามีเน็ต (stale-while-revalidate)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// รองรับ Periodic Background Sync (progressive enhancement บางแพลตฟอร์มเท่านั้น)
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "thayakii-daily-word") {
    event.waitUntil(
      self.registration.showNotification("たやきぃ — มีคำศัพท์ใหม่รอคุณอยู่", {
        body: "แตะเพื่อทบทวนคำศัพท์ภาษาญี่ปุ่นวันนี้",
        icon: "icons/icon-192.png",
        badge: "icons/icon-192.png",
        tag: "thayakii-daily",
      })
    );
  }
});
