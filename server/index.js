"use strict";
const express = require("express");
const path = require("node:path");
const crypto = require("node:crypto");
const { db, hashPassword, verifyPassword, getSettings, newRequestCode } = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_DAYS = 7;
const isProd = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));

// Basic security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

/* ---------------- Utilities ---------------- */
const bool = v => (v ? 1 : 0);
const str = (v, max = 500) => (v == null ? "" : String(v).trim().slice(0, max));
const today = () => new Date().toISOString().slice(0, 10);

function parsePlan(p) { return { ...p, featured: !!p.featured, active: !!p.active, features: JSON.parse(p.features || "[]") }; }

function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

// Very small in-memory rate limiter (per IP + bucket)
const hits = new Map();
function rateLimit(bucket, max, windowMs) {
  return (req, res, next) => {
    const key = bucket + ":" + req.ip;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: "Твърде много опити. Опитайте отново след малко." });
    arr.push(now); hits.set(key, arr); next();
  };
}

/* ---------------- Public API ---------------- */
app.get("/api/site", (req, res) => {
  const s = getSettings();
  res.json({
    settings: { ...s, offices: JSON.parse(s.offices || "[]"), announcement_active: s.announcement_active === "1" },
    plans: db.prepare("SELECT * FROM plans WHERE active = 1 ORDER BY sort, id").all().map(parsePlan),
    services: db.prepare("SELECT * FROM services WHERE active = 1 ORDER BY sort, id").all(),
    promotions: db.prepare("SELECT * FROM promotions WHERE active = 1 AND (valid_until = '' OR valid_until IS NULL OR valid_until >= ?) ORDER BY sort, id").all(today()),
    news: db.prepare("SELECT id,title,excerpt,image,published_at FROM news WHERE active = 1 ORDER BY published_at DESC LIMIT 6").all(),
    faq: db.prepare("SELECT id,question,answer FROM faq WHERE active = 1 ORDER BY sort, id").all(),
    coverage: db.prepare("SELECT id,area,status,note FROM coverage WHERE active = 1 ORDER BY sort, area").all()
  });
});

app.get("/api/news/:id", (req, res) => {
  const n = db.prepare("SELECT * FROM news WHERE id = ? AND active = 1").get(Number(req.params.id));
  if (!n) return res.status(404).json({ error: "Новината не е намерена." });
  res.json(n);
});

