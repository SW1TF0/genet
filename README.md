# Global Net website

New website for Global Net, an internet and TV provider in Kardzhali (globalnet-bg.com).

It's a static site: plain HTML, CSS and JavaScript with no build step. Open `index.html` in a browser, or serve the folder with any static host.

- `index.html`: the page layout and the copy, in Bulgarian.
- `assets/css/style.css`: the black-and-white theme and the transitions.
- `assets/js/main.js`: the plans and services data, the "За дома / За бизнеса" switch, the plan filters, scroll animations and the sign-up form.

To update a price or plan, edit the `PLANS` object in `assets/js/main.js`.

The sign-up form has no server yet. When submitted, it opens a pre-filled email to office.globalnet@gmail.com.
