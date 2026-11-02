(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = s => { if (!s) return ""; const d = new Date(String(s).length <= 10 ? s : String(s).replace(" ", "T") + "Z"); return isNaN(d) ? s : d.toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric", ...(String(s).length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}) }); };

  const STATUS = { new: "Нова", in_progress: "В обработка", scheduled: "Насрочена", done: "Изпълнена", cancelled: "Отказана" };
  const TYPES = { signup: "Включване", business: "Бизнес оферта", support: "Повреда / проблем", callback: "Обратно обаждане" };
  const TITLES = { dashboard: "Табло", requests: "Заявки", plans: "Планове и цени", services: "Услуги", promotions: "Промоции", news: "Новини", faq: "Често задавани въпроси", coverage: "Покритие", settings: "Контакти и настройки", profile: "Профил и достъп" };

  /* ---------------- API ---------------- */
  async function api(path, opts = {}) {
    const r = await fetch("/api/admin" + path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    });
    if (r.status === 401 && path !== "/login") { showLogin(); throw new Error("Влезте отново."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Грешка");
    return j;
  }

  let toastT;
  function toast(msg, err = false) {
    const t = $("#toast"); t.textContent = msg; t.classList.toggle("is-err", err); t.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), 2800);
  }
  function confirmBox(text, yes = "Изтрий") {
    return new Promise(res => {
      const d = $("#confirm"); $("#confirm-text").textContent = text; $("#confirm-yes").textContent = yes;
      $("#confirm-yes").onclick = () => { d.close(); res(true); };
      $("#confirm-no").onclick = () => { d.close(); res(false); };
      d.showModal();
    });
  }

  /* ---------------- Drawer ---------------- */
  function openDrawer(title, html) {
    $("#drawer-title").textContent = title; $("#drawer-body").innerHTML = html;
    $("#drawer").classList.add("is-open"); $("#drawer").setAttribute("aria-hidden", "false");
    setTimeout(() => $("#drawer-body input, #drawer-body select, #drawer-body textarea")?.focus(), 350);
  }
  function closeDrawer() { $("#drawer").classList.remove("is-open"); $("#drawer").setAttribute("aria-hidden", "true"); }
  $$("#drawer [data-close]").forEach(el => el.addEventListener("click", closeDrawer));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });

  /* ---------------- Auth ---------------- */
  function showLogin() { $("#app").hidden = true; $("#login").hidden = false; $("#l-user").focus(); }
  async function boot() {
    try {
      const me = await api("/me");
      $("#me").textContent = me.name || me.username;
      $("#login").hidden = true; $("#app").hidden = false;
      route(); pollNew(); setInterval(pollNew, 60000);
    } catch { showLogin(); }
  }
  $("#login-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("#login-err").textContent = "";
    try {
      const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: $("#l-user").value, password: $("#l-pass").value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      $("#l-pass").value = ""; boot();
    } catch (err) { $("#login-err").textContent = err.message || "Грешка при вход."; }
  });
  $("#logout").addEventListener("click", async () => { await fetch("/api/admin/logout", { method: "POST" }); showLogin(); });
  $("#burger").addEventListener("click", () => $("#side").classList.toggle("is-open"));

  async function pollNew() {
    try {
      const s = await api("/stats");
      const n = s.byStatus.new || 0, b = $("#new-badge");
      b.hidden = !n; b.textContent = n;
      document.title = (n ? `(${n}) ` : "") + "Админ панел – Global Net";
    } catch { /* ignore */ }
  }

  /* ---------------- Router ---------------- */
  function route() {
    const v = (location.hash || "#dashboard").slice(1);
    const view = TITLES[v] ? v : "dashboard";
    $$("#side-nav a").forEach(a => a.classList.toggle("is-active", a.dataset.view === view));
    $("#view-title").textContent = TITLES[view];
    $("#side").classList.remove("is-open");
    const el = $("#view"); el.style.animation = "none"; el.offsetHeight; el.style.animation = "";
    el.innerHTML = `<div class="empty">Зареждане…</div>`;
    ({ dashboard, requests, settings, profile }[view] || (() => crud(view)))().catch(err => { el.innerHTML = `<div class="empty">${esc(err.message)}</div>`; });
  }
  window.addEventListener("hashchange", route);

  /* ---------------- Dashboard ---------------- */
  async function dashboard() {
    const s = await api("/stats");
    const open = (s.byStatus.new || 0) + (s.byStatus.in_progress || 0) + (s.byStatus.scheduled || 0);
    // 14-day series
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
    const map = Object.fromEntries(s.last14.map(r => [r.d, r.n]));
    const vals = days.map(d => map[d] || 0), max = Math.max(4, ...vals);
    const W = 560, H = 200, pad = 24, bw = (W - pad) / 14;
    const bars = vals.map((v, i) => {
      const h = (v / max) * (H - 40);
      return `<rect class="bar" x="${pad + i * bw + 4}" y="${H - 20 - h}" width="${bw - 8}" height="${Math.max(h, 1)}" rx="4"><title>${days[i]}: ${v}</title></rect>
        ${i % 2 === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${days[i].slice(8)}.${days[i].slice(5, 7)}</text>` : ""}`;
    }).join("");
    const grid = [0, .5, 1].map(f => `<line x1="${pad}" x2="${W}" y1="${H - 20 - f * (H - 40)}" y2="${H - 20 - f * (H - 40)}" stroke="#dce5f2"/><text x="0" y="${H - 16 - f * (H - 40)}">${Math.round(max * f)}</text>`).join("");
    const colors = { new: "#1d4ed8", in_progress: "#f59e0b", scheduled: "#8b5cf6", done: "#10b981", cancelled: "#e11d48" };
    const maxS = Math.max(1, ...Object.values(s.byStatus));
    const maxT = Math.max(1, ...Object.values(s.byType));

    $("#view").innerHTML = `
      <div class="grid kpis">
        <div class="panel kpi" style="--c:#1d4ed8"><div class="kpi__label">Нови заявки</div><div class="kpi__value">${s.byStatus.new || 0}</div></div>
        <div class="panel kpi" style="--c:#f59e0b"><div class="kpi__label">Отворени</div><div class="kpi__value">${open}</div></div>
        <div class="panel kpi" style="--c:#10b981"><div class="kpi__label">Последните 7 дни</div><div class="kpi__value">${s.week}</div></div>
        <div class="panel kpi" style="--c:#0a1f44"><div class="kpi__label">Общо заявки</div><div class="kpi__value">${s.total}</div></div>
      </div>
      <div class="grid two">
        <div class="panel chart"><h3>Заявки за последните 14 дни</h3><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Заявки по дни">${grid}${bars}</svg></div>
        <div class="panel"><h3>По статус</h3><div class="bars">${Object.keys(STATUS).map(k => `<div><span>${STATUS[k]}</span><i style="--w:${((s.byStatus[k] || 0) / maxS) * 100}%;--c:${colors[k]}"></i><b>${s.byStatus[k] || 0}</b></div>`).join("")}</div>
          <h3 style="margin-top:22px">По вид</h3><div class="bars">${Object.keys(TYPES).map(k => `<div><span>${TYPES[k]}</span><i style="--w:${((s.byType[k] || 0) / maxT) * 100}%"></i><b>${s.byType[k] || 0}</b></div>`).join("")}</div></div>
      </div>
      <div class="grid two">
        <div class="panel"><h3>Последни заявки</h3>${reqTable(s.recent, true)}</div>
        <div class="panel"><h3>Най-търсени планове</h3>${s.topPlans.length ? `<div class="bars">${s.topPlans.map(p => `<div><span>${esc(p.plan)}</span><i style="--w:${(p.n / s.topPlans[0].n) * 100}%"></i><b>${p.n}</b></div>`).join("")}</div>` : `<p class="empty">Още няма данни.</p>`}</div>
      </div>`;
    bindReqRows();
  }

  function reqTable(rows, compact = false) {
    if (!rows.length) return `<div class="empty">Няма заявки.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Номер</th><th>Клиент</th>${compact ? "" : "<th>Вид</th><th>Адрес</th>"}<th>План</th><th>Статус</th><th>Дата</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="clickable" data-req="${r.id}">
        <td class="code">${esc(r.code)}</td>
        <td>${esc(r.name)}${r.company ? `<span class="sub">${esc(r.company)}</span>` : ""}<span class="sub">${esc(r.phone)}</span></td>
        ${compact ? "" : `<td><span class="pill pill--type">${TYPES[r.type]}</span></td><td>${esc(r.address)}</td>`}
        <td>${esc(r.plan || r.topic || "—")}</td>
        <td><span class="pill pill--${r.status}">${STATUS[r.status]}</span></td>
        <td>${fmt(r.created_at)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function bindReqRows() { $$("[data-req]").forEach(tr => tr.addEventListener("click", () => openRequest(Number(tr.dataset.req)))); }

  /* ---------------- Requests ---------------- */
  const reqState = { status: "", type: "", q: "" };
  async function requests() {
    $("#view").innerHTML = `
      <div class="toolbar">
        <input type="search" class="fld" id="rq-q" placeholder="Търси по номер, име, телефон, адрес…" value="${esc(reqState.q)}" style="padding:10px 12px;border:1px solid var(--line);border-radius:10px">
        <div class="chips" id="rq-status">${[["", "Всички"], ...Object.entries(STATUS)].map(([k, v]) => `<button class="chipf${reqState.status === k ? " is-on" : ""}" data-k="${k}">${v}</button>`).join("")}</div>
        <select id="rq-type" class="chipf">${[["", "Всички видове"], ...Object.entries(TYPES)].map(([k, v]) => `<option value="${k}" ${reqState.type === k ? "selected" : ""}>${v}</option>`).join("")}</select>
        <span class="spacer"></span>
        <a class="b b--ghost" href="/api/admin/requests.csv">⇩ Експорт CSV</a>
      </div>
      <div id="rq-list"><div class="empty">Зареждане…</div></div>`;
    const load = async () => {
      const qs = new URLSearchParams(Object.entries(reqState).filter(([, v]) => v));
      const rows = await api("/requests?" + qs);
      $("#rq-list").innerHTML = reqTable(rows); bindReqRows();
    };
    let t; $("#rq-q").addEventListener("input", e => { reqState.q = e.target.value; clearTimeout(t); t = setTimeout(load, 250); });
    $$("#rq-status .chipf").forEach(b => b.addEventListener("click", () => { reqState.status = b.dataset.k; $$("#rq-status .chipf").forEach(x => x.classList.toggle("is-on", x === b)); load(); }));
    $("#rq-type").addEventListener("change", e => { reqState.type = e.target.value; load(); });
    await load();
  }

  async function openRequest(id) {
    const r = await api("/requests/" + id);
    const tel = r.phone.replace(/[^\d+]/g, "");
    openDrawer(`Заявка ${r.code}`, `
      <div class="quick">
        <a class="b b--primary b--sm" href="tel:${esc(tel)}">☏ Обади се</a>
        ${r.email ? `<a class="b b--ghost b--sm" href="mailto:${esc(r.email)}?subject=${encodeURIComponent("Заявка " + r.code)}">✉ Имейл</a>` : ""}
        ${r.address ? `<a class="b b--ghost b--sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/${encodeURIComponent(r.address)}">⌖ Карта</a>` : ""}
      </div>
      <dl class="info">
        <dt>Вид</dt><dd><span class="pill pill--type">${TYPES[r.type]}</span> · ${r.segment === "business" ? "Бизнес" : "Дом"}</dd>
        <dt>Клиент</dt><dd>${esc(r.name)}${r.company ? ` · ${esc(r.company)}` : ""}</dd>
        <dt>Телефон</dt><dd>${esc(r.phone)}</dd>
        ${r.email ? `<dt>Имейл</dt><dd>${esc(r.email)}</dd>` : ""}
        ${r.address ? `<dt>Адрес</dt><dd>${esc(r.address)}</dd>` : ""}
        ${r.plan ? `<dt>План</dt><dd>${esc(r.plan)}</dd>` : ""}
        ${r.topic ? `<dt>Тема</dt><dd>${esc(r.topic)}</dd>` : ""}
        ${r.message ? `<dt>Съобщение</dt><dd>${esc(r.message).replace(/\n/g, "<br>")}</dd>` : ""}
        <dt>Подадена</dt><dd>${fmt(r.created_at)}</dd>
      </dl>
      <form class="form" id="req-form">
        <div class="cols">
          <label class="fld"><span>Статус</span><select name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${r.status === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="fld"><span>Посещение (дата/час)</span><input name="scheduled_for" value="${esc(r.scheduled_for)}" placeholder="напр. 12.11, 10:00 – 12:00"></label>
        </div>
        <label class="fld"><span>Съобщение към клиента</span><input name="public_note" placeholder="Вижда се при проследяване на заявката"><small>Показва се на клиента в „Проследи заявка“.</small></label>
        <label class="fld"><span>Вътрешни бележки</span><textarea name="notes" placeholder="Само за екипа">${esc(r.notes)}</textarea></label>
        <div class="form__actions"><button type="button" class="b b--ghost" id="req-del" style="color:var(--danger)">Изтрий</button><button class="b b--primary">Запази</button></div>
      </form>
      <h3 style="margin:18px 0 6px">История</h3>
      <ul class="timeline">${r.events.slice().reverse().map(e => `<li><time>${fmt(e.created_at)} · ${esc(e.author)}</time><b>${STATUS[e.status] || e.status}</b>${e.public_note ? ` – ${esc(e.public_note)}` : ""}</li>`).join("")}</ul>`);
    $("#req-form").addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/requests/" + id, { method: "PATCH", body: Object.fromEntries(new FormData(e.target)) }); toast("Заявката е обновена."); closeDrawer(); route(); pollNew(); }
      catch (err) { toast(err.message, true); }
    });
    $("#req-del").addEventListener("click", async () => {
      if (!(await confirmBox(`Да изтрия ли заявка ${r.code}?`))) return;
      await api("/requests/" + id, { method: "DELETE" }); toast("Заявката е изтрита."); closeDrawer(); route(); pollNew();
    });
  }

  /* ---------------- Generic content CRUD ---------------- */
  const SCHEMAS = {
    plans: {
      add: "Нов план", cols: [["name", "План"], ["segment", "За"], ["type", "Вид"], ["speed", "Скорост"], ["price", "Цена"], ["active", "Видим"]],
      cell: { segment: v => v === "business" ? "Бизнес" : "Дом", type: v => ({ internet: "Интернет", combo: "Интернет + ТВ", tv: "Телевизия", custom: "По заявка" }[v]), speed: v => v ? v + " Mbps" : "—", price: v => v != null ? v + " €" : "Оферта" },
      fields: [
        ["name", "Име на плана", "text", { required: true }], ["segment", "За", "select", { options: [["home", "Дом"], ["business", "Бизнес"]] }],
        ["type", "Вид", "select", { options: [["internet", "Интернет"], ["combo", "Интернет + ТВ"], ["tv", "Телевизия"], ["custom", "По заявка"]] }],
        ["price", "Цена (€ / месец, с ДДС)", "number", { step: "0.01", hint: "Празно = „по заявка“" }], ["speed", "Скорост (Mbps)", "number"], ["channels", "Брой канали", "number"],
        ["badge", "Етикет", "text", { hint: "напр. Популярно, Ново, Топ" }], ["sort", "Подредба", "number"],
        ["features", "Предимства (по едно на ред)", "lines"], ["featured", "Открояване (тъмна карта)", "switch"], ["active", "Видим на сайта", "switch"]
      ]
    },
    services: {
      add: "Нова услуга", cols: [["title", "Услуга"], ["segment", "За"], ["icon", "Икона"], ["active", "Видима"]],
      cell: { segment: v => v === "business" ? "Бизнес" : "Дом" },
      fields: [
        ["title", "Заглавие", "text", { required: true }], ["segment", "За", "select", { options: [["home", "Дом"], ["business", "Бизнес"]] }],
        ["icon", "Икона", "select", { options: [["wifi", "Интернет"], ["tv", "Телевизия"], ["cam", "Камера"], ["net", "Мрежа"], ["lock", "Ключалка"], ["pc", "Компютър"], ["tool", "Сервиз"], ["web", "Уеб"]] }],
        ["text", "Описание", "textarea"], ["image", "Изображение (URL)", "image"], ["sort", "Подредба", "number"], ["active", "Видима на сайта", "switch"]
      ]
    },
    promotions: {
      add: "Нова промоция", cols: [["title", "Промоция"], ["valid_until", "Валидна до"], ["active", "Активна"]],
      cell: { valid_until: v => v ? (v < new Date().toISOString().slice(0, 10) ? `<span class="pill pill--cancelled">Изтекла ${fmt(v)}</span>` : fmt(v)) : "Без срок" },
      fields: [["title", "Заглавие", "text", { required: true }], ["text", "Текст", "textarea"], ["image", "Изображение (URL)", "image"], ["valid_until", "Валидна до", "date", { hint: "След тази дата се скрива автоматично." }], ["sort", "Подредба", "number"], ["active", "Активна", "switch"]]
    },
    news: {
      add: "Нова новина", cols: [["title", "Заглавие"], ["published_at", "Дата"], ["active", "Публикувана"]],
      cell: { published_at: v => fmt(v) },
      fields: [["title", "Заглавие", "text", { required: true }], ["published_at", "Дата", "date"], ["excerpt", "Кратко описание", "textarea"], ["body", "Текст на новината", "textarea", { rows: 10 }], ["image", "Изображение (URL)", "image"], ["active", "Публикувана", "switch"]]
    },
    faq: {
      add: "Нов въпрос", cols: [["question", "Въпрос"], ["sort", "Ред"], ["active", "Видим"]],
      fields: [["question", "Въпрос", "text", { required: true }], ["answer", "Отговор", "textarea", { rows: 6 }], ["sort", "Подредба", "number"], ["active", "Видим", "switch"]]
    },
    coverage: {
      add: "Ново място", cols: [["area", "Населено място / квартал"], ["status", "Статус"], ["note", "Бележка"], ["active", "Видимо"]],
      cell: { status: v => `<span class="pill pill--${v === "available" ? "done" : "in_progress"}">${{ available: "Налично", soon: "Скоро", planned: "Планирано" }[v]}</span>` },
      fields: [["area", "Населено място / квартал", "text", { required: true }], ["status", "Статус", "select", { options: [["available", "Налично"], ["soon", "Скоро"], ["planned", "Планирано"]] }], ["note", "Бележка", "text", { hint: "напр. GPON оптика" }], ["sort", "Подредба", "number"], ["active", "Видимо", "switch"]]
    }
  };

  async function crud(entity) {
    const S = SCHEMAS[entity];
    const rows = await api("/" + entity);
    const cell = (k, v) => k === "active" ? `<span class="pill pill--${v ? "done" : "off"}">${v ? "Да" : "Не"}</span>` : S.cell?.[k] ? S.cell[k](v) : esc(v ?? "—");
    $("#view").innerHTML = `
      <div class="toolbar"><input type="search" id="c-q" placeholder="Търси…" style="padding:10px 12px;border:1px solid var(--line);border-radius:10px"><span class="spacer"></span><button class="b b--primary" id="c-add">+ ${S.add}</button></div>
      <div class="table-wrap"><table><thead><tr>${S.cols.map(c => `<th>${c[1]}</th>`).join("")}<th></th></tr></thead>
      <tbody>${rows.map(r => `<tr class="clickable" data-id="${r.id}" data-text="${esc(Object.values(r).join(" ").toLowerCase())}">${S.cols.map(c => `<td>${cell(c[0], r[c[0]])}</td>`).join("")}
        <td><div class="row-actions"><button class="b b--ghost b--sm" data-edit="${r.id}">Редактирай</button></div></td></tr>`).join("") || `<tr><td colspan="${S.cols.length + 1}" class="empty">Няма записи.</td></tr>`}</tbody></table></div>`;
    $("#c-add").addEventListener("click", () => editItem(entity, null));
    $$("[data-id]").forEach(tr => tr.addEventListener("click", () => editItem(entity, rows.find(r => r.id === Number(tr.dataset.id)))));
    $("#c-q").addEventListener("input", e => { const q = e.target.value.toLowerCase(); $$("[data-text]").forEach(tr => tr.hidden = !tr.dataset.text.includes(q)); });
  }

  function fieldHtml([key, label, type, o = {}], v) {
    const val = v ?? "";
    const hint = o.hint ? `<small>${o.hint}</small>` : "";
    switch (type) {
      case "select": return `<label class="fld"><span>${label}</span><select name="${key}">${o.options.map(([k, t]) => `<option value="${k}" ${String(val) === k ? "selected" : ""}>${t}</option>`).join("")}</select>${hint}</label>`;
      case "textarea": return `<label class="fld"><span>${label}</span><textarea name="${key}" rows="${o.rows || 4}">${esc(val)}</textarea>${hint}</label>`;
      case "lines": return `<label class="fld"><span>${label}</span><textarea name="${key}" rows="4">${esc((val || []).join("\n"))}</textarea>${hint}</label>`;
      case "switch": return `<label class="switch"><input type="checkbox" name="${key}" ${v === undefined || v ? "checked" : ""}> ${label}</label>`;
      case "image": return `<label class="fld"><span>${label}</span><input name="${key}" value="${esc(val)}" placeholder="assets/img/… или https://…">${val ? `<img class="img-prev" src="/${esc(String(val).replace(/^\//, ""))}" alt="" onerror="this.src='${esc(val)}'">` : ""}<small>Качете изображението в public/assets/img или поставете линк.</small></label>`;
      default: return `<label class="fld"><span>${label}</span><input name="${key}" type="${type}" value="${esc(val)}" ${o.required ? "required" : ""} ${o.step ? `step="${o.step}"` : ""}>${hint}</label>`;
    }
  }

  function editItem(entity, item) {
    const S = SCHEMAS[entity];
    openDrawer(item ? "Редакция" : S.add, `
      <form class="form" id="item-form">
        ${S.fields.map(f => fieldHtml(f, item ? item[f[0]] : undefined)).join("")}
        <div class="form__actions">${item ? `<button type="button" class="b b--ghost" id="item-del" style="color:var(--danger)">Изтрий</button>` : "<span></span>"}<button class="b b--primary">${item ? "Запази" : "Добави"}</button></div>
      </form>`);
    $("#item-form").addEventListener("submit", async e => {
      e.preventDefault();
      const body = {};
      for (const [key, , type] of S.fields) {
        const el = e.target.elements[key];
        body[key] = type === "switch" ? el.checked : type === "lines" ? el.value.split("\n") : el.value;
      }
      try {
        await api("/" + entity + (item ? "/" + item.id : ""), { method: item ? "PUT" : "POST", body });
        toast(item ? "Промените са запазени." : "Добавено."); closeDrawer(); route();
      } catch (err) { toast(err.message, true); }
    });
    $("#item-del")?.addEventListener("click", async () => {
      if (!(await confirmBox("Сигурни ли сте, че искате да изтриете този запис?"))) return;
      await api("/" + entity + "/" + item.id, { method: "DELETE" }); toast("Изтрито."); closeDrawer(); route();
    });
  }

  /* ---------------- Settings ---------------- */
  async function settings() {
    const s = await api("/settings");
    const offices = JSON.parse(s.offices || "[]");
    const f = (k, l, hint = "") => `<label class="fld"><span>${l}</span><input name="${k}" value="${esc(s[k])}">${hint ? `<small>${hint}</small>` : ""}</label>`;
    $("#view").innerHTML = `
      <form class="form" id="set-form" style="max-width:860px">
        <div class="panel form"><h3>Лента с обявление</h3>
          <label class="switch"><input type="checkbox" name="announcement_active" ${s.announcement_active === "1" ? "checked" : ""}> Показвай лентата най-горе на сайта</label>
          ${f("announcement", "Текст на обявлението")}
        </div>
        <div class="panel form"><h3>Контакти</h3>
          <div class="cols">${f("phone", "Телефон")}${f("mobile", "Мобилен / 24/7")}</div>
          <div class="cols">${f("email", "Имейл")}${f("address", "Адрес")}</div>
          ${f("hours", "Работно време")}${f("support_hours", "Поддръжка")}
          <div class="cols">${f("facebook", "Facebook")}${f("pay_url", "Линк за онлайн плащане")}</div>
          ${f("legal_names", "Юридически лица (долу на сайта)")}
        </div>
        <div class="panel form"><h3>Офиси и каси</h3><div id="offices" class="form"></div><button type="button" class="b b--ghost" id="add-office">+ Добави офис</button></div>
        <div class="form__actions"><span></span><button class="b b--primary">Запази настройките</button></div>
      </form>`;
    const officeRow = (o = {}) => `<div class="panel form office-row" style="background:#f8fafd">
      <div class="cols"><label class="fld"><span>Име</span><input data-o="name" value="${esc(o.name)}"></label><label class="fld"><span>Телефони (със запетая)</span><input data-o="phones" value="${esc(o.phones)}"></label></div>
      <label class="fld"><span>Адрес</span><input data-o="address" value="${esc(o.address)}"></label>
      <label class="fld"><span>Работно време</span><textarea data-o="hours" rows="2">${esc(o.hours)}</textarea></label>
      <button type="button" class="b b--ghost b--sm" data-rm style="justify-self:start;color:var(--danger)">Премахни</button></div>`;
    const box = $("#offices");
    box.innerHTML = offices.map(officeRow).join("");
    $("#add-office").addEventListener("click", () => box.insertAdjacentHTML("beforeend", officeRow()));
    box.addEventListener("click", e => { if (e.target.matches("[data-rm]")) e.target.closest(".office-row").remove(); });
    $("#set-form").addEventListener("submit", async e => {
      e.preventDefault();
      const body = {};
      $$("input[name], textarea[name]", e.target).forEach(el => body[el.name] = el.type === "checkbox" ? (el.checked ? "1" : "0") : el.value);
      body.offices = $$(".office-row", box).map(r => Object.fromEntries($$("[data-o]", r).map(i => [i.dataset.o, i.value]))).filter(o => o.name || o.address);
      try { await api("/settings", { method: "PUT", body }); toast("Настройките са запазени."); } catch (err) { toast(err.message, true); }
    });
  }

  /* ---------------- Profile ---------------- */
  async function profile() {
    const admins = await api("/admins");
    $("#view").innerHTML = `
      <div class="grid two" style="margin-top:0">
        <form class="panel form" id="pw-form"><h3>Смяна на парола</h3>
          <label class="fld"><span>Текуща парола</span><input type="password" name="current" autocomplete="current-password" required></label>
          <label class="fld"><span>Нова парола</span><input type="password" name="next" autocomplete="new-password" minlength="8" required><small>Поне 8 символа.</small></label>
          <button class="b b--primary">Смени паролата</button></form>
        <div class="panel"><h3>Администратори</h3>
          <div class="table-wrap"><table><tbody>${admins.map(a => `<tr><td><b>${esc(a.username)}</b><span class="sub">${esc(a.name)}</span></td><td>${fmt(a.created_at)}</td><td><div class="row-actions"><button class="b b--ghost b--sm" data-rm-admin="${a.id}">Премахни</button></div></td></tr>`).join("")}</tbody></table></div>
          <form class="form" id="adm-form" style="margin-top:16px">
            <div class="cols"><label class="fld"><span>Потребител</span><input name="username" required></label><label class="fld"><span>Име</span><input name="name"></label></div>
            <label class="fld"><span>Парола</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
            <button class="b b--ghost">+ Добави администратор</button></form>
        </div>
      </div>`;
    $("#pw-form").addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/password", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); toast("Паролата е сменена."); e.target.reset(); } catch (err) { toast(err.message, true); }
    });
    $("#adm-form").addEventListener("submit", async e => {
      e.preventDefault();
      try { await api("/admins", { method: "POST", body: Object.fromEntries(new FormData(e.target)) }); toast("Администраторът е добавен."); route(); } catch (err) { toast(err.message, true); }
    });
    $$("[data-rm-admin]").forEach(b => b.addEventListener("click", async () => {
      if (!(await confirmBox("Да премахна ли този администратор?", "Премахни"))) return;
      try { await api("/admins/" + b.dataset.rmAdmin, { method: "DELETE" }); toast("Премахнат."); route(); } catch (err) { toast(err.message, true); }
    }));
  }

  boot();
})();
