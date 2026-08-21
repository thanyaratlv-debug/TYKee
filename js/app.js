// ==========================================================================
// app.js — ตัวควบคุมหลักของแอป: จัดการ view, คิว SRS, การ์ดพลิก, ปัด, สถิติ ฯลฯ
// ==========================================================================

const LEVELS = [
  { id: "n5", label: "N5", desc: "ง่ายมาก" },
  { id: "n4", label: "N4", desc: "ง่าย" },
  { id: "n3", label: "N3", desc: "ปานกลาง" },
  { id: "n2", label: "N2", desc: "ยาก" },
  { id: "n1", label: "N1", desc: "ยากมาก" },
];
const MODES = [
  { id: "kanji", label: "คันจิ", jp: "漢字" },
  { id: "hiragana", label: "ฮิรางานะ", jp: "ひらがな" },
  { id: "katakana", label: "คาตากานะ", jp: "カタカナ" },
];

function levelMeta(id) { return LEVELS.find((l) => l.id === id); }
function toKatakana(hira) {
  return hira.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}
function pref(key, fallback) {
  const v = localStorage.getItem("thayakii." + key);
  return v === null ? fallback : v;
}
function setPref(key, value) { localStorage.setItem("thayakii." + key, value); }

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------------------------------------------------------------------
// สถานะแอป
// ---------------------------------------------------------------------
const State = {
  mode: pref("mode", "kanji"),
  level: pref("level", "mix"),
  category: pref("category", "all"),
  queue: [],
  history: [],
  historyIndex: -1,
  lastActiveTs: Date.now(),
};

// ---------------------------------------------------------------------
// สร้างคิวคำศัพท์: คำที่ครบกำหนดทบทวนก่อน ตามด้วยคำใหม่ (จำกัดต่อเซสชัน)
// ---------------------------------------------------------------------
const NEW_PER_SESSION = 20;

async function buildQueue() {
  const words = await API.getWordsByFilter(State.level, State.category);
  if (words.length === 0) { State.queue = []; return; }
  const idSet = new Set(words.map((w) => w.id));

  const allProgress = await DB.getAllProgress();
  const relevant = allProgress.filter((p) => idSet.has(p.wordId));
  const progressedIds = new Set(relevant.map((p) => p.wordId));

  const due = SRS.sortByDue(relevant.filter((p) => p.due <= Date.now())).map((p) => p.wordId);
  const fresh = words.filter((w) => !progressedIds.has(w.id))
    .sort(() => Math.random() - 0.5)
    .slice(0, NEW_PER_SESSION)
    .map((w) => w.id);

  let queue = [...due, ...fresh];
  if (queue.length === 0) {
    // ไม่มีคำค้างทบทวน/คำใหม่ในตัวกรองนี้ -> สุ่มคำที่เคยเรียนแล้วมาฝึกซ้อมอิสระ
    queue = words.map((w) => w.id).sort(() => Math.random() - 0.5);
  }
  State.queue = queue;
}

async function resetSession() {
  await buildQueue();
  State.history = [];
  State.historyIndex = -1;
  await goNext();
}

// ---------------------------------------------------------------------
// การ์ด: render / flip / navigate
// ---------------------------------------------------------------------
const cardEl = document.getElementById("card");
const swipeWrapEl = document.getElementById("cardSwipeWrap");

function currentWord() {
  return State.historyIndex >= 0 ? State.history[State.historyIndex] : null;
}

