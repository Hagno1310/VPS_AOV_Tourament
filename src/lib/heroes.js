const fs = require('node:fs');
const path = require('node:path');

// Nguồn dữ liệu tướng = thư mục ảnh. Thêm ảnh vào đây là tự động có tướng mới.
// src/lib → ../../public/assets/heroes
const HEROES_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'heroes');
// (tuỳ chọn) override tên/voice theo img path, ví dụ để gắn voice lines sau này.
// src/lib → ../../public/database/herolist.json
const OVERRIDES_FILE = path.join(__dirname, '..', '..', 'public', 'database', 'herolist.json');

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

let cache = null;
let cacheSig = null; // chữ ký thư mục (mtime) để tự làm mới khi có ảnh mới

function loadOverrides() {
  try {
    const raw = fs.readFileSync(OVERRIDES_FILE, 'utf8');
    const list = JSON.parse(raw);
    const map = new Map();
    for (const h of list) {
      if (h && h.img) map.set(h.img, h);
    }
    return map;
  } catch {
    return new Map(); // không có file override cũng không sao
  }
}

function scanHeroes() {
  const overrides = loadOverrides();
  let files;
  try {
    files = fs.readdirSync(HEROES_DIR);
  } catch {
    return [];
  }
  const list = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!IMG_EXT.has(ext)) continue; // bỏ .psd và file không phải ảnh
    const img = `/assets/heroes/${file}`;
    const ov = overrides.get(img) || {};
    const name = ov.name || path.basename(file, path.extname(file));
    list.push({ name, img, voice: ov.voice ?? null });
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return list;
}

function dirSignature() {
  try {
    // mtime của thư mục đổi khi thêm/xoá file → dùng làm khoá cache
    return String(fs.statSync(HEROES_DIR).mtimeMs);
  } catch {
    return '0';
  }
}

function loadHeroes() {
  const sig = dirSignature();
  if (cache && cacheSig === sig) return cache;
  cache = scanHeroes();
  cacheSig = sig;
  return cache;
}

function findByImg(img) {
  return loadHeroes().find(h => h.img === img) || null;
}

module.exports = { loadHeroes, findByImg };
