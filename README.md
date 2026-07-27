# kelvingao.com

A dependency-free personal portfolio with a blue/black default theme, a
switchable white/blue theme, and four accessible placeholder project tabs.

## Files

- `index.html` — page content and the four project panels
- `styles.css` — layout, themes, responsive styles, and preview illustrations
- `script.js` — theme persistence, project tabs, navigation, and reveal effects
- `favicon.svg` — KG favicon
- `CNAME` — GitHub Pages custom domain (`kelvingao.com`)

## Customize it

1. Replace the placeholder copy and projects in `index.html`.
2. Update `hello@kelvingao.com` if that is not the inbox you want to use.
3. Replace each “coming soon” span with a real `<a>` when a case study is ready.
4. Add or remove tab/panel pairs using the existing `aria-controls` and
   `aria-labelledby` pattern.

The color palettes live at the top of `styles.css` under `:root` and
`html[data-theme="light"]`.

## Publish

The site is ready to host as static files. For GitHub Pages, publish the root of
the `main` branch and then finish the DNS setup with your domain provider. The
included `CNAME` file tells GitHub Pages to use `kelvingao.com`.
