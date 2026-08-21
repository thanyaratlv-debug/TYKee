// ==========================================================================
// gestures.js — แยกแยะ แตะ (tap) / ปัดซ้าย-ขวา (swipe) บนการ์ด โดยไม่ต้องพึ่ง
// ไลบรารีภายนอก (ให้ทำงานออฟไลน์ได้แน่นอน)
// ==========================================================================

function attachCardGestures(el, { onTap, onSwipeLeft, onSwipeRight }) {
  let startX = 0, startY = 0, startT = 0;
  let dragging = false;

  const TAP_THRESHOLD = 10;      // px ที่ขยับได้ก่อนจะไม่นับเป็น tap
  const SWIPE_THRESHOLD = 60;    // px ขั้นต่ำของแนวนอนเพื่อนับเป็น swipe
  const SWIPE_MAX_TIME = 600;    // ms

  function reset() {
    el.style.transform = "";
    el.style.opacity = "";
    dragging = false;
  }

  function pointerDown(x, y) {
    startX = x; startY = y; startT = Date.now();
    dragging = true;
    el.style.transition = "none";
  }

  function pointerMove(x, y) {
    if (!dragging) return;
    const dx = x - startX;
    const dy = y - startY;
    if (Math.abs(dx) > Math.abs(dy)) {
      el.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
      el.style.opacity = String(1 - Math.min(Math.abs(dx) / 400, 0.4));
    }
  }

  function pointerUp(x, y) {
    if (!dragging) return;
    const dx = x - startX;
    const dy = y - startY;
    const dt = Date.now() - startT;
    el.style.transition = "transform .25s ease, opacity .25s ease";

    const isHorizontal = Math.abs(dx) > Math.abs(dy);

    if (isHorizontal && Math.abs(dx) > SWIPE_THRESHOLD && dt < SWIPE_MAX_TIME) {
      const flyX = dx > 0 ? window.innerWidth : -window.innerWidth;
      el.style.transform = `translateX(${flyX}px) rotate(${dx / 20}deg)`;
      el.style.opacity = "0";
      setTimeout(() => {
        reset();
        if (dx > 0) onSwipeRight && onSwipeRight();
        else onSwipeLeft && onSwipeLeft();
      }, 220);
    } else if (Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < TAP_THRESHOLD) {
      reset();
      onTap && onTap();
    } else {
      reset();
    }
  }

  // Pointer events รองรับทั้งเมาส์และสัมผัส
  el.addEventListener("pointerdown", (e) => {
    el.setPointerCapture(e.pointerId);
    pointerDown(e.clientX, e.clientY);
  });
  el.addEventListener("pointermove", (e) => {
    if (dragging) pointerMove(e.clientX, e.clientY);
  });
  el.addEventListener("pointerup", (e) => pointerUp(e.clientX, e.clientY));
  el.addEventListener("pointercancel", reset);
}
