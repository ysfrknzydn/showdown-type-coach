# Showdown Type Coach

A beginner-friendly browser extension for [Pokemon Showdown](https://play.pokemonshowdown.com) that's grown from a type-effectiveness overlay into a full turn-by-turn battle coach. While you're in a battle it shows:

- A **recommendation banner** at the top of the panel — the single best thing to do this turn: use a specific move, switch to a specific bench Pokemon, or Terastallize, with the reasoning shown. Accounts for type effectiveness (ability/item-aware — Levitate, Air Balloon, etc.), STAB, move accuracy, status-condition type immunities (e.g. Steel/Poison-types can't be poisoned), entry hazard chip damage on switch-in (Stealth Rock/Spikes), and whether you actually move first (a strong attack doesn't help if the opponent hits you before you get to use it).
- In **Random Battle** specifically, an approximate damage-% estimate (e.g. "~45-60% — likely a 2HKO") instead of just a type-effectiveness label — Random Battle's near-fixed stat spreads make this possible without guessing hidden information; other formats keep the plain effectiveness label since real teams have genuinely arbitrary EVs.
- Your active Pokemon and the opponent's active Pokemon, with their **current** types (this correctly follows Terastallization, forme changes, and type-changing moves, because it reads the type straight from Showdown's own live battle object instead of guessing), plus revealed ability/item and volatile conditions (Encore, Taunt, Substitute, etc).
- A **Speed** verdict (outspeed/outsped/tie/uncertain) using your exact stats vs. a real possible range for the opponent's.
- "Your risk this turn" and "Opponent's weaknesses/strengths" — what either side could get hit hard by.
- Every move you can currently choose, with its type, whether it's **STAB**, and its effectiveness against the opponent's active Pokemon.
- Your full team, including bench Pokemon from turn 1 (not just whichever you've already sent out), with a risk badge showing who's safe to switch into.
- A basic Team Preview view showing your team's (and the opponent's revealed) types before turn 1.

Click the toolbar icon any time (in or out of a battle) for:
- A full interactive 18-type effectiveness chart.
- A "pick 1-2 types" lookup tool to check any type combo's weaknesses/resistances/immunities.
- A short glossary of core mechanics (STAB, priority, status conditions, stat boosts, entry hazards, Terastallizing, etc).

All type-effectiveness data was generated directly from Pokemon Showdown's own `data/typechart.js`, so it matches what the actual battle engine uses. The recommendation engine only ever reacts to information that's actually been revealed in the battle (a move once used, an ability/item once shown) — it never guesses at an opponent's hidden moveset or set based on "commonly runs."

## How it works

Pokemon Showdown's client keeps the entire battle state (`window.app.curRoom.battle`) in the page's own JavaScript. The extension injects a small script into the page to read that state (Pokemon types, HP, status, your currently-selectable moves) and broadcasts it to a content script, which renders the floating panel. No data is sent anywhere — everything stays in your browser.

## Installing in Chrome (or any Chromium browser: Edge, Brave, etc.)

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension/` folder in this project.
4. Open a battle at play.pokemonshowdown.com — the panel appears in the bottom-right corner.

Any time you edit the code, click the refresh icon on the extension's card in `chrome://extensions` to reload it.

## Installing in Firefox

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `extension/manifest.json`.
3. Note: temporary add-ons are removed when Firefox closes; for a permanent install you'd package and sign it through Mozilla's add-on tools.

## Installing in Safari

Safari extensions must be wrapped in a small Xcode app and code-signed on your Mac — this part can't be done by editing files alone, it needs Xcode. Steps:

1. Install Xcode from the App Store if you don't have it (free).
2. In Terminal, run Apple's converter tool on this extension:
   ```
   xcrun safari-web-extension-converter /Users/yusuf/pokemon_showdown/extension --project-location /Users/yusuf/pokemon_showdown/safari-project
   ```
   This generates an Xcode project that wraps the extension in a native app shell.
3. It will open the generated project in Xcode automatically (or open `safari-project/*.xcodeproj` yourself). Press the **Run** button (▶) in Xcode — this builds and installs the container app, which registers the extension with Safari.
4. In Safari: **Settings → Extensions**, enable "Showdown Type Coach".
5. Since this isn't distributed through the App Store, Safari will treat it as an unsigned/development extension: you may need **Safari → Settings → Advanced → Show Develop menu**, then **Develop → Allow Unsigned Extensions** (this resets each time Safari restarts, since there's no paid Apple Developer account signing it — that's the trade-off for not publishing to the App Store).
6. Re-running step 3 (Xcode's Run button) after any code changes rebuilds and refreshes the extension.

If you ever want this permanently installed without re-running Xcode each Safari restart, that requires enrolling in the $99/year Apple Developer Program to notarize/sign it — not necessary just to use it yourself during a session.

## Project layout

```
extension/
  manifest.json         Manifest V3 config
  icons/                 Toolbar icons
  src/
    typechart.js          Type-effectiveness data + helpers, incl. ability/item immunities and status-condition immunities
    statmath.js            General stat-math helpers (speed ranges, boost multipliers)
    randbats.js             Random Battle-specific stat estimation (near-fixed EV/IV spreads)
    damage.js               Real Pokemon damage formula -> approximate damage-% range
    recommend.js            The turn-by-turn recommendation engine (best move/switch/Tera)
    inject.js              Runs in the page itself; reads live battle state
    content.js              Builds the floating in-battle panel (Shadow DOM, isolated styling)
    popup.html/.js/.css     Toolbar popup: type chart, lookup tool, glossary
```

See `CLAUDE.md` for how these pieces fit together and the constraints worth knowing before changing behavior.

## Limitations / next steps

- Singles-focused: in doubles/VGC it only looks at the first active slot on each side.
- Team Preview only shows types, not stats/abilities/items.
- Approximate damage-% estimates only apply in Random Battle (where stat spreads are close to fixed); other formats show the plain type-effectiveness label, since real constructed teams have genuinely arbitrary EVs that can't be estimated responsibly.
- Entry hazard damage accounts for Stealth Rock and Spikes; Toxic Spikes and Sticky Web aren't factored in yet, and Spikes assumes a single layer rather than tracking stacked layers.
