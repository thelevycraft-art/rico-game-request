const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-this";

const db = new Database(path.join(__dirname, "data", "games.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  game_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  reason TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_id, voter_key),
  FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE CASCADE
);
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, "public")));

function clean(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function voterKey(req) {
  const raw = `${req.ip}|${req.get("user-agent") || ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.status(401).json({ error: "Belum login admin." });
  next();
}

app.get("/api/games", (req, res) => {
  const status = clean(req.query.status, 30);
  const search = clean(req.query.search, 100);
  let sql = "SELECT * FROM requests";
  const params = [];

  const conditions = [];
  if (status) {
    conditions.push("status = ?");
    params.push(status);
  }
  if (search) {
    conditions.push("(game_name LIKE ? OR nickname LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY votes DESC, created_at DESC";

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.get("/api/stats", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS n FROM requests").get().n;
  const pending = db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status='pending'").get().n;
  const played = db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status='played'").get().n;
  const votes = db.prepare("SELECT COALESCE(SUM(votes),0) AS n FROM requests").get().n;
  const top = db.prepare("SELECT * FROM requests WHERE status!='rejected' ORDER BY votes DESC LIMIT 5").all();
  res.json({ total, pending, played, votes, top });
});

app.post("/api/requests", (req, res) => {
  const nickname = clean(req.body.nickname, 40);
  const gameName = clean(req.body.game_name, 100);
  const platform = clean(req.body.platform, 30);
  const reason = clean(req.body.reason, 500);
  const imageUrl = clean(req.body.image_url, 500);

  if (!nickname || !gameName || !platform) {
    return res.status(400).json({ error: "Nickname, nama game, dan platform wajib diisi." });
  }

  const duplicate = db.prepare(`
    SELECT id FROM requests
    WHERE lower(game_name)=lower(?) AND status!='rejected'
    LIMIT 1
  `).get(gameName);

  if (duplicate) {
    return res.status(409).json({
      error: "Game ini sudah ada di daftar. Gunakan tombol VOTE untuk mendukung request yang sudah ada."
    });
  }

  const result = db.prepare(`
    INSERT INTO requests (nickname, game_name, platform, reason, image_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(nickname, gameName, platform, reason, imageUrl);

  res.json({ ok: true, id: result.lastInsertRowid });
});

app.post("/api/games/:id/vote", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "ID tidak valid." });

  try {
    const game = db.prepare("SELECT id FROM requests WHERE id=? AND status!='rejected'").get(id);
    if (!game) return res.status(404).json({ error: "Request tidak ditemukan." });

    const result = db.prepare("INSERT INTO votes (request_id, voter_key) VALUES (?, ?)").run(id, voterKey(req));
    if (result.changes) {
      db.prepare("UPDATE requests SET votes=votes+1 WHERE id=?").run(id);
    }
    res.json({ ok: true, message: "Vote berhasil!" });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Kamu sudah vote game ini dari perangkat/jaringan ini." });
    }
    res.status(500).json({ error: "Gagal memberikan vote." });
  }
});

app.post("/api/admin/login", (req, res) => {
  const username = clean(req.body.username, 100);
  const password = String(req.body.password || "");
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Username atau password salah." });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  res.json({ loggedIn: !!req.session.admin });
});

app.patch("/api/admin/requests/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const allowed = ["pending", "review", "scheduled", "played", "rejected"];
  const status = clean(req.body.status, 30);

  if (!allowed.includes(status)) return res.status(400).json({ error: "Status tidak valid." });

  const result = db.prepare("UPDATE requests SET status=? WHERE id=?").run(status, id);
  if (!result.changes) return res.status(404).json({ error: "Request tidak ditemukan." });
  res.json({ ok: true });
});

app.delete("/api/admin/requests/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM votes WHERE request_id=?").run(id);
  const result = db.prepare("DELETE FROM requests WHERE id=?").run(id);
  if (!result.changes) return res.status(404).json({ error: "Request tidak ditemukan." });
  res.json({ ok: true });
});

app.get("/api/overlay", (req, res) => {
  const game = db.prepare(`
    SELECT * FROM requests
    WHERE status IN ('pending','review','scheduled')
    ORDER BY votes DESC, created_at ASC
    LIMIT 1
  `).get();
  res.json(game || null);
});

app.listen(PORT, () => {
  console.log(`Rico Game Request berjalan di http://localhost:${PORT}`);
  console.log(`Admin: ${ADMIN_USER}`);
});
