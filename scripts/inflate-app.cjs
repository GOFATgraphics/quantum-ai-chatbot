#!/usr/bin/env node
/**
 * Restores src/App.tsx from compressed blob (used after emergency restore).
 * Supports single App.tsx.zlib.b64 or split App.tsx.zlib.b64.0 + .1
 * Runs automatically via prebuild / predev.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'src', 'App.tsx');
const single = path.join(root, 'src', 'App.tsx.zlib.b64');
const p0 = path.join(root, 'src', 'App.tsx.zlib.b64.0');
const p1 = path.join(root, 'src', 'App.tsx.zlib.b64.1');

let b64 = '';
if (fs.existsSync(p0) && fs.existsSync(p1)) {
  b64 = fs.readFileSync(p0, 'utf8').trim() + fs.readFileSync(p1, 'utf8').trim();
  console.log('[inflate-app] using split blobs');
} else if (fs.existsSync(single)) {
  b64 = fs.readFileSync(single, 'utf8').trim();
  console.log('[inflate-app] using single blob');
} else {
  console.log('[inflate-app] no blob, skip');
  process.exit(0);
}

try {
  const buf = zlib.inflateSync(Buffer.from(b64, 'base64'));
  fs.writeFileSync(outPath, buf);
  console.log('[inflate-app] restored src/App.tsx (' + buf.length + ' bytes)');
} catch (e) {
  console.error('[inflate-app] inflate failed:', e.message);
  process.exit(1);
}
