// ==========================================================================
// srs.js — อัลกอริทึม Spaced Repetition (แบบย่อของ SM-2 ที่ใช้ใน Anki)
// rating: 0 = ยังไม่รู้ (Again), 1 = ยาก (Hard), 2 = จำได้ (Good), 3 = ง่าย (Easy)
// ==========================================================================

const SRS = {
  DAY_MS: 24 * 60 * 60 * 1000,

  // สร้างสถานะเริ่มต้นของคำศัพท์ที่ยังไม่เคยทบทวน
  freshProgress(wordId) {
    return {
      wordId,
      ef: 2.5,        // ease factor
      interval: 0,     // จำนวนวันก่อนครบกำหนดทบทวนรอบถัดไป
      reps: 0,         // จำนวนครั้งที่ตอบถูกติดต่อกัน
      state: "new",    // new | learning | review
      due: Date.now(), // ครบกำหนดทันที (เป็นคำใหม่)
      lastReviewed: null,
    };
  },

  // คำนวณสถานะถัดไปจากการให้คะแนนของผู้ใช้
  next(progress, rating) {
    let { ef, interval, reps } = progress;

    if (rating === 0) {
      // Again: รีเซ็ตรอบ กลับมาให้ดูใหม่เร็ว ๆ นี้ในเซสชันเดียวกัน
      reps = 0;
      interval = 0;
      ef = Math.max(1.3, ef - 0.2);
    } else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 3;
      else interval = Math.round(interval * ef);

      reps += 1;

      if (rating === 1) ef = Math.max(1.3, ef - 0.15);       // Hard
      else if (rating === 3) ef = ef + 0.15;                  // Easy
      // rating === 2 (Good) -> ef คงเดิม
    }

    const state = reps === 0 ? "learning" : (interval >= 21 ? "review" : "learning");
    const due = rating === 0
      ? Date.now() + 2 * 60 * 1000       // Again -> ให้กลับมาใหม่ใน ~2 นาที (ภายในเซสชัน)
      : Date.now() + interval * SRS.DAY_MS;

    return { ...progress, ef, interval, reps, state, due, lastReviewed: Date.now() };
  },

  // เรียงคำที่ครบกำหนดทบทวนจากเก่าสุดไปใหม่สุด (ค้างนานสุดก่อน)
  sortByDue(progressList) {
    return [...progressList].sort((a, b) => a.due - b.due);
  },
};
