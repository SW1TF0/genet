(() => {
  "use strict";

  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
  };

  let DATA = null;            // filled from /api/site
  let OFFLINE = false;        // true when the API is not reachable (static preview)
  let currentFilter = "all";
  let formType = "signup";

  /* ---------------- Static content ---------------- */
  const ICONS = {
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
    tv: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    cam: '<path d="M3 7h12l4 3v4l-4 3H3z"/><circle cx="9" cy="12" r="2.5"/><path d="M19 10l2-1v6l-2-1"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    net: '<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-3h14v3"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.5"/>',
    pc: '<rect x="2" y="3" width="20" height="13" rx="2"/><path d="M2 12h20M9 21h6M12 16v5"/>',
    web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>'
  };
  const icon = name => `<svg class="card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.wifi}</svg>`;

  const FEATURES = {
    home: [
      { title: "Връщане назад до 24 часа", text: "Изпусна ли нещо – върни го и го гледай, когато ти е удобно." },
      { title: "7-дневна програма", text: "Пълен електронен програмен справочник за цялата седмица." },
      { title: "Картина в картината", text: "Следи два канала едновременно." },
      { title: "Подреди каналите", text: "Сложи любимите си канали на първите позиции." },
      { title: "Родителски контрол", text: "Заключи каналите, които не са подходящи за децата." }
    ],
    business: [
      { title: "Оглед на обекта", text: "Идваме на място и изслушваме нуждите ви." },
      { title: "Проект и оферта", text: "Предлагаме конкретно решение с ясна цена." },
      { title: "Изграждане", text: "Наши екипи изграждат оптиката, мрежата и системите." },
      { title: "Поддръжка 24/7", text: "Денонощна техническа поддръжка." }
    ]
  };
  const TYPE_LABEL = { internet: "Интернет", combo: "Интернет + ТВ", tv: "Телевизия", custom: "По заявка" };
  const STATUS = {
    new: { label: "Получена", step: 0 }, in_progress: { label: "В обработка", step: 1 },
    scheduled: { label: "Насрочена", step: 2 }, done: { label: "Изпълнена", step: 3 }, cancelled: { label: "Отказана", step: -1 }
  };
  const fmtDate = s => { const d = new Date(String(s).replace(" ", "T") + (String(s).length <= 10 ? "" : "Z")); return isNaN(d) ? s : d.toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" }); };

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("is-on");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  /* ---------------- Settings binding ---------------- */
  function applySettings(s) {
    $$("[data-s]").forEach(el => { if (s[el.dataset.s]) el.textContent = s[el.dataset.s]; });
    $$("[data-s-tel]").forEach(el => { const v = s[el.dataset.sTel]; if (v) el.href = "tel:" + v.replace(/[^\d+]/g, ""); });
    $$("[data-s-mail]").forEach(el => { const v = s[el.dataset.sMail]; if (v) el.href = "mailto:" + v; });
    $$("[data-s-href]").forEach(el => { const v = s[el.dataset.sHref]; if (v) el.href = v; });

    const ann = $("#announce");
    if (s.announcement_active && s.announcement && store.get("gn-ann") !== s.announcement) {
      $("#announce-text").textContent = s.announcement; ann.hidden = false;
      $("#announce-close").onclick = () => { ann.hidden = true; store.set("gn-ann", s.announcement); };
    }

    $("#offices").innerHTML = (s.offices || []).map(o => `
      <article class="office reveal is-visible">
        <h3>${esc(o.name)}</h3>
        <p>${esc(o.address)}</p>
        ${o.hours ? `<p>${esc(o.hours).replace(/\n/g, "<br>")}</p>` : ""}
        <p>${String(o.phones || "").split(",").map(p => p.trim()).filter(Boolean).map(p => `<a href="tel:${p.replace(/[^\d+]/g, "")}">${esc(p)}</a>`).join(" · ")}</p>
      </article>`).join("");
  }

  /* ---------------- Plans ---------------- */
  function planCard(p, i) {
    const big = p.speed ? `${p.speed}<small>Mbps</small>` : p.type === "tv" ? `${p.channels || 180}+<small>канала</small>` : `24/7<small>поддръжка</small>`;
    const price = p.price != null ? `<b>${String(p.price).replace(".", ",")} €</b> <span class="muted">/ месец</span>` : `<b>Оферта</b> <span class="muted">по заявка</span>`;
    return `<article class="plan${p.featured ? " plan--featured" : ""}" style="--i:${i}">
      ${p.badge ? `<span class="plan__badge">${esc(p.badge)}</span>` : ""}
      <p class="plan__type">${TYPE_LABEL[p.type] || ""}</p>
      <h3 class="plan__name">${esc(p.name)}</h3>
      <div class="plan__speed">${big}</div>
      ${p.speed ? `<div class="plan__meter" aria-hidden="true"><span style="--w:${Math.min(100, Math.round(p.speed / 6))}%"></span></div>` : ""}
      <p class="plan__price">${price}</p>
      <ul class="plan__list">${(p.features || []).map(f => `<li>${esc(f)}</li>`).join("")}</ul>
      <a href="#signup" class="btn btn--outline" data-pick-plan="${esc(p.name)}">${p.price != null ? "Заяви включване" : "Поискай оферта"}</a>
    </article>`;
  }

  function render() {
    if (!DATA) return;
    const seg = root.dataset.segment;
    const plans = DATA.plans.filter(p => p.segment === seg && (seg !== "home" || currentFilter === "all" || p.type === currentFilter));
    $("#plans-grid").innerHTML = plans.map(planCard).join("") || `<p class="muted">Няма планове в тази категория.</p>`;

    const homePrices = DATA.plans.filter(p => p.segment === "home" && p.type !== "tv" && p.price != null).map(p => p.price);
    if (homePrices.length) $("#min-price").textContent = Math.min(...homePrices);

    $("#services-grid").innerHTML = DATA.services.filter(s => s.segment === seg).map((s, i) =>
      `<article class="card${s.image ? " card--image" : ""}" style="--i:${i}">
        ${s.image ? `<div class="card__img" style="background-image:url('${esc(s.image)}')" aria-hidden="true"></div>` : ""}
        ${icon(s.icon)}<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>
      </article>`).join("");

    $("#features-list").innerHTML = FEATURES[seg].map((f, i) => `<li style="--i:${i}"><h3>${f.title}</h3><p>${f.text}</p></li>`).join("");

    const options = DATA.plans.filter(p => p.segment === seg).map(p => p.name)
      .concat(seg === "business" ? ["Видеонаблюдение", "LAN / Wi-Fi мрежа", "Контрол на достъпа", "Друго"] : ["Сервиз", "Друго"]);
    const sel = $("#plan-select"), prev = sel.value;
    sel.innerHTML = `<option value="">Изберете…</option>` + options.map(o => `<option>${esc(o)}</option>`).join("");
    if (options.includes(prev)) sel.value = prev;
    updateFormFields();
  }

  function renderStatic() {
    // Promotions
    const promos = DATA.promotions || [];
    $("#promotions").hidden = !promos.length;
    $("#promos").innerHTML = promos.map(p => `
      <article class="promo reveal">
        ${p.image ? `<div class="promo__img" style="background-image:url('${esc(p.image)}')" aria-hidden="true"></div>` : ""}
        <div class="promo__body">
          <p class="eyebrow">Промоция${p.valid_until ? " · до " + esc(fmtDate(p.valid_until)) : ""}</p>
          <h3>${esc(p.title)}</h3>
          <p>${esc(p.text)}</p>
          <a href="#signup" class="btn btn--light btn--sm">Възползвай се</a>
        </div>
      </article>`).join("");

    // News
    $("#news-grid").innerHTML = (DATA.news || []).map((n, i) => `
      <article class="news-card reveal" style="--i:${i}">
        <button class="news-card__btn" data-news="${n.id}">
          <div class="news-card__img" ${n.image ? `style="background-image:url('${esc(n.image)}')"` : ""} aria-hidden="true">${n.image ? "" : "<span>GN</span>"}</div>
          <time>${esc(fmtDate(n.published_at))}</time>
          <h3>${esc(n.title)}</h3>
          <p>${esc(n.excerpt)}</p>
          <span class="news-card__more">Прочети →</span>
        </button>
      </article>`).join("") || `<p class="muted">Няма новини.</p>`;

    // FAQ
    $("#faq-list").innerHTML = (DATA.faq || []).map(f => `
      <details class="faq__item reveal"><summary>${esc(f.question)}<span aria-hidden="true"></span></summary><div class="faq__a"><p>${esc(f.answer)}</p></div></details>`).join("");

    // Coverage
    const cov = DATA.coverage || [];
    $("#coverage-list").innerHTML = cov.map(c => `<option value="${esc(c.area)}">`).join("");
    const label = { available: "Налично", soon: "Очаквайте скоро", planned: "Планирано" };
    $("#coverage-chips").innerHTML = cov.map(c => `<li class="chip chip--${c.status}"><span></span>${esc(c.area)} · ${label[c.status]}</li>`).join("");
  }

  /* ---------------- Home / Business switch ---------------- */
  const segBtns = $$("[data-set-segment]");
  const pill = $(".segment__pill");
  function movePill() {
    const active = segBtns.find(b => b.classList.contains("is-active"));
    if (!active || !pill) return;
    pill.style.width = active.offsetWidth + "px";
    pill.style.transform = `translateX(${active.offsetLeft - 4}px)`;
  }
  function setSegment(seg, animate = true) {
    if (seg !== "home" && seg !== "business") return;
    segBtns.forEach(b => { const on = b.dataset.setSegment === seg; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on); });
    movePill();
    store.set("gn-segment", seg);
    const apply = () => {
      root.dataset.segment = seg;
      currentFilter = "all";
      $$(".filter").forEach(f => f.classList.toggle("is-active", f.dataset.filter === "all"));
      render();
      if (animate) $$(".reveal").forEach(el => el.classList.add("is-visible"));
    };
    if (!animate || root.dataset.segment === seg) return apply();
    document.body.classList.add("is-switching");
    setTimeout(() => { apply(); requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("is-switching"))); }, 280);
  }
  segBtns.forEach(b => b.addEventListener("click", () => setSegment(b.dataset.setSegment)));
  window.addEventListener("resize", movePill);

  $$(".filter").forEach(btn => btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    $$(".filter").forEach(f => f.classList.toggle("is-active", f === btn));
    render();
  }));

  document.addEventListener("click", e => {
    const a = e.target.closest("[data-pick-plan]");
    if (a) { setFormType("signup"); $("#plan-select").value = a.dataset.pickPlan; }
    const n = e.target.closest("[data-news]");
    if (n) openNews(Number(n.dataset.news));
  });

  /* ---------------- Plan advisor ---------------- */
  const QUESTIONS = [
    { q: "Колко души ползват интернет вкъщи?", a: [["1 – 2", 0], ["3 – 4", 1], ["5 и повече", 2]] },
    { q: "Какво правите най-често онлайн?", a: [["Сърфиране, социални мрежи", 0], ["Филми и сериали в HD", 1], ["Игри, 4K, работа от вкъщи", 2]] },
    { q: "Искате ли и телевизия?", a: [["Не, само интернет", "none"], ["Да", "tv"], ["Да, със спортни канали", "sport"]] }
  ];
  function openAdvisor() {
    const dlg = $("#advisor"), body = $("#advisor-body");
    const answers = [];
    const step = i => {
      if (i >= QUESTIONS.length) return result();
      const q = QUESTIONS[i];
      body.innerHTML = `<p class="advisor__step">Стъпка ${i + 1} от ${QUESTIONS.length}</p>
        <div class="advisor__bar"><span style="width:${(i / QUESTIONS.length) * 100}%"></span></div>
        <h3>${q.q}</h3>
        <div class="advisor__opts">${q.a.map((o, j) => `<button class="advisor__opt" data-j="${j}" style="--i:${j}">${o[0]}</button>`).join("")}</div>`;
      $$(".advisor__opt", body).forEach(b => b.onclick = () => { answers.push(q.a[b.dataset.j][1]); step(i + 1); });
    };
    const result = () => {
      const score = answers[0] + answers[1], tv = answers[2];
      let name;
      if (tv === "sport") name = "Интерактив Спорт";
      else if (tv === "tv") name = score >= 2 ? "Ултра Интерактив" : "Интерактив";
      else name = score >= 3 ? "Ултра" : score >= 1 ? "Спринт" : "Универсален";
      const plan = DATA.plans.find(p => p.name === name) || DATA.plans.find(p => p.segment === "home");
      body.innerHTML = `<p class="advisor__step">Нашата препоръка</p>
        <div class="advisor__bar"><span style="width:100%"></span></div>
        <div class="advisor__result">${planCard(plan, 0)}</div>`;
      $("[data-pick-plan]", body).addEventListener("click", () => dlg.close());
    };
    step(0);
    dlg.showModal();
  }
  $("#open-advisor").addEventListener("click", openAdvisor);

  /* ---------------- News modal ---------------- */
  async function openNews(id) {
    const dlg = $("#news-modal"), art = $("#news-article");
    let n = (DATA.news || []).find(x => x.id === id);
    if (!OFFLINE) { try { const r = await fetch("/api/news/" + id); if (r.ok) n = await r.json(); } catch { /* use summary */ } }
    if (!n) return;
    art.innerHTML = `${n.image ? `<div class="article__img" style="background-image:url('${esc(n.image)}')"></div>` : ""}
      <time class="muted">${esc(fmtDate(n.published_at))}</time><h2>${esc(n.title)}</h2>
      ${String(n.body || n.excerpt || "").split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}`;
    dlg.showModal();
  }
  $$(".modal").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

  /* ---------------- Coverage ---------------- */
  $("#coverage-form").addEventListener("submit", e => {
    e.preventDefault();
    const q = $("#coverage-input").value.trim().toLowerCase();
    const out = $("#coverage-result");
    if (!q) { out.innerHTML = ""; return; }
    const norm = s => s.toLowerCase().replace(/^(гр\.|с\.|кв\.)\s*/, "");
    const hit = (DATA.coverage || []).find(c => norm(c.area).includes(norm(q)) || norm(q).includes(norm(c.area).split(" ")[0]));
    const msgs = {
      available: ["ok", "Да! Global Net е наличен в", "Заяви включване"],
      soon: ["soon", "Очаквайте ни скоро в", "Запиши се за известие"],
      planned: ["soon", "Планираме изграждане в", "Запиши се за известие"]
    };
    const m = hit ? msgs[hit.status] : ["no", "Все още нямаме данни за", "Остави телефон"];
    out.innerHTML = `<div class="cov cov--${m[0]}"><span class="cov__dot"></span><p>${m[1]} <b>${esc(hit ? hit.area : $("#coverage-input").value)}</b>${hit && hit.note ? ` · ${esc(hit.note)}` : ""}</p>
      <a href="#signup" class="btn btn--light btn--sm" data-cov-cta>${m[2]}</a></div>`;
    $("[data-cov-cta]", out).addEventListener("click", () => {
      setFormType(m[0] === "ok" ? "signup" : "callback");
      $("#f-address").value = hit ? hit.area : $("#coverage-input").value;
      if (m[0] !== "ok") $("#f-message").value = "Моля, уведомете ме, когато Global Net стане достъпен в " + (hit ? hit.area : $("#coverage-input").value) + ".";
    });
  });

  /* ---------------- Request form ---------------- */
  function setFormType(t) {
    formType = t;
    $$("[data-form-type]").forEach(b => { const on = b.dataset.formType === t; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", on); });
    updateFormFields();
  }
  function updateFormFields() {
    const seg = root.dataset.segment;
    const t = formType === "signup" && seg === "business" ? "business" : formType;
    $$("#request-form [data-for]").forEach(f => {
      const types = f.dataset.for.split(" ");
      const show = types.includes(t) || (t === "business" && types.includes("signup"));
      f.hidden = !show;
    });
    $("#f-address").required = t === "signup" || t === "business" || t === "support";
    $("#msg-label").textContent = t === "support" ? "Опишете проблема *" : t === "callback" ? "Кога е удобно да ви се обадим?" : "Коментар";
    $("#f-message").required = t === "support";
    $("#form-submit").textContent = t === "support" ? "Подай сигнал" : t === "callback" ? "Обадете ми се" : t === "business" ? "Изпрати запитване" : "Заяви включване";
  }
  $$("[data-form-type]").forEach(b => b.addEventListener("click", () => setFormType(b.dataset.formType)));

  $("#request-form").addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.target, note = $("#form-note");
    let ok = true;
    $$("input, select, textarea", form).forEach(f => {
      if (f.classList.contains("hp")) return;
      const field = f.closest(".field");
      const bad = !(field && field.hidden) && (!f.checkValidity() || (f.name === "phone" && !/^[0-9 +()\/-]{6,}$/.test(f.value.trim())));
      if (field) field.classList.toggle("is-invalid", bad);
      if (bad) ok = false;
    });
    if (!$("#f-consent").checked) { ok = false; $(".check").classList.add("is-invalid"); } else $(".check").classList.remove("is-invalid");
    if (!ok) { note.textContent = "Моля, попълнете полетата, отбелязани със *, и потвърдете съгласието."; return; }

    const d = Object.fromEntries(new FormData(form));
    $$(".field", form).forEach(f => { if (f.hidden) { const el = $("input, select, textarea", f); if (el) delete d[el.name]; } });
    const seg = root.dataset.segment;
    d.type = formType === "signup" && seg === "business" ? "business" : formType;
    d.segment = seg;
    const btn = $("#form-submit"); btn.disabled = true; btn.classList.add("is-loading"); note.textContent = "";
    try {
      let code;
      if (OFFLINE) { await new Promise(r => setTimeout(r, 600)); code = "GN-DEMO01"; }
      else {
        const r = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
        const j = await r.json();
        if (!r.ok) {
          Object.keys(j.fields || {}).forEach(k => { const f = form.elements[k]; if (f) f.closest(".field")?.classList.add("is-invalid"); });
          throw new Error(j.error || "Грешка");
        }
        code = j.code;
      }
      store.set("gn-last-code", code);
      $("#success-code").textContent = code;
      $("#t-code").value = code; $("#t-phone").value = d.phone;
      form.hidden = true; $(".tabs").hidden = true; $("#form-success").hidden = false;
      form.reset();
    } catch (err) {
      note.textContent = err.message === "Failed to fetch" ? "Няма връзка със сървъра. Обадете ни се на телефона вляво." : err.message;
    } finally { btn.disabled = false; btn.classList.remove("is-loading"); }
  });
  $("#success-new").addEventListener("click", () => { $("#form-success").hidden = true; $("#request-form").hidden = false; $(".tabs").hidden = false; });

  /* ---------------- Tracking ---------------- */
  $("#track-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code = $("#t-code").value.trim().toUpperCase(), phone = $("#t-phone").value.trim();
    const out = $("#track-result");
    if (!code || !phone) { out.innerHTML = `<p class="track__err">Въведете номер на заявка и телефон.</p>`; return; }
    out.innerHTML = `<div class="skeleton"></div>`;
    let r;
    if (OFFLINE) {
      r = { code, status: "scheduled", plan: "Ултра", scheduled_for: "утре, 10:00 – 12:00", created_at: new Date().toISOString(), events: [
        { status: "new", public_note: "Заявката е получена.", created_at: new Date().toISOString() },
        { status: "in_progress", public_note: "Проверихме адреса – има покритие.", created_at: new Date().toISOString() },
        { status: "scheduled", public_note: "Техник ще дойде утре между 10:00 и 12:00 ч.", created_at: new Date().toISOString() }] };
    } else {
      try {
        const res = await fetch(`/api/requests/track?code=${encodeURIComponent(code)}&phone=${encodeURIComponent(phone)}`);
        r = await res.json();
        if (!res.ok) { out.innerHTML = `<p class="track__err">${esc(r.error)}</p>`; return; }
      } catch { out.innerHTML = `<p class="track__err">Няма връзка със сървъра.</p>`; return; }
    }
    const st = STATUS[r.status] || STATUS.new;
    const steps = ["Получена", "В обработка", "Насрочена", "Изпълнена"];
    out.innerHTML = `
      <div class="tracker">
        <div class="tracker__head"><span class="tracker__code">${esc(r.code)}</span><span class="status status--${r.status}">${st.label}</span></div>
        ${r.status === "cancelled" ? "" : `<ol class="tracker__steps">${steps.map((s, i) => `<li class="${i <= st.step ? "is-done" : ""}" style="--i:${i}"><span></span>${s}</li>`).join("")}</ol>`}
        ${r.scheduled_for ? `<p class="tracker__when">Посещение: <b>${esc(r.scheduled_for)}</b></p>` : ""}
        <ul class="tracker__log">${r.events.slice().reverse().map(ev => `<li><time>${esc(fmtDate(ev.created_at))}</time><b>${(STATUS[ev.status] || {}).label || ""}</b>${ev.public_note ? ` – ${esc(ev.public_note)}` : ""}</li>`).join("")}</ul>
      </div>`;
  });

  /* ---------------- Header, nav, progress, reveal ---------------- */
  const header = $("#header"), progress = $("#progress");
  const onScroll = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 10);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${h > 0 ? window.scrollY / h : 0})`;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const burger = $("#burger"), nav = $("#nav");
  burger.addEventListener("click", () => {
    const open = burger.getAttribute("aria-expanded") !== "true";
    burger.setAttribute("aria-expanded", open); nav.classList.toggle("is-open", open);
  });
  nav.addEventListener("click", e => { if (e.target.closest("a")) { burger.setAttribute("aria-expanded", "false"); nav.classList.remove("is-open"); } });

  // Active nav link
  const sections = $$("main section[id]");
  const navLinks = $$('.nav a[href^="#"]');
  const spy = () => {
    const y = window.scrollY + 140;
    let cur = "";
    sections.forEach(s => { if (s.offsetTop <= y) cur = s.id; });
    navLinks.forEach(a => a.classList.toggle("is-current", a.getAttribute("href") === "#" + cur));
  };
  window.addEventListener("scroll", spy, { passive: true });

  let io;
  function observeReveals() {
    if (!("IntersectionObserver" in window)) return $$(".reveal").forEach(el => el.classList.add("is-visible"));
    io = io || new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); countUp(en.target); }
    }), { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal:not(.is-visible)").forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(el); });
  }

  // Count-up numbers in the hero
  function countUp(scope) {
    $$("[data-count]", scope).forEach(el => {
      if (el.dataset.done) return; el.dataset.done = 1;
      const end = Number(el.dataset.count), t0 = performance.now(), dur = 1400;
      const tick = t => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }

  // Rotating word in the hero
  const words = ["разчиташ", "стриймваш", "играеш", "работиш"];
  let wi = 0;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) setInterval(() => {
    const el = $("#hero-type"); if (!el) return;
    el.classList.add("is-out");
    setTimeout(() => { wi = (wi + 1) % words.length; el.textContent = words[wi]; el.classList.remove("is-out"); }, 350);
  }, 2800);

  /* ---------------- Init ---------------- */
  async function init() {
    $("#year").textContent = new Date().getFullYear();
    const cl = $("#clients"); if (cl) cl.innerHTML += cl.innerHTML.replace(/<li>/g, '<li aria-hidden="true">');
    try {
      const r = await fetch("/api/site", { headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error();
      DATA = await r.json();
    } catch {
      OFFLINE = true;
      DATA = window.GN_FALLBACK || { settings: {}, plans: [], services: [], promotions: [], news: [], faq: [], coverage: [] };
    }
    applySettings(DATA.settings || {});
    renderStatic();

    let seg = store.get("gn-segment") || "home";
    if (location.hash === "#business") seg = "business";
    setSegment(seg, false);
    setFormType("signup");
    observeReveals();
    requestAnimationFrame(movePill);
    if (document.fonts) document.fonts.ready.then(movePill);
    const last = store.get("gn-last-code"); if (last && !$("#t-code").value) $("#t-code").value = last;
  }
  init();
})();
