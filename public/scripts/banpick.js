const SFX = { ban: "/assets/sfx/BAN.MP3", pick: "/assets/sfx/PICK.MP3" };
const ARROWS = {
  banBlue: "/assets/ui/leftbanning.gif",
  banRed: "/assets/ui/rightbanning.gif",
  pickBlue: "/assets/ui/leftpicking.gif",
  pickRed: "/assets/ui/rightpicking.gif",
  swap: "/assets/ui/adjustment.png",
};

function imgIndex(group, i) {
  if (group === "pickLeft") return i + 1;
  if (group === "pickRight") return i + 6;
  if (group === "banLeft") return i + 11;
  if (group === "banRight") return i + 16;
  return null;
}

let prevPhaseIndex = -1;
const lastImg = {};

function playSFX(src) {
  const a = document.getElementById("sfx-audio");
  if (!a) return;
  a.pause();
  a.currentTime = 0;
  a.src = src;
  a.play().catch(() => {});
}
function playVoice(src) {
  const a = document.getElementById("hero-voice");
  if (!a || !src) return;
  a.pause();
  a.currentTime = 0;
  a.src = src;
  a.play().catch(() => {});
}

function arrowFor(phase) {
  if (!phase) return "";
  if (phase.type === "swap") return ARROWS.swap;
  return ARROWS[phase.type + (phase.team === "blue" ? "Blue" : "Red")] || "";
}

const PHASE_TYPES = [
  "ban",
  "ban",
  "ban",
  "ban",
  "pick",
  "pick",
  "pick",
  "pick",
  "ban",
  "ban",
  "ban",
  "ban",
  "pick",
  "pick",
  "pick",
  "swap",
];
const PHASE_TEAMS = [
  "blue",
  "red",
  "blue",
  "red",
  "blue",
  "red",
  "blue",
  "red",
  "red",
  "blue",
  "red",
  "blue",
  "red",
  "blue",
  "red",
  null,
];
function phaseAt(i) {
  if (i < 0 || i >= 16) return null;
  return { type: PHASE_TYPES[i], team: PHASE_TEAMS[i] };
}

function setColors(cfg) {
  const r = document.documentElement.style;
  r.setProperty("--blueteamcolor", cfg.teams.blue.color);
  r.setProperty("--redteamcolor", cfg.teams.red.color);
  r.setProperty("--bluetextcolor", cfg.teams.blue.textColor);
  r.setProperty("--redtextcolor", cfg.teams.red.textColor);
}

// Ban slot -> its phase index (mirrors PHASES in src/lib/draft.js). A ban is
// "locked" once the draft advances past its phase; until then it is a live
// preview shown in full colour. The 5th slot is legacy (offscreen) => null.
const BAN_PHASE = {
  banLeft: [0, 2, 9, 11, null],
  banRight: [1, 3, 8, 10, null],
};
// Pick slot -> its phase index (mirrors PHASES in src/lib/draft.js). A pick is
// "locked" once the draft advances past its phase.
const PICK_PHASE = {
  pickLeft: [4, 6, 6, 13, 13],
  pickRight: [5, 5, 7, 12, 14],
};
const lockedState = {};
let lockInit = false;

