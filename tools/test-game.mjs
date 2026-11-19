#!/usr/bin/env node
// Headless smoke test: loads <folder>/<entry>#autostart in headless Chrome and
// fails on uncaught JS errors (a wall-clock timeout alone is only a warning) or on an AUTOTEST line containing FAIL/MISMATCH/NaN.
// If game.json has "autotest": true, at least one AUTOTEST line is required.
//
//   node tools/test-game.mjs <folder> [<folder> …] [--budget ms]
//
// Writes a JSON summary to $TEST_REPORT (if set) for push-pending.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadGame } from './lib.mjs';

const args = process.argv.slice(2);
const bi = args.indexOf('--budget');
const budget = bi >= 0 ? parseInt(args[bi + 1], 10) : 5000; // virtual ms
const WALL = 150000; // real ms; heavy canvas games render slowly headless
const folders = args.filter((a, i) => !a.startsWith('--') && !(bi >= 0 && i === bi + 1));

function findChrome() {
  const c = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const hit = c.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('Chrome not found — set CHROME=/path/to/chrome');
  return hit;
}

const chrome = findChrome();
const report = {};
let failed = 0;

for (const folder of folders) {
  let g;
  try {
    g = loadGame(folder);
  } catch (e) {
    console.error(`FAIL  ${e.message}`);
    report[folder] = { ok: false, error: e.message };
    failed++;
    continue;
  }
  const url = pathToFileURL(path.join(g.dir, g.entry)).href + '#autostart';
  const r = spawnSync(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--mute-audio',
      '--window-size=420,860',
      '--enable-logging=stderr',
      '--v=0',
      `--virtual-time-budget=${budget}`,
      '--dump-dom',
      url,
    ],
    { encoding: 'utf8', timeout: WALL, maxBuffer: 64 * 1024 * 1024 },
  );
  const lines = (r.stderr || '').split(/\r?\n/).filter((l) => /CONSOLE|Uncaught/.test(l));
  const consoleMsgs = lines.map((l) => (l.match(/"(.*)", source:/) || [, l])[1]);
  const errors = consoleMsgs.filter((m) => /Uncaught|TypeError|ReferenceError|SyntaxError/.test(m));
  const autotest = consoleMsgs.filter((m) => m.startsWith('AUTOTEST'));
  const badAuto = autotest.filter((m) => /FAIL|MISMATCH|\bNaN\b|nan=true/.test(m));
  const problems = [...errors, ...badAuto];
  // A wall-clock timeout with no errors = slow software rendering, not a broken game.
  const slow = r.error?.code === 'ETIMEDOUT';
  if (r.error && !slow) problems.push(`chrome: ${r.error.message}`);
  if (g.autotest === true && autotest.length === 0) problems.push('autotest: true but no AUTOTEST output');

  const ok = problems.length === 0;
  report[g.id] = { ok, slow, autotest, errors: problems };
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${g.id}${slow ? ' (slow: hit wall-clock limit, no errors seen)' : ''}${autotest.length ? '  ' + autotest.join(' | ') : ''}`);
  for (const p of problems) console.log(`      ${p}`);
  if (!ok) failed++;
}

if (process.env.TEST_REPORT) fs.writeFileSync(process.env.TEST_REPORT, JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
