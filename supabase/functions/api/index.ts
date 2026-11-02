// Global Net API as a Supabase Edge Function.
// Same routes and JSON shapes as server/index.js, so the static site
// (GitHub Pages) and the admin panel work unchanged against it.
// Admin sessions use a token in the "x-gn-token" header instead of a cookie.
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false, max: 3,
  // bigserial ids come back as numbers, like SQLite did
  types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-gn-token",
  "Access-Control-Expose-Headers": "content-disposition",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
const err = (msg: string, status = 400, extra: Record<string, unknown> = {}) => json({ error: msg, ...extra }, status);

const str = (v: unknown, max = 500) => (v == null ? "" : String(v).trim().slice(0, max));
const bool = (v: unknown) => (v && v !== "0" && v !== "false" ? 1 : 0);
const today = () => new Date().toISOString().slice(0, 10);
const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
// deno-lint-ignore no-explicit-any
const parsePlan = (p: any) => ({ ...p, price: p.price == null ? null : Number(p.price), featured: !!p.featured, active: !!p.active, features: JSON.parse(p.features || "[]") });

// Small per-isolate rate limiter
const hits = new Map<string, number[]>();
function limited(bucket: string, ip: string, max: number, windowMs: number) {
  const key = bucket + ":" + ip, now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) return true;
  arr.push(now); hits.set(key, arr); return false;
}

async function getSettings() {
  const rows = await sql`select key, value from settings`;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
async function newCode() {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = "GN-" + Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join("");
    const [x] = await sql`select 1 from requests where code = ${code}`;
    if (!x) return code;
  }
}

const REQUEST_TYPES = ["signup", "business", "support", "callback"];
const REQ_STATUSES = ["new", "in_progress", "scheduled", "done", "cancelled"];