// ---- pick-turn running-light effect ----
// image-box numbers per pick group (matches imgIndex()).
const PICK_IMG = { pickLeft: [1, 2, 3, 4, 5], pickRight: [6, 7, 8, 9, 10] };
// Give each pick card its running border-light overlay (styled in pickcards.css).
// The flowing-texture canvas (.card-flow) is created/driven by pickflow.js.
function ensurePickGlows() {
  for (let n = 1; n <= 10; n++) {
    const box = document.getElementById(`image-box-${n}`);
    const card = box && box.closest(".heropick");
    if (!card) continue;
    if (!card.querySelector(":scope > .pick-turn-glow")) {
      const g = document.createElement("div");
      g.className = "pick-turn-glow";
      card.appendChild(g);
    }
  }
}
// Mark the card(s) whose turn it is with `.picking` (the light runs until the
// phase advances, i.e. until the pick is locked). In swap (phase 15) all 10 pick
// cards light up to signal the swap/adjustment step.
function pickActiveSet(phaseIndex) {
  const active = new Set();
  if (phaseIndex === 15) {
    for (let n = 1; n <= 10; n++) active.add(n);
  } else if (PHASE_TYPES[phaseIndex] === "pick") {
    for (const g of ["pickLeft", "pickRight"]) {
      PICK_PHASE[g].forEach((ph, i) => {
        if (ph === phaseIndex) active.add(PICK_IMG[g][i]);
      });
    }
  }
  return active;
}
function applyPickActive(active) {
  for (let n = 1; n <= 10; n++) {
    const box = document.getElementById(`image-box-${n}`);
    const card = box && box.closest(".heropick");
    if (!card) continue;
    const want = active.has(n);
    const had = card.classList.contains("picking");
    card.classList.toggle("picking", want);
    // Sync the running-light phase to a global clock so every card (including a
    // card already picking when swap begins) moves in step: animation-delay of
    // -(now mod duration) makes the phase equal to (time mod duration) for all.
    if (want && !had) {
      const glow = card.querySelector(":scope > .pick-turn-glow");
      if (glow) {
        glow.style.animationDelay = (-((performance.now() / 1000) % 1.8)).toFixed(3) + "s";
      }
    }
  }
}
// One-shot lock effect on all 10 pick cards when the swap turn ends.
function triggerSwapLock() {
  for (let n = 1; n <= 10; n++) {
    const box = document.getElementById(`image-box-${n}`);
    const card = box && box.closest(".heropick");
    if (!card) continue;
    card.classList.remove("lock-fx");
    void card.offsetWidth; // reflow so the shine restarts
    card.classList.add("lock-fx");
    clearTimeout(card._swapLockT);
    card._swapLockT = setTimeout(() => card.classList.remove("lock-fx"), 1000);
  }
  playSFX(SFX.pick); // lock sound (silent on the LED — it has no audio element)
}

let pickTurnTimer = null;
let pickTurnPrevPhase = -1;
let swapRevealPending = false;
const SWAP_REVEAL_DELAY = 800; // ms pause after the last lock before the swap effect
function renderPickTurn(phaseIndex) {
  // swap turn just ended (15 → done) → lock all 10 cards
  if (pickTurnPrevPhase === 15 && phaseIndex >= 16) triggerSwapLock();
  if (phaseIndex === 15) {
    if (pickTurnPrevPhase !== 15) {
      // just entered swap: pause (turn the last card's light off) then reveal all 10
      clearTimeout(pickTurnTimer);
      swapRevealPending = true;
      applyPickActive(new Set());
      pickTurnTimer = setTimeout(() => {
        swapRevealPending = false;
        applyPickActive(pickActiveSet(15));
      }, SWAP_REVEAL_DELAY);
    } else if (!swapRevealPending) {
      applyPickActive(pickActiveSet(15)); // already revealed — keep it on
    }
    // while pending, do nothing so the pause isn't cut short by a state tick
  } else {
    clearTimeout(pickTurnTimer);
    swapRevealPending = false;
    applyPickActive(pickActiveSet(phaseIndex));
  }
  pickTurnPrevPhase = phaseIndex;
}

// One-shot lock reveal: draw the X + pulse (bans) / shine (picks). Fires on the
// same state update that advances the phase, so it lands with the lock SFX.
function triggerLockFx(box, isBan) {
  const el = isBan ? box : box.closest(".heropick");
  if (!el) return;
  el.classList.remove("lock-fx");
  void el.offsetWidth; // reflow so the animation restarts
  el.classList.add("lock-fx");
  clearTimeout(el._lockT);
  el._lockT = setTimeout(() => el.classList.remove("lock-fx"), 1000);
}

function renderHeroes(slots, phaseIndex) {
  const groups = ["banLeft", "banRight", "pickLeft", "pickRight"];
  for (const g of groups) {
    slots[g].forEach((hero, i) => {
      const n = imgIndex(g, i);
      const img = document.getElementById(`image-display-${n}`);
      const box = document.getElementById(`image-box-${n}`);
      if (!img || !box) return;
      const src = hero ? hero.img : "";
      if (src) {
        if (lastImg[n] !== src) {
          img.src = src;
          img.style.opacity = "1";
          box.classList.remove("hero-animate-in");
          void box.offsetWidth;
          box.classList.add("hero-animate-in");
          if (hero.voice) playVoice(hero.voice);
        }
        box.classList.add("show");
      } else {
        img.src = "";
        img.style.opacity = "0";
        box.classList.remove("show", "hero-animate-in", "hero-animate-out");
      }
      // Lock state (bans + picks): locked once the draft passes this slot's phase.
      const isBan = g === "banLeft" || g === "banRight";
      const ph = (isBan ? BAN_PHASE[g] : PICK_PHASE[g])[i];
      const locked = !!src && ph != null && phaseIndex > ph;
      if (isBan) box.classList.toggle("locked", locked);
      // Play the lock effect on the transition into locked (skip the first render
      // so a mid-match overlay refresh doesn't replay every lock at once).
      if (lockInit && locked && !lockedState[n]) triggerLockFx(box, isBan);
      lockedState[n] = locked;
      lastImg[n] = src;
    });
  }
  lockInit = true;
}