const REQUEST_TYPES = ["signup", "business", "support", "callback"];
app.post("/api/requests", rateLimit("req", 8, 10 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ code: "GN-OK" }); // honeypot field filled → bot, pretend success
  const type = REQUEST_TYPES.includes(b.type) ? b.type : "signup";
  const data = {
    type,
    segment: b.segment === "business" ? "business" : "home",
    name: str(b.name, 120), company: str(b.company, 160), phone: str(b.phone, 40), email: str(b.email, 160),
    address: str(b.address, 250), plan: str(b.plan, 120), topic: str(b.topic, 80), message: str(b.message, 2000)
  };
  const errors = {};
  if (data.name.length < 2) errors.name = "Въведете имената си.";
  if (!/^[0-9 +()/-]{6,}$/.test(data.phone)) errors.phone = "Въведете валиден телефон.";
  if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) errors.email = "Невалиден имейл.";
  if ((type === "signup" || type === "business") && data.address.length < 3) errors.address = "Въведете адрес.";
  if (type === "support" && data.message.length < 3) errors.message = "Опишете проблема.";
  if (Object.keys(errors).length) return res.status(400).json({ error: "Проверете полетата.", fields: errors });

  const code = newRequestCode();
  const r = db.prepare(`INSERT INTO requests (code,type,segment,name,company,phone,email,address,plan,topic,message)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(code, data.type, data.segment, data.name, data.company, data.phone, data.email, data.address, data.plan, data.topic, data.message);
  db.prepare("INSERT INTO request_events (request_id,status,public_note,author) VALUES (?,?,?,?)")
    .run(r.lastInsertRowid, "new", "Заявката е получена.", "Система");
  res.status(201).json({ code });
});

// Customer tracking: needs both the code and the phone number used
app.get("/api/requests/track", rateLimit("track", 30, 10 * 60 * 1000), (req, res) => {
  const code = str(req.query.code, 20).toUpperCase();
  const digits = str(req.query.phone, 40).replace(/\D/g, "");
  const r = db.prepare("SELECT * FROM requests WHERE code = ?").get(code);
  if (!r || digits.length < 6 || r.phone.replace(/\D/g, "").slice(-6) !== digits.slice(-6)) {
    return res.status(404).json({ error: "Не намерихме заявка с този номер и телефон." });
  }
  const events = db.prepare("SELECT status, public_note, created_at FROM request_events WHERE request_id = ? ORDER BY id").all(r.id);
  res.json({ code: r.code, type: r.type, plan: r.plan, status: r.status, scheduled_for: r.scheduled_for, created_at: r.created_at, events });
});

/* ---------------- Admin auth ---------------- */
function requireAdmin(req, res, next) {
  // Cookie for the same-origin admin; x-gn-token header for static hosting (see assets/js/backend.js)
  const token = cookies(req).gn_admin || req.get("x-gn-token");
  if (!token) return res.status(401).json({ error: "Не сте влезли." });
  const s = db.prepare(`SELECT s.token, s.expires_at, a.id, a.username, a.name FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token = ?`).get(token);
  if (!s || s.expires_at < Date.now()) return res.status(401).json({ error: "Сесията е изтекла." });
  req.admin = { id: s.id, username: s.username, name: s.name };
  next();
}

function setSessionCookie(res, token, maxAgeSec) {
  res.setHeader("Set-Cookie", `gn_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isProd ? "; Secure" : ""}`);
}

app.post("/api/admin/login", rateLimit("login", 10, 15 * 60 * 1000), (req, res) => {
  const { username, password } = req.body || {};
  const a = db.prepare("SELECT * FROM admins WHERE username = ?").get(str(username, 60));
  if (!a || !verifyPassword(String(password || ""), a.pass_hash, a.salt)) {
    return res.status(401).json({ error: "Грешно потребителско име или парола." });
  }
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token, admin_id, expires_at) VALUES (?,?,?)").run(token, a.id, Date.now() + SESSION_DAYS * 864e5);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  res.json({ username: a.username, name: a.name, token });
});

app.post("/api/admin/logout", (req, res) => {
  const token = cookies(req).gn_admin || req.get("x-gn-token");
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  setSessionCookie(res, "", 0);
  res.json({ ok: true });
});

const admin = express.Router();
admin.use(requireAdmin);

admin.get("/me", (req, res) => res.json(req.admin));

admin.post("/password", (req, res) => {
  const { current, next: nextPw } = req.body || {};
  const a = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.admin.id);
  if (!verifyPassword(String(current || ""), a.pass_hash, a.salt)) return res.status(400).json({ error: "Текущата парола е грешна." });
  if (String(nextPw || "").length < 8) return res.status(400).json({ error: "Новата парола трябва да е поне 8 символа." });
  const { hash, salt } = hashPassword(String(nextPw));
  db.prepare("UPDATE admins SET pass_hash = ?, salt = ? WHERE id = ?").run(hash, salt, a.id);
  res.json({ ok: true });
});

admin.get("/admins", (req, res) => res.json(db.prepare("SELECT id, username, name, created_at FROM admins ORDER BY id").all()));
admin.post("/admins", (req, res) => {
  const username = str(req.body?.username, 60), name = str(req.body?.name, 120), password = String(req.body?.password || "");
  if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) return res.status(400).json({ error: "Потребителското име трябва да е поне 3 символа (латиница, цифри)." });
  if (password.length < 8) return res.status(400).json({ error: "Паролата трябва да е поне 8 символа." });
  if (db.prepare("SELECT 1 FROM admins WHERE username = ?").get(username)) return res.status(400).json({ error: "Това потребителско име е заето." });
  const { hash, salt } = hashPassword(password);
  db.prepare("INSERT INTO admins (username,name,pass_hash,salt) VALUES (?,?,?,?)").run(username, name, hash, salt);
  res.status(201).json({ ok: true });
});
admin.delete("/admins/:id", (req, res) => {
  const id = Number(req.params.id);
  if (id === req.admin.id) return res.status(400).json({ error: "Не можете да изтриете собствения си профил." });
  db.prepare("DELETE FROM admins WHERE id = ?").run(id);
  res.json({ ok: true });
});

/* Dashboard */
admin.get("/stats", (req, res) => {
  const byStatus = Object.fromEntries(db.prepare("SELECT status, COUNT(*) n FROM requests GROUP BY status").all().map(r => [r.status, r.n]));
  const byType = Object.fromEntries(db.prepare("SELECT type, COUNT(*) n FROM requests GROUP BY type").all().map(r => [r.type, r.n]));
  const last14 = db.prepare(`SELECT date(created_at) d, COUNT(*) n FROM requests WHERE created_at >= datetime('now','-13 days') GROUP BY d ORDER BY d`).all();
  const topPlans = db.prepare(`SELECT plan, COUNT(*) n FROM requests WHERE plan <> '' GROUP BY plan ORDER BY n DESC LIMIT 5`).all();
  const total = db.prepare("SELECT COUNT(*) n FROM requests").get().n;
  const week = db.prepare("SELECT COUNT(*) n FROM requests WHERE created_at >= datetime('now','-7 days')").get().n;
  const recent = db.prepare("SELECT id, code, type, name, phone, plan, status, created_at FROM requests ORDER BY id DESC LIMIT 6").all();
  res.json({ total, week, byStatus, byType, last14, topPlans, recent });
});

/* Requests */
const REQ_STATUSES = ["new", "in_progress", "scheduled", "done", "cancelled"];
admin.get("/requests", (req, res) => {
  const where = [], args = [];
  if (REQ_STATUSES.includes(req.query.status)) { where.push("status = ?"); args.push(req.query.status); }
  if (REQUEST_TYPES.includes(req.query.type)) { where.push("type = ?"); args.push(req.query.type); }
  if (req.query.q) {
    const q = "%" + str(req.query.q, 80) + "%";
    where.push("(code LIKE ? OR name LIKE ? OR phone LIKE ? OR address LIKE ? OR company LIKE ? OR email LIKE ?)");
    args.push(q, q, q, q, q, q);
  }
  const sql = `SELECT * FROM requests ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 500`;
  res.json(db.prepare(sql).all(...args));
});

admin.get("/requests.csv", (req, res) => {
  const rows = db.prepare("SELECT code,type,segment,status,name,company,phone,email,address,plan,topic,message,scheduled_for,notes,created_at FROM requests ORDER BY id DESC").all();
  const cols = rows.length ? Object.keys(rows[0]) : ["code"];
  const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="zaqvki-${today()}.csv"`);
  res.send(csv);
});

