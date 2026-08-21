// ==========================================================================
// notifications.js — การแจ้งเตือนคำศัพท์ใหม่แบบปรับได้
//
// ข้อจำกัดสำคัญ: เบราว์เซอร์ส่วนใหญ่ (โดยเฉพาะ iOS Safari) ไม่อนุญาตให้เว็บแอป
// ส่ง Notification ขณะแอปถูกปิดสนิท ถ้าไม่มีเซิร์ฟเวอร์ Push จริงอยู่เบื้องหลัง
// โมดูลนี้จึงทำงานแบบ "best effort":
//   1) ถ้าเปิดแอป/แท็บทิ้งไว้ (แม้ย่อไปพื้นหลัง) จะเช็คเวลาทุก 1 นาทีแล้วแจ้งเตือน
//      เมื่อถึงเวลาที่ตั้งไว้
//   2) ลองใช้ Periodic Background Sync (รองรับเฉพาะ Chrome/Android ที่ติดตั้ง
//      แอปแล้วเท่านั้น) เป็นการอัปเกรดแบบ progressive enhancement
//   3) ถ้าต้องการแจ้งเตือนแม้ปิดแอปสนิทบนทุกอุปกรณ์ 100% ต้องต่อกับเซิร์ฟเวอร์
//      Push (Web Push API + VAPID keys) ซึ่งไฟล์นี้เตรียมจุดเชื่อมไว้ให้แล้ว
//      ที่ฟังก์ชัน registerPushWithServer() (ยังไม่ผูกจริง)
// ==========================================================================

const Notify = {
  timer: null,

  async getSchedule() {
    return DB.getSetting("notifySchedule", {
      enabled: false,
      time: "09:00",     // HH:MM แจ้งเตือนตอนไหนของวัน
      frequency: "daily", // daily | every3h | every6h | every12h
      lastFired: null,    // YYYY-MM-DD ของครั้งล่าสุดที่แจ้งไปแล้ว (กันแจ้งซ้ำ)
    });
  },

  async saveSchedule(schedule) {
    await DB.setSetting("notifySchedule", schedule);
    this.restart();
  },

  async requestPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    return Notification.requestPermission();
  },

  async fire(word) {
    const title = "たやきぃ — มีคำศัพท์ใหม่รอคุณอยู่";
    const body = word
      ? `${word.kanji || word.hiragana} · ${word.meaning}`
      : "แตะเพื่อทบทวนคำศัพท์ภาษาญี่ปุ่นวันนี้";
    const options = {
      body,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      tag: "thayakii-daily",
    };
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) { reg.showNotification(title, options); return; }
    }
    new Notification(title, options);
  },

  async checkAndFire() {
    const s = await this.getSchedule();
    if (!s.enabled || Notification.permission !== "granted") return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (s.frequency === "daily") {
      const [h, m] = s.time.split(":").map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      const withinWindow = Math.abs(now - target) < 60 * 1000; // ภายใน 1 นาทีจากเวลาที่ตั้ง
      if (withinWindow && s.lastFired !== todayStr) {
        const words = await DB.getAllWords();
        const random = words[Math.floor(Math.random() * words.length)];
        await this.fire(random);
        s.lastFired = todayStr;
        await DB.setSetting("notifySchedule", s);
      }
    } else {
      const hours = { every3h: 3, every6h: 6, every12h: 12 }[s.frequency] || 6;
      const lastTs = Number(s.lastFiredTs || 0);
      if (Date.now() - lastTs >= hours * 60 * 60 * 1000) {
        const words = await DB.getAllWords();
        const random = words[Math.floor(Math.random() * words.length)];
        await this.fire(random);
        s.lastFiredTs = Date.now();
        await DB.setSetting("notifySchedule", s);
      }
    }
  },

  start() {
    this.stop();
    this.checkAndFire();
    this.timer = setInterval(() => this.checkAndFire(), 60 * 1000);
    this.tryPeriodicSync();
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  restart() {
    this.start();
  },

  // ความพยายามเสริม (progressive enhancement) — ใช้ได้เฉพาะบางเบราว์เซอร์/แพลตฟอร์ม
  async tryPeriodicSync() {
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (!("periodicSync" in reg)) return;
      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state === "granted") {
        await reg.periodicSync.register("thayakii-daily-word", { minInterval: 6 * 60 * 60 * 1000 });
      }
    } catch (e) { /* ไม่รองรับ — ใช้ตัวจับเวลาแบบ foreground แทน */ }
  },

  // จุดเชื่อมสำหรับอนาคต ถ้าต้องการ Push แจ้งเตือนแม้ปิดแอปสนิท 100%
  // ต้องมีเซิร์ฟเวอร์ที่เก็บ push subscription แล้วยิง Web Push มาตามเวลา
  async registerPushWithServer(/* vapidPublicKey, apiEndpoint */) {
    // ตัวอย่างโครงร่าง (ยังไม่ผูกจริง เพราะต้องมีเซิร์ฟเวอร์ฝั่ง backend):
    // const reg = await navigator.serviceWorker.ready;
    // const sub = await reg.pushManager.subscribe({
    //   userVisibleOnly: true,
    //   applicationServerKey: vapidPublicKey,
    // });
    // await fetch(apiEndpoint, { method: "POST", body: JSON.stringify(sub) });
    console.info("registerPushWithServer: ยังไม่ได้ผูกกับเซิร์ฟเวอร์ push จริง");
  },
};
