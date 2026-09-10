const draft = require('./draft.js');
const config = require('./config.js');
const { DURATION } = require('./constants.js');

function createHub({ state, timer, saver, broadcast, findByImg }) {
  function sendError(ws, message) {
    try { ws.send(JSON.stringify({ type: 'error', message })); } catch {}
  }

  function commit() {
    saver(state);
    broadcast(state);
  }

  function handleConnection(ws) {
    ws.send(JSON.stringify({ type: 'state', state }));
  }

  function handleMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return sendError(ws, 'JSON không hợp lệ'); }
    const action = msg && msg.action;
    const p = (msg && msg.payload) || {};

    switch (action) {
      case 'selectHero': {
        const hero = findByImg(p.heroImg);
        if (!hero) return sendError(ws, 'không tìm thấy tướng');
        const r = draft.selectHero(state, p.slot, hero);
        if (!r.ok) return sendError(ws, r.error);
        if (r.advanced) timer.reset(DURATION);
        return commit();
      }
      case 'clearSlot': {
        const r = draft.clearSlot(state, p.slot);
        if (!r.ok) return sendError(ws, r.error);
        return commit();
      }
      case 'swap': {
        const r = draft.swap(state, p.slotA, p.slotB);
        if (!r.ok) return sendError(ws, r.error);
        return commit();
      }
      case 'nextPhase': {
        const r = draft.nextPhase(state);
        if (r.changed) timer.reset(DURATION);
        return commit();
      }
      case 'prevPhase': {
        const r = draft.prevPhase(state);
        if (r.changed) timer.reset(DURATION);
        return commit();
      }
      case 'resetDraft': {
        draft.resetDraft(state);
        timer.reset(DURATION);
        timer.stop();
        return commit();
      }
      case 'setCorrection': {
        draft.setCorrection(state, p.on);
        return commit();
      }
      case 'timerStart': { timer.start(); return commit(); }
      case 'timerStop':  { timer.stop();  return commit(); }
      case 'timerReset': { timer.reset(DURATION); return commit(); }
      case 'setTeam': {
        const r = config.setTeam(state, p.side, p.field, p.value);
        if (!r.ok) return sendError(ws, r.error);
        return commit();
      }
      case 'setScore': {
        const r = config.setScore(state, p.side, p.value);
        if (!r.ok) return sendError(ws, r.error);
        return commit();
      }
      case 'setPlayer': {
        const r = config.setPlayer(state, p.side, p.index, p.value);
        if (!r.ok) return sendError(ws, r.error);
        return commit();
      }
      case 'setBO': { config.setBO(state, p.value); return commit(); }
      case 'setRound': { config.setRound(state, p.value); return commit(); }
      case 'movePlayer': {
        const r = config.movePlayer(state, p.side, p.from, p.to);
        if (!r.ok) return sendError(ws, r.error);
        return commit();
      }
      case 'swapTeams': {
        if (p.what === 'names') config.swapNames(state);
        else if (p.what === 'logos') config.swapLogos(state);
        else return sendError(ws, 'what không hợp lệ');
        return commit();
      }
      default:
        return sendError(ws, 'action không hỗ trợ: ' + action);
    }
  }

  return { handleConnection, handleMessage };
}

module.exports = { createHub };
