const fs = require('node:fs');
const path = require('node:path');
const { emptySlots } = require('./draft.js');
const { DURATION } = require('./constants.js');

function team(color) {
  return {
    name: '', logo: '', color, textColor: '#ffffff', score: 0,
    players: ['', '', '', '', ''],
    playerPhotos: ['', '', '', '', ''],
  };
}

function defaultState() {
  return {
    config: {
      teams: { blue: team('#005eff'), red: team('#ff4a00') },
      round: 'SEMI',
      bo: 'BO5',
    },
    draft: {
      phaseIndex: 0,
      correction: false,
      timer: { remaining: DURATION, running: false, duration: DURATION },
      slots: emptySlots(),
    },
  };
}

function load(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    // Structural check: a syntactically-valid but partial file must not be
    // trusted (server reads state.draft.timer.running etc. on boot).
    if (!parsed || !parsed.config || !parsed.config.teams || !parsed.draft
        || !parsed.draft.timer || !parsed.draft.slots) {
      return defaultState();
    }
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveNow(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

function createSaver(filePath, delay = 300) {
  let t = null;
  return function (state) {
    if (t) clearTimeout(t);
    t = setTimeout(() => { saveNow(filePath, state); t = null; }, delay);
  };
}

module.exports = { defaultState, load, saveNow, createSaver };
