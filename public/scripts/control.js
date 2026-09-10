/* ============================================================
   Control "Draft Deck" — drives the 16-step draft over WebSocket.
   Renders the draft as a sequential ladder (competitive order),
   builds the hero grid ONCE, and auto-targets the current step.
   ============================================================ */

// Client copy of the phase order (browser can't require the Node module).
// MUST stay in sync with src/lib/draft.js PHASES.
const PHASES = [
  { team: 'blue', type: 'ban',  slots: ['banLeft-0'] },
  { team: 'red',  type: 'ban',  slots: ['banRight-0'] },
  { team: 'blue', type: 'ban',  slots: ['banLeft-1'] },
  { team: 'red',  type: 'ban',  slots: ['banRight-1'] },
  { team: 'blue', type: 'pick', slots: ['pickLeft-0'] },
  { team: 'red',  type: 'pick', slots: ['pickRight-0', 'pickRight-1'] },
  { team: 'blue', type: 'pick', slots: ['pickLeft-1', 'pickLeft-2'] },
  { team: 'red',  type: 'pick', slots: ['pickRight-2'] },
  { team: 'red',  type: 'ban',  slots: ['banRight-2'] },
  { team: 'blue', type: 'ban',  slots: ['banLeft-2'] },
  { team: 'red',  type: 'ban',  slots: ['banRight-3'] },
  { team: 'blue', type: 'ban',  slots: ['banLeft-3'] },
  { team: 'red',  type: 'pick', slots: ['pickRight-3'] },
  { team: 'blue', type: 'pick', slots: ['pickLeft-3', 'pickLeft-4'] },
  { team: 'red',  type: 'pick', slots: ['pickRight-4'] },
  { team: 'none', type: 'swap', slots: [] },
];
const DEFAULT_PHOTO = '/assets/ui/Tournamemt.png'; // placeholder when no player photo set
const pad2 = (n) => String(n).padStart(2, '0');
const parseSlot = (id) => { const i = id.lastIndexOf('-'); return { group: id.slice(0, i), index: +id.slice(i + 1) }; };

let heroes = [];
let heroCells = new Map();   // img -> grid cell element (built once)
let slotEls = new Map();     // slot id -> { root, av, nm, rm }
let curState = null;
let activeSlot = null;       // manually chosen slot (correction/multi-slot)
let swapMode = false;
let swapFirst = null;
let lastUsedKey = '';        // to skip redundant grid "used" repaints
let lastScrolledPhase = -1;  // to auto-scroll the ladder only on step change
let swapSel = null;          // slot selected in the swap-preview overlay
const swapCardEls = new Map();// slot -> { card, photo, hero, nick }

/* ---------- connection ---------- */
window.AOG.onStatus((ok) => {
  const el = document.getElementById('status');
  el.textContent = ok ? 'live' : 'offline';
  el.className = 'status ' + (ok ? 'online' : 'offline');
});
window.AOG.onError((m) => { setHint('⚠ ' + m); });

function setHint(t) { document.getElementById('hint').innerHTML = t; }

/* ---------- simple command buttons ---------- */
document.querySelectorAll('.controls [data-cmd]').forEach((b) => {
  b.addEventListener('click', () => window.AOG.send(b.dataset.cmd, {}));
});
document.getElementById('btnCorrection').addEventListener('click', () => {
  const on = !(curState && curState.draft.correction);
  window.AOG.send('setCorrection', { on });
});
const btnSwap = document.getElementById('btnSwap');
const swapPreview = document.getElementById('swapPreview');
btnSwap.addEventListener('click', () => (swapMode ? closeSwap() : openSwap()));
document.getElementById('swapDone').addEventListener('click', closeSwap);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && swapMode) closeSwap(); });

function openSwap() {
  swapMode = true; swapSel = null; activeSlot = null;
  btnSwap.setAttribute('aria-pressed', 'true');
  swapPreview.hidden = false;
  buildSwapCards();
  if (curState) updateSwapCards(curState);
}
function closeSwap() {
  swapMode = false; swapSel = null;
  btnSwap.setAttribute('aria-pressed', 'false');
  swapPreview.hidden = true;
}

