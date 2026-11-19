# Game publishing pipeline

```
<slug>/index.html + <slug>/game.json  ──git push──►  GitHub Action (publish-games.yml)
   1. validate game.json + headless test (#autostart)
   2. covers/<id>.webp missing? → Cloudflare Workers AI FLUX schnell (free), 768×768
   3. commit cover → GitHub Pages
   4. Firestore pendingGames/<id>
Admin panel → Pending Games → Approve  ──►  games/<id> (live in the app)
```

| Script | What it does |
|---|---|
| `node tools/test-game.mjs <folder>…` | Headless Chrome smoke test; fails on uncaught errors / `AUTOTEST … FAIL` |
| `node tools/make-cover.mjs <folder>… [--force] [--variants N]` | AI cover from `coverPrompt` |
| `node tools/push-pending.mjs <folder>… [--dry-run]` | Queue for review in the admin panel |

Setup: `cd tools && npm install`. Local secrets go in `<repo>/.env` (gitignored):
```
CF_ACCOUNT_ID=…
CF_API_TOKEN=…
FIREBASE_SERVICE_ACCOUNT=C:/path/to/service-account.json
```
The same three values are GitHub repo secrets for the Action (`FIREBASE_SERVICE_ACCOUNT` = the JSON content).

Manual run for existing games: Actions → Publish games → Run workflow → `folders: keeper fire-snake`.