// deno-lint-ignore no-explicit-any
type Body = Record<string, any>;
// deno-lint-ignore no-explicit-any
const ENTITIES: Record<string, { fields: string[]; required: string; order: string; clean: (b: Body) => Record<string, any>; out?: (x: any) => any }> = {
  plans: {
    fields: ["segment", "type", "name", "speed", "channels", "price", "badge", "featured", "features", "sort", "active"], required: "name",
    order: "segment, sort, id", out: parsePlan,
    clean: b => ({
      segment: b.segment === "business" ? "business" : "home",
      type: ["internet", "combo", "tv", "custom"].includes(b.type) ? b.type : "internet",
      name: str(b.name, 80), speed: num(b.speed), channels: num(b.channels), price: num(b.price),
      badge: str(b.badge, 30) || null, featured: bool(b.featured),
      features: JSON.stringify((Array.isArray(b.features) ? b.features : String(b.features || "").split("\n")).map((s: unknown) => str(s, 120)).filter(Boolean)),
      sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active),
    }),
  },
  services: {
    fields: ["segment", "icon", "title", "text", "image", "sort", "active"], required: "title", order: "segment, sort, id",
    clean: b => ({ segment: b.segment === "business" ? "business" : "home", icon: str(b.icon, 20) || "wifi", title: str(b.title, 100), text: str(b.text, 400), image: str(b.image, 300) || null, sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
  },
  promotions: {
    fields: ["title", "text", "image", "valid_until", "sort", "active"], required: "title", order: "sort, id",
    clean: b => ({ title: str(b.title, 120), text: str(b.text, 600), image: str(b.image, 300) || null, valid_until: str(b.valid_until, 10), sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
  },
  news: {
    fields: ["title", "excerpt", "body", "image", "published_at", "active"], required: "title", order: "published_at desc, id desc",
    clean: b => ({ title: str(b.title, 200), excerpt: str(b.excerpt, 400), body: str(b.body, 20000), image: str(b.image, 300) || null, published_at: str(b.published_at, 10) || today(), active: b.active === undefined ? 1 : bool(b.active) }),
  },
  faq: {
    fields: ["question", "answer", "sort", "active"], required: "question", order: "sort, id",
    clean: b => ({ question: str(b.question, 200), answer: str(b.answer, 2000), sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
  },
  coverage: {
    fields: ["area", "status", "note", "sort", "active"], required: "area", order: "sort, area",
    clean: b => ({ area: str(b.area, 120), status: ["available", "soon", "planned"].includes(b.status) ? b.status : "available", note: str(b.note, 200), sort: Number(b.sort) || 0, active: b.active === undefined ? 1 : bool(b.active) }),
  },
};

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const i = url.pathname.indexOf("/api");
  const p = (i >= 0 ? url.pathname.slice(i + 4) : url.pathname) || "/";
  const m = req.method;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  let body: Body = {};
  if (m !== "GET" && m !== "DELETE") { try { body = await req.json(); } catch { body = {}; } }

  /* ---------- public ---------- */
  if (m === "GET" && p === "/site") {
    const s = await getSettings();
    const [plans, services, promotions, news, faq, coverage] = await Promise.all([
      sql`select * from plans where active = 1 order by sort, id`,
      sql`select * from services where active = 1 order by sort, id`,
      sql`select * from promotions where active = 1 and (valid_until = '' or valid_until is null or valid_until >= ${today()}) order by sort, id`,
      sql`select id,title,excerpt,image,published_at from news where active = 1 order by published_at desc limit 6`,
      sql`select id,question,answer from faq where active = 1 order by sort, id`,
      sql`select id,area,status,note from coverage where active = 1 order by sort, area`,
    ]);
    return json({
      settings: { ...s, offices: JSON.parse(s.offices || "[]"), announcement_active: s.announcement_active === "1" },
      plans: plans.map(parsePlan), services, promotions, news, faq, coverage,
    });
  }
  let mm = p.match(/^\/news\/(\d+)$/);
  if (m === "GET" && mm) {
    const [n] = await sql`select * from news where id = ${Number(mm[1])} and active = 1`;
    return n ? json(n) : err("Новината не е намерена.", 404);
  }
  if (m === "POST" && p === "/requests") {
    if (limited("req", ip, 8, 10 * 60 * 1000)) return err("Твърде много опити. Опитайте отново след малко.", 429);
    const b = body;
    if (b.website) return json({ code: "GN-OK" });
    const type = REQUEST_TYPES.includes(b.type) ? b.type : "signup";
    const d = {
      type, segment: b.segment === "business" ? "business" : "home",
      name: str(b.name, 120), company: str(b.company, 160), phone: str(b.phone, 40), email: str(b.email, 160),
      address: str(b.address, 250), plan: str(b.plan, 120), topic: str(b.topic, 80), message: str(b.message, 2000),
    };
    const fields: Record<string, string> = {};
    if (d.name.length < 2) fields.name = "Въведете имената си.";
    if (!/^[0-9 +()/-]{6,}$/.test(d.phone)) fields.phone = "Въведете валиден телефон.";
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) fields.email = "Невалиден имейл.";
    if ((type === "signup" || type === "business") && d.address.length < 3) fields.address = "Въведете адрес.";
    if (type === "support" && d.message.length < 3) fields.message = "Опишете проблема.";
    if (Object.keys(fields).length) return err("Проверете полетата.", 400, { fields });
    const code = await newCode();
    const [r] = await sql`insert into requests ${sql({ code, ...d })} returning id`;
    await sql`insert into request_events (request_id,status,public_note,author) values (${r.id}, 'new', 'Заявката е получена.', 'Система')`;
    return json({ code }, 201);
  }
  if (m === "GET" && p === "/requests/track") {
    if (limited("track", ip, 30, 10 * 60 * 1000)) return err("Твърде много опити. Опитайте отново след малко.", 429);
    const code = str(url.searchParams.get("code"), 20).toUpperCase();
    const digits = str(url.searchParams.get("phone"), 40).replace(/\D/g, "");
    const [r] = await sql`select * from requests where code = ${code}`;
    if (!r || digits.length < 6 || r.phone.replace(/\D/g, "").slice(-6) !== digits.slice(-6)) return err("Не намерихме заявка с този номер и телефон.", 404);
    const events = await sql`select status, public_note, created_at from request_events where request_id = ${r.id} order by id`;
    return json({ code: r.code, type: r.type, plan: r.plan, status: r.status, scheduled_for: r.scheduled_for, created_at: r.created_at, events });
  }

  /* ---------- admin ---------- */
  if (!p.startsWith("/admin")) return err("Not found", 404);
  const a = p.slice(6) || "/";

  if (m === "POST" && a === "/login") {
    if (limited("login", ip, 10, 15 * 60 * 1000)) return err("Твърде много опити. Опитайте отново след малко.", 429);
    const [ad] = await sql`select id, username, name from admins where username = ${str(body.username, 60)} and pass_hash = crypt(${String(body.password || "")}, pass_hash)`;
    if (!ad) return err("Грешно потребителско име или парола.", 401);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    await sql`delete from sessions where expires_at < ${Date.now()}`;
    await sql`insert into sessions (token, admin_id, expires_at) values (${token}, ${ad.id}, ${Date.now() + 7 * 864e5})`;
    return json({ username: ad.username, name: ad.name, token });
  }
  const token = req.headers.get("x-gn-token") || "";
  if (m === "POST" && a === "/logout") {
    if (token) await sql`delete from sessions where token = ${token}`;
    return json({ ok: true });
  }
  if (!token) return err("Не сте влезли.", 401);
  const [me] = await sql`select a.id, a.username, a.name, s.expires_at from sessions s join admins a on a.id = s.admin_id where s.token = ${token}`;
  if (!me || Number(me.expires_at) < Date.now()) return err("Сесията е изтекла.", 401);
  const admin = { id: Number(me.id), username: me.username, name: me.name };

  if (m === "GET" && a === "/me") return json(admin);
  if (m === "POST" && a === "/password") {
    const [ok] = await sql`select 1 from admins where id = ${admin.id} and pass_hash = crypt(${String(body.current || "")}, pass_hash)`;
    if (!ok) return err("Текущата парола е грешна.");
    if (String(body.next || "").length < 8) return err("Новата парола трябва да е поне 8 символа.");
    await sql`update admins set pass_hash = crypt(${String(body.next)}, gen_salt('bf', 10)) where id = ${admin.id}`;
    return json({ ok: true });
  }
  if (m === "GET" && a === "/admins") return json(await sql`select id, username, name, created_at from admins order by id`);
  if (m === "POST" && a === "/admins") {
    const username = str(body.username, 60), name = str(body.name, 120), password = String(body.password || "");
    if (!/^[a-zA-Z0-9._-]{3,}$/.test(username)) return err("Потребителското име трябва да е поне 3 символа (латиница, цифри).");
    if (password.length < 8) return err("Паролата трябва да е поне 8 символа.");
    const [ex] = await sql`select 1 from admins where username = ${username}`;
    if (ex) return err("Това потребителско име е заето.");
    await sql`insert into admins (username, name, pass_hash) values (${username}, ${name}, crypt(${password}, gen_salt('bf', 10)))`;
    return json({ ok: true }, 201);
  }
  mm = a.match(/^\/admins\/(\d+)$/);
  if (m === "DELETE" && mm) {
    if (Number(mm[1]) === admin.id) return err("Не можете да изтриете собствения си профил.");
    await sql`delete from admins where id = ${Number(mm[1])}`;
    return json({ ok: true });
  }

  if (m === "GET" && a === "/stats") {
    const [byS, byT, last14, topPlans, [{ n: total }], [{ n: week }], recent] = await Promise.all([
      sql`select status, count(*)::int n from requests group by status`,
      sql`select type, count(*)::int n from requests group by type`,
      sql`select substr(created_at,1,10) d, count(*)::int n from requests where created_at >= to_char((now() at time zone 'utc') - interval '13 days', 'YYYY-MM-DD') group by d order by d`,
      sql`select plan, count(*)::int n from requests where plan <> '' group by plan order by n desc limit 5`,
      sql`select count(*)::int n from requests`,
      sql`select count(*)::int n from requests where created_at >= to_char((now() at time zone 'utc') - interval '7 days', 'YYYY-MM-DD HH24:MI:SS')`,
      sql`select id, code, type, name, phone, plan, status, created_at from requests order by id desc limit 6`,
    ]);
    return json({ total, week, byStatus: Object.fromEntries(byS.map(r => [r.status, r.n])), byType: Object.fromEntries(byT.map(r => [r.type, r.n])), last14, topPlans, recent: recent.map(r => ({ ...r, id: Number(r.id) })) });
  }

  if (m === "GET" && a === "/requests") {
    const st = url.searchParams.get("status"), ty = url.searchParams.get("type"), q = url.searchParams.get("q");
    const like = q ? "%" + str(q, 80) + "%" : null;
    const rows = await sql`select * from requests where true
      ${REQ_STATUSES.includes(st || "") ? sql`and status = ${st}` : sql``}
      ${REQUEST_TYPES.includes(ty || "") ? sql`and type = ${ty}` : sql``}
      ${like ? sql`and (code ilike ${like} or name ilike ${like} or phone ilike ${like} or address ilike ${like} or company ilike ${like} or email ilike ${like})` : sql``}
      order by id desc limit 500`;
    return json(rows.map(r => ({ ...r, id: Number(r.id) })));
  }
  if (m === "GET" && a === "/requests.csv") {
    const rows = await sql`select code,type,segment,status,name,company,phone,email,address,plan,topic,message,scheduled_for,notes,created_at from requests order by id desc`;
    const cols = ["code", "type", "segment", "status", "name", "company", "phone", "email", "address", "plan", "topic", "message", "scheduled_for", "notes", "created_at"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "﻿" + [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\r\n");
    return new Response(csv, { headers: { ...CORS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="zaqvki-${today()}.csv"` } });
  }
  mm = a.match(/^\/requests\/(\d+)$/);
  if (mm) {
    const id = Number(mm[1]);
    const [r] = await sql`select * from requests where id = ${id}`;
    if (!r && m !== "DELETE") return err("Няма такава заявка.", 404);
    if (m === "GET") {
      const events = await sql`select * from request_events where request_id = ${id} order by id`;
      return json({ ...r, id, events });
    }
    if (m === "PATCH") {
      const status = REQ_STATUSES.includes(body.status) ? body.status : r.status;
      const notes = body.notes !== undefined ? str(body.notes, 4000) : r.notes;
      const scheduled = body.scheduled_for !== undefined ? str(body.scheduled_for, 40) : r.scheduled_for;
      await sql`update requests set status = ${status}, notes = ${notes}, scheduled_for = ${scheduled}, updated_at = gn_now() where id = ${id}`;
      const publicNote = str(body.public_note, 500);
      if (status !== r.status || publicNote || scheduled !== r.scheduled_for) {
        await sql`insert into request_events (request_id,status,public_note,author) values (${id}, ${status}, ${publicNote}, ${admin.name || admin.username})`;
      }
      return json({ ok: true });
    }
    if (m === "DELETE") { await sql`delete from requests where id = ${id}`; return json({ ok: true }); }
  }

  if (a === "/settings") {
    if (m === "GET") return json(await getSettings());
    if (m === "PUT") {
      const allowed = ["company", "legal_names", "address", "phone", "mobile", "email", "hours", "support_hours", "facebook", "pay_url", "announcement", "announcement_active", "offices"];
      for (const k of allowed) {
        if (body[k] === undefined) continue;
        let v = body[k];
        if (k === "offices") { try { v = JSON.stringify(Array.isArray(v) ? v : JSON.parse(v)); } catch { return err("Невалиден списък с офиси."); } }
        await sql`insert into settings (key, value) values (${k}, ${str(v, 5000)}) on conflict (key) do update set value = excluded.value`;
      }
      return json({ ok: true });
    }
  }

  mm = a.match(/^\/(plans|services|promotions|news|faq|coverage)(?:\/(\d+))?$/);
  if (mm) {
    const name = mm[1], id = mm[2] ? Number(mm[2]) : null, e = ENTITIES[name];
    const out = e.out || ((x: Body) => x);
    if (m === "GET" && id == null) {
      const rows = await sql.unsafe(`select * from ${name} order by ${e.order}`);
      return json(rows.map(r => out({ ...r, id: Number(r.id) })));
    }
    if ((m === "POST" && id == null) || (m === "PUT" && id != null)) {
      const v = e.clean(body);
      if (!v[e.required]) return err("Попълнете задължителните полета.");
      if (m === "POST") { const [r] = await sql`insert into ${sql(name)} ${sql(v, e.fields)} returning id`; return json({ id: Number(r.id) }, 201); }
      await sql`update ${sql(name)} set ${sql(v, e.fields)} where id = ${id}`;
      return json({ ok: true });
    }
    if (m === "DELETE" && id != null) { await sql`delete from ${sql(name)} where id = ${id}`; return json({ ok: true }); }
  }
  return err("Not found", 404);
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try { return await handle(req); }
  catch (e) { console.error(e); return err("Възникна грешка на сървъра.", 500); }
});
