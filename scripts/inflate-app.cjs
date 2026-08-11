#!/usr/bin/env node
/**
 * Restores src/App.tsx from compressed blob (used after emergency restore).
 * Runs automatically via prebuild / predev.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');
const blobPath = path.join(root, 'src', 'App.tsx.zlib.b64');
const outPath = path.join(root, 'src', 'App.tsx');

if (!fs.existsSync(blobPath)) {
  console.log('[inflate-app] no blob, skip');
  process.exit(0);
}

const b64 = fs.readFileSync(blobPath, 'utf8').trim();
const buf = zlib.inflateSync(Buffer.from(b64, 'base64'));
fs.writeFileSync(outPath, buf);
console.log('[inflate-app] restored src/App.tsx (' + buf.length + ' bytes)');