// Score changes roll: the new number slides up (on increase) or down (on
// decrease) while the old one rolls out the opposite way.
function rollScore(el, value) {
  if (!el) return;
  const v = String(value);
  const cur = el.querySelector(".num");
  if (!cur) {
    el.textContent = "";
    const first = document.createElement("span");
    first.className = "num";
    first.textContent = v;
    el.appendChild(first);
    el.dataset.score = v;
    return;
  }
  if (el.dataset.score === v) return;
  const up = Number(v) > Number(el.dataset.score);
  el.dataset.score = v;
  cur.classList.remove("num"); // keep it in place but stop it matching future queries
  cur.classList.add("num-out", up ? "roll-out-up" : "roll-out-down");
  const gone = cur;
  setTimeout(() => gone.remove(), 460);
  const next = document.createElement("span");
  next.className = "num " + (up ? "roll-in-up" : "roll-in-down");
  next.textContent = v;
  el.appendChild(next);
  next.addEventListener(
    "animationend",
    () => next.classList.remove("roll-in-up", "roll-in-down"),
    { once: true },
  );
}

function renderNames(cfg) {
  cfg.teams.blue.players.forEach((v, i) => {
    const el = document.getElementById(`name-box-${i + 3}`);
    if (el) el.textContent = v || "";
  });
  cfg.teams.red.players.forEach((v, i) => {
    const el = document.getElementById(`name-box-${i + 10}`);
    if (el) el.textContent = v || "";
  });
  const bn = document.getElementById("name-box-1");
  if (bn) bn.textContent = cfg.teams.blue.name || "";
  const rn = document.getElementById("name-box-8");
  if (rn) rn.textContent = cfg.teams.red.name || "";
  rollScore(document.getElementById("name-box-2"), cfg.teams.blue.score);
  rollScore(document.getElementById("name-box-9"), cfg.teams.red.score);
  const bo = document.getElementById("boDisplay");
  if (bo) {
    const round = (cfg.round || "").trim();
    const boVal = (cfg.bo || "").trim();
    bo.textContent = "";
    if (round && boVal) {
      // round and BO split by a real vertical rule (.bo-sep), not a "|" glyph
      const a = document.createElement("span");
      a.className = "bo-part";
      a.textContent = round;
      const sep = document.createElement("span");
      sep.className = "bo-sep";
      const b = document.createElement("span");
      b.className = "bo-part";
      b.textContent = boVal;
      bo.append(a, sep, b);
    } else {
      bo.textContent = round || boVal;
    }
  }
}

function renderLogos(cfg) {
  const l1 = document.getElementById("displayImage1");
  if (l1) l1.src = cfg.teams.blue.logo || "";
  const l2 = document.getElementById("displayImage2");
  if (l2) l2.src = cfg.teams.red.logo || "";
}

// Player photo fills the pick card behind the hero art. When no photo is set
// the layer is left empty (transparent) so the card's purple + texture
// background shows through; a real uploaded photo overrides it.
function pickPhotoLayer(imgBoxId) {
  const box = document.getElementById(imgBoxId);
  const card = box ? box.closest(".heropick") : null;
  if (!card) return null;
  let layer = card.querySelector(":scope > .player-photo");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "player-photo";
    card.insertBefore(layer, card.firstChild);
  }
  return layer;
}
function renderPlayerPhotos(cfg) {
  const blue = cfg.teams.blue.playerPhotos || [];
  const red = cfg.teams.red.playerPhotos || [];
  for (let i = 0; i < 5; i++) {
    const bl = pickPhotoLayer(`image-box-${i + 1}`);
    if (bl) bl.style.backgroundImage = blue[i] ? `url("${blue[i]}")` : "none";
    const rl = pickPhotoLayer(`image-box-${i + 6}`);
    if (rl) rl.style.backgroundImage = red[i] ? `url("${red[i]}")` : "none";
  }
}

