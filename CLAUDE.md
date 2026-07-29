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

### Zone pacing is a growing threshold, not a divisor

Do **not** reintroduce `Math.floor(score / SOME_CONSTANT)`. Score accrues faster every zone
(speed rises), so a flat threshold makes each zone *shorter* than the last — at a flat 600
a player hit zone 5 by 2,700 points. `zoneThreshold(n)` charges `ZONE_GROWTH` more per zone
to cancel that, and `getZoneForScore(s)` is its closed-form inverse (cheap enough to call
every frame). Zones land roughly 30-45s apart throughout.

### Audio: mind the gain structure

Output was once measured at **-21.9 dBFS peak** with the bed inaudible, because bus
attenuations stacked (master -6 → musicBus -12 → drone -8 = -26 dB) and the sub sat at 55Hz,
below what laptop/phone speakers reproduce at all. Now ~-10 dBFS peak, sub at 110Hz.
When adding a voice, check the *cumulative* path to `master`, not just its own Volume.

`audioManager` runs three synchronised loops (`musicLoop` bass, `padLoop`, `arpLoop`) plus a
drone. `updateMusicLayers(zone)` fades the arp in from zone 2 and opens the pad filter, so
progression is audible. `window.gwStats().audio` reports the whole graph's live state.

The fragment pitch ladder **wraps** (`combo % length`) and decays after
`FRAGMENT_COMBO_DECAY_FRAMES` of no pickups. Clamping instead of wrapping meant every pickup
past the top of the ladder fired the same shrill note for the rest of the run.

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

### World generation: formations on a guaranteed corridor

`manageObstacles()` spawns **formations**, not single blocks: `single`, `cluster` (2-3
scattered pieces) and `gate` (walls welded to the top and bottom edges with a gap). The mix
shifts toward gates with zone. Gates run from zone 0 with a very wide gap — the game is
made engaging early by requiring you to *aim*, not by adding debris.