const SWAP_TEAMS = [
  { side: 'blue', group: 'pickLeft', label: 'Blue side' },
  { side: 'red', group: 'pickRight', label: 'Red side' },
];
function buildSwapCards() {
  const wrap = document.getElementById('swapCards');
  wrap.innerHTML = ''; swapCardEls.clear();
  SWAP_TEAMS.forEach(({ side, group, label }) => {
    const teamEl = document.createElement('div');
    teamEl.className = 'swap-team ' + side;
    const lbl = document.createElement('div'); lbl.className = 'swap-teamlabel'; lbl.textContent = label;
    teamEl.appendChild(lbl);
    // Red mirrors the overlay: player 1 on the right → build 5..1 left-to-right.
    const order = side === 'red' ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4];
    order.forEach((i) => {
      const slot = `${group}-${i}`;
      const card = document.createElement('div');
      card.className = 'swap-card ' + side; card.dataset.slot = slot; card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.innerHTML = `<div class="sc-photo"></div><div class="sc-foot"><span class="sc-num">${i + 1}</span><span class="sc-nick">—</span></div>`;
      const onClick = () => onSwapCardClick(slot);
      card.addEventListener('click', onClick);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } });
      teamEl.appendChild(card);
      swapCardEls.set(slot, { card, photo: card.querySelector('.sc-photo'), nick: card.querySelector('.sc-nick') });
    });
    wrap.appendChild(teamEl);
  });
}
function updateSwapCards(state) {
  const cfg = state.config, slots = state.draft.slots;
  swapCardEls.forEach((el, slot) => {
    const { group, index } = parseSlot(slot);
    const side = group === 'pickLeft' ? 'blue' : 'red';
    const hero = slots[group][index];
    const nick = cfg.teams[side].players[index] || '—';
    // the swap card shows the HERO image (swapping is about heroes)
    el.photo.style.backgroundImage = hero ? `url("${hero.img}")` : '';
    el.card.classList.toggle('empty', !hero);
    el.nick.textContent = nick;
  });
  applySwapSelection();
}
function applySwapSelection() {
  const selTeam = swapSel ? (swapSel.startsWith('pickLeft') ? 'blue' : 'red') : null;
  swapCardEls.forEach((el, slot) => {
    el.card.classList.remove('selected', 'dim', 'disabled');
    if (!swapSel) return;
    if (slot === swapSel) { el.card.classList.add('selected'); return; }
    el.card.classList.add('dim');
    const team = slot.startsWith('pickLeft') ? 'blue' : 'red';
    if (team !== selTeam) el.card.classList.add('disabled');
  });
}
function onSwapCardClick(slot) {
  if (!swapSel) { swapSel = slot; applySwapSelection(); return; }
  if (swapSel === slot) { swapSel = null; applySwapSelection(); return; } // cancel
  const a = swapSel.startsWith('pickLeft') ? 'blue' : 'red';
  const b = slot.startsWith('pickLeft') ? 'blue' : 'red';
  if (a !== b) return; // only same-team swaps
  window.AOG.send('swap', { slotA: swapSel, slotB: slot });
  swapSel = null; // state broadcast will re-render with swapped heroes
}

/* ---------- config drawer (teams & match) ---------- */
const drawer = document.getElementById('configDrawer');
const backdrop = document.getElementById('drawerBackdrop');
const btnConfig = document.getElementById('btnConfig');
function openDrawer() {
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  backdrop.hidden = false; btnConfig.setAttribute('aria-expanded', 'true');
  const first = drawer.querySelector('input, button.drawer-close');
  if (first) first.focus();
}
function closeDrawer() {
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
  backdrop.hidden = true; btnConfig.setAttribute('aria-expanded', 'false');
  btnConfig.focus();
}
btnConfig.addEventListener('click', () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer()));
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
backdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

