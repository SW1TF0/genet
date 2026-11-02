# Global Net website

The new website for Global Net, an internet and TV provider in Kardzhali (globalnet-bg.com). It includes an admin panel.

- **Public site** (`/`): the text is in Bulgarian and the theme is dark blue. A "За дома / За бизнеса" switch changes the content. The site has:
  - plans with filters and a plan advisor
  - promotions and services
  - a coverage check
  - news and FAQ
  - one form for sign-ups, fault reports and callback requests
  - request tracking with a status timeline
- **Admin panel** (`/admin`):
  - a dashboard with statistics
  - requests: status, visit date, a message to the customer, internal notes, history and CSV export
  - editing for plans, services, promotions, news, FAQ, coverage, contacts, offices and the announcement bar
  - managing admin accounts

## Running it

You need Node.js 22.13 or newer. The database is the SQLite built into Node, so there's nothing else to install.

```bash
npm install
ADMIN_PASSWORD='a-strong-password' npm start      # http://localhost:3000, admin at /admin
```

The first start creates `data/globalnet.db` and an admin account. The username is `admin`, or the value of `ADMIN_USER`. If you don't set `ADMIN_PASSWORD`, a random password is printed in the console. You can change it later under Админ панел → Профил и достъп.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DB_PATH` | `data/globalnet.db` | Path to the database |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin` / random | The first admin, created only when the database is new |
| `NODE_ENV` | — | Set it to `production` so the session cookie gets `Secure` (needs HTTPS) |

Run the tests with `npm test`.

## Structure

```
server/index.js   Express: public API, admin API, static files
server/db.js      Schema, seed data (taken from the old site), password helpers
public/           The site (index.html, assets/) and the admin panel (admin/)
test/             API tests (node:test)
```

## Notes

- The images in `public/assets/img` were generated in Canva. They are low-resolution previews for now. Replace them with the full-size files and keep the same file names.
- The seeded news items are based on titles from the old site. Check their dates and text in the admin panel.
- Back up the `data/` folder regularly. It holds all requests and content.

## Статична версия (GitHub Pages)

`npm run build:pages` прави копие на публичния сайт в `docs/`, с вградени данни, без админ панел и без сървър. Формите там работят в демо режим. В GitHub: Settings → Pages → Deploy from a branch → този клон, папка `/docs`. Ако Pages е настроен на корена (`/`), `index.html` в корена пренасочва към `docs/`.