function renderTimerAndPhase(draft) {
  const phase = phaseAt(draft.phaseIndex);
  const arrow = document.getElementById("arrow");
  const phaseEl = document.getElementById("phase");
  const timerEl = document.getElementById("timer");
  const bar = document.getElementById("timer-bar");

  if (arrow) arrow.src = arrowFor(phase);
  if (phaseEl) phaseEl.textContent = phase ? phase.type : "";
  if (timerEl) timerEl.textContent = draft.timer.remaining;

  if (prevPhaseIndex !== -1 && draft.phaseIndex !== prevPhaseIndex) {
    const prev = phaseAt(prevPhaseIndex);
    if (prev && prev.type === "ban") playSFX(SFX.ban);
    else if (prev && prev.type === "pick") playSFX(SFX.pick);
  }
  prevPhaseIndex = draft.phaseIndex;

  // Drive the bar off the remaining/duration fraction. State arrives ~once per
  // second, so a 1s linear transition makes each step deplete smoothly instead
  // of restarting a full-length animation every broadcast.
  if (bar) {
    const dur = draft.timer.duration || 60;
    const frac = Math.max(0, Math.min(1, draft.timer.remaining / dur));
    bar.style.transformOrigin = "center";
    bar.style.transition = draft.timer.running ? "transform 1s linear" : "none";
    // purple eraser grows from the centre outward as time runs down (1 - frac)
    bar.style.transform = `translateX(-50%) scaleX(${1 - frac})`;
  }
}

// Show/hide + intro reveal.
// - The overlay is hidden until the match starts.
// - Pressing Start at phase 0 (timer runs, nothing drafted yet) reveals it with
//   the intro animation.
// - A fresh/reset draft (phase 0, timer stopped, all slots empty) hides it again,
//   ready for the next Start.
let prevRunning = false;
function slotsEmpty(s) {
  return ["banLeft", "banRight", "pickLeft", "pickRight"].every((g) =>
    s[g].every((x) => !x),
  );
}
// A freshly reset draft: phase 0, nothing drafted, timer stopped AND full
// (reset restores remaining=duration). Requiring the FULL timer means a timer
// that merely ran out at phase 0 does NOT count as reset — so the overlay stays
// shown when time expires / the next lock begins.
function isReset(draft) {
  return (
    draft.phaseIndex === 0 &&
    !draft.timer.running &&
    draft.timer.remaining === draft.timer.duration &&
    slotsEmpty(draft.slots)
  );
}
function playIntro() {
  const overlay = document.querySelector(".overlay");
  if (!overlay) return;
  overlay.classList.remove("intro");
  void overlay.offsetWidth; // reflow so the animation restarts on repeat
  overlay.classList.add("intro");
  clearTimeout(playIntro._t);
  // long enough to cover the LED intro; banpick's own intro anims use `both` so
  // holding `.intro` a little longer is harmless there.
  playIntro._t = setTimeout(() => overlay.classList.remove("intro"), 4100);
}
function updateStage(draft) {
  const overlay = document.querySelector(".overlay");
  if (!overlay) return;
  const running = !!draft.timer.running;
  if (isReset(draft)) {
    overlay.classList.remove("shown", "intro"); // hidden before Start / after reset
  } else if (running && !prevRunning && draft.phaseIndex === 0) {
    overlay.classList.add("shown"); // Start pressed at kickoff → reveal + intro
    playIntro();
  } else {
    overlay.classList.add("shown"); // match in progress (or loaded mid-match)
  }
  prevRunning = running;
}

ensurePickGlows();
window.AOG.onState((state) => {
  setColors(state.config);
  renderHeroes(state.draft.slots, state.draft.phaseIndex);
  renderNames(state.config);
  renderLogos(state.config);
  renderPlayerPhotos(state.config);
  renderTimerAndPhase(state.draft);
  renderPickTurn(state.draft.phaseIndex);
  updateStage(state.draft);
});

// Scale the fixed 1920x1080 stage to fill the full viewport WIDTH (no side
// padding). The band is anchored to the bottom, so any vertical overflow is the
// empty top area. At an exact 1920x1080 source (OBS) the scale is 1.
function fitStage() {
  const stageWidth = document.body.classList.contains("led-page") ? 1984 : 1920;
  const stageHeight = document.body.classList.contains("led-page")
    ? 1280
    : 1080;
  const scale = Math.min(
    window.innerWidth / stageWidth,
    window.innerHeight / stageHeight,
  );
  document.documentElement.style.setProperty("--scale", String(scale));
}
window.addEventListener("resize", fitStage);
fitStage();
