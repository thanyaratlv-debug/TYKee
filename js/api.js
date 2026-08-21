// ==========================================================================
// api.js — ชั้นดึงข้อมูลคำศัพท์
//
// ตอนนี้ดึงจากไฟล์ data/*.json ในเครื่อง (ทำงานออฟไลน์ได้ 100%) แล้ว import
// เข้า IndexedDB เพื่อ query ได้เร็วแม้มีคำศัพท์หลักหมื่นคำ
//
// วิธี “สลับไปใช้ backend API จริง”:
//   1) เปลี่ยนฟังก์ชัน fetchWordFiles() ให้ fetch("https://your-api.com/words")
//      แทนการอ่านไฟล์ในเครื่อง (โครงสร้าง JSON ต้องมี field เดิม)
//   2) เปลี่ยน getWords()/getWordsByFilter() ให้เรียก endpoint พร้อม query
//      params (level, category, limit, offset) แทนการ query IndexedDB
//   3) ที่เหลือ (SRS, สถิติ, favorite) ไม่ต้องแก้ เพราะแยกชั้นออกจากกันแล้ว
// ==========================================================================

const DATA_VERSION = "1.0.0"; // เปลี่ยนเลขนี้เมื่อแก้ไฟล์ data/*.json เพื่อบังคับ re-import
const WORD_FILES = [
  "data/words-n5.json",
  "data/words-n4.json",
  "data/words-n3.json",
  "data/words-n2.json",
  "data/words-n1.json",
];

async function fetchWordFiles() {
  const results = await Promise.all(WORD_FILES.map((f) => fetch(f).then((r) => r.json())));
  return results.flat();
}

const API = {
  categories: [],

  // เรียกครั้งเดียวตอนแอปเริ่มทำงาน: โหลดคำศัพท์เข้า IndexedDB ถ้ายังไม่เคยโหลด
  // หรือถ้า DATA_VERSION เปลี่ยน (มีการอัปเดตคลังคำศัพท์)
  async init() {
    const storedVersion = await DB.getSetting("dataVersion", null);
    const count = await DB.countWords();

    if (storedVersion !== DATA_VERSION || count === 0) {
      const words = await fetchWordFiles();
      await DB.putWords(words);
      await DB.setSetting("dataVersion", DATA_VERSION);
    }

    const catRes = await fetch("data/categories.json");
    this.categories = await catRes.json();
    return true;
  },

  async getAllWords() {
    return DB.getAllWords();
  },

  async getWordCount() {
    return DB.countWords();
  },

  // กรองคำศัพท์ตามระดับ + หมวดหมู่ (level: "mix" หรือรหัสระดับ, category: "all" หรือรหัสหมวด)
  async getWordsByFilter(level, category) {
    const all = await DB.getAllWords();
    return all.filter((w) => {
      const levelOk = level === "mix" || w.level === level;
      const catOk = category === "all" || (w.categories || []).includes(category);
      return levelOk && catOk;
    });
  },

  getCategories() {
    return this.categories;
  },

  categoryLabel(id) {
    const c = this.categories.find((c) => c.id === id);
    return c ? c.label : id;
  },
};