/* ---------- team config ---------- */
document.querySelectorAll('.team').forEach((box) => {
  const side = box.dataset.side;
  box.querySelectorAll('[data-field]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const f = inp.dataset.field;
      if (f === 'score') window.AOG.send('setScore', { side, value: inp.value });
      else window.AOG.send('setTeam', { side, field: f, value: inp.value });
    });
  });
});
document.getElementById('boInput').addEventListener('input', (e) => window.AOG.send('setBO', { value: e.target.value }));
document.getElementById('roundInput').addEventListener('input', (e) => window.AOG.send('setRound', { value: e.target.value }));
document.querySelectorAll('[data-swap]').forEach((b) => {
  b.addEventListener('click', () => window.AOG.send('swapTeams', { what: b.dataset.swap }));
});

/* build nickname inputs (5 per side) */
document.querySelectorAll('[data-players]').forEach((wrap) => {
  const side = wrap.dataset.players;
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('div'); row.className = 'player-row';
    const num = document.createElement('span'); num.className = 'num'; num.textContent = i + 1;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.placeholder = `Người chơi ${i + 1}`; inp.dataset.pindex = i;
    inp.addEventListener('input', () => window.AOG.send('setPlayer', { side, index: i, value: inp.value }));

    // player photo (shown behind the pick slot on the overlay)
    const photo = document.createElement('label');
    photo.className = 'player-photo-btn'; photo.title = 'Ảnh tuyển thủ (hiện sau ô pick)';
    const pv = document.createElement('span'); pv.className = 'pp-preview'; pv.dataset.pp = i;
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    file.addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      pv.style.backgroundImage = `url("${URL.createObjectURL(f)}")`; pv.classList.add('has');
      // set the player's name to the image's file name (without extension) —
      // uploading a new photo always overwrites the old name
      const base = f.name.replace(/\.[^/.]+$/, '').trim();
      if (base) {
        inp.value = base;
        window.AOG.send('setPlayer', { side, index: i, value: base });
      }
      try { await fetch(`/api/player/${side}/${i}`, { method: 'POST', headers: { 'Content-Type': f.type }, body: f }); }
      catch { setHint('⚠ upload ảnh tuyển thủ lỗi'); }
    });
    photo.append(pv, file);

    // drag-drop reorder: drag the number badge onto another row. The fixed
    // position numbers stay; nickname + photo move (server movePlayer).
    row.dataset.pindex = i;
    num.setAttribute('draggable', 'true');
    num.title = 'Kéo để đổi thứ tự';
    num.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ side, from: i }));
      row.classList.add('dragging');
    });
    num.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault(); row.classList.remove('drag-over');
      let data; try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (!data || data.side !== side || data.from === i) return;
      window.AOG.send('movePlayer', { side, from: data.from, to: i });
    });

    row.append(num, inp, photo);
    wrap.appendChild(row);
  }
});

/* ---------- build the ladder ONCE ---------- */
function buildLadder() {
  const root = document.getElementById('ladder');
  root.innerHTML = '';
  PHASES.forEach((ph, i) => {
    const step = document.createElement('div');
    step.className = 'step';
    step.dataset.team = ph.team;
    step.dataset.type = ph.type;
    step.dataset.phase = i;

    const idx = document.createElement('div');
    idx.className = 'idx'; idx.textContent = pad2(i + 1);

    const body = document.createElement('div');
    body.className = 'body';
    const kind = document.createElement('div');
    kind.className = 'kind';
    kind.innerHTML = ph.type === 'swap'
      ? 'SWAP'
      : `${ph.type.toUpperCase()}<div class="side">${ph.team}</div>`;
    const slotsWrap = document.createElement('div');
    slotsWrap.className = 'slots';

    if (ph.slots.length === 0) {
      const note = document.createElement('div');
      note.className = 'nm empty'; note.textContent = 'Điều chỉnh / hoán đổi cuối';
      slotsWrap.appendChild(note);
    }
    ph.slots.forEach((sid) => {
      const slot = document.createElement('div');
      slot.className = 'slot'; slot.dataset.slot = sid; slot.dataset.type = ph.type;
      slot.tabIndex = 0; slot.setAttribute('role', 'button'); slot.setAttribute('aria-label', 'Ô ' + sid);
      slot.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSlotClick(sid); }
      });
      const av = document.createElement('div'); av.className = 'av';
      const nm = document.createElement('div'); nm.className = 'nm empty'; nm.textContent = '—';
      const rm = document.createElement('button'); rm.className = 'rm'; rm.title = 'Xoá'; rm.textContent = '✕';
      rm.addEventListener('click', (e) => { e.stopPropagation(); window.AOG.send('clearSlot', { slot: sid }); });
      slot.append(av, nm, rm);
      slot.addEventListener('click', () => onSlotClick(sid));
      slotsWrap.appendChild(slot);
      slotEls.set(sid, { root: slot, av, nm });
    });

    body.append(kind, slotsWrap);
    step.append(idx, body);
    root.appendChild(step);
  });
}

