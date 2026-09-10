const SIDES = ['blue', 'red'];
const TEAM_FIELDS = ['name', 'color', 'textColor'];

function setTeam(state, side, field, value) {
  if (!SIDES.includes(side)) return { ok: false, error: 'side lạ' };
  if (!TEAM_FIELDS.includes(field)) return { ok: false, error: 'field lạ' };
  state.config.teams[side][field] = String(value ?? '');
  return { ok: true };
}

function setScore(state, side, value) {
  if (!SIDES.includes(side)) return { ok: false, error: 'side lạ' };
  const n = Number(value);
  state.config.teams[side].score = Number.isFinite(n) ? n : 0;
  return { ok: true };
}

function setPlayer(state, side, index, value) {
  if (!SIDES.includes(side)) return { ok: false, error: 'side lạ' };
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i > 4) return { ok: false, error: 'index lạ' };
  state.config.teams[side].players[i] = String(value ?? '');
  return { ok: true };
}

function setBO(state, value) {
  state.config.bo = String(value || 'BO5');
  return { ok: true };
}

function setRound(state, value) {
  state.config.round = String(value ?? '');
  return { ok: true };
}

function setLogo(state, side, logoPath) {
  if (!SIDES.includes(side)) return { ok: false, error: 'side lạ' };
  state.config.teams[side].logo = String(logoPath || '');
  return { ok: true };
}

function setPlayerPhoto(state, side, index, photoPath) {
  if (!SIDES.includes(side)) return { ok: false, error: 'side lạ' };
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i > 4) return { ok: false, error: 'index lạ' };
  const t = state.config.teams[side];
  if (!Array.isArray(t.playerPhotos)) t.playerPhotos = ['', '', '', '', ''];
  t.playerPhotos[i] = String(photoPath || '');
  return { ok: true };
}

// Reorder players within a team (drag-drop in the config drawer). The fixed
// position numbers 1..5 stay; the player content (nickname + photo) moves.
function movePlayer(state, side, from, to) {
  if (!SIDES.includes(side)) return { ok: false, error: 'side lạ' };
  const f = Number(from), t = Number(to);
  if (![f, t].every((n) => Number.isInteger(n) && n >= 0 && n <= 4)) return { ok: false, error: 'index lạ' };
  if (f === t) return { ok: true };
  const team = state.config.teams[side];
  if (!Array.isArray(team.playerPhotos)) team.playerPhotos = ['', '', '', '', ''];
  const [p] = team.players.splice(f, 1); team.players.splice(t, 0, p);
  const [ph] = team.playerPhotos.splice(f, 1); team.playerPhotos.splice(t, 0, ph);
  return { ok: true };
}

function swapNames(state) {
  const b = state.config.teams.blue, r = state.config.teams.red;
  [b.name, r.name] = [r.name, b.name];
  [b.players, r.players] = [r.players, b.players];
  [b.playerPhotos, r.playerPhotos] = [r.playerPhotos, b.playerPhotos];
  [b.score, r.score] = [r.score, b.score];
}

function swapLogos(state) {
  const b = state.config.teams.blue, r = state.config.teams.red;
  [b.logo, r.logo] = [r.logo, b.logo];
}

module.exports = { setTeam, setScore, setPlayer, setBO, setRound, setLogo, setPlayerPhoto, movePlayer, swapNames, swapLogos };
