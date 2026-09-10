const path = require('path');

const DURATION = 60;

const ARROWS = {
  banBlue:  '/assets/ui/leftbanning.gif',
  banRed:   '/assets/ui/rightbanning.gif',
  pickBlue: '/assets/ui/leftpicking.gif',
  pickRed:  '/assets/ui/rightpicking.gif',
  swap:     '/assets/ui/adjustment.png',
};

const SFX = {
  ban:  '/assets/sfx/BAN.MP3',
  pick: '/assets/sfx/PICK.MP3',
};

// src/lib → ../../data (override with STATE_FILE env var for dev/testing)
const STATE_FILE = process.env.STATE_FILE
  ? path.resolve(process.env.STATE_FILE)
  : path.join(__dirname, '..', '..', 'data', 'state.json');
const LOGO_DIR   = path.join(__dirname, '..', '..', 'data', 'logos');
const PLAYER_DIR = path.join(__dirname, '..', '..', 'data', 'players');

module.exports = { DURATION, ARROWS, SFX, STATE_FILE, LOGO_DIR, PLAYER_DIR };