admin.get("/requests/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM requests WHERE id = ?").get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: "Няма такава заявка." });
  r.events = db.prepare("SELECT * FROM request_events WHERE request_id = ? ORDER BY id").all(r.id);
  res.json(r);
});

admin.patch("/requests/:id", (req, res) => {
  const r = db.prepare("SELECT * FROM requests WHERE id = ?").get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: "Няма такава заявка." });
  const b = req.body || {};
  const status = REQ_STATUSES.includes(b.status) ? b.status : r.status;
  const notes = b.notes !== undefined ? str(b.notes, 4000) : r.notes;
  const scheduled = b.scheduled_for !== undefined ? str(b.scheduled_for, 40) : r.scheduled_for;
  db.prepare("UPDATE requests SET status = ?, notes = ?, scheduled_for = ?, updated_at = datetime('now') WHERE id = ?").run(status, notes, scheduled, r.id);
  const publicNote = str(b.public_note, 500);
  if (status !== r.status || publicNote || scheduled !== r.scheduled_for) {
    db.prepare("INSERT INTO request_events (request_id,status,public_note,author) VALUES (?,?,?,?)").run(r.id, status, publicNote, req.admin.name || req.admin.username);
  }
  res.json({ ok: true });
});

admin.delete("/requests/:id", (req, res) => {
  db.prepare("DELETE FROM requests WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

/* Settings */
admin.get("/settings", (req, res) => res.json(getSettings()));
admin.put("/settings", (req, res) => {
  const allowed = ["company", "legal_names", "address", "phone", "mobile", "email", "hours", "support_hours", "facebook", "pay_url", "announcement", "announcement_active", "offices"];
  const up = db.prepare("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const k of allowed) {
    if (req.body?.[k] === undefined) continue;
    let v = req.body[k];
    if (k === "offices") { try { v = JSON.stringify(Array.isArray(v) ? v : JSON.parse(v)); } catch { return res.status(400).json({ error: "Невалиден списък с офиси." }); } }
    up.run(k, str(v, 5000));
  }
  res.json({ ok: true });
});

/* Generic CRUD for content tables */
const ENTITIES = {
  plans: {
    fields: ["segment", "type", "name", "speed", "channels", "price", "badge", "featured", "features", "sort", "active"],
    clean: b => ({
      segment: b.segment === "business" ? "business" : "home",
      type: ["internet", "combo", "tv", "custom"].includes(b.type) ? b.type : "internet",
      name: str(b.name, 80), speed: b.speed === "" || b.speed == null ? null : Number(b.speed),
      channels: b.channels === "" || b.channels == null ? null : Number(b.channels),
      price: b.price === "" || b.price == null ? null : Number(b.price),
      badge: str(b.badge, 30) || null, featured: bool(b.featured),
      features: JSON.stringify((Array.isArray(b.features) ? b.features : String(b.features || "").split("\n")).map(s => str(s, 120)).filter(Boolean)),
      sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active)
    }),
    order: "segment, sort, id", out: parsePlan
  },
  services: {
    fields: ["segment", "icon", "title", "text", "image", "sort", "active"],
    clean: b => ({ segment: b.segment === "business" ? "business" : "home", icon: str(b.icon, 20) || "wifi", title: str(b.title, 100), text: str(b.text, 400), image: str(b.image, 300) || null, sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
    order: "segment, sort, id"
  },
  promotions: {
    fields: ["title", "text", "image", "valid_until", "sort", "active"],
    clean: b => ({ title: str(b.title, 120), text: str(b.text, 600), image: str(b.image, 300) || null, valid_until: str(b.valid_until, 10), sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
    order: "sort, id"
  },
  news: {
    fields: ["title", "excerpt", "body", "image", "published_at", "active"],
    clean: b => ({ title: str(b.title, 200), excerpt: str(b.excerpt, 400), body: str(b.body, 20000), image: str(b.image, 300) || null, published_at: str(b.published_at, 10) || today(), active: b.active === undefined ? 1 : bool(b.active) }),
    order: "published_at DESC, id DESC"
  },
  faq: {
    fields: ["question", "answer", "sort", "active"],
    clean: b => ({ question: str(b.question, 200), answer: str(b.answer, 2000), sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
    order: "sort, id"
  },
  coverage: {
    fields: ["area", "status", "note", "sort", "active"],
    clean: b => ({ area: str(b.area, 120), status: ["available", "soon", "planned"].includes(b.status) ? b.status : "available", note: str(b.note, 200), sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
    order: "sort, area"
  }
};

for (const [name, e] of Object.entries(ENTITIES)) {
  const out = e.out || (x => x);
  const required = { plans: "name", services: "title", promotions: "title", news: "title", faq: "question", coverage: "area" }[name];
  admin.get(`/${name}`, (req, res) => res.json(db.prepare(`SELECT * FROM ${name} ORDER BY ${e.order}`).all().map(out)));
  admin.post(`/${name}`, (req, res) => {
    const v = e.clean(req.body || {});
    if (!v[required]) return res.status(400).json({ error: "Попълнете задължителните полета." });
    const r = db.prepare(`INSERT INTO ${name} (${e.fields.join(",")}) VALUES (${e.fields.map(() => "?").join(",")})`).run(...e.fields.map(f => v[f]));
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  admin.put(`/${name}/:id`, (req, res) => {
    const v = e.clean(req.body || {});
    if (!v[required]) return res.status(400).json({ error: "Попълнете задължителните полета." });
    db.prepare(`UPDATE ${name} SET ${e.fields.map(f => f + " = ?").join(", ")} WHERE id = ?`).run(...e.fields.map(f => v[f]), Number(req.params.id));
    res.json({ ok: true });
  });
  admin.delete(`/${name}/:id`, (req, res) => {
    db.prepare(`DELETE FROM ${name} WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  });
}

app.use("/api/admin", admin);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

/* ---------------- Static site ---------------- */
const pub = path.join(__dirname, "..", "public");
// The admin page uses relative paths, so it must be served as /admin/
app.get("/admin", (req, res) => res.redirect(301, "/admin/"));
app.use(express.static(pub, { extensions: ["html"], maxAge: isProd ? "1h" : 0 }));
app.get("/admin*", (req, res) => res.sendFile(path.join(pub, "admin", "index.html")));
app.use((req, res) => res.status(404).sendFile(path.join(pub, "404.html")));

// Error handler (keeps JSON for API)
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith("/api")) return res.status(500).json({ error: "Възникна грешка на сървъра." });
  res.status(500).send("Server error");
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Global Net работи на http://localhost:${PORT}  (админ: /admin)`));
}
module.exports = app;
