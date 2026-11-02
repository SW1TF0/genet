// Hero visuals: animated fibre-light canvas, live speed gauge, sparkline and card spotlight.
(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fibre light streams ---------- */
  const cv = document.getElementById("hero-canvas");
  if (cv && !reduce) {
    const ctx = cv.getContext("2d");
    let w, h, dpr, lines = [], pulses = [], raf, visible = true;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(10, Math.round(w / 70));
      lines = Array.from({ length: n }, (_, i) => ({
        y0: h * (0.15 + 0.8 * (i / n)), amp: 30 + Math.random() * 70, freq: 0.002 + Math.random() * 0.002,
        phase: Math.random() * Math.PI * 2, speed: 0.0003 + Math.random() * 0.0006, hue: Math.random() < .25 ? 205 : 218
      }));
    };
    const yAt = (l, x, t) => l.y0 + Math.sin(x * l.freq + l.phase + t * l.speed) * l.amp - x * 0.18;
    const frame = t => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const l of lines) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) { const y = yAt(l, x, t); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        const g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, "rgba(47,124,246,0)"); g.addColorStop(.55, `hsla(${l.hue},90%,65%,.14)`); g.addColorStop(1, `hsla(${l.hue},90%,70%,.3)`);
        ctx.strokeStyle = g; ctx.stroke();
      }
      if (Math.random() < 0.08 && pulses.length < 26) pulses.push({ l: lines[(Math.random() * lines.length) | 0], x: -20, v: 2 + Math.random() * 4 });
      pulses = pulses.filter(p => p.x < w + 40);
      for (const p of pulses) {
        p.x += p.v;
        const y = yAt(p.l, p.x, t);
        const tail = 90;
        const g = ctx.createLinearGradient(p.x - tail, 0, p.x, 0);
        g.addColorStop(0, "rgba(140,184,255,0)"); g.addColorStop(1, "rgba(200,225,255,.95)");
        ctx.beginPath(); ctx.strokeStyle = g; ctx.lineWidth = 2;
        for (let x = p.x - tail; x <= p.x; x += 6) { const yy = yAt(p.l, x, t); x === p.x - tail ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
        ctx.stroke();
        ctx.beginPath(); ctx.fillStyle = "rgba(220,235,255,.95)"; ctx.shadowColor = "#8cb8ff"; ctx.shadowBlur = 12;
        ctx.arc(p.x, y, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      }
      if (visible) raf = requestAnimationFrame(frame);
    };
    resize(); window.addEventListener("resize", resize);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } }).observe(cv);
  }

  /* ---------- Speed gauge + sparkline ---------- */
  const num = document.getElementById("gauge-num"), arc = document.getElementById("gauge-arc"), spark = document.getElementById("spark-path"), ping = document.getElementById("ping");
  if (num && arc) {
    const max = () => (document.documentElement.dataset.segment === "business" ? 600 : 300);
    const pts = Array.from({ length: 30 }, () => 0.85 + Math.random() * 0.12);
    let cur = 0;
    const set = target => {
      const from = cur, t0 = performance.now(), dur = reduce ? 1 : 1400;
      const step = t => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        cur = from + (target - from) * e; num.textContent = Math.round(cur);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      arc.style.strokeDashoffset = String(100 - Math.min(100, (target / max()) * 96));
    };
    const tick = () => {
      const m = max(), v = m * (0.9 + Math.random() * 0.08);
      set(v);
      pts.push(v / m); pts.shift();
      if (spark) spark.setAttribute("d", pts.map((p, i) => `${i ? "L" : "M"}${(i / (pts.length - 1)) * 240} ${40 - (p - 0.75) * 140}`).join(" "));
      if (ping) ping.textContent = (3 + Math.round(Math.random() * 3)) + " ms";
    };
    setTimeout(tick, 900);
    if (!reduce) setInterval(tick, 3200);
    document.querySelectorAll("[data-set-segment]").forEach(b => b.addEventListener("click", () => setTimeout(tick, 400)));
  }

  /* ---------- Spotlight that follows the mouse on cards ---------- */
  document.addEventListener("pointermove", e => {
    const el = e.target.closest(".plan, .card");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });
})();
