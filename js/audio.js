// ==========================================================================
// audio.js — เสียงอ่านคำศัพท์ภาษาญี่ปุ่น ด้วย Web Speech API (ทำงานออฟไลน์
// ได้บนอุปกรณ์ที่มีเสียงระบบติดตั้งไว้แล้ว ไม่ต้องโหลดไฟล์เสียงจากเน็ต)
// ==========================================================================

const Audio_ = {
  voices: [],
  ready: false,

  init() {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      this.voices = speechSynthesis.getVoices();
      this.ready = true;
    };
    load();
    speechSynthesis.onvoiceschanged = load;
  },

  hasJapaneseVoice() {
    return this.voices.some((v) => v.lang && v.lang.toLowerCase().startsWith("ja"));
  },

  speak(text) {
    if (!("speechSynthesis" in window) || !text) return false;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = Number(localStorage.getItem("thayakii.ttsRate") || 0.85);
    const jaVoice = this.voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("ja"));
    if (jaVoice) u.voice = jaVoice;
    speechSynthesis.speak(u);
    return true;
  },

  setRate(rate) {
    localStorage.setItem("thayakii.ttsRate", String(rate));
  },
  getRate() {
    return Number(localStorage.getItem("thayakii.ttsRate") || 0.85);
  },
};

Audio_.init();
