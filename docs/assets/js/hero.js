// Hero visuals: fibre lines with a twinkling star field, live speed gauge, sparkline and card spotlight.
(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Fibre lines + twinkling star field ---------- */
  const cv = document.getElementById("hero-canvas");
  if (cv && !reduce) {
    const ctx = cv.getContext("2d");
    let w, h, dpr, lines = [], stars = [], sparkles = [], raf, visible = true;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const newSparkle = () => ({ x: rnd(0.05, 0.95) * w, y: rnd(0.05, 0.95) * h, r: rnd(6, 13), born: performance.now() + rnd(0, 2500), life: rnd(2600, 4200), rot: rnd(0, Math.PI / 4), pink: Math.random() < .3 });
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(10, Math.round(w / 70));
      lines = Array.from({ length: n }, (_, i) => ({
        y0: h * (0.15 + 0.8 * (i / n)), amp: 30 + Math.random() * 70, freq: 0.002 + Math.random() * 0.002,
        phase: Math.random() * Math.PI * 2, speed: 0.0003 + Math.random() * 0.0006, hue: Math.random() < .25 ? 205 : 218
      }));
      // Small round stars that softly twinkle in place.
      stars = Array.from({ length: Math.round((w * h) / 6500) }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() < .85 ? rnd(.5, 1.1) : rnd(1.2, 1.8),
        base: rnd(.35, .85), tw: rnd(.0008, .0025), ph: rnd(0, Math.PI * 2), warm: Math.random() < .12
      }));
      // A few larger four-point sparkles that fade in and out.
      sparkles = Array.from({ length: Math.max(4, Math.round(w / 140)) }, newSparkle);
    };
    const yAt = (l, x, t) => l.y0 + Math.sin(x * l.freq + l.phase + t * l.speed) * l.amp - x * 0.18;
    const drawSparkle = (x, y, r, rot, a, pink) => {
      const c = pink ? "255,190,225" : "215,230,255";
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
      glow.addColorStop(0, `rgba(${c},${a * .35})`); glow.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(${c},${a})`; ctx.beginPath();
      const k = r * 0.16;
      ctx.moveTo(0, -r); ctx.quadraticCurveTo(k, -k, r, 0); ctx.quadraticCurveTo(k, k, 0, r);
      ctx.quadraticCurveTo(-k, k, -r, 0); ctx.quadraticCurveTo(-k, -k, 0, -r); ctx.fill();
      ctx.restore();
    };
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
      for (const s of stars) {
        const a = s.base * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
        ctx.fillStyle = s.warm ? `rgba(255,200,230,${a})` : `rgba(220,232,255,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < sparkles.length; i++) {
        const s = sparkles[i], p = (t - s.born) / s.life;
        if (p < 0) continue;
        if (p >= 1) { sparkles[i] = newSparkle(); continue; }
        const a = Math.sin(p * Math.PI);
        drawSparkle(s.x, s.y, s.r * (0.6 + 0.4 * a), s.rot + p * 0.4, a * .9, s.pink);
      }
      if (visible) raf = requestAnimationFrame(frame);
    };
    resize(); window.addEventListener("resize", resize);
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } }).observe(cv);
  }

  /* ---------- Speed gauge + sparkline ---------- */
  const num = document.getElementById("gauge-num"), arc = document.getElementById("gauge-arc"), spark = document.getElementById("spark-path"), ping = document.getElementById("ping");
  if (num && arc) {
    const max = () => (document.documentElement.dataset.segment === "business" ? 600 : 1000);
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
