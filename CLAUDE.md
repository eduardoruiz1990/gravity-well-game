# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

**Gravity Well** — a one-mechanic browser game: hold to place a gravity well, the comet is
pulled toward it. Vanilla JS, HTML5 Canvas 2D, Tone.js for audio, built with Vite. No
framework, no TypeScript.

**Web only.** The single ship target is a self-contained HTML bundle for CrazyGames.
There is no native/mobile wrapper — see "Scope" below.

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # production build -> dist/
npm run preview   # serve the production build
npm run package   # build + zip dist/ contents -> gravity-well-crazygames.zip
```

There is no test runner. Verification is manual, plus the browser probes described below.

## THE ONE RULE: `index.html` is the only source of truth

This repo previously carried **three divergent copies** of the game and a TODO written
against the wrong one. Do not let that happen again.

- **`index.html`** (repo root) is the game. All markup, all CSS, and the entire ~2200-line
  engine live in one inline `<script type="module">`. This is the Vite entry point.
- **`src/`** contains only `PortalSDK.js`. There is no `src/main.js` — a stale 1165-line
  copy of the engine lived there, imported by nothing, and was deleted. Don't recreate it.

Before "fixing" a bug reported against this game, confirm which file it is actually in.
A bug in a file nothing imports is not a bug in the game.

## Scope: web only

A Capacitor/Android wrapper (`gravity-well-app/`) with a Firebase Firestore leaderboard
was developed through iteration 22.3 and **deliberately removed**. It contained a separate,
much smaller build of the game (no shop, upgrades, cosmetics, or tutorial) that had
diverged from `index.html`, and maintaining two games was the root cause of the
three-way source split above.

Everything still exists in git history — restore with:

```bash
git checkout f6398a0 -- gravity-well-app
```

Its two genuinely useful pieces were ported into `index.html` before removal: the filtered
sub-bass drone plus the master/music/sfx bus split (`audioManager`), and the depth cue in
`Star` (size, alpha and speed all keyed to one `depth` value). The Firebase leaderboard was
dropped on purpose — the CrazyGames build must stay self-contained, and the SDK has no
leaderboard API. Don't reintroduce a backend without deciding that fresh.

## Architecture notes

### Everything is inside one `DOMContentLoaded` closure

`index.html`'s module script wires up all DOM buttons directly (`getElementById` + manual
class toggling) and owns a single `requestAnimationFrame` loop (`gameLoop`) driven by a
plain string `gameState` (`menu`, `playing`, `tutorial`, `paused`, `game-over`,
`observatory`). Nothing is reachable from outside the closure, which is why the browser
probes drive the game through DOM clicks and synthetic key events rather than internals.

`setGameState()` is the single choke point for every transition — it hides all UI via the
`data-ui-screen` sweep, then shows what the new state needs. Portal gameplay events hang
off it for exactly that reason.

### Rendering is virtual-resolution + letterboxed

All drawing happens in a fixed `VIRTUAL_WIDTH` x `VIRTUAL_HEIGHT` (1280x720) space.
`resizeCanvas()` computes a uniform `scale`, and `drawGame()` applies it once via
`ctx.scale(scale, scale)`. Input is converted back with `/ scale`.

Careful: `StarFragment.draw()` declares a **local** `const pulse` that used to be named
`scale` and shadowed the module-level one. It is an idle animation, not the canvas scale.

### Core feel: turn authority, not damping

The well applies a **constant-magnitude** steering force, while `PlayerComet.update()`
renormalises velocity to exactly `baseSpeed` every frame. Two consequences:

1. **`INERTIAL_DAMPING` is inert during real gameplay.** It only shapes the idle wave and
   the `baseSpeed === 0` tutorial case. Tuning it will not change how the game plays.
2. **Turn rate ≈ influence / baseSpeed.** Since `baseSpeed` grows every zone, a flat
   influence meant control authority halved by zone 6 while obstacle spacing tightened.

`getGravityInfluence()` therefore scales the force with speed. `TURN_AUTHORITY_EXPONENT`
is the knob: `1.0` holds turn radius constant at every speed, `0.75` (current) lets it
widen gently so some difficulty ramp survives. **This value needs playtesting to zone 6+,
not reasoning.**

`KEYBOARD_WELL_DISTANCE` must stay inside `GRAVITY_WELL_RADIUS` — the pull only applies
when `dist < gravityWell.radius`, so a keyboard well parked outside it is silently inert.
Both are derived from `VIRTUAL_HEIGHT` for that reason; don't hardcode either.

### Save data: merge `upgrades` key-by-key

`loadPlayerData()` spreads the loaded save over defaults. A top-level spread replaces the
whole `upgrades` object, so a save written before a new upgrade existed leaves that key
`undefined` — and `buyUpgrade`'s `playerData.upgrades[id]++` turns it into `NaN`.
`mergedUpgrades` exists to prevent this. **When adding an upgrade, add it to
`upgradeCosts`, to both `defaultPlayerData` literals, and give it an `#upgrade-<id>` row
in the shop markup.** `updateObservatoryUI()` and the buy handler are both generic and
need no further wiring.

