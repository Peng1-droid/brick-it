# Brick It

This fork adds general NFT artwork builds to [Punk to Bricks](https://github.com/hs7j4yk4sz-boop/punk-to-bricks). Upload, drop, or paste a PNG, JPEG, WebP, or GIF image from any collection. The default **Upright voxel bust** preserves the front silhouette and adds 4–16 voxels of depth, with optional rounded back edges. Alpha creates the cutout; optional flat-background removal flood-fills colours matching the top-left corner from the image edges. It does not recognize subjects or reconstruct unseen geometry. Use a transparent cutout for complex backgrounds. Animated files use one decoded frame.

Choose 16, 24, or 32 voxels on the longest image/mesh edge. Inspect the rotatable voxel preview, adjust depth, then choose **Create LEGO build**. Unsupported columns gain visible clear supports down to a two-layer base. Mini uses one stud per voxel and alternating 2/3-plate heights; XL uses two studs and five plates per voxel. The final parts feed the structural checker, 3D animation, PDF, ZIP kit and shopping lists. Models remain computer-checked, not physically build-tested. Clear supports may substantially change the appearance and piece count.

**Other modes:** Flat artwork relief makes a horizontal brightness-based panel, with transparent pixels composited on white. Classic CryptoPunk bust retains the original algorithm and is selected for Punk-number lookup. Download artwork first; general marketplace URLs, contract lookup and video NFTs are not supported.

**3D models:** Import self-contained GLB, OBJ geometry or STL, up to 25 MB and 100,000 triangles. Orient the model before voxelizing. Embedded GLB textures are sampled per triangle; OBJ material sidecars, external resources, compressed textures/geometry, animation, skinning and instancing are not supported. Closed meshes fill with solid interior voxels; open surfaces may remain shells. A 30,000-piece limit prevents oversized builds.

**Optional OpenRouter experiment:** Copy `.env.example` to `.env.local`, set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (a vision model supporting JSON-schema structured outputs), and restart `npm run dev`. Never prefix secrets with `VITE_`. The local server keeps the API key out of browser bundles. Only clicking **Send image & generate with OpenRouter** sends the selected artwork to OpenRouter and may incur charges. The model returns validated primitive shapes, not executable code or a detailed reconstructed mesh. The generated interpretation can then be voxelized like an imported model. No live generation was tested without a configured key; the adapter is covered with mocked-provider tests. The AI endpoint is local-development-only; static deployments retain the fully local bust, relief and mesh-upload features. A public AI deployment would require an authenticated backend with usage controls.

OpenRouter references: [image input](https://openrouter.ai/docs/guides/overview/multimodal/image-understanding) and [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

Development: Node 22.12+ (or Node 24), `npm ci`, `npm run dev`. Validate with `npm test` and `npm run build`. Browser smoke scripts: `node scripts/smoke-artwork.mjs` and `node scripts/smoke-sculpture.mjs` (local server on port 5173 and Microsoft Edge required).

## Original project documentation

Turn your CryptoPunk into a brick bust you can really build.

<p align="center">
  <a href="https://hs7j4yk4sz-boop.github.io/punk-to-bricks/"><img src="public/og.png" alt="Punk to Bricks: turn your Punk into a brick bust you can really build" width="720"></a>
</p>

<h3 align="center">👉 <a href="https://hs7j4yk4sz-boop.github.io/punk-to-bricks/">Open Punk to Bricks</a> 👈</h3>
<p align="center">Free · runs in your browser · your image never leaves your device</p>

## How to use

1. **Type your Punk number** (0 to 9999), or **drop its image**: the original PNG, a marketplace download or a phone screenshot. No Punk at hand? Click one of the examples.
2. **① Your bust**: watch it build in 3D, pick **Mini** (about 400 pieces) or **XL** (about 1,250 pieces), turn it with your finger or mouse. The key figures are big: pieces, steps, lots to buy, size; "More info" shows every check. Download a video of the build (square or 9:16).
3. **② Instructions**: flip through the step-by-step booklet right on the page, then download it as a PDF or as a full kit (PDF + parts list).
4. **③ Buy the bricks**: see your shopping list (every part, its quantity, red if LEGO sells it, blue if only BrickLink has it), then **Buy at LEGO** (a Pick a Brick upload file) or **Buy on BrickLink** (a wanted list to paste). "Only parts LEGO sells" rebuilds your bust with parts LEGO sells and runs every check again.

<p align="center">
  <img src="docs/bust.png" alt="① Your bust: the 3D bust and its key figures" width="640">
  <img src="docs/instructions.png" alt="② Instructions: the booklet on the page" width="640">
  <img src="docs/buy.png" alt="③ Buy the bricks: shopping list, Buy at LEGO, Buy on BrickLink" width="640">
</p>

## What's inside

- **100% static.** Everything runs in the visitor's browser (a Web Worker does the heavy lifting). No server, no AI, no API key, no tracking.
- **Two sizes.** Mini: 1 pixel = 1 stud, rows alternate one brick and two plates so pixels stay square. XL: 1 pixel = 2×2 studs, 5 plates tall, hollow with 2-stud walls.
- **Honest checks.** Every model is checked on its final piece list: studs connected, 0 floating pieces, 0 collisions, centre of mass over the base, weak joints. A failed check is shown, never hidden. Tested on all 10,000 CryptoPunks, in both sizes.
- **Order the bricks.** A Pick a Brick upload file in LEGO's own CSV format (400 references and 999 units per line at most, split into several files when needed) and a BrickLink wanted list (Want → Upload → "Upload BrickLink XML format"). Element IDs come from [Rebrickable](https://rebrickable.com)'s free exports, built into `src/data/elements.json` by `scripts/build-elements.ts` (no live calls). Nothing is sold here: you order and pay on LEGO or BrickLink.
- **Exports.** Full kit ZIP (PDF booklet, one page per layer with the step's parts in colour and outlined in yellow, plus parts inventory; CSV parts list), and square or 9:16 videos of the build ending on the flipping booklet, with brick clicks made in Web Audio.

Inspired by [@victormustar](https://x.com/victormustar)'s Microduck and by [my own CryptoPunk bust](https://github.com/hs7j4yk4sz-boop/cryptopunk-brick-bust).

## How it works

1. **Find the Punk** (`src/core/detect.ts`). Look for a flat background region whose bounding box is a square, read the 24×24 grid from the centre of each cell, and tell background from Punk with a tolerance sized to the image noise (exact on PNG, tolerant on JPEG and screenshots).
2. **Pick brick colours** (`src/core/palette.ts`). Nearest of 38 common BrickLink colours (CIEDE2000); two touching colours that differ are kept apart, the smaller one moves.
3. **Understand the pixels** (`src/core/analyze.ts`). Solid head vs. thin parts (brims, pipes, cigarettes, ears: a 4×4 morphological opening), floating details (smoke) held by clear supports, and the colour each pixel shows on the sides and back.
4. **Build** (`src/core/build.ts`, `src/core/tile.ts`). Stud cells per layer, rounded top and back corners, hollow inside, base sized to the centre of mass. Each layer is filled greedily with real bricks, plates and tiles, alternating direction; hidden cells may take any colour, which lets pieces bridge from a visible detail into the body. Anything left floating is repaired (re-tiling around it, bridging from above or below, or a support stack).
5. **Check** (`src/core/check.ts`) the final piece list.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (detection, solidity, exports, all example Punks)
npm run build      # static site in dist/
```

Typing a Punk number uses `public/punks.png`, the official image of all 10,000 CryptoPunks from [larvalabs/cryptopunks](https://github.com/larvalabs/cryptopunks): it is downloaded once, only when a visitor types a number, and the Punk is cut out in the browser. Tests on all 10,000 Punks run when that same file is copied to `real/punks.png` (git-ignored). The drawings in test/fixtures are only used by the tests.

## Notes

Unofficial fan project · Not affiliated with, sponsored or endorsed by the LEGO Group, BrickLink or the CryptoPunks project. LEGO® is a trademark of the LEGO Group. Parts data: Rebrickable. No purchases, payments or personal data go through this site. Models are computer-checked, not physically build-tested.

Made by John Karp · NFT Morning.

## License

[MIT](LICENSE). See also the [disclaimer](DISCLAIMER.md). The license covers the code only, not CryptoPunks images or any trademark.
