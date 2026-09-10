const { DURATION } = require('./constants.js');

function createTimer(state, onTick) {
  let interval = null;
  let autoRun = false; // "session running" intent: set by start(), cleared by stop()

  function tick() {
    const tm = state.draft.timer;
    // Only advance + notify while actively counting down. When stopped or at 0
    // this is a no-op and does NOT broadcast — start/stop/reset broadcast via wsHub.
    if (tm.running && tm.remaining > 0) {
      tm.remaining -= 1;
      if (tm.remaining <= 0) { tm.remaining = 0; tm.running = false; }
      if (onTick) onTick();
    }
  }

  function start() {
    autoRun = true;
    state.draft.timer.running = true;
    if (!interval) interval = setInterval(tick, 1000);
    if (interval.unref) interval.unref();
  }

  function stop() {
    autoRun = false;
    state.draft.timer.running = false;
  }

  function reset(duration = DURATION) {
    state.draft.timer.remaining = duration;
    state.draft.timer.duration = duration;
    // Once the operator has started the clock, each phase reset keeps counting
    // (no need to press Start again). Stop() disarms this.
    state.draft.timer.running = autoRun;
  }

  function dispose() {
    if (interval) { clearInterval(interval); interval = null; }
  }

  return { start, stop, reset, tick, dispose };
}

module.exports = { createTimer };