function onSlotClick(sid) {
  if (swapMode) {
    if (!swapFirst) { swapFirst = sid; refreshSlotHighlights(); return; }
    if (swapFirst !== sid) window.AOG.send('swap', { slotA: swapFirst, slotB: sid });
    swapFirst = null; refreshSlotHighlights();
    return;
  }
  activeSlot = sid;
  refreshSlotHighlights();
  setHint('Đang chọn cho ô <b>' + sid + '</b> — bấm 1 tướng bên phải');
}

/* ---------- hero grid built ONCE ---------- */
function buildGrid() {
  const grid = document.getElementById('heroGrid');
  grid.innerHTML = ''; heroCells.clear();
  heroes.forEach((h) => {
    const cell = document.createElement('button');
    cell.className = 'hero'; cell.type = 'button'; cell.dataset.name = h.name.toLowerCase();
    cell.innerHTML = `<img src="${h.img}" loading="lazy" alt=""><div class="hn">${h.name}</div>`;
    cell.addEventListener('click', () => {
      if (!activeSlot) { setHint('Chọn 1 ô ở cột trái trước'); return; }
      window.AOG.send('selectHero', { slot: activeSlot, heroImg: h.img });

    });
    grid.appendChild(cell);
    heroCells.set(h.img, cell);
  });
  document.getElementById('pickCount').textContent = heroes.length + ' tướng';
}

document.getElementById('heroSearch').addEventListener('input', filterGrid);
function filterGrid() {
  const q = document.getElementById('heroSearch').value.toLowerCase().trim();
  heroCells.forEach((cell) => {
    cell.style.display = (!q || cell.dataset.name.includes(q)) ? '' : 'none';
  });
}

/* ---------- render from state (no grid rebuild) ---------- */
function heroAt(state, sid) { const { group, index } = parseSlot(sid); return state.draft.slots[group][index]; }

