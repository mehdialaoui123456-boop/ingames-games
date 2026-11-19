// Shared helpers for the game publishing pipeline.
//
// A game is a folder at the repo root containing index.html + game.json.
// game.json uses the SAME field names as Firestore `games/<id>` so the
// pending doc is a straight copy (see ../ingames/ingames_admin GameEditScreen).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COVERS_DIR = path.join(ROOT, 'covers');

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const CATEGORIES = new Set(['single', 'team', 'hard']);

/** Loads KEY=VALUE pairs from <repo>/.env into process.env (never overrides). */
export function loadDotEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/** Public base URL of the GitHub Pages site, trailing slash included. */
export function pagesBase() {
  if (process.env.PAGES_BASE) return process.env.PAGES_BASE.replace(/\/?$/, '/');
  const repo = process.env.GITHUB_REPOSITORY; // owner/name inside Actions
  if (repo) {
    const [owner, name] = repo.split('/');
    return `https://${owner}.github.io/${name}/`;
  }
  return 'https://mehdialaoui123456-boop.github.io/ingames-games/';
}

/** Reads + validates <folder>/game.json. Throws with every problem listed. */
export function loadGame(folder) {
  folder = folder.replace(/[\\/]+$/, '').replace(/[\\/]game\.json$/, '');
  const dir = path.join(ROOT, folder);
  const file = path.join(dir, 'game.json');
  if (!fs.existsSync(file)) throw new Error(`${folder}: no game.json`);
  let g;
  try {
    g = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${folder}/game.json: invalid JSON — ${e.message}`);
  }
  const errs = [];
  const id = g.id ?? folder;
  if (!ID_RE.test(id)) errs.push(`id "${id}" must match ${ID_RE}`);
  if (!str(g.titleAr)) errs.push('titleAr is required');
  if (!str(g.descriptionAr)) errs.push('descriptionAr is required');
  if (!str(g.coverPrompt) && !fs.existsSync(coverPath(id)))
    errs.push('coverPrompt is required (or commit covers/<id>.webp yourself)');
  if (!Array.isArray(g.categories) || g.categories.length === 0) errs.push('categories: pick at least one of single/team/hard');
  else for (const c of g.categories) if (!CATEGORIES.has(c)) errs.push(`categories: unknown "${c}"`);
  if (g.stepsAr !== undefined && !(Array.isArray(g.stepsAr) && g.stepsAr.every(str)))
    errs.push('stepsAr must be an array of strings');
  const entry = g.entry ?? 'index.html';
  if (!fs.existsSync(path.join(dir, entry))) errs.push(`${entry} not found in ${folder}/`);
  if (errs.length) throw new Error(`${folder}/game.json:\n  - ${errs.join('\n  - ')}`);
  return { ...g, id, folder, dir, entry };
}

export const coverPath = (id) => path.join(COVERS_DIR, `${id}.webp`);

/** Cover URL with a content hash so the app's image cache refreshes on regeneration. */
export function coverUrl(id) {
  const f = coverPath(id);
  const v = fs.existsSync(f)
    ? crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 8)
    : '0';
  return `${pagesBase()}covers/${id}.webp?v=${v}`;
}

/** Mirror of derivePlayersAndDifficulty in ingames_admin/lib/widgets/game_categories.dart. */
export function derivePlayersAndDifficulty(cats) {
  const s = new Set(cats);
  let minPlayers, maxPlayers;
  if (s.has('single') && s.has('team')) [minPlayers, maxPlayers] = [1, 6];
  else if (s.has('team')) [minPlayers, maxPlayers] = [2, 6];
  else [minPlayers, maxPlayers] = [1, 1];
  return { minPlayers, maxPlayers, difficulty: s.has('hard') ? 'hard' : 'medium' };
}

/** Firestore fields for the game doc (what GameEditScreen._save writes, minus timestamps/counters). */
export function toGameDoc(g) {
  const categories = [...g.categories].sort();
  return {
    category: g.category ?? 'highEnergy',
    ageGroup: g.ageGroup ?? 'children',
    color: g.color ?? 0xff00e5ff,
    cardColor: g.cardColor ?? 0xff0f1626,
    titleAr: g.titleAr.trim(),
    descriptionAr: g.descriptionAr.trim(),
    howToPlayAr: (g.howToPlayAr ?? '').trim(),
    emoji: (g.emoji ?? '').trim() || '🎮',
    stepsAr: (g.stepsAr ?? []).map((s) => s.trim()).filter(Boolean),
    order: Number.isInteger(g.order) ? g.order : 0,
    playUrl: g.playUrl ?? `${pagesBase()}${g.folder}/${g.entry === 'index.html' ? '' : g.entry}`,
    // Empty when no cover exists yet (e.g. generation failed) — the admin panel
    // shows a placeholder and the cover can be set in "Review & edit".
    imageUrl: fs.existsSync(coverPath(g.id)) ? coverUrl(g.id) : '',
    isMultiplayer: g.isMultiplayer === true,
    categories,
    ...derivePlayersAndDifficulty(categories),
  };
}

/** Folders that contain a game.json (for "all" runs). */
export function allGameFolders() {
  return fs
    .readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, d.name, 'game.json')))
    .map((d) => d.name);
}

function str(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
