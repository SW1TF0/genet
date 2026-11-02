(() => {
  "use strict";

  const root = document.documentElement;
  const STORAGE_KEY = "gn-segment";

  /* ---------------- Data (prices from globalnet-bg.com, € with VAT) ---------------- */
  const PLANS = {
    home: [
      { type: "internet", name: "Универсален", speed: 60, price: 13, features: ["GPON оптичен интернет", "Плати 6, ползвай 7 или безплатен рутер", "Такса включване 15 €"] },
      { type: "internet", name: "Спринт", speed: 100, price: 15, features: ["GPON оптичен интернет", "Плати 3, ползвай 4 или безплатен рутер", "Такса включване 15 €"] },
      { type: "internet", name: "Ултра", speed: 300, price: 17, badge: "Популярно", featured: true, features: ["Гигабитов 5 GHz рутер", "Плати 6 – получаваш гигабитов рутер", "Такса включване 15 €"] },
      { type: "combo", name: "Интерактив", speed: 100, price: 18, badge: "Най-поръчван", features: ["Над 180 канала, 60+ в HD", "Приемник включен", "Такса включване 15 €"] },
      { type: "combo", name: "Ултра Интерактив", speed: 300, price: 20, badge: "Ново", features: ["Над 190 канала, 65+ в HD", "Гигабитов рутер", "Такса включване 15 €"] },
      { type: "combo", name: "Интерактив Спорт", speed: 300, price: 25, badge: "Топ", featured: true, features: ["DIEMA SPORT HD и MAX SPORT HD", "Над 180 канала, 60+ в HD", "Гигабитов рутер"] },
      { type: "tv", name: "IPTV", speed: null, price: 10, features: ["Над 180 канала, 60+ в HD", "Плати 6, ползвай 7", "Втори приемник +2 € / месец"] }
    ],
    business: [
      { type: "internet", name: "Ултра оптичен", speed: 600, price: 22, badge: "Бизнес", featured: true, features: ["FTTH оптична свързаност", "Без такса включване", "Поддръжка 24/7"] },
      { type: "custom", name: "Индивидуално решение", speed: null, price: null, features: ["Множество обекти и точки", "Мрежа, Wi-Fi и видеонаблюдение", "Оферта след безплатен оглед"] }
    ]
  };

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

  const SERVICES = {
    home: [
      { icon: "wifi", title: "Оптичен интернет", text: "GPON до 300 Mbps по собствена подземна мрежа. Стабилно, бързо, без прекъсвания." },
      { icon: "tv", title: "IPTV телевизия", text: "Над 190 канала, връщане до 24 часа назад, 7-дневна програма и родителски контрол." },
      { icon: "pc", title: "Компютри и периферия", text: "Настолни компютри, лаптопи и аксесоари в магазина ни на бул. Булаир 27." },
      { icon: "tool", title: "Сервиз", text: "Ремонт, инсталиране на Windows, почистване от вируси и настройка на интернет." }
    ],
    business: [
      { icon: "wifi", title: "FTTH интернет до 600 Mbps", text: "Директна оптична свързаност за офиси, магазини и производство." },
      { icon: "cam", title: "Видеонаблюдение", text: "Камери от ново поколение с отдалечено наблюдение от всяка точка на света." },
      { icon: "net", title: "LAN и Wi-Fi мрежи", text: "Проектиране и изграждане на кабелни и безжични мрежи за вашия обект." },
      { icon: "lock", title: "Контрол на достъпа и СОТ", text: "Проектиране и монтаж на системи за контрол на достъпа и алармени системи." },
      { icon: "tool", title: "Сервиз и поддръжка", text: "Продажба и поддръжка на компютърна и офис техника, AV и LCD инсталации." },
      { icon: "web", title: "Уеб дизайн", text: "Изработка на уебсайтове за вашия бизнес." }
    ]
  };

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
      { title: "Поддръжка 24/7", text: "Денонощна техническа поддръжка на 0898 819 299." }
    ]
  };

  const TYPE_LABEL = { internet: "Интернет", combo: "Интернет + ТВ", tv: "Телевизия", custom: "По заявка" };

  /* ---------------- Rendering ---------------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let currentFilter = "all";

  function planCard(p, i) {
    const speed = p.speed ? `<div class="plan__speed">${p.speed}<small>Mbps</small></div>` : (p.type === "tv" ? `<div class="plan__speed">190+<small>канала</small></div>` : `<div class="plan__speed">24/7<small>поддръжка</small></div>`);
    const price = p.price != null ? `<b>${p.price} €</b> <span class="muted">/ месец</span>` : `<b>Оферта</b> <span class="muted">по заявка</span>`;
    const cta = p.price != null ? "Заяви включване" : "Поискай оферта";
    return `<article class="plan${p.featured ? " plan--featured" : ""}" style="--i:${i}">
      ${p.badge ? `<span class="plan__badge">${p.badge}</span>` : ""}
      <p class="plan__type">${TYPE_LABEL[p.type]}</p>
      <h3 class="plan__name">${p.name}</h3>
      ${speed}
      <p class="plan__price">${price}</p>
      <ul class="plan__list">${p.features.map(f => `<li>${f}</li>`).join("")}</ul>
      <a href="#signup" class="btn btn--outline" data-pick-plan="${p.name}">${cta}</a>
    </article>`;
  }

  function render() {
    const seg = root.dataset.segment;
    const plans = PLANS[seg].filter(p => seg !== "home" || currentFilter === "all" || p.type === currentFilter);
    $("#plans-grid").innerHTML = plans.map(planCard).join("");

    $("#services-grid").innerHTML = SERVICES[seg].map((s, i) =>
      `<article class="card" style="--i:${i}">
        <svg class="card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[s.icon]}</svg>
        <h3>${s.title}</h3><p>${s.text}</p>
      </article>`).join("");

    $("#features-list").innerHTML = FEATURES[seg].map((f, i) =>
      `<li style="--i:${i}"><h3>${f.title}</h3><p>${f.text}</p></li>`).join("");

    const options = PLANS[seg].map(p => p.name).concat(seg === "business" ? ["Видеонаблюдение", "LAN / Wi-Fi мрежа", "Друго"] : ["Друго"]);
    $("#plan-select").innerHTML = `<option value="">Изберете…</option>` + options.map(o => `<option>${o}</option>`).join("");
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
    if (!PLANS[seg]) return;
    segBtns.forEach(b => {
      const on = b.dataset.setSegment === seg;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on);
    });
    movePill();
    try { localStorage.setItem(STORAGE_KEY, seg); } catch (e) { /* ignore */ }

    const apply = () => {
      root.dataset.segment = seg;
      currentFilter = "all";
      $$(".filter").forEach(f => f.classList.toggle("is-active", f.dataset.filter === "all"));
      render();
      if (animate) $$(".reveal").forEach(el => el.classList.add("is-visible"));
    };

    if (!animate || root.dataset.segment === seg) { apply(); return; }
    document.body.classList.add("is-switching");
    setTimeout(() => {
      apply();
      requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("is-switching")));
    }, 280);
  }

  segBtns.forEach(b => b.addEventListener("click", () => setSegment(b.dataset.setSegment)));
  window.addEventListener("resize", movePill);

  /* ---------------- Plan filters ---------------- */
  $$(".filter").forEach(btn => btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    $$(".filter").forEach(f => f.classList.toggle("is-active", f === btn));
    render();
  }));

  /* Pre-select the plan when a plan's CTA is clicked */
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-pick-plan]");
    if (a) $("#plan-select").value = a.dataset.pickPlan;
  });

  /* ---------------- Header & mobile nav ---------------- */
  const header = $("#header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const burger = $("#burger"), nav = $("#nav");
  burger.addEventListener("click", () => {
    const open = burger.getAttribute("aria-expanded") !== "true";
    burger.setAttribute("aria-expanded", open);
    nav.classList.toggle("is-open", open);
  });
  nav.addEventListener("click", e => {
    if (e.target.closest("a")) { burger.setAttribute("aria-expanded", "false"); nav.classList.remove("is-open"); }
  });

  /* ---------------- Scroll reveal ---------------- */
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    $$(".reveal").forEach((el, i) => { el.style.transitionDelay = `${(i % 4) * 80}ms`; io.observe(el); });
  } else {
    $$(".reveal").forEach(el => el.classList.add("is-visible"));
  }

  /* ---------------- Sign-up form ---------------- */
  // No backend yet: validates, then opens a pre-filled e-mail to the office.
  const form = $("#signup-form"), note = $("#form-note");
  form.addEventListener("submit", e => {
    e.preventDefault();
    let ok = true;
    $$("input[required], select[required]", form).forEach(f => {
      const visible = f.offsetParent !== null;
      const bad = visible && !f.checkValidity();
      f.closest(".field").classList.toggle("is-invalid", bad);
      if (bad) ok = false;
    });
    if (!ok) { note.textContent = "Моля, попълнете полетата, отбелязани със *."; return; }

    const d = Object.fromEntries(new FormData(form));
    const seg = root.dataset.segment === "business" ? "Бизнес" : "Дом";
    const body = [`Тип: ${seg}`, `Имена: ${d.name}`, d.company ? `Фирма: ${d.company}` : "", `Телефон: ${d.phone}`, `Адрес: ${d.address}`, `План: ${d.plan}`].filter(Boolean).join("\n");
    window.location.href = `mailto:office.globalnet@gmail.com?subject=${encodeURIComponent("Заявка за включване – " + d.plan)}&body=${encodeURIComponent(body)}`;
    note.textContent = "Благодарим! Ще се свържем с вас до един работен ден.";
    form.reset();
  });

  /* ---------------- Init ---------------- */
  $("#year").textContent = new Date().getFullYear();
  let saved = "home";
  try { saved = localStorage.getItem(STORAGE_KEY) || (location.hash === "#business" ? "business" : "home"); } catch (e) { /* ignore */ }
  if (location.hash === "#business") saved = "business";
  setSegment(saved, false);
  requestAnimationFrame(movePill);
  if (document.fonts) document.fonts.ready.then(movePill);
})();
