#!/usr/bin/env node
// Queues games for review: writes Firestore pendingGames/<id>. Nothing goes
// live here — an admin approves it in the admin panel ("Pending games"),
// which copies the doc into games/<id>.
//
//   node tools/push-pending.mjs <folder> [<folder> …] [--dry-run]
//
// Env: FIREBASE_SERVICE_ACCOUNT (the JSON key itself, or a path to it).
// Optional: TEST_REPORT (from test-game.mjs), GITHUB_SHA, GITHUB_REPOSITORY.

import fs from 'node:fs';
import { loadDotEnv, loadGame, toGameDoc } from './lib.mjs';

loadDotEnv();
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const folders = args.filter((a) => !a.startsWith('--'));
if (!folders.length) {
  console.error('usage: node tools/push-pending.mjs <folder> [...] [--dry-run]');
  process.exit(2);
}

const tests = process.env.TEST_REPORT && fs.existsSync(process.env.TEST_REPORT)
  ? JSON.parse(fs.readFileSync(process.env.TEST_REPORT, 'utf8'))
  : {};

const docs = folders.map((f) => {
  const g = loadGame(f);
  const t = tests[g.id];
  return [g.id, {
    ...toGameDoc(g),
    source: {
      folder: g.folder,
      repo: process.env.GITHUB_REPOSITORY ?? 'local',
      commit: process.env.GITHUB_SHA ?? null,
    },
    test: t ? { ok: t.ok, autotest: t.autotest ?? [], errors: t.errors ?? [] } : null,
  }];
});

if (dry) {
  for (const [id, d] of docs) console.log(id, JSON.stringify(d, null, 2));
  process.exit(0);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT');
  process.exit(2);
}
const sa = JSON.parse(raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8'));

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

for (const [id, d] of docs) {
  const live = await db.collection('games').doc(id).get();
  await db.collection('pendingGames').doc(id).set({
    ...d,
    kind: live.exists ? 'update' : 'new',
    submittedAt: FieldValue.serverTimestamp(),
  });
  console.log(`queued pendingGames/${id} (${live.exists ? 'update' : 'new'})`);
}
