const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const express = require("express");
const { WebSocketServer } = require("ws");

// All non-internal IPv4 addresses of this machine (for LAN access from other PCs),
// ordered so a common home/office LAN address (192.168.x, then 10.x) comes first —
// virtual adapters (WSL/Hyper-V, often 172.x) fall to the back.
function localIPv4s() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  const rank = (a) =>
    a.startsWith("192.168.") ? 0 : a.startsWith("10.") ? 1 : 2;
  return out.sort((a, b) => rank(a) - rank(b));
}

const {
  STATE_FILE,
  LOGO_DIR,
  PLAYER_DIR,
  DURATION,
} = require("./lib/constants.js");
const stateMod = require("./lib/state.js");
const { createTimer } = require("./lib/timer.js");
const { createHub } = require("./lib/wsHub.js");
const { findByImg, loadHeroes } = require("./lib/heroes.js");
const config = require("./lib/config.js");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "..", "public");

// --- state + persistence ---
const state = stateMod.load(STATE_FILE);
state.draft.timer.running = false; // không tự chạy timer khi khởi động lại
const saver = stateMod.createSaver(STATE_FILE, 300);

// --- app ---
const app = express();
// Allow LAN clients and browser frontends on another origin to call the API.
// WebSocket connections use the same HTTP server and are unaffected by this.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
// Don't let the browser/OBS cache the overlay code — always revalidate html/css/js
// so edits show up on a normal refresh (no more cache-busting version bumps).
const noCacheCode = (res, filePath) => {
  if (/\.(html|css|js)$/i.test(filePath))
    res.setHeader("Cache-Control", "no-cache");
};
app.use(express.static(PUBLIC_DIR, { setHeaders: noCacheCode }));
app.use("/logos", express.static(LOGO_DIR, { setHeaders: () => {} }));
app.use("/players", express.static(PLAYER_DIR, { setHeaders: () => {} }));
app.get("/api/state", (req, res) => res.json(state));
app.get("/api/heroes", (req, res) => res.json(loadHeroes()));

// logo upload (raw body, không cần multer)
const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
app.post(
  "/api/logo/:side",
  express.raw({ type: () => true, limit: "25mb" }),
  (req, res) => {
    const side = req.params.side;
    if (side !== "blue" && side !== "red")
      return res.status(400).json({ error: "side lạ" });
    const ext = EXT[req.headers["content-type"]] || "png";
    if (!req.body || !req.body.length)
      return res.status(400).json({ error: "thiếu file" });
    fs.mkdirSync(LOGO_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOGO_DIR, `${side}.${ext}`), req.body);
    config.setLogo(state, side, `/logos/${side}.${ext}?v=${Date.now()}`);
    saver(state);
    broadcast(state);
    res.json({ ok: true, logo: state.config.teams[side].logo });
  },
);

// player photo upload (shown behind the pick slot on the overlay)
app.post(
  "/api/player/:side/:index",
  express.raw({ type: () => true, limit: "25mb" }),
  (req, res) => {
    const side = req.params.side;
    const i = Number(req.params.index);
    if (side !== "blue" && side !== "red")
      return res.status(400).json({ error: "side lạ" });
    if (!Number.isInteger(i) || i < 0 || i > 4)
      return res.status(400).json({ error: "index lạ" });
    const ext = EXT[req.headers["content-type"]] || "png";
    if (!req.body || !req.body.length)
      return res.status(400).json({ error: "thiếu file" });
    fs.mkdirSync(PLAYER_DIR, { recursive: true });
    for (const oldExt of new Set(Object.values(EXT))) {
      const old = path.join(PLAYER_DIR, `${side}-${i}.${oldExt}`);
      if (oldExt !== ext && fs.existsSync(old)) fs.rmSync(old);
    }
    fs.writeFileSync(path.join(PLAYER_DIR, `${side}-${i}.${ext}`), req.body);
    config.setPlayerPhoto(
      state,
      side,
      i,
      `/players/${side}-${i}.${ext}?v=${Date.now()}`,
    );
    saver(state);
    broadcast(state);
    res.json({ ok: true, photo: state.config.teams[side].playerPhotos[i] });
  },
);

// --- http + ws ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(st) {
  const data = JSON.stringify({ type: "state", state: st });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

const timer = createTimer(state, () => broadcast(state));
const hub = createHub({ state, timer, saver, broadcast, findByImg });

wss.on("connection", (ws) => {
  hub.handleConnection(ws);
  ws.on("message", (raw) => hub.handleMessage(ws, raw.toString()));
});

server.listen(PORT, HOST, () => {
  const ips = localIPv4s();
  const ip = ips[0] || "localhost"; // primary LAN address other machines should use
  console.log(`OVERLAY AOG ban/pick server đang chạy (cổng ${PORT})`);
  console.log(`  Máy này        : http://localhost:${PORT}`);
  console.log(`  Máy khác (LAN) : http://${ip}:${PORT}`);
  console.log(`  control : http://${ip}:${PORT}/control.html`);
  console.log(`  banpick : http://${ip}:${PORT}/banpick.html`);
  console.log(`  led     : http://${ip}:${PORT}/led.html`);
  if (ips.length > 1) {
    console.log(`  (IP LAN khác: ${ips.slice(1).join(", ")})`);
  } else if (ips.length === 0) {
    console.log(`  (không tìm thấy IP LAN — có thể chưa nối mạng)`);
  }
});