**`safeLaneY` is load-bearing — do not place obstacles without consulting it.** A
reachability sweep over independently-placed formations found that from zone 2 onward some
generated fields had *no navigable path at all* (a cluster block landing in front of a
gate's opening; two formations overlapping in x and jointly sealing the column), rising to
every field by zone 12. Players would have died to the RNG rather than to a mistake.

So the corridor is guaranteed by construction:
- `advanceSafeLane(dx, zone)` drifts the lane by at most `0.5 * dx`, because the comet
  trades forward speed for vertical speed (velocity is pinned to `baseSpeed`), making ~45°
  its practical limit. The lane can therefore always be followed.
- Gate openings are **centred on `safeLaneY`**, never placed randomly.
- `placeBlockAvoidingLane(height, zone, extraMargin)` keeps freestanding blocks out of the
  corridor, and returns `null` when neither side has room (caller skips the piece). Pass
  `extraMargin` for obstacle types that *move after placement* — `vertical` oscillates ±50px
  and would otherwise wander into a corridor that was clear at spawn time.

Difficulty comes from how narrow (`getCorridorHalf`) and how mobile the lane is, never from
whether a route exists. `scratchpad`-style reachability checks should be re-run after any
change here; the invariant is **100% path existence at every zone**.

### The collapsing rift (anti-idle pressure)

Because the corridor is guaranteed and the comet advances by itself, a player could sit in
an open lane and simply not die — disengaging had no cost. `updateRift()` runs a wall that
chases from behind: it cruises slightly slower than the comet, accelerates the longer you go
without collecting a fragment (`framesSinceFragment`), and is shoved back by
`RIFT_FRAGMENT_PUSHBACK` on every pickup. Sustained idling kills in ~10s. This makes
fragments load-bearing for *survival*, not just currency.

Two constraints these constants must respect — the first attempt violated both and the
mechanic did nothing at all:

- **`RIFT_MAX_LAG` must keep the wall on screen.** The comet sits 1/3 into the view (screen
  x ≈ 427), so a lag of 900 rendered at x = −473: invisible, therefore not a threat.
- **The ramp must cross factor 1.0 quickly, then keep going.** At factor < 1 the rift falls
  *further* behind and can never close, no matter how long the player idles.

`revivePlayer()` must reset `riftX` — otherwise being caught re-triggers on the very next
frame and burns the revive for nothing.

### Headstart handover

Collisions are disabled during the headstart flight, but the *handover* is what kills. The
flight now eases `playerComet.y` toward `safeLaneY` and `endHeadstart()` snaps exactly onto
it, clears any obstacle overlapping the comet, and grants `HEADSTART_GRACE_FRAMES` of shield.
Before that, the comet was deposited wherever the idle wave left it while the corridor could
be anywhere in 86–634 — with no player control during the flight to pre-position, and
measurement showed it passing through 20 obstacles mid-flight, so it could land *inside* one.

### Performance rules for the hot loop

`gameLoop()` sets `frameTime` once per frame; animated draw code reads that, never
`Date.now()` directly.

- **Never `arr = arr.filter(...)` per frame.** Use `compact(arr, keep)` — in-place, preserves
  array identity. Five entity lists were each allocating a fresh array every frame.
- **Never construct a gradient in a draw call.** Build it once at the origin and position it
  with `ctx.translate` (see `drawWellFalloff`, `Orbiter.draw`, `drawRift`), or cache it keyed
  on whatever it actually depends on (see the theme renderer's `_cacheKey`, keyed on zone +
  canvas size). The background alone was building 9 gradients per frame; steady state is now
  **0**, verified by patching `CanvasRenderingContext2D.prototype`.
- **Hoist invariants out of per-entity loops** — the equipped-skin lookup ran once per
  obstacle per frame in `checkCollisions()`.
- Don't allocate to read a constant: `POWERUP_COLORS` is module-level because code was
  constructing throwaway `PowerUp` instances just to read one hex string.

### Tutorial: real collisions with a soft rewind

Collisions are **live** during the tutorial. They previously were not — `checkCollisions()`
returned early for `gameState === 'tutorial'` and the obstacle step completed on the comet's
x passing the obstacle's right edge, so a player could fly straight through and be
congratulated for dodging. (An automated walkthrough passed it by coasting with no input.)

Now `updateTutorial()` catches `collisionResult.obstacle` and calls
`tutorialManager.handleCrash()`, which rewinds to `checkpoint`, shows the step's
`onCrashText` for ~2.5s and lets the player retry. It stays unloseable while a mistake
finally means something. `renderText()` is the single owner of the banner so step text and
retry coaching cannot fight over the element.

The tutorial gate's gap is deliberately offset ~150px from the comet's line — centring it
would let the player coast through and re-create the fake success.

### Save data: merge `upgrades` key-by-key

`loadPlayerData()` spreads the loaded save over defaults. A top-level spread replaces the
whole `upgrades` object, so a save written before a new upgrade existed leaves that key
`undefined` — and `buyUpgrade`'s `playerData.upgrades[id]++` turns it into `NaN`.
`mergedUpgrades` exists to prevent this. **When adding an upgrade, add it to
`upgradeCosts`, to both `defaultPlayerData` literals, and give it an `#upgrade-<id>` row
in the shop markup.** `updateObservatoryUI()` and the buy handler are both generic and
need no further wiring.

### Backgrounds are data + one shared renderer

`makeBackgroundTheme(id, name, cost, cfg)` builds every background theme from a hue band.
One `render(ctx, w, h, zone, camX)` serves all of them, so **themes drift with the zone** and
all get the parallax layers (`bgHaze` far / `stars` mid / `bgDust` near, all driven off
`cameraX`) for free.

This replaced seven hardcoded closures that each painted one flat gradient. Zone changes
used to be invisible: `checkZoneTransition()` only recoloured the background inside
`if (!equippedBackgroundTheme.render)`, and every theme defined `render()`, so that branch
**never executed**. Combined with the zone hue only applying to `obstacle_default`, buying
any obstacle skin erased the last visual trace of progression. `onZoneAdvanced()` now also
fires a screen wash, a ring and a "ZONE n" banner.

When adding a theme, add a `makeBackgroundTheme(...)` entry — do not hand-roll a `render`.

### Shop previews must come from the game's own renderers

`renderCosmeticPreview(item)` returns a `<canvas>` painted by the **same** functions
gameplay uses (`skin.draw`, `theme.render`, `getCircleStack` for stacked skins), at the
aspect the item actually has in play. Previews were CSS boxes while gameplay was canvas —
two implementations with nothing keeping them in sync, and they had drifted badly (Asteroid
previewed as a smooth oval but drew as a cratered polygon; Crystal Spires previewed as a
hexagon but drew as a spire). Never reintroduce a CSS-only `previewStyle` path.

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
