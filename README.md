# kelvingao.com

A build-free, multi-page personal portfolio made as a flat blueprint drawing
system, with a blue/black default theme, switchable white/blue theme, four
accessible project tabs, a hover-scroll exploded CAD sequence, and three
playable mini games. Desktop pages fit one browser viewport and cycle in order
after a deliberate vertical wheel gesture.

## Files

- `index.html` — landing page
- `projects.html` — four project panels and the spider robot viewer
- `games.html` — tabbed Flappy Bird, Snake, and Space Invaders library
- `about.html` — profile copy, compact portrait placeholder, and capabilities
- `contact.html` — contact page
- `styles.css` — layout, themes, responsive styles, and preview illustrations
- `script.js` — theme persistence, project tabs, and metered page cycling
- `game-library.js` — accessible switching between the three game panels
- `flappy-game.js` — dependency-free responsive Flappy Bird canvas demo
- `snake-game.js` — dependency-free responsive Snake canvas demo
- `space-invaders-game.js` — dependency-free responsive Space Invaders demo
- `model-viewer.js` — GLB rendering and the model-to-photo interaction sequence
- `assets/kelvin-presentation.png` — archived supplied photo (not currently rendered)
- `assets/kg-logo-blue.png` — transparent site-blue KG logo and browser favicon
- `assets/kg-logo-source.png` — untouched supplied source logo
- `assets/models/spider-robot.step` — the supplied AP242 spider robot assembly
- `assets/models/spider-robot.glb` — optimized 109-part browser model
- `tools/convert-step-to-glb.cjs` — repeatable STEP-to-GLB conversion script
- `vendor/` — pinned browser runtimes and their license files
- `CNAME` — GitHub Pages custom domain (`kelvingao.com`)

## Customize it

1. Replace the placeholder projects in `projects.html` and profile copy in
   `about.html`.
2. Update `kelvin.gao@ucdconnect.ie` if that is not the inbox you want to use.
3. Replace each “coming soon” span with a real `<a>` when a case study is ready.
4. Add or remove tab/panel pairs using the existing `aria-controls` and
   `aria-labelledby` pattern.
5. Replace the four `.sequence-photo__art` placeholders in Project 1 with your
   real images when they are ready; keep each `data-sequence-photo` wrapper so
   the crossfades continue to work.
6. Replace `.about-photo__placeholder` in `about.html` when you want to add a
   portrait again.

The color palettes live at the top of `styles.css` under `:root` and
`html[data-theme="light"]`. The transparent blue logo is derived from the
untouched source with its original geometry preserved exactly.

The live panel loads the pre-tessellated GLB, avoiding the much slower raw STEP
conversion in each visitor's browser. The model remains split into 109 rendered
parts, so the explosion is still assembly-level rather than a single-object
effect. Hovering over the Project 1 window and scrolling advances from the
assembled model to the exploded view and then through four photo placeholders;
scrolling upward reverses the sequence. To regenerate the GLB after replacing
the STEP file, install Node.js and run `node tools/convert-step-to-glb.cjs` from
the repository root.

The converter uses `occt-import-js` 0.0.23 (LGPL-2.1), and the viewer uses
Three.js 0.185.1 (MIT). Their upstream notices are kept beside the vendored
files. The first visit downloads the 5.6 MB model; the browser can cache it for
later visits.

Because browsers block model requests from `file://` pages, preview the site
through GitHub Pages or any simple local web server rather than double-clicking
`index.html`.

## Publish

The site is ready to host as static files. For GitHub Pages, publish the root of
the `main` branch and then finish the DNS setup with your domain provider. The
included `CNAME` file tells GitHub Pages to use `kelvingao.com`.
