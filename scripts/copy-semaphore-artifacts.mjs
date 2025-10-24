#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const depth = Number(process.env.SNARK_DEPTH || 20);
const srcDir = path.join(repoRoot, 'node_modules/@zk-kit/semaphore-artifacts');
const dstDir = path.join(repoRoot, 'apps/web-app/public/artifacts');

const files = [
  { src: `semaphore-${depth}.wasm`, dst: 'semaphore.wasm' },
  { src: `semaphore-${depth}.zkey`, dst: 'semaphore.zkey' }
];

if (!fs.existsSync(srcDir)) {
  console.error('[artifacts] Source not found:', srcDir);
  process.exit(1);
}
fs.mkdirSync(dstDir, { recursive: true });

for (const f of files) {
  const from = path.join(srcDir, f.src);
  const to = path.join(dstDir, f.dst);
  if (!fs.existsSync(from)) {
    console.error(`[artifacts] Missing ${from}. Set SNARK_DEPTH to match available files.`);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
  console.log(`[artifacts] Copied ${from} -> ${to}`);
}

console.log('[artifacts] Done.');

