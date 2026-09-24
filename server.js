// เซิร์ฟเวอร์หาคู่ตีแบด: เสิร์ฟไฟล์ในโฟลเดอร์ public และเก็บข้อมูลลง data.json
// ไม่ต้องติดตั้งแพ็กเกจเพิ่ม ใช้แค่ Node.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = path.join(__dirname, "data.json");
const LEVELS = ["new", "BG", "N", "S", "P"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ---------- ข้อมูล ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

function sampleData() {
  const now = Date.now();
  const base = { contact: "", hostName: "ตัวอย่าง", hostId: "sample", sample: true };
  return {
    games: [
      { ...base, id: "sample1", venue: "สนามแบดตัวอย่าง A", area: "ลาดพร้าว", date: addDays(0), start: "19:00", end: "21:00",
        slots: 3, courts: 2, price: 120, shuttle: "ลูกละ 90 หารตามเกม", note: "ตีคู่ผสม หมุนเวียนทุกเกม มีที่จอดรถ",
        levels: ["BG", "N"], contact: "@example-line", createdAt: now },
      { ...base, id: "sample2", venue: "สนามแบดตัวอย่าง B", area: "บางนา", date: addDays(2), start: "10:00", end: "12:00",
        slots: 4, courts: 1, price: 80, shuttle: "รวมค่าลูกแล้ว", note: "ก๊วนมือใหม่ ไม่ซีเรียส มีคนสอนพื้นฐาน",
        levels: ["new", "BG"], createdAt: now + 1 },
      { ...base, id: "sample3", venue: "สนามแบดตัวอย่าง C", area: "รามอินทรา", date: addDays(3), start: "18:00", end: "21:00",
        slots: 2, courts: 3, price: 150, shuttle: "ลูกละ 100 หารตามเกม", note: "เน้นคู่ชาย เกมเร็ว",
        levels: ["N", "S"], createdAt: now + 2 },
    ],
    joins: [
      { id: "sample1__a", gameId: "sample1", userId: "sample-a", name: "มิ้นท์", createdAt: now + 10 },
      { id: "sample3__a", gameId: "sample3", userId: "sample-b", name: "บอส", createdAt: now + 20 },
      { id: "sample3__b", gameId: "sample3", userId: "sample-c", name: "เจ", createdAt: now + 30 },
    ],
  };
}

function load() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { games: Array.isArray(d.games) ? d.games : [], joins: Array.isArray(d.joins) ? d.joins : [] };
  } catch (e) {
    if (e.code !== "ENOENT") console.warn("อ่าน data.json ไม่ได้ เริ่มใหม่ด้วยข้อมูลตัวอย่าง:", e.message);
    const d = sampleData();
    save(d);
    return d;
  }
}
function save(d) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
let db = load();

// ---------- ตรวจข้อมูลที่ส่งเข้ามา ----------
const str = (v, n) => (typeof v === "string" ? v.trim() : "").slice(0, n);
const int = (v, lo, hi) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : null; };
const isId = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(v);

function cleanGame(b) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const start = /^\d{2}:\d{2}$/.test(b.start) ? b.start : null;
  const end = /^\d{2}:\d{2}$/.test(b.end) ? b.end : "";
  const venue = str(b.venue, 80), hostName = str(b.hostName, 30);
  if (!venue) return { error: "ใส่ชื่อสนามด้วย" };
  if (!date || date < ymd(new Date())) return { error: "เลือกวันที่ตั้งแต่วันนี้เป็นต้นไป" };
  if (!start) return { error: "ใส่เวลาเริ่ม" };
  if (!hostName) return { error: "ใส่ชื่อคนตั้งก๊วน" };
  if (!isId(b.hostId)) return { error: "ไม่พบรหัสผู้ใช้ ลองรีเฟรชหน้า" };
  return {
    game: {
      id: crypto.randomBytes(8).toString("hex"),
      venue, area: str(b.area, 60), date, start, end,
      slots: int(b.slots, 1, 30) ?? 2, courts: int(b.courts, 1, 20) ?? 1,
      price: b.price === "" || b.price == null ? null : int(b.price, 0, 5000),
      shuttle: str(b.shuttle, 80), note: str(b.note, 400), contact: str(b.contact, 60),
      hostName, hostId: b.hostId,
      levels: Array.isArray(b.levels) ? [...new Set(b.levels.filter((k) => LEVELS.includes(k)))] : [],
      sample: false, createdAt: Date.now(),
    },
  };
}

// ---------- HTTP ----------
function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 20_000) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}
function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "ไม่พบไฟล์", "text/plain; charset=utf-8");
    send(res, 200, buf, MIME[path.extname(file)] || "application/octet-stream");
  });
}

async function api(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const method = req.method;

  // GET /api/state
  if (method === "GET" && parts[1] === "state") return send(res, 200, db);

  // POST /api/games
  if (method === "POST" && parts[1] === "games" && parts.length === 2) {
    const { game, error } = cleanGame(await readBody(req));
    if (error) return send(res, 400, { error });
    db.games.push(game); save(db);
    return send(res, 201, game);
  }

  const game = parts[1] === "games" && parts[2] ? db.games.find((g) => g.id === parts[2]) : null;
  if (parts[1] === "games" && parts[2] && !game) return send(res, 404, { error: "ไม่พบก๊วนนี้ อาจถูกลบไปแล้ว" });

  // DELETE /api/games/:id   body: {userId}
  if (method === "DELETE" && game && parts.length === 3) {
    const { userId } = await readBody(req);
    if (!game.sample && game.hostId !== userId) return send(res, 403, { error: "ลบได้เฉพาะคนตั้งก๊วน" });
    db.games = db.games.filter((g) => g.id !== game.id);
    db.joins = db.joins.filter((j) => j.gameId !== game.id);
    save(db);
    return send(res, 200, { ok: true });
  }

  // POST /api/games/:id/join   body: {userId, name}
  if (method === "POST" && game && parts[3] === "join") {
    const b = await readBody(req);
    const name = str(b.name, 30);
    if (!isId(b.userId)) return send(res, 400, { error: "ไม่พบรหัสผู้ใช้ ลองรีเฟรชหน้า" });
    if (!name) return send(res, 400, { error: "ใส่ชื่อเล่นของคุณก่อน" });
    if (db.joins.some((j) => j.gameId === game.id && j.userId === b.userId)) return send(res, 200, { ok: true });
    db.joins.push({ id: game.id + "__" + b.userId, gameId: game.id, userId: b.userId, name, createdAt: Date.now() });
    save(db);
    return send(res, 201, { ok: true });
  }

  // DELETE /api/games/:id/join   body: {userId}
  if (method === "DELETE" && game && parts[3] === "join") {
    const { userId } = await readBody(req);
    db.joins = db.joins.filter((j) => !(j.gameId === game.id && j.userId === userId));
    save(db);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: "ไม่พบ API นี้" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (req.method !== "GET") return send(res, 405, "Method Not Allowed", "text/plain");
    serveStatic(req, res, url.pathname);
  } catch (e) {
    const code = e.message === "too_large" ? 413 : e.message === "bad_json" ? 400 : 500;
    if (code === 500) console.error(e);
    send(res, code, { error: code === 500 ? "เซิร์ฟเวอร์มีปัญหา ลองใหม่อีกครั้ง" : "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🏸 หาคู่ตีแบด เปิดแล้ว`);
  console.log(`   เครื่องนี้:        http://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`   เพื่อนใน Wi-Fi เดียวกัน: http://${a.address}:${PORT}`);
    }
  }
  console.log(`   ข้อมูลเก็บที่: ${DATA_FILE}\n`);
});
