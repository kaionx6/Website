<<<<<<< ours
<<<<<<< ours
<<<<<<< ours
# kelvingao.com

A build-free, multi-page personal portfolio made as a flat blueprint drawing
system, with a white/blue default theme, switchable blue/black theme, four
accessible project tabs, a looping hover-scroll CAD sequence, and five
playable mini games. Desktop pages use a fixed navigation sidebar, fit one
browser viewport, and cycle in order after a deliberate vertical wheel gesture.

## Files

- `index.html` — landing page
- `projects.html` — four project panels and the spider robot viewer
- `games.html` — tabbed Flappy Bird, Snake, Space Invaders, Tetris, and Grid
  Command library
- `simulations.html` — the Labs tab: a framed embed of the EEEN20140
  simulation library
- `labs/engineering-mastery.html` — the self-contained simulation library
  (54 simulations across five learning outcomes); replace this file to update it
- `about.html` — profile copy, compact portrait placeholder, and capabilities
- `contact.html` — contact page
- `styles.css` — layout, themes, responsive styles, and preview illustrations
- `script.js` — theme persistence, project tabs, and page-tab cycling progress
- `game-audio.js` — shared 8-bit game effects and persistent sound toggle
- `game-library.js` — accessible switching between the five game panels
- `flappy-game.js` — dependency-free responsive Flappy Bird canvas demo
- `snake-game.js` — dependency-free responsive Snake canvas demo
- `space-invaders-game.js` — dependency-free responsive Space Invaders demo
- `tetris-game.js` — responsive Tetris with touch gestures and a hold queue
- `grid-command-game.js` — 12-level sector-defence campaign with multi-wave
  assaults, full battlefield resets between levels, staged one-, three-, and
  five-lane fields, 12 tower unlocks, specialist enemies, and touch controls
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
`html[data-theme="light"]`; each page starts in light mode unless a saved theme
preference overrides it. Nunito is used for body and interface text, while
Bitcount Prop Single is reserved for headings; both load from Google Fonts with
system sans-serif fallbacks. The transparent blue logo is derived from the
untouched source with its original geometry preserved exactly.

The hero coordinate strip points to the historic University of Glasgow Old
College site on High Street (`55.8591 N, 004.2404 W`), Kelvin's university
workplace when he proposed the absolute temperature scale in 1848. It is a
historic-site reference rather than a claim about the exact room he worked in.

The live panel loads the pre-tessellated GLB, avoiding the much slower raw STEP
conversion in each visitor's browser. The model remains split into 109 rendered
parts, so the explosion is still assembly-level rather than a single-object
effect. Hovering over the Project 1 window and scrolling advances from the
assembled model to the exploded view and then through four photo placeholders.
The final photo fades back into the reassembled model so the sequence loops
continuously; scrolling upward reverses it. To regenerate the GLB after replacing
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
=======
=======
>>>>>>> theirs
=======
>>>>>>> theirs
# C to C++: a small VS Code tutorial

This project is a short, hands-on bridge from C to modern C++. Each lesson shows
the same idea twice: first in C, then in C++. Read the matching files side by
side, run both programs, and make the suggested changes yourself.

## What you need

- [Visual Studio Code](https://code.visualstudio.com/)
- A C/C++ compiler: GCC, Clang, or Microsoft Visual C++
- The VS Code **C/C++** extension (VS Code will recommend it when this folder opens)
- `make` for the included one-command build on Linux or macOS

On Windows, the easiest beginner setup is VS Code with
[WSL](https://code.visualstudio.com/docs/remote/wsl), then install the compiler
inside Ubuntu:

```bash
sudo apt update
sudo apt install build-essential gdb
```

## Start in VS Code

1. Open this repository as a folder in VS Code.
2. Install the recommended **C/C++** extension.
3. Open **Terminal > New Terminal**.
4. Run `make` to compile every example.
5. Run a program, for example `./build/01_hello_cpp`.

You can also press **Ctrl+Shift+B** (macOS: **Cmd+Shift+B**) and choose:

- **Build all lessons** to compile everything.
- **Run C++ hello lesson** for the first C++ example.
- **Run C++ collections lesson** for the final example.

To debug, open a `.cpp` file, add a breakpoint by clicking beside a line number,
select **Run and Debug**, and choose **Debug C++ hello lesson**. The supplied
debug profile uses GDB and works in Linux and WSL.

## Lesson 1: output and functions

Compare [`lessons/01_hello.c`](lessons/01_hello.c) with
[`lessons/01_hello.cpp`](lessons/01_hello.cpp).

| C | C++ |
|---|---|
| `#include <stdio.h>` | `#include <iostream>` |
| `printf("Hello, %s!\n", name)` | `std::cout << "Hello, " << name << "!\n"` |
| `const char *name` | `const std::string& name` |

C++ is largely compatible with C syntax, but prefer its type-safe standard
library. `std::string` owns and manages text; the `&` passes it without making a
copy, and `const` promises not to change it.

**Try it:** change the name, add an `age` parameter, and print it from both
versions.

## Lesson 2: input and safer failure handling

Compare [`lessons/02_input.c`](lessons/02_input.c) with
[`lessons/02_input.cpp`](lessons/02_input.cpp).

The C version gives `scanf` an address such as `&left` and checks how many
values it converted. The C++ version streams values into variables with
`std::cin >> left` and checks the stream itself. Both checks matter: never use
input without confirming that parsing succeeded.

C++ also lets `add` use a reference output parameter (`double& result`).
Unlike a pointer, a reference cannot normally be null and uses the variable's
ordinary name inside the function.

**Try it:** add division. Reject division by zero and return a helpful error.

## Lesson 3: replace manual arrays with containers

Compare [`lessons/03_collection.c`](lessons/03_collection.c) with
[`lessons/03_collection.cpp`](lessons/03_collection.cpp).

The C program carries an array and its length separately. The C++ program uses
`std::vector<int>`, which owns its storage and knows its size. A range-based
`for` loop visits each value without indexing. `auto` asks the compiler to infer
the iterator's long type; it does **not** make C++ dynamically typed.

**Try it:** use `values.push_back(13)`, rebuild, and confirm that the total and
average update without changing a separate array length.

## A practical C-to-C++ conversion checklist

Convert working programs gradually rather than rewriting everything at once:

1. Rename one `.c` file to `.cpp` and compile it with warnings enabled.
2. Keep behavior unchanged while fixing compiler errors.
3. Replace C headers with C++ forms (`<stdio.h>` becomes `<cstdio>`), then prefer
   the appropriate C++ library (`<iostream>`, `<string>`, `<vector>`).
4. Replace owning `char*` buffers with `std::string`.
5. Replace manually allocated arrays with `std::vector` or fixed arrays with
   `std::array`.
6. Prefer references for required objects and use `nullptr`, not `NULL`, for
   pointers that may be absent.
7. Use constructors and destructors to acquire and release resources (RAII)
   instead of scattered `malloc`/`free` calls.
8. Rebuild and test after every small change.

Do not rush into classes just because the language supports them. First learn
the standard types, value semantics, references, `const`, and automatic resource
management. Those provide the biggest safety improvement when moving from C.

## Commands

```bash
make            # compile all lessons into build/
make test       # compile, run, and check every example
make clean      # remove generated programs
```

The build enables strong warnings and uses C17 and C++20. Treat warnings as
problems to understand, even when the compiler can still create a program.
<<<<<<< ours
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
=======
>>>>>>> theirs
