/* ============================================================
   LED image remap.
   banpick.js drives every image-display-* off the control state
   using the regular /assets/heroes/<Name>.<ext> path. The LED wall
   uses the tall (444x2048) splash art in /assets/heroes_led/<Name>.jpg
   instead, so after each state update we rewrite the srcs here.
   Runs AFTER banpick.js's own onState (script order), and falls back
   to the original art if a hero has no _led image.
   ============================================================ */
(function () {
  function ledSrc(u) {
    return u
      .replace('/assets/heroes/', '/assets/heroes_led/')
      .replace(/\.(png|jpe?g|webp|gif)(\?.*)?$/i, '.jpg');
  }

  function remap() {
    // only the pick cards (1..10) use the tall heroes_led splash art;
    // bans (11..20) keep the regular square-ish portraits so they crop to fit
    // like the banpick ban slots.
    for (let n = 1; n <= 10; n++) {
      const img = document.getElementById('image-display-' + n);
      if (!img) continue;
      const cur = img.getAttribute('src') || '';
      if (!cur.includes('/assets/heroes/')) continue; // empty or already remapped
      const next = ledSrc(cur);
      if (img.getAttribute('src') === next) continue;
      const original = cur;
      img.onerror = function () {
        img.onerror = null;
        img.src = original; // no _led version → keep the regular art
      };
      img.src = next;
    }
  }

  if (window.AOG && window.AOG.onState) window.AOG.onState(remap);
})();
