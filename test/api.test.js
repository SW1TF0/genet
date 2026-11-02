"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gn-"));
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.ADMIN_PASSWORD = "test-password-123";
const app = require("../server/index.js");

let server, base, cookie = "";
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (p, opts = {}) => {
  const r = await fetch(base + p, { method: opts.method || "GET", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: r.status, body: await r.json().catch(() => null) };
};

test("public site data is seeded", async () => {
  const { status, body } = await call("/api/site");
  assert.equal(status, 200);
  assert.ok(body.plans.length >= 8);
  assert.equal(body.settings.mobile, "0898 819 299");
  assert.ok(body.faq.length > 0 && body.coverage.length > 0);
});

test("request validation rejects bad input", async () => {
  const { status, body } = await call("/api/requests", { method: "POST", body: { type: "signup", name: "A", phone: "x" } });
  assert.equal(status, 400);
  assert.ok(body.fields.name && body.fields.phone && body.fields.address);
});

let code;
test("customer can submit and track a request", async () => {
  const r = await call("/api/requests", { method: "POST", body: { type: "signup", name: "Иван Петров", phone: "0888 123 456", address: "Кърджали, ул. Тест 1", plan: "Ултра" } });
  assert.equal(r.status, 201);
  assert.match(r.body.code, /^GN-[A-Z0-9]{6}$/);
  code = r.body.code;
  const bad = await call(`/api/requests/track?code=${code}&phone=0899999999`);
  assert.equal(bad.status, 404);
  const ok = await call(`/api/requests/track?code=${code}&phone=0888123456`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "new");
  assert.equal(ok.body.notes, undefined, "internal notes must never be public");
});

test("admin endpoints require login", async () => {
  cookie = "";
  assert.equal((await call("/api/admin/requests")).status, 401);
  assert.equal((await call("/api/admin/login", { method: "POST", body: { username: "admin", password: "wrong" } })).status, 401);
});

test("admin can log in, update a request and the customer sees it", async () => {
  const login = await call("/api/admin/login", { method: "POST", body: { username: "admin", password: "test-password-123" } });
  assert.equal(login.status, 200);
  const list = await call("/api/admin/requests?q=" + encodeURIComponent("Иван"));
  assert.equal(list.body.length, 1);
  const id = list.body[0].id;
  const up = await call("/api/admin/requests/" + id, { method: "PATCH", body: { status: "scheduled", scheduled_for: "12.11, 10:00", public_note: "Техник идва", notes: "секретно" } });
  assert.equal(up.status, 200);
  const t = await call(`/api/requests/track?code=${code}&phone=0888123456`);
  assert.equal(t.body.status, "scheduled");
  assert.equal(t.body.scheduled_for, "12.11, 10:00");
  assert.ok(t.body.events.some(e => e.public_note === "Техник идва"));
  assert.ok(!JSON.stringify(t.body).includes("секретно"));
  const stats = await call("/api/admin/stats");
  assert.equal(stats.body.total, 1);
});

test("admin can manage plans and changes show on the site", async () => {
  const add = await call("/api/admin/plans", { method: "POST", body: { name: "Тест План", segment: "home", type: "internet", price: "9.99", speed: "50", features: ["Едно", "Две", ""] } });
  assert.equal(add.status, 201);
  let site = await call("/api/site");
  const p = site.body.plans.find(x => x.name === "Тест План");
  assert.deepEqual(p.features, ["Едно", "Две"]);
  assert.equal(p.price, 9.99);
  await call("/api/admin/plans/" + add.body.id, { method: "PUT", body: { ...p, active: false } });
  site = await call("/api/site");
  assert.ok(!site.body.plans.some(x => x.name === "Тест План"));
});

test("expired promotions are hidden", async () => {
  await call("/api/admin/promotions", { method: "POST", body: { title: "Стара", text: "x", valid_until: "2020-01-01" } });
  const site = await call("/api/site");
  assert.ok(!site.body.promotions.some(p => p.title === "Стара"));
});

test("settings update", async () => {
  await call("/api/admin/settings", { method: "PUT", body: { announcement: "Тест обява", offices: [{ name: "X", address: "Y" }] } });
  const site = await call("/api/site");
  assert.equal(site.body.settings.announcement, "Тест обява");
  assert.equal(site.body.settings.offices[0].name, "X");
});
