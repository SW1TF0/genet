// Builds the GitHub Pages copy of the site into docs/.
// The pages talk to the Supabase "api" Edge Function (see supabase/), set by
// GN_API_BASE below. data.js holds a snapshot of the seed content that is only
// used if the API cannot be reached.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const API_BASE = process.env.GN_API_BASE || "https://qjutfulgqnarqglqongd.supabase.co/functions/v1/api";
const out = path.join(root, "docs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gn-pages-"));
process.env.DB_PATH = path.join(tmp, "pages.db");
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "build-only-" + Date.now();

const app = require("../server/index.js");

const server = app.listen(0, async () => {
  try {
    const { port } = server.address();
    const site = await (await fetch(`http://127.0.0.1:${port}/api/site`)).json();

    fs.rmSync(out, { recursive: true, force: true });
    fs.cpSync(path.join(root, "public"), out, { recursive: true });
    fs.writeFileSync(path.join(out, "assets", "js", "config.js"), `window.GN_API_BASE = ${JSON.stringify(API_BASE)};\n`);

    fs.writeFileSync(path.join(out, "assets", "js", "data.js"), "window.GN_FALLBACK = " + JSON.stringify(site) + ";\n");
    const indexPath = path.join(out, "index.html");
    let html = fs.readFileSync(indexPath, "utf8");
    html = html.replace('<script src="assets/js/main.js"></script>',
      '<script src="assets/js/config.js"></script>\n  <script src="assets/js/backend.js"></script>\n  <script src="assets/js/data.js"></script>\n  <script src="assets/js/main.js"></script>');
    fs.writeFileSync(indexPath, html);
    const adminPath = path.join(out, "admin", "index.html");
    let ah = fs.readFileSync(adminPath, "utf8");
    ah = ah.replace('<script src="admin.js"></script>',
      '<script src="../assets/js/config.js"></script>\n  <script src="../assets/js/backend.js"></script>\n  <script src="admin.js"></script>');
    fs.writeFileSync(adminPath, ah);
    fs.writeFileSync(path.join(out, ".nojekyll"), "");
    console.log("Static site written to docs/");
  } catch (e) {
    console.error(e); process.exitCode = 1;
  } finally {
    server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
});
