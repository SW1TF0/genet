// Builds a static copy of the public site into docs/ for GitHub Pages.
// The data comes from a fresh seeded database (same content as /api/site),
// so the page works without the Node server. Forms run in demo mode there.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
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
    fs.cpSync(path.join(root, "public"), out, { recursive: true, filter: src => !src.includes(`${path.sep}admin`) });

    fs.writeFileSync(path.join(out, "assets", "js", "data.js"), "window.GN_FALLBACK = " + JSON.stringify(site) + ";\n");
    const indexPath = path.join(out, "index.html");
    let html = fs.readFileSync(indexPath, "utf8");
    html = html.replace('<script src="assets/js/main.js"></script>', '<script src="assets/js/data.js"></script>\n  <script src="assets/js/main.js"></script>');
    fs.writeFileSync(indexPath, html);
    fs.writeFileSync(path.join(out, ".nojekyll"), "");
    console.log("Static site written to docs/");
  } catch (e) {
    console.error(e); process.exitCode = 1;
  } finally {
    server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
});
