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

### Difficulty is keyed to DISTANCE, never score

`getRunZone()` returns `getZoneForScore(maxDistanceReached / SCORE_DIVISOR)` in **both**
modes. Do not "simplify" it back to `getZoneForScore(score)`.

Score is not progress — it is progress times the player's purchases: the Score Bonus
upgrade, the combo multiplier, near misses and boost all inflate it. Keying difficulty to
score meant buying the score upgrade made obstacles tighten sooner *and* the rift grow more
aggressive sooner. The player was paying fragments to be punished. Distance is unaffected by
any purchase and is also what makes the daily seed deterministic.

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

**Tolerance is denominated in MISSED FRAGMENT CLUSTERS, not seconds.** This is the third
version of these constants; the first two were wrong in opposite directions and both because
the budget was expressed in frames:

- **`RIFT_MAX_LAG` must keep the wall on screen.** The comet sits 1/3 into the view (screen
  x ≈ 427), so a lag of 900 rendered at x = −473: invisible, therefore not a threat.
- **The ramp must cross factor 1.0 quickly, then keep going.** At factor < 1 the rift falls
  *further* behind and can never close, no matter how long the player idles.
- **A frame-based grace is the wrong unit.** 120 frames ≈ 410px at zone-0 speed, but clusters
  are ~800px apart — so the rift started gaining before the player could reach the next group
  at all, and dropping one fragment meant you could not recover. It also got silently
  stricter every zone, because a faster comet crosses the gap in fewer frames.

`riftMissTolerance(zone)` now expresses the budget as cluster intervals (2.3 early → 1.5
deep), `RIFT_FREE_CLUSTERS` guarantees one whole missed group is always survivable, and the
ramp's peak is **solved** from the integral rather than hand-picked, so the death point
matches the design target at every zone instead of drifting.

`riftMissTolerance(zone)` decays exponentially (3.0 clusters at zone 0 → a 1.4 floor) rather
than linearly: generous while the player is still learning the rift exists, tightening
through the mid zones, then flattening so it stays demanding without becoming unsurvivable.
It crosses the old linear curve around zone 4-5, so it is *more* forgiving early and *more*
aggressive late.

### Near miss

The second pressure valve. Without it, fragments were the only way to hold the rift off,
which punished a skilled player who took a fragment-poor line.

**The window must scale with the gate — a flat threshold cannot work.** It began at 34px and
therefore never fired: a zone-0 gate has a 420px gap, leaving ~195px of clearance each side,
so nobody aiming for the opening was ever within 34px of a wall. But a flat *large* number is
wrong too — 78px is wider than the entire opening by zone 12.

`nearMissWindow(zone)` is therefore `max(NEAR_MISS_MIN, getGateGap(zone) * 0.24)`, so "close"
means the same *proportion* of the available room throughout: ~52% early (you must commit to
one side rather than coast down the middle), bottoming out at the floor late where it fires on
most passes — correct, because threading those gaps at all is the feat.

It also needs to be **loud**, or players never learn it exists: two-line floating text that
names the reward (`RIFT PUSHED BACK` — the pushback is otherwise invisible), a ring, a
distinct chime, and a screen-edge glow for peripheral vision.

### `runReady`: the loop must not simulate a run that does not exist yet

`setGameState('playing')` flips `gameState` **immediately**, but the run is not built until
`startGame()` → `initNewRun()` fires on a 350ms timer. Coming from the **menu**, the render
loop is already running (the menu branch starts it), so its very next frame entered the
gameplay branch and stepped `updateGame()` against the *previous* run's leftovers — a dead
comet usually sitting inside an obstacle, the stale obstacle list, and a rift parked on the
player. That produced a game over before the run began.

It only reproduced from the menu **after at least one earlier run**, which is why "Play Again"
(where the loop is dormant at `game-over`) always looked fine and hid the bug.

`runReady` is set false alongside every deferred `setTimeout(startGame/startTutorial, 350)`
and true inside `initNewRun()`. While false the loop still paints (so the screen does not
flash) but does not simulate. **Any new deferred-start path must clear it too.**

### Run start must never be losable

Three separate things could kill a player before they had oriented, and all three are fixed
in `initNewRun`/`manageObstacles`:

