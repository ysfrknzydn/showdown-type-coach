# Showdown Type Coach

A beginner-friendly browser extension for [Pokemon Showdown](https://play.pokemonshowdown.com). While you're in a battle it shows:

- Your active Pokemon and the opponent's active Pokemon, with their **current** types (this correctly follows Terastallization, forme changes, and type-changing moves, because it reads the type straight from Showdown's own live battle object instead of guessing).
- A "your risk this turn" warning listing what the opponent could hit you super-effectively with (or if you're immune to something).
- Every move you can currently choose, with its type, whether it's **STAB**, and its effectiveness multiplier against the opponent's active Pokemon.
- A basic Team Preview view showing your team's (and the opponent's revealed) types before turn 1.

Click the toolbar icon any time (in or out of a battle) for:
- A full interactive 18-type effectiveness chart.
- A "pick 1-2 types" lookup tool to check any type combo's weaknesses/resistances/immunities.
- A short glossary of core mechanics (STAB, priority, status conditions, stat boosts, entry hazards, Terastallizing, etc).

All type-effectiveness data was generated directly from Pokemon Showdown's own `data/typechart.js`, so it matches what the actual battle engine uses.

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
    typechart.js          Shared type-effectiveness data + helpers (no dependencies)
    inject.js             Runs in the page itself; reads live battle state
    content.js             Builds the floating in-battle panel (Shadow DOM, isolated styling)
    popup.html/.js/.css     Toolbar popup: type chart, lookup tool, glossary
```

## Limitations / next steps

- Singles-focused: in doubles/VGC it only looks at the first active slot on each side.
- Team Preview only shows types, not stats/abilities/items.
- No move-damage-number estimates (that needs full stat/EV/nature data, which the client doesn't always know for the opponent) — it sticks to what a beginner actually needs: the effectiveness multiplier.
