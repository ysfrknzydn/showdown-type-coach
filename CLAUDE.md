# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Showdown Type Coach" — a Manifest V3 browser extension for beginners playing
[Pokemon Showdown](https://play.pokemonshowdown.com). It shows live type-effectiveness
hints during a battle (your active Pokemon's types, the opponent's, which of your
moves are super/not-very effective, STAB, etc.), plus a toolbar popup with a full
type chart, a type-combo lookup tool, and a beginner glossary.

There is no build step, package manager, or test suite — it's plain HTML/CSS/JS loaded
directly by the browser. "Running" it means loading it as an unpacked extension.

## Commands

There is nothing to install or build. To develop:

- **Load/reload in Chrome (or Edge/Brave):** `chrome://extensions` → enable Developer
  mode → "Load unpacked" → select `extension/`. After editing source, click the reload
  icon on the extension's card in that page.
- **Load in Firefox:** `about:debugging#/runtime/this-firefox` → "Load Temporary
  Add-on…" → select `extension/manifest.json`. Removed on browser restart.
- **Syntax-check a JS file:** `node --check extension/src/<file>.js` (no linter/test
  runner is configured).
- **Rebuild the Safari wrapper:** the Xcode project at `safari-project/` was generated
  once via `xcrun safari-web-extension-converter extension --project-location
  safari-project`. Its extension-source files are relative-path references straight
  into `extension/` (see `.xcodeproj/project.pbxproj`), **not copies** — so editing
  `extension/src/*` or `extension/manifest.json` is picked up automatically on the
  next Xcode build. Re-run the converter only if you need to regenerate the wrapper
  itself (e.g. changing the app name/bundle id); don't hand-edit files under
  `safari-project/` expecting them to affect the actual extension behavior.

## Architecture

The extension has three independent JS entry points that only communicate through the
DOM, because they run in different JS execution contexts:

1. **`src/typechart.js`** — pure data + helpers, no DOM/browser API dependency. Exposes
   everything on `window.PSHelper.TypeChart`: the attacker→defender effectiveness
   matrix, type badge colors, the glossary text, and helper functions
   (`getMultiplier`, `getDefensiveProfile`, `effectivenessLabel/Class`). Loaded by both
   the content script and the popup. **The multiplier matrix was generated
   programmatically from Pokemon Showdown's own live `data/typechart.js`** (attacker
   damageTaken codes inverted into a defender-oriented matrix) — if type mechanics
   ever need updating, regenerate from the source rather than hand-editing values.

