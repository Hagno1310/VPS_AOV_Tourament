# OVERLAY AOG — Ban/Pick Tournament Overlay

Overlay ban/pick cho AOG (Arena of Glory / Liên Quân) theo luật đấu giải, gồm một server đồng bộ realtime, một trang điều khiển và một trang hiển thị lên stream.

## Chạy

**Cách nhanh (Windows):** double-click **`start.bat`** — tự cài dependencies lần đầu rồi khởi động server. Cửa sổ Terminal sẽ in ra địa chỉ để máy khác trong mạng LAN bấm vào.

**Cách thủ công:**

```bash
npm install
npm start
```

- Trang điều khiển: http://localhost:3000/control.html
- Trang hiển thị OBS (Browser Source): http://localhost:3000/banpick.html
- Màn LED: http://localhost:3000/led.html
- Máy khác trong LAN: thay `localhost` bằng IP mà server in ra (vd `http://192.168.1.7:3000/...`).

Đổi cổng: `PORT=4000 npm start`.

## Bàn giao (đóng gói cho máy khác)

Yêu cầu: máy đích cài sẵn **Node.js** (bản LTS, https://nodejs.org) — vì `start.bat` chạy `npm install`.

1. Copy nguyên thư mục dự án (không cần kèm `node_modules` — `start.bat` sẽ tự cài; nếu muốn chạy offline không cần internet thì copy kèm luôn `node_modules`).
2. Người dùng double-click `start.bat`.

Muốn có file **`.exe`** thay cho `.bat`:
- Đơn giản: dùng công cụ **"Bat To Exe Converter"** (miễn phí) để convert `start.bat` → `start.exe` (đặt được icon).
- Hoặc **IExpress** có sẵn trong Windows (gõ `iexpress` ở Run) để gói `start.bat` thành `.exe` tự giải nén.
- Muốn `.exe` chạy độc lập **không cần cài Node** thì phải bundle Node bằng `pkg`/`nexe` (khác luồng `npm i` ở trên — dependencies được nhúng sẵn).

## Kiến trúc

Server-authoritative: trang control gửi lệnh qua WebSocket → server kiểm tra luật, cập nhật state, lưu `data/state.json`, rồi broadcast full state cho mọi client. Trang banpick chỉ nhận state và vẽ. Đồng hồ đếm ngược chạy ở server.

- `src/server.js` — entry (static + WebSocket + upload logo)
- `src/lib/` — logic thuần: `draft` (16 phase + luật), `state`, `config`, `timer`, `heroes`, `wsHub`, `constants`
- `public/` — `control.html`, `banpick.html`, `styles/`, `scripts/`, `assets/`, `database/herolist.json`
- `data/` — state + logo runtime (tự tạo, gitignored)

## Test

```bash
npm test
```

Unit test cho toàn bộ logic trong `src/lib/` (`test/*.test.js`).

## Luồng draft

16 phase chuẩn đấu giải (ban×4 → pick 1-2-2-1 → ban×4 → pick 1-2-1 → adjustment). Tướng đã ban/pick bị khoá không chọn lại. Bật Correction để sửa tự do.
