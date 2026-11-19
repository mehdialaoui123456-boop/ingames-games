#!/usr/bin/env node
// Generates covers/<id>.webp (square, 768×768) from game.json's coverPrompt
// using Cloudflare Workers AI FLUX.1 [schnell] — free daily allowance.
//
//   node tools/make-cover.mjs <folder> [<folder> …] [--force] [--variants N]
//
// Env (or <repo>/.env): CF_ACCOUNT_ID, CF_API_TOKEN (token needs "Workers AI: Read").
// Skips games that already have a cover unless --force. With --variants N it
// writes covers/_candidates/<id>-1..N.webp instead, for you to pick one.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadDotEnv, loadGame, coverPath, COVERS_DIR } from './lib.mjs';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const SIZE = 768;
// Shared style so every cover in the catalogue looks like one family.
const STYLE =
  'square mobile game cover art, vibrant saturated colors, glossy stylized 3D render, ' +
  'single clear focal subject centered with breathing room around it, dramatic rim lighting, ' +
  'clean uncluttered background, no text, no letters, no words, no logo, no watermark, no UI. Scene: ';

loadDotEnv();
const args = process.argv.slice(2);
const force = args.includes('--force');
const vi = args.indexOf('--variants');
const variants = vi >= 0 ? Math.max(1, parseInt(args[vi + 1], 10) || 3) : 0;
const folders = args.filter((a, i) => !a.startsWith('--') && !(vi >= 0 && i === vi + 1));

if (!folders.length) {
  console.error('usage: node tools/make-cover.mjs <folder> [...] [--force] [--variants N]');
  process.exit(2);
}
const { CF_ACCOUNT_ID, CF_API_TOKEN } = process.env;
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('Missing CF_ACCOUNT_ID / CF_API_TOKEN (set them in .env or the environment).');
  process.exit(2);
}

async function generate(prompt, seed) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps: 8, seed }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.result?.image) {
    const msg = body?.errors?.map((e) => e.message).join('; ') || res.statusText;
    throw new Error(`Cloudflare AI ${res.status}: ${msg}`);
  }
  return Buffer.from(body.result.image, 'base64');
}

async function toWebp(buf, out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await sharp(buf).resize(SIZE, SIZE, { fit: 'cover', position: 'centre' }).webp({ quality: 82 }).toFile(out);
}

let failed = 0;
for (const folder of folders) {
  try {
    const g = loadGame(folder);
    const out = coverPath(g.id);
    if (!variants && fs.existsSync(out) && !force) {
      console.log(`skip  ${g.id} (cover exists — use --force to regenerate)`);
      continue;
    }
    if (!g.coverPrompt) throw new Error('no coverPrompt in game.json');
    const prompt = STYLE + g.coverPrompt.trim();
    if (variants) {
      for (let i = 1; i <= variants; i++) {
        const f = path.join(COVERS_DIR, '_candidates', `${g.id}-${i}.webp`);
        await toWebp(await generate(prompt, Math.floor(Math.random() * 2 ** 31)), f);
        console.log(`cand  ${path.relative(process.cwd(), f)}`);
      }
    } else {
      await toWebp(await generate(prompt, g.coverSeed), out);
      console.log(`cover ${path.relative(process.cwd(), out)}`);
    }
  } catch (e) {
    failed++;
    console.error(`FAIL  ${folder}: ${e.message}`);
  }
}
process.exit(failed ? 1 : 0);
