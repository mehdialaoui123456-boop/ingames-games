---
name: new-game
description: Build a new InGames HTML game end-to-end — game folder, game.json, headless test, AI cover — and get it ready to push so the GitHub Action queues it in the admin panel's Pending Games. Use when the user asks to make/add a new game.
---

# New InGames game

The user gives an idea (genre, mechanic, or their own design). Build an **original** game — never a
recreation of a specific existing game's name, characters, art or levels.

## 1. Build the game — `<slug>/index.html`
- `<slug>`: lowercase, digits, `-` or `_` (it becomes the Firestore id and the URL).
- One self-contained HTML file. CDN libs only from cdnjs/jsdelivr (Three.js r128 is the house 3D lib).
- Arabic UI, `dir="rtl"`, Cairo font, portrait, touch-first, works in an Android WebView.
- On game over call `window.FlutterBridge?.postMessage('gameOver')`.
- Online 2-player games follow the multiplayer contract (`?room=&player=&token=`, Firebase RTDB) —
  see the user's memory note on it; with no `room` the game must work solo.
- Add an `if (location.hash === '#autostart')` block that runs a quick self-test by stepping
  `update(1/60)` synchronously in a loop (headless rAF barely ticks) and logs
  `console.log('AUTOTEST <game> …')`. Put `FAIL` in the line if an invariant breaks.
  Guard `dt = Math.max(.001, …)`.

## 2. Write `<slug>/game.json`
Same field names as Firestore `games/<id>` (the admin panel's game editor):
```json
{
  "titleAr": "…",
  "emoji": "🎮",
  "descriptionAr": "one or two enticing sentences",
  "howToPlayAr": "one sentence",
  "stepsAr": ["…", "…", "…"],
  "categories": ["single"],
  "isMultiplayer": false,
  "autotest": true,
  "coverPrompt": "English scene description: one centered focal subject, setting, colors, mood"
}
```
- `categories` ⊆ `single`, `team`, `hard` (at least one).
- Optional: `id` (defaults to folder name), `entry` (defaults to `index.html`), `order`, `coverSeed`.
- `coverPrompt`: describe the scene only — the script adds the house style, square framing and
  "no text". Keep the subject centered (1:1 cover, shown in small grid cards).

## 3. Test locally
```bash
node tools/test-game.mjs <slug>
```
Must print `PASS`. "slow" is fine (heavy canvas renders slowly headless); any `Uncaught …` is not.

## 4. Cover (optional locally — CI makes it if missing)
Needs `CF_ACCOUNT_ID` / `CF_API_TOKEN` in `.env`.
```bash
node tools/make-cover.mjs <slug> --variants 3   # candidates in covers/_candidates/
node tools/make-cover.mjs <slug>                # final covers/<slug>.webp
```
Read the image to check it (no garbled text, subject centered). Regenerate with `--force`
or tweak `coverPrompt`. If the user supplies their own cover, save it as `covers/<slug>.webp`
(square, ~768px) and CI won't generate one.

## 5. Commit — one game per commit
```bash
git add <slug>/ covers/<slug>.webp
git commit -m "Add <titleAr> (<English name>) — <one-line pitch>"
```
**Ask before `git push`.** Pushing triggers `.github/workflows/publish-games.yml`, which tests the
game, generates a missing cover, and writes Firestore `pendingGames/<slug>`. The game only goes
live when the user approves it in the admin panel → Pending Games.

Changing only `index.html` later updates the live game directly (GitHub Pages) without review;
changing `game.json` re-queues it as an "Update".