### Obstacle cosmetics own their own rendering

Each entry in `cosmeticItems` may carry a `draw(ctx, x, y, w, h, skin, obs)` and a
`collisionShape`. `Obstacle.draw()` dispatches to it; `checkCollisions()` honours the
shape. For `collisionShape: 'circle'`, `getCircleStack()` fills the obstacle's box with a
vertical stack of overlapping circles, and **both the renderer and collision read that one
function** so the silhouette and hitbox cannot drift apart. Circular skins used to be
squashed to `height === width`, which made them strictly easier — cosmetics must stay
cosmetic.

## CrazyGames / portal integration

`src/PortalSDK.js` is a portal-agnostic adapter (ported from the sibling `Fractured`
project). **The game talks to this module, never to `window.CrazyGames` directly.** Its
hard contract: with no portal — localhost, a blocked CDN, or environment `'disabled'` —
every method is a silent no-op and the game behaves exactly as before.

Wiring points in `index.html`:

| Concern | Where |
|---|---|
| Boot gate | `portalSDK.init().then(init)` — must resolve before `loadPlayerData()`, since the save backend may be cloud |
| Save | `savePlayerData` / `loadPlayerData` use `portalSDK.setItem/getItem` |
| Gameplay events | `setGameState()` — `playing`/`tutorial` start, everything else stops |
| Load window | `loadingStart()` at top of `init()`, `loadingStop()` at the end |
| Mute | `platformMuted` + `mutedByAd` feed one `applyMute()`; never unmute unconditionally |
| Ad | `showGameOverAd()` on the `game-over` transition |

**Build requirements:**
- `vite.config.js` sets `base: './'`. CrazyGames serves from a subdirectory; absolute
  asset paths 404 there. Never change this to `/`.
- The build must stay self-contained. The only permitted external request is
  `sdk.crazygames.com`. Tailwind's CDN (a 407KB runtime JIT compiler serving three utility
  classes) and Google Fonts were both removed; Tone.js is bundled from npm. Don't
  reintroduce a CDN.
- Submission = zip the **contents** of `dist/`, with `index.html` at the zip root.

## Verifying changes

`npm run build`, then serve `dist/` **from a nested path** to catch absolute-path
regressions:

```bash
mkdir -p /tmp/subdir/games/gw && cp -r dist/* /tmp/subdir/games/gw/
cd /tmp/subdir && python3 -m http.server 8899
# http://127.0.0.1:8899/games/gw/
```

For runtime checks, drive headless Chrome over CDP (`/usr/bin/google-chrome
--headless=new --remote-debugging-port=...`). Two gotchas learned the hard way:

- **Use `userGesture: true` on `Runtime.evaluate`.** Without it `Tone.start()` never
  settles and the Play button appears dead. (The game now races that call against a 2s
  timeout precisely so a suspended AudioContext can't make the game unstartable — but the
  probe still needs the flag to exercise the audio path.)
- **The portal SDK namespaces its storage.** Seeding a save with raw
  `localStorage.setItem` is invisible to the game when the SDK is present; write through
  `window.CrazyGames.SDK.data.setItem` instead.

Headless runs at roughly 23fps, so anything distance-based takes ~2.6x longer in wall
clock than it would at 60fps. Budget accordingly before concluding something is stuck.