2. **`src/statmath.js`** — pure stat-math helpers (no DOM/browser dependency),
   exposed on `window.PSHelper.StatMath`. Computes exact stats for the player's own
   Pokemon (from `inject.js`'s merge of `room.request.side.pokemon[].stats`) and a
   min/max possible **range** for the opponent (from base stat + level, since the
   opponent's real EVs/IVs/nature are never sent to the client — genuine hidden
   information, same as real competitive play). Used for the "Speed" verdict
   (outspeed/outsped/tie/uncertain) — deliberately never shows a fabricated opponent
   number, only the range-derived verdict.

3. **`src/randbats.js`** — Random-Battle-specific stat estimation, on
   `window.PSHelper.RandBats`. Pokemon Showdown's Random Battle generator does NOT
   use arbitrary EVs/IVs like real constructed teams — every stat defaults to a
   near-fixed spread (31 IV / 84 EV / neutral nature), with two detectable
   exceptions (Trick Room/Gyro Ball users get dumped Speed instead; a Pokemon with
   no known physical move likely has dumped Attack). This lets Random Battle
   specifically get a much tighter stat *estimate* than `statmath.js`'s
   general-purpose wide range, which is still what's used for any other format.
   Source for these specific numbers: read directly from `Nebraskinator/ps-ppo`'s
   `obs_pokemon.py` (a reference Random Battle bot), not guessed — re-verify
   against that if the numbers ever seem stale for a newer generation.

4. **`src/damage.js`** — one pure function (`estimateDamageRange`) implementing the
   real Pokemon damage formula (STAB, ability/item-aware type effectiveness via
   `typechart.js`, the 0.85–1.00 roll, burn-halving) to get an approximate
   damage-% range. Deliberately not exhaustive — no weather/terrain, screens,
   crits, flat damage-reducing abilities (Filter/Solid Rock/etc.), or the Tera-
   matches-original-type 2x STAB case (the snapshot's `types` field is already
   post-Terastallize, so the pre-Tera type needed for that case isn't preserved
   anywhere). Only used when `recommend.js` detects Random Battle format — see the
   constraint below on why the opponent's HP specifically needs `randbats.js`'s
   estimate, never the raw snapshot field.

5. **`src/recommend.js`** — the turn-by-turn "what should I do" recommendation
   engine, on `window.PSHelper.Recommend`. Pure data in/out: scores legal move
   choices (type multiplier × STAB × base power — a ranking heuristic, not a
   numeric damage-calc estimate), decides when switching beats attacking, picks the
   best bench Pokemon to switch to (using that Pokemon's own known moves/stats via
   `inject.js`'s `allMoves`/`exactStats`, not a types-only guess), and flags
   Terastallize when it flips a bad matchup or unlocks a super-effective STAB move.
   Scoped to **only ever react to already-revealed opponent info** — an ability/item
   once shown, or a move once actually used (tracked via `moveTrack`, see below) —
   never a speculative guess about what a species "commonly" runs. Also accounts for:
   type-based status immunity (`TypeChart.isStatusImmune` — Poison/Steel can't be
   poisoned, Electric can't be paralyzed, Fire can't be burned, Ice can't be frozen —
   a real game rule distinct from the attack-effectiveness chart, since e.g.
   Poison-type is only *resisted* as an attack target but fully immune to *being*
   poisoned); entry hazard chip damage on switch-in (Stealth Rock scaled by Rock-type
   effectiveness, Spikes for grounded Pokemon, both nulled by Heavy-Duty Boots); and
   speed order — a good attack only overrides real type-danger when you actually
   move first (`pressAttackSafe` in `recommend()`), since staying in with a
   super-effective move doesn't help if the opponent hits you before you get to use
   it.

6. **`src/inject.js`** — runs in the **page's own JS context** (not the extension's
   isolated content-script world), because it needs to read Pokemon Showdown's live
   client state directly: `window.app.curRoom.battle` (a `Battle` instance from PS's
   client `battle.js`), `Pokemon.getTypes()` (handles Terastallize/forme
   changes/type-changing moves correctly), and `room.request.active[].moves` (the
   currently-choosable moves) cross-referenced against `window.BattleMovedex` for
   move type/category. It polls every 400ms and, on change, broadcasts a plain-data
   snapshot via `document.dispatchEvent(new CustomEvent("psh-battle-snapshot", ...))`.
   It gets into the page by `content.js` appending a `<script src=...>` tag — this is
   the standard workaround for MAIN-world access without needing the
   `chrome.scripting` `world: "MAIN"` API (kept for broader Safari/Firefox
   compatibility).

   Since it runs in a separate JS world from `typechart.js`/`statmath.js`/
   `recommend.js`, it can't see `window.PSHelper` and keeps its own small local copy
   of the id-normalization helper (`normalizeId`) — this is intentional duplication,
   not something to "fix" into a shared import, since the two worlds can't share JS
   objects. It also reads `poke.ability`/`poke.item`/`poke.teraType` (empty strings
   until actually revealed for the opponent) and `poke.moveTrack` (the client's own
   mechanism for tracking moves actually observed in battle — the sole source for
   "opponent's revealed moves"). For the player's **own** team only, it joins
   `room.request.side.pokemon[]` to the live `Pokemon` objects by `ident` to attach
   exact stats/moves (`exactStats`, `allMoves`) — this exact data is never available
   for the opponent's side, by design of the actual battle protocol.

7. **`src/content.js`** — the actual content script (declared in
   `manifest.json`'s `content_scripts`). Injects `inject.js` into the page, listens for
   `psh-battle-snapshot` on `document`, and renders the floating panel into its own
   **closed-off Shadow DOM** (`host.attachShadow`) so its styles never collide with
   Pokemon Showdown's own page CSS. All panel CSS lives inline in this file as a
   template string (`PANEL_CSS`) rather than a separate stylesheet, specifically so it
   can be injected into the shadow root (a `content_scripts` "css" entry would only
   apply to the light DOM, not inside a shadow root). Renders a top-of-panel
   recommendation banner from `Recommend.recommend(snapshot)`, plus ability/item-aware
   effectiveness (`TypeChart.getMultiplierWithAbility`/`getDefensiveProfileWithAbility`
   — the fix for abilities/items like Levitate or Air Balloon creating immunities the
   raw type chart doesn't know about).

8. **`src/popup.html`/`popup.js`/`popup.css`** — the toolbar popup. Fully static/local;
   only depends on `typechart.js`, no live page state. Safe to test standalone by
   opening `extension/src/popup.html` directly.

Cross-context data only ever flows as plain JSON-serializable objects (via
`CustomEvent.detail`, which the browser structured-clones across the page/isolated-world
boundary) — never functions, DOM nodes, or class instances.

## Constraints worth knowing before changing behavior

- Content script only matches `https://play.pokemonshowdown.com/*` (see
  `manifest.json`). The site currently serves its "oldclient" (jQuery/Backbone) bundle,
  which is what `inject.js`'s assumptions (`window.app`, `room.type === 'battle'`,
  `room.battle`, `room.request`) are based on — verified against the live site's actual
  served JS, not just docs.
- Singles-only: `inject.js` reads `active[0]` on each side; doubles/VGC would need
  reading the full `active` array.
- No automated test suite exists. The type-effectiveness math has been manually
  verified against known real matchups (e.g. Charizard's Fire/Flying weaknesses) —
  if you change `typechart.js`'s matrix, re-verify against a known Pokemon's real
  weaknesses/resistances before trusting it.
- **The opponent's `maxhp`/`hp` fields are NOT real numbers — they're a 0-100
  percentage, always.** Pokemon Showdown only ever reports the foe's HP as a
  fraction-of-100 over the wire (confirmed directly against a real replay: a very
  bulky opponent Pokemon showed as "100/100" while the player's own real Pokemon in
  the same replay showed genuine numbers like "300/300"). Never use
  `farActive.maxhp` as a real HP denominator for anything (e.g. damage-%
  calculations) — `recommend.js`'s `pokemonDamageContext` uses `randbats.js`'s
  estimated HP for the opponent specifically because of this.
- The opponent's real stats (EVs/IVs/nature) and unrevealed ability/item/moves are
  fundamentally hidden information — the client itself is never sent them, so the
  extension can't either. `recommend.js`/`statmath.js` are built around this: only
  react to what's actually been revealed in battle (an ability/item once shown, a
  move once used and tracked via `poke.moveTrack`), and only ever compute a possible
  min/max *range* for opponent stats, never a fabricated exact number. Don't "fix"
  this by guessing at common competitive sets — that was an explicit scope call.