async function renderWord(word) {
  const meta = levelMeta(word.level);
  const wrapFront = document.getElementById("wordWrapFront");

  let html = "";
  if (State.mode === "kanji" && word.kanji) {
    html = `<span class="word"><ruby>${word.kanji}<rt>${word.hiragana}</rt></ruby></span>`;
  } else if (State.mode === "katakana") {
    html = `<span class="word">${word.katakana || toKatakana(word.hiragana)}</span>`;
  } else {
    html = `<span class="word">${word.hiragana}</span>`;
  }
  wrapFront.innerHTML = html;

  document.getElementById("romajiFront").textContent = word.romaji;
  document.querySelectorAll(".levelPillText").forEach((el) => { el.textContent = `${meta.label} · ${meta.desc}`; });
  document.querySelectorAll(".stampText").forEach((el) => { el.textContent = meta.label; });

  document.getElementById("meaningBack").textContent = word.meaning;
  document.getElementById("exampleJpBack").innerHTML =
    `<ruby>${rubyfy(word.example_jp, word.example_reading)}</ruby>`;
  document.getElementById("exampleThBack").textContent = word.example_th;

  const cats = (word.categories || []).map((c) => API.categoryLabel(c)).join(" · ");
  document.getElementById("categoryBack").textContent = cats;

  await refreshMarkButtons(word.id);
  cardEl.classList.remove("flipped");
}

// เรียงฟุริงานะแบบง่าย: วางคำอ่านทั้งประโยคไว้ใต้ ruby รวมก้อนเดียว (ไม่ตัดรายตัวอักษร)
function rubyfy(jpSentence, reading) {
  return `${jpSentence}<rt>${reading}</rt>`;
}

async function refreshMarkButtons(wordId) {
  const isFav = await DB.isFavorite(wordId);
  const isMarked = await DB.isMarkedForReview(wordId);
  document.querySelectorAll(".favBtn").forEach((b) => b.classList.toggle("active", isFav));
  document.querySelectorAll(".markBtn").forEach((b) => b.classList.toggle("active", isMarked));
}

async function showWordById(id, { pushHistory = true } = {}) {
  const word = await DB.getWord(id);
  if (!word) return;
  if (pushHistory) {
    State.history = State.history.slice(0, State.historyIndex + 1);
    State.history.push(word);
    State.historyIndex++;
  }
  await renderWord(word);
}

async function goNext() {
  if (State.historyIndex < State.history.length - 1) {
    State.historyIndex++;
    await renderWord(State.history[State.historyIndex]);
    return;
  }
  if (State.queue.length === 0) {
    showEmptyCard();
    return;
  }
  const id = State.queue.shift();
  await showWordById(id);
}

function goPrev() {
  if (State.historyIndex > 0) {
    State.historyIndex--;
    renderWord(State.history[State.historyIndex]);
  } else {
    toast("นี่คือคำแรกในเซสชันนี้แล้ว");
  }
}

function showEmptyCard() {
  document.getElementById("wordWrapFront").innerHTML = `<span class="word" style="font-size:28px">ยังไม่มีคำในหมวดนี้</span>`;
  document.getElementById("romajiFront").textContent = "ลองเปลี่ยนตัวกรองดูนะ";
}

function flipCard() { cardEl.classList.toggle("flipped"); }

// ---------------------------------------------------------------------
// การให้คะแนน SRS
// ---------------------------------------------------------------------
async function rate(rating) {
  const word = currentWord();
  if (!word) return;
  let p = await DB.getProgress(word.id);
  if (!p) p = SRS.freshProgress(word.id);
  const updated = SRS.next(p, rating);
  await DB.putProgress(updated);
  await DB.logReview(word.id, rating);

  if (rating === 0) {
    State.queue.splice(Math.min(3, State.queue.length), 0, word.id);
  }
  await goNext();
}

// ---------------------------------------------------------------------
// Favorite / Mark-for-review
// ---------------------------------------------------------------------
async function toggleFav() {
  const word = currentWord();
  if (!word) return;
  const now = await DB.toggleFavorite(word.id);
  document.querySelectorAll(".favBtn").forEach((b) => b.classList.toggle("active", now));
  toast(now ? "เพิ่มในรายการโปรดแล้ว" : "เอาออกจากรายการโปรดแล้ว");
}
async function toggleMark() {
  const word = currentWord();
  if (!word) return;
  const now = await DB.toggleReviewMark(word.id);
  document.querySelectorAll(".markBtn").forEach((b) => b.classList.toggle("active", now));
  toast(now ? "บันทึกไว้อ่านใหม่แล้ว" : "เอาออกจากรายการอ่านใหม่แล้ว");
}