function render(state) {
  curState = state;
  const d = state.draft;
  document.body.classList.toggle('correcting', d.correction);

  // slots
  slotEls.forEach((el, sid) => {
    const hero = heroAt(state, sid);
    if (hero) {
      el.av.style.backgroundImage = `url("${hero.img}")`;
      el.nm.textContent = hero.name; el.nm.classList.remove('empty');
      el.root.classList.add('filled');
    } else {
      el.av.style.backgroundImage = '';
      el.nm.textContent = '—'; el.nm.classList.add('empty');
      el.root.classList.remove('filled');
    }
  });

  // step states + auto active slot
  const cur = d.phaseIndex;
  const openSlots = [];
  document.querySelectorAll('.step').forEach((step) => {
    const i = +step.dataset.phase;
    step.classList.toggle('current', i === cur);
    step.classList.toggle('done', i < cur);
    step.classList.toggle('upcoming', i > cur);
    if (i === cur) {
      (PHASES[i].slots || []).forEach((sid) => {
        const filled = !!heroAt(state, sid);
        slotEls.get(sid)?.root.classList.toggle('open', !filled);
        if (!filled) openSlots.push(sid);
      });
    } else {
      (PHASES[i].slots || []).forEach((sid) => slotEls.get(sid)?.root.classList.remove('open'));
    }
  });

  if (!swapMode && !d.correction) {
    const curSlots = (PHASES[cur] && PHASES[cur].slots) || [];
    // Pin the target to the current phase; default to its first slot. Never
    // auto-move after a pick — in a 2-pick turn the operator clicks the other
    // card to pick for that player. Only Lock & next advances.
    if (!activeSlot || !curSlots.includes(activeSlot)) activeSlot = curSlots[0] || null;
  }
  refreshSlotHighlights();

  // auto-scroll the ladder to the current step, once per step change
  if (cur !== lastScrolledPhase) {
    lastScrolledPhase = cur;
    const curStep = document.querySelector('.step.current');
    if (curStep) curStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (!swapMode) {
    if (activeSlot) setHint('Ô <b>' + activeSlot + '</b> — bấm tướng để chọn/đổi, rồi 🔒 Lock để sang bước');
    else if (cur >= 16) setHint('Draft hoàn tất ✓');
    else if (d.correction) setHint('Correction bật — bấm ô bất kỳ để sửa');
    else setHint('Chờ lượt…');
  }

  // used heroes (toggle classes only when set changed)
  const usedKey = usedImgs(state).sort().join('|');
  if (usedKey !== lastUsedKey) {
    const used = new Set(usedImgs(state));
    heroCells.forEach((cell, img) => cell.classList.toggle('used', used.has(img)));
    lastUsedKey = usedKey;
  }

  // command bar
  document.getElementById('stepIndex').textContent = pad2(Math.min(cur + 1, 16));
  const chip = document.getElementById('phaseChip');
  const ph = cur < 16 ? PHASES[cur] : null;
  chip.dataset.team = ph ? ph.team : 'none';
  chip.textContent = ph ? (ph.type === 'swap' ? 'SWAP · ADJUST' : `${ph.team.toUpperCase()} · ${ph.type.toUpperCase()}`) : 'DONE';

  const clock = document.getElementById('clock');
  document.getElementById('timerNum').textContent = d.timer.remaining;
  clock.classList.toggle('running', !!d.timer.running);
  clock.classList.toggle('low', d.timer.running && d.timer.remaining <= 10);

  // correction toggle reflect server truth
  const cb = document.getElementById('btnCorrection');
  cb.setAttribute('aria-pressed', String(d.correction));

  syncConfig(state.config);
  if (swapMode) updateSwapCards(state);
}

function refreshSlotHighlights() {
  slotEls.forEach((el, sid) => {
    el.root.classList.toggle('active', sid === activeSlot && !swapMode);
    el.root.classList.toggle('swap-pick', sid === swapFirst && swapMode);
  });
}

function usedImgs(state) {
  const out = [];
  for (const g of ['banLeft', 'banRight', 'pickLeft', 'pickRight'])
    for (const h of state.draft.slots[g]) if (h) out.push(h.img);
  return out;
}

/* ---------- config sync (never clobber a focused field) ---------- */
function setIfIdle(inp, val) {
  if (inp && document.activeElement !== inp && inp.value !== String(val ?? '')) inp.value = val ?? '';
}
function syncConfig(cfg) {
  document.querySelectorAll('.team').forEach((box) => {
    const t = cfg.teams[box.dataset.side];
    setIfIdle(box.querySelector('[data-field="name"]'), t.name);
    setIfIdle(box.querySelector('[data-field="score"]'), t.score);
    box.querySelectorAll('.players input[type="text"]').forEach((inp, i) => setIfIdle(inp, t.players[i]));
    const photos = t.playerPhotos || [];
    box.querySelectorAll('.players .pp-preview').forEach((pv, i) => {
      const src = photos[i];
      if (src) { pv.style.backgroundImage = `url("${src}")`; pv.classList.add('has'); }
      else { pv.style.backgroundImage = ''; pv.classList.remove('has'); }
    });
  });
  setIfIdle(document.getElementById('boInput'), cfg.bo);
  setIfIdle(document.getElementById('roundInput'), cfg.round);
}

/* ---------- boot ---------- */
buildLadder();
fetch('/api/heroes')
  .then((r) => r.json())
  .then((list) => { heroes = list.map((h) => ({ name: h.name, img: h.img })); buildGrid(); if (curState) render(curState); })
  .catch(() => setHint('⚠ không tải được danh sách tướng'));
window.AOG.onState(render);
