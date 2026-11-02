// Static hosting support (e.g. GitHub Pages).
// When window.GN_API_BASE is set, every "/api/..." request made by the site
// and the admin panel goes to that URL (the Supabase "api" Edge Function)
// instead of the same server. The admin session token is kept in
// localStorage and sent as "x-gn-token", because cookies do not cross sites.
(function () {
  const base = window.GN_API_BASE;
  if (!base) return;
  const KEY = "gn-admin-token";
  const store = {
    get() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } },
    set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* ignore */ } }
  };
  const orig = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.startsWith("/api/")) return orig(input, init);
    const headers = new Headers(init.headers || {});
    const isAdmin = url.startsWith("/api/admin");
    if (isAdmin && store.get()) headers.set("x-gn-token", store.get());
    const res = await orig(base + url.slice(4), { ...init, headers, credentials: "omit" });
    if (url === "/api/admin/login" && res.ok) {
      const j = await res.clone().json().catch(() => ({}));
      if (j.token) store.set(j.token);
    }
    if (url === "/api/admin/logout" || (isAdmin && res.status === 401)) store.set("");
    return res;
  };

  // The CSV export is a plain link; download it with the token instead.
  document.addEventListener("click", async e => {
    const a = e.target.closest && e.target.closest('a[href$="/api/admin/requests.csv"]');
    if (!a) return;
    e.preventDefault();
    const r = await window.fetch("/api/admin/requests.csv");
    if (!r.ok) return;
    const blob = await r.blob();
    const name = (r.headers.get("content-disposition") || "").match(/filename="([^"]+)"/)?.[1] || "zaqvki.csv";
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
})();
