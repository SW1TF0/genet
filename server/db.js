"use strict";
// SQLite database (built into Node 22+): schema, seed data and small helpers.
const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "globalnet.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment TEXT NOT NULL CHECK (segment IN ('home','business')),
  type TEXT NOT NULL,              -- internet | combo | tv | custom
  name TEXT NOT NULL,
  speed INTEGER,                   -- Mbps
  channels INTEGER,
  price REAL,                      -- € / month, VAT included
  badge TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  features TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  segment TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'wifi',
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  image TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  image TEXT,
  valid_until TEXT,                -- YYYY-MM-DD, empty = no end date
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  image TEXT,
  published_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS coverage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','soon','planned')),
  note TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('signup','business','support','callback')),
  segment TEXT NOT NULL DEFAULT 'home',
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','scheduled','done','cancelled')),
  scheduled_for TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',  -- internal, never shown to the customer
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  public_note TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
`);

/* ---------------- Password helpers ---------------- */
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

/* ---------------- Seed ---------------- */
function seed() {
  const has = db.prepare("SELECT COUNT(*) AS n FROM settings").get().n > 0;
  if (has) return;

  const settings = {
    company: "Global Net",
    legal_names: "Глобал Нет Консулт ЕООД (ЕИК 108685240) · Глобал Нет Груп ЕООД (ЕИК 206654400)",
    address: "бул. Булаир 27, Кърджали 6600",
    phone: "0361 82320",
    mobile: "0898 819 299",
    email: "office.globalnet@gmail.com",
    hours: "Пон – Пет 08:30 – 18:30 · Съб 09:30 – 16:30",
    support_hours: "Техническа поддръжка 24/7 · Екипи на терен 09:00 – 19:00",
    facebook: "https://www.facebook.com/GlobalNet.Kardzhali/",
    pay_url: "https://pay.tlux.online/auth",
    announcement: "Нови планове: оптичен интернет до 1000 Mbps от 12,90 € на месец.",
    announcement_active: "1",
    offices: JSON.stringify([
      { name: "Офис – магазин", address: "бул. Булаир 27, Кърджали 6600", hours: "Пон – Пет 08:30 – 18:30\nСъб 09:30 – 16:30", phones: "0361 82320, 0898 819 299" },
      { name: "Каса Възрожденци", address: "бул. Христо Ботев 76, Кърджали", hours: "Пон – Пет 10:30 – 17:30\nСъб 10:00 – 15:00", phones: "0893 392 509" },
      { name: "Каса Luxes", address: "бул. България 52 (до МТЕЛ), Кърджали", hours: "", phones: "0361 52767" },
      { name: "Крумовград", address: "ул. Съединение 12, Крумовград", hours: "Пон – Пет 08:30 – 17:30", phones: "0888 601 052" }
    ])
  };
  const setS = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(settings)) setS.run(k, v);

  const plans = [
    ["home", "internet", "Интернет 100", 100, null, 12.9, null, 0, ["Оптичен интернет 100 Mbps", "Собствена подземна мрежа", "Поддръжка 24/7"]],
    ["home", "internet", "Интернет 300", 300, null, 15.9, null, 0, ["Оптичен интернет 300 Mbps", "Собствена подземна мрежа", "Поддръжка 24/7"]],
    ["home", "internet", "Интернет 500", 500, null, 18.9, null, 0, ["Оптичен интернет 500 Mbps", "Собствена подземна мрежа", "Поддръжка 24/7"]],
    ["home", "internet", "Интернет 1000", 1000, null, 23.9, null, 0, ["Оптичен интернет 1000 Mbps", "Собствена подземна мрежа", "Поддръжка 24/7"]],
    ["home", "tv", "IPTV", null, 180, 10, null, 0, ["Над 180 канала, 60+ в HD", "Архив 7 дни и връщане на предавания", "Пауза, запис и EPG", "Smart TV приложение", "1 приемник"]],
    ["home", "combo", "HOME", 100, 180, 12.9, null, 0, ["Интернет 100 Mbps", "Над 180 ТВ канала", "Архив, пауза и запис"]],
    ["home", "combo", "FAMILY", 300, 190, 18.9, "Най-популярен", 1, ["Интернет 300 Mbps", "Над 190 ТВ канала", "Архив, пауза и запис"]],
    ["home", "combo", "ULTRA", 500, 190, 21.9, null, 0, ["Интернет 500 Mbps", "Над 190 ТВ канала", "Архив, пауза и запис"]],
    ["home", "combo", "GIGA", 1000, 190, 26.9, null, 0, ["Интернет 1000 Mbps", "Над 190 ТВ канала", "Архив, пауза и запис"]],
    ["home", "combo", "SPORT", 500, null, 27.9, null, 0, ["Интернет 500 Mbps", "Телевизия + спортни канали", "Архив, пауза и запис"]],
    ["business", "internet", "Ултра оптичен", 600, null, 22, "Бизнес", 1, ["FTTH оптична свързаност", "Без такса включване", "Поддръжка 24/7"]],
    ["business", "custom", "Индивидуално решение", null, null, null, null, 0, ["Множество обекти и точки", "Мрежа, Wi-Fi и видеонаблюдение", "Оферта след безплатен оглед"]]
  ];
  const insP = db.prepare("INSERT INTO plans (segment,type,name,speed,channels,price,badge,featured,features,sort) VALUES (?,?,?,?,?,?,?,?,?,?)");
  plans.forEach((p, i) => insP.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], JSON.stringify(p[8]), i));

  const services = [
    ["home", "wifi", "Оптичен интернет", "GPON до 1000 Mbps по собствена подземна мрежа. Стабилно, бързо, без прекъсвания.", null],
    ["home", "tv", "IPTV телевизия", "Над 190 канала, връщане до 24 часа назад, 7-дневна програма и родителски контрол.", null],
    ["home", "pc", "Компютри и периферия", "Настолни компютри, лаптопи и аксесоари в магазина ни на бул. Булаир 27.", null],
    ["home", "tool", "Сервиз", "Ремонт, инсталиране на Windows, почистване от вируси и настройка на интернет.", null],
    ["business", "wifi", "FTTH интернет до 600 Mbps", "Директна оптична свързаност за офиси, магазини и производство.", null],
    ["business", "cam", "Видеонаблюдение", "Камери от ново поколение с отдалечено наблюдение от всяка точка на света.", "assets/img/cctv.png"],
    ["business", "net", "LAN и Wi-Fi мрежи", "Проектиране и изграждане на кабелни и безжични мрежи за вашия обект.", null],
    ["business", "lock", "Контрол на достъпа и СОТ", "Проектиране и монтаж на системи за контрол на достъпа и алармени системи.", null],
    ["business", "tool", "Сервиз и поддръжка", "Продажба и поддръжка на компютърна и офис техника, AV и LCD инсталации.", null],
    ["business", "web", "Уеб дизайн", "Изработка на уебсайтове за вашия бизнес.", null]
  ];
  const insS = db.prepare("INSERT INTO services (segment,icon,title,text,image,sort) VALUES (?,?,?,?,?,?)");
  services.forEach((s, i) => insS.run(...s, i));

  db.prepare("INSERT INTO promotions (title,text,image,valid_until,sort) VALUES (?,?,?,?,?)")
    .run("Плати 3 месеца, ползвай 4", "Платете абонамента си за 3 месеца напред и получавате четвъртия месец безплатно.", "assets/img/hero-fiber.png", "", 0);

  const news = [
    ["Отличиха 25 млади художници в конкурса „Бъдещето през моите очи“", "Global Net награди младите участници в конкурса за детска рисунка.", "2026-03-30"],
    ["174 деца показаха бъдещето в изложба в ОДК", "Изложба с рисунки на деца от Кърджали, подкрепена от Global Net.", "2025-06-01"],
    ["Безплатен Wi-Fi в градските автобуси", "Global Net осигури безплатен интернет в градския транспорт.", "2024-09-15"],
    ["Свръхскоростен гигабитов интернет в Кърджали", "Global Net предлага гигабитова свързаност по собствена оптична мрежа.", "2023-05-10"]
  ];
  const insN = db.prepare("INSERT INTO news (title,excerpt,body,published_at) VALUES (?,?,?,?)");
  for (const [t, e, d] of news) insN.run(t, e, e, d);

  const faq = [
    ["Как да се включа?", "Попълнете формата „Включи се“ на сайта или ни се обадете на 0898 819 299. Ще се свържем с вас, за да уточним удобен час за включване."],
    ["Имате ли денонощна поддръжка?", "Да. Техническата поддръжка работи 24/7 на 0898 819 299. Екипите ни на терен работят от 09:00 до 19:00 ч."],
    ["Как мога да платя сметката си?", "Онлайн през бутона „Плати онлайн“, в нашите офиси и каси, в EasyPay, както и по банков път (само за юридически лица)."],
    ["Има ли такса включване?", "Таксата за включване е 15 €. За бизнес плана „Ултра оптичен“ няма такса включване."],
    ["Мога ли да спра услугата временно?", "Да, предлагаме възможност за временно спиране на услугата. Свържете се с нас за подробности."],
    ["Какъв е срокът на договора?", "Предлагаме безсрочни договори. Подробностите са в Общите условия."]
  ];
  const insF = db.prepare("INSERT INTO faq (question,answer,sort) VALUES (?,?,?)");
  faq.forEach((f, i) => insF.run(f[0], f[1], i));

  const insC = db.prepare("INSERT INTO coverage (area,status,note,sort) VALUES (?,?,?,?)");
  [["Кърджали", "available", "GPON оптика"], ["Кърджали – кв. Възрожденци", "available", "GPON оптика"], ["Крумовград", "available", ""]]
    .forEach((c, i) => insC.run(c[0], c[1], c[2], i));

  // First admin account
  const username = process.env.ADMIN_USER || "admin";
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString("base64url");
  const { hash, salt } = hashPassword(password);
  db.prepare("INSERT INTO admins (username,name,pass_hash,salt) VALUES (?,?,?,?)").run(username, "Администратор", hash, salt);
  if (!process.env.ADMIN_PASSWORD) {
    console.log("\n  Създаден е администратор:");
    console.log(`  Потребител: ${username}`);
    console.log(`  Парола:     ${password}`);
    console.log("  Сменете паролата от Админ панел → Профил.\n");
  }
}
seed();

/* ---------------- Helpers ---------------- */
function getSettings() {
  const out = {};
  for (const r of db.prepare("SELECT key, value FROM settings").all()) out[r.key] = r.value;
  return out;
}

function newRequestCode() {
  // e.g. GN-7K3P9Q: short, easy to read over the phone (no 0/O/1/I)
  const abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (;;) {
    let c = "GN-";
    const bytes = crypto.randomBytes(6);
    for (const b of bytes) c += abc[b % abc.length];
    if (!db.prepare("SELECT 1 FROM requests WHERE code = ?").get(c)) return c;
  }
}

module.exports = { db, hashPassword, verifyPassword, getSettings, newRequestCode };