// ---------------------------------------------------------------------
// Gestures: ปัดซ้าย = คำถัดไป, ปัดขวา = คำก่อนหน้า, แตะ = พลิกการ์ด
// ---------------------------------------------------------------------
attachCardGestures(swipeWrapEl, {
  onTap: flipCard,
  onSwipeLeft: () => goNext(),
  onSwipeRight: () => goPrev(),
});

// ---------------------------------------------------------------------
// View / Tab navigation
// ---------------------------------------------------------------------
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  if (name === "saved") renderSavedLists();
  if (name === "stats") renderStats();
}
document.querySelectorAll(".tab-btn").forEach((b) => {
  b.addEventListener("click", () => showView(b.dataset.view));
});

// ---------------------------------------------------------------------
// Filter sheet (ระดับ + หมวดหมู่)
// ---------------------------------------------------------------------
const filterOverlay = document.getElementById("filterOverlay");
document.getElementById("openFilter").addEventListener("click", () => {
  buildFilterPills();
  filterOverlay.classList.add("open");
});
document.getElementById("closeFilter").addEventListener("click", () => filterOverlay.classList.remove("open"));
filterOverlay.addEventListener("click", (e) => { if (e.target === filterOverlay) filterOverlay.classList.remove("open"); });

function buildFilterPills() {
  const levelWrap = document.getElementById("filterLevelPills");
  levelWrap.innerHTML =
    `<button class="pill stamped${State.level === "mix" ? " active" : ""}" data-level="mix">ผสมทุกระดับ</button>` +
    LEVELS.map((l) => `<button class="pill stamped${State.level === l.id ? " active" : ""}" data-level="${l.id}">${l.label} · ${l.desc}</button>`).join("");
  levelWrap.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      State.level = btn.dataset.level; setPref("level", State.level);
      buildFilterPills();
      await resetSession();
    });
  });

  const catWrap = document.getElementById("filterCategoryPills");
  const cats = API.getCategories();
  catWrap.innerHTML =
    `<button class="pill${State.category === "all" ? " active" : ""}" data-cat="all">ทุกหมวดหมู่</button>` +
    cats.map((c) => `<button class="pill${State.category === c.id ? " active" : ""}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join("");
  catWrap.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      State.category = btn.dataset.cat; setPref("category", State.category);
      buildFilterPills();
      await resetSession();
    });
  });
}

document.getElementById("shuffleAllBtn").addEventListener("click", async () => {
  State.level = "mix"; State.category = "all";
  setPref("level", "mix"); setPref("category", "all");
  buildFilterPills();
  await resetSession();
  filterOverlay.classList.remove("open");
  toast("สุ่มคำศัพท์จากทุกหมวดหมู่แล้ว");
});

// ---------------------------------------------------------------------
// Settings view: mode / audio / notifications / data
// ---------------------------------------------------------------------
function buildModePills() {
  const wrap = document.getElementById("modePills");
  wrap.innerHTML = MODES.map((m) => `<button class="pill${State.mode === m.id ? " active" : ""}" data-mode="${m.id}"><span class="jp">${m.jp}</span> ${m.label}</button>`).join("");
  wrap.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      State.mode = btn.dataset.mode; setPref("mode", State.mode);
      buildModePills();
      const w = currentWord();
      if (w) renderWord(w);
    });
  });
}

function initAudioSettings() {
  const slider = document.getElementById("ttsRate");
  slider.value = Audio_.getRate();
  document.getElementById("ttsRateLabel").textContent = slider.value + "x";
  slider.addEventListener("input", () => {
    Audio_.setRate(slider.value);
    document.getElementById("ttsRateLabel").textContent = slider.value + "x";
  });
  document.getElementById("ttsTestBtn").addEventListener("click", () => {
    Audio_.speak("こんにちは");
  });
}

async function initNotificationSettings() {
  const s = await Notify.getSchedule();
  const toggle = document.getElementById("notifyToggle");
  const timeInput = document.getElementById("notifyTime");
  const freqWrap = document.getElementById("notifyFreqPills");
  const statusEl = document.getElementById("notifyStatus");

  toggle.checked = s.enabled;
  timeInput.value = s.time;

  const freqs = [
    { id: "daily", label: "ทุกวันเวลานี้" },
    { id: "every3h", label: "ทุก 3 ชม." },
    { id: "every6h", label: "ทุก 6 ชม." },
    { id: "every12h", label: "ทุก 12 ชม." },
  ];
  freqWrap.innerHTML = freqs.map((f) => `<button class="pill${s.frequency === f.id ? " active" : ""}" data-freq="${f.id}">${f.label}</button>`).join("");
  freqWrap.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cur = await Notify.getSchedule();
      cur.frequency = btn.dataset.freq;
      await Notify.saveSchedule(cur);
      freqWrap.querySelectorAll(".pill").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  document.getElementById("notifyTimeRow").style.display = s.frequency === "daily" || !s.frequency ? "flex" : "flex";

  function updateStatus() {
    if (!("Notification" in window)) { statusEl.textContent = "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน"; return; }
    if (Notification.permission === "granted") statusEl.textContent = "ได้รับอนุญาตแล้ว";
    else if (Notification.permission === "denied") statusEl.textContent = "ถูกปฏิเสธสิทธิ์ — เปิดใช้ในตั้งค่าเบราว์เซอร์";
    else statusEl.textContent = "ยังไม่ได้ขออนุญาต";
  }
  updateStatus();

  toggle.addEventListener("change", async () => {
    if (toggle.checked) {
      const perm = await Notify.requestPermission();
      updateStatus();
      if (perm !== "granted") { toggle.checked = false; toast("ต้องอนุญาตการแจ้งเตือนก่อน"); return; }
    }
    const cur = await Notify.getSchedule();
    cur.enabled = toggle.checked;
    await Notify.saveSchedule(cur);
    toast(toggle.checked ? "เปิดการแจ้งเตือนแล้ว" : "ปิดการแจ้งเตือนแล้ว");
  });

  timeInput.addEventListener("change", async () => {
    const cur = await Notify.getSchedule();
    cur.time = timeInput.value;
    await Notify.saveSchedule(cur);
  });
}

async function initDataInfo() {
  const count = await API.getWordCount();
  document.getElementById("wordCountLabel").textContent = `${count.toLocaleString("th-TH")} คำ ในคลังคำศัพท์`;
}

document.getElementById("resetProgressBtn").addEventListener("click", async () => {
  if (!confirm("ล้างความคืบหน้า SRS ทั้งหมด (ไม่ลบรายการโปรด) แน่ใจหรือไม่?")) return;
  const all = await DB.getAllProgress();
  await Promise.all(all.map((p) => DB.putProgress({ ...p, due: Date.now(), reps: 0, interval: 0, ef: 2.5 })));
  toast("ล้างความคืบหน้าเรียบร้อย");
  await resetSession();
});

// ---------------------------------------------------------------------
// Saved view: Favorites / Review-list
// ---------------------------------------------------------------------
let savedTab = "fav";
document.querySelectorAll(".saved-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    savedTab = btn.dataset.savedTab;
    document.querySelectorAll(".saved-tab").forEach((b) => b.classList.toggle("active", b === btn));
    renderSavedLists();
  });
});

async function renderSavedLists() {
  const listEl = document.getElementById("savedList");
  const entries = savedTab === "fav" ? await DB.getAllFavorites() : await DB.getAllReviewMarks();
  if (entries.length === 0) {
    listEl.innerHTML = `<p class="empty-note">${savedTab === "fav" ? "ยังไม่มีคำโปรด แตะรูปดาวบนการ์ดเพื่อเก็บไว้" : "ยังไม่มีคำที่บันทึกไว้อ่านใหม่ แตะรูปที่คั่นหน้าบนการ์ดเพื่อบันทึก"}</p>`;
    return;
  }
  const words = await Promise.all(entries.map((e) => DB.getWord(e.wordId)));
  listEl.innerHTML = words.filter(Boolean).map((w) => `
    <div class="saved-row" data-id="${w.id}">
      <div class="saved-row-text">
        <div class="saved-row-word">${w.kanji || w.hiragana}</div>
        <div class="saved-row-meaning">${w.meaning}</div>
      </div>
      <button class="row-remove" data-remove="${w.id}" aria-label="เอาออก">✕</button>
    </div>`).join("");

  listEl.querySelectorAll(".saved-row-text").forEach((row) => {
    row.addEventListener("click", async () => {
      const id = row.closest(".saved-row").dataset.id;
      showView("learn");
      await showWordById(id);
    });
  });
  listEl.querySelectorAll(".row-remove").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.remove;
      if (savedTab === "fav") await DB.removeFavorite(id); else await DB.removeReviewMark(id);
      renderSavedLists();
      const w = currentWord();
      if (w && w.id === id) refreshMarkButtons(id);
    });
  });
}

// ---------------------------------------------------------------------
// Stats view
// ---------------------------------------------------------------------
async function renderStats() {
  const s = await Stats.summary();
  document.getElementById("statWeek").textContent = s.week.unique;
  document.getElementById("statWeekTotal").textContent = `${s.week.total} ครั้ง`;
  document.getElementById("statMonth").textContent = s.month.unique;
  document.getElementById("statMonthTotal").textContent = `${s.month.total} ครั้ง`;
  document.getElementById("statYear").textContent = s.year.unique;
  document.getElementById("statYearTotal").textContent = `${s.year.total} ครั้ง`;
  document.getElementById("statStreak").textContent = s.streak;

  const max = Math.max(1, ...s.daily.map((d) => d.count));
  document.getElementById("dailyChart").innerHTML = s.daily.map((d) => `
    <div class="chart-col">
      <div class="chart-bar" style="height:${Math.round((d.count / max) * 74) + 6}px" title="${d.count}"></div>
      <div class="chart-label">${d.label}</div>
    </div>`).join("");
}

// ---------------------------------------------------------------------
// ติดตั้งแอปลงหน้าจอหลัก
// ---------------------------------------------------------------------
let deferredPrompt = null;
const installBtn = document.getElementById("installBtn");
const installRow = document.getElementById("installRow");
const installDesc = document.getElementById("installDesc");
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

if (isStandalone) {
  installRow.style.display = "none";
} else if (isIOS) {
  installDesc.textContent = "แตะปุ่มแชร์ในซาฟารี แล้วเลือก “เพิ่มไปยังหน้าจอโฮม” เพื่อใช้แบบออฟไลน์";
  installBtn.style.display = "none";
} else {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installRow.style.display = "flex";
  });
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
}

// ---------------------------------------------------------------------
// Card-face buttons (front + back), wired once
// ---------------------------------------------------------------------
document.querySelectorAll(".favBtn").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); toggleFav(); }));
document.querySelectorAll(".markBtn").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); toggleMark(); }));
document.querySelectorAll(".audioBtn").forEach((b) => b.addEventListener("click", (e) => {
  e.stopPropagation();
  const w = currentWord();
  if (w) Audio_.speak(w.kanji || w.hiragana);
}));
document.getElementById("audioBtnExample").addEventListener("click", (e) => {
  e.stopPropagation();
  const w = currentWord();
  if (w) Audio_.speak(w.example_jp);
});
document.querySelectorAll(".rate-btn").forEach((b) => b.addEventListener("click", (e) => {
  e.stopPropagation();
  rate(Number(b.dataset.rating));
}));
document.getElementById("flipHintBtn").addEventListener("click", (e) => { e.stopPropagation(); flipCard(); });

// ---------------------------------------------------------------------
// เริ่มต้นแอป
// ---------------------------------------------------------------------
async function boot() {
  await API.init();
  buildModePills();
  buildFilterPills();
  initAudioSettings();
  await initNotificationSettings();
  await initDataInfo();
  await resetSession();
  Notify.start();
}
boot();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const idleFor = Date.now() - State.lastActiveTs;
    if (idleFor > 5 * 60 * 1000) resetSession(); // ห่างหายไปนาน -> เริ่มเซสชันใหม่ด้วยคำใหม่
    Notify.checkAndFire();
  } else {
    State.lastActiveTs = Date.now();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