- `safeLaneY` could drift ±245px **before the first formation**, so the opening gate's gap
  could be a quarter-screen from the comet's fixed start position. The first formation is now
  laid on the comet's own line (`formationsSpawned === 0`).
- The first obstacle sat ~726px out; now `VIRTUAL_WIDTH * 0.72`.
- `SPAWN_GRACE_FRAMES` of shield, because neither of the above is a guarantee.

`revivePlayer()` must reset `riftX` — otherwise being caught re-triggers on the very next
frame and burns the revive for nothing.

### Daily challenge: seeded, and why upgrades are switched off

One shared field per UTC day (`getDailyKey` → `seedFromKey` → mulberry32 `worldRandom`).

**`worldRandom()` is used in the spawners ONLY.** Particles, twinkle and other cosmetic
randomness must keep using `Math.random()` — if they drew from the same stream, two players
whose particle counts differed (skins emit at different rates) would desync the world.

**`activeUpgrades()` returns zeroes during a daily run.** That is not just a fairness
nicety, it is what makes the seed work at all: the score upgrade changes how fast score
accrues → score drives the zone → the zone drives generation, so two players with different
upgrades would get different worlds from the same seed. For the same reason `getRunZone()`
keys off *distance* in daily mode rather than score, since combo/near-miss/boost all inflate
score by skill. Cosmetics are untouched — they have no mechanical effect.

Verified by extracting the real generator and running it twice: 500 formations / 741
obstacles byte-identical, and a different day key produces a different field.

### Daily-exclusive cosmetics, and the rank problem

`DAILY_UNLOCKS` gates cosmetics on days played and score thresholds. Items carry
`cost: null` + `dailyOnly: true`; `buyCosmetic()` refuses them explicitly, because
`starFragments >= null` coerces to `>= 0` and would otherwise make them free.

**Rank-based unlocks ("top 100 of the day") are not implementable client-side.** The
CrazyGames leaderboard has no read API, so the game cannot learn where a player placed.
Doing it properly needs a backend that reads their Leaderboard API with the server-side API
key and hands the client a signed entitlement. Everything in `DAILY_UNLOCKS` is deliberately
something the client can verify by itself.

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

### Leaderboard: submit-only, and it shapes the UI

`CrazyGames.SDK.user.submitScore({ encryptedScore, score })` (see `PortalSDK.submitScore`)
needs a per-game **Encryption Key** from the developer portal, pasted into
`CRAZYGAMES_LEADERBOARD_KEY` in `index.html`. Empty key = silent no-op, everything else works.

**There is no read API.** A game cannot fetch rankings — CrazyGames renders the board on the
game's own page, outside the iframe. So the in-game "Your Best Runs" board is the player's
*local* history (`playerData.records`), not a global one. Don't go looking for a
`getLeaderboard()`; it doesn't exist.

Each record snapshots the cosmetics equipped when it was set (`comet`/`obstacle`/`background`
ids, copied not referenced) and renders them via `renderCosmeticPreview` — the same function
the shop uses. That's deliberate: it gives cosmetics a reason to exist beyond a recolour.

### Mobile / iOS requirements (from docs.crazygames.com/requirements/technical/)

- `touch-action: none` on `body` and `canvas`. Without it the browser claims touches for
  scroll/pinch and steals them mid-drag, which breaks the game's only input.
- **The AudioContext must be resumed on a later user gesture.** iOS drops it to
  `interrupted`/`suspended` on backgrounding and never restores it. `Tone.start()` fires once
  from the Play button, so without the `touchend`/`pointerup`/`visibilitychange` handlers the
  game goes permanently silent after the first interruption.

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

- **`gwStats()` reports `cometY: 0` when `playerComet` is null**, which passes a
  `typeof === 'number'` guard. A probe that latches "run start" on that will read state from
  *before* `initNewRun()` — this produced a false report that the spawn grace shield was
  missing when it was in fact working. Gate on `cometX` being in the expected start range and
  `formationsSpawned > 0` instead.
- **An autopilot that steers to `nextGap.centre` will never trigger a near miss**, because the
  gap centre is the furthest possible point from both walls. That is the autopilot behaving
  correctly, not the mechanic being broken. Steer to `safeLaneY`, or deliberately off-centre,
  to exercise it.
