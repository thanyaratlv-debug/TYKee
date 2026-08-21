// ==========================================================================
// stats.js — รวมสถิติการเรียนจาก reviewLog: รายสัปดาห์ / เดือน / ปี + สถิติต่อเนื่อง
// ==========================================================================

const Stats = {
  dayKey(ts) {
    return new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
  },

  async summary() {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const all = await DB.getAllLog();

    const since = (days) => all.filter((r) => r.timestamp >= now - days * DAY);

    const uniqueWords = (rows) => new Set(rows.map((r) => r.wordId)).size;

    const week = since(7);
    const month = since(30);
    const year = since(365);

    // สร้างข้อมูลรายวันของ 7 วันล่าสุด สำหรับกราฟแท่งง่าย ๆ
    const dailyMap = {};
    week.forEach((r) => {
      const k = this.dayKey(r.timestamp);
      dailyMap[k] = (dailyMap[k] || 0) + 1;
    });
    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      const k = this.dayKey(d.getTime());
      daily.push({ key: k, label: d.toLocaleDateString("th-TH", { weekday: "short" }), count: dailyMap[k] || 0 });
    }

    // นับ streak (จำนวนวันติดต่อกันที่มีการทบทวนอย่างน้อย 1 ครั้ง)
    const daysWithReview = new Set(all.map((r) => this.dayKey(r.timestamp)));
    let streak = 0;
    for (let i = 0; ; i++) {
      const d = new Date(now - i * DAY);
      const k = this.dayKey(d.getTime());
      if (daysWithReview.has(k)) streak++;
      else break;
    }

    return {
      week: { total: week.length, unique: uniqueWords(week) },
      month: { total: month.length, unique: uniqueWords(month) },
      year: { total: year.length, unique: uniqueWords(year) },
      allTime: { total: all.length, unique: uniqueWords(all) },
      streak,
      daily,
    };
  },
};
