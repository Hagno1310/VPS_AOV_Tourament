(function () {
  const stateCbs = [];
  const statusCbs = [];
  let ws = null;
  let lastState = null;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.onopen = () => statusCbs.forEach(cb => cb(true));
    ws.onclose = () => {
      statusCbs.forEach(cb => cb(false));
      setTimeout(connect, 1000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'state') {
        lastState = msg.state;
        stateCbs.forEach(cb => cb(msg.state));
      } else if (msg.type === 'error') {
        console.warn('[server error]', msg.message);
        if (window.AOG._onError) window.AOG._onError(msg.message);
      }
    };
  }

  window.AOG = {
    onState(cb) { stateCbs.push(cb); if (lastState) cb(lastState); },
    onStatus(cb) { statusCbs.push(cb); },
    onError(cb) { this._onError = cb; },
    send(action, payload = {}) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ action, payload }));
    },
  };

  connect();
})();
