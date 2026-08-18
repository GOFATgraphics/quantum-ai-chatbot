const fs = require('fs')
const zlib = require('zlib')
const path = require('path')
const root = path.join(__dirname, '..')
const b64Path = path.join(root, 'src/App.tsx.zlib.b64')
const outPath = path.join(root, 'src/App.tsx')
if (!fs.existsSync(b64Path)) {
  console.log('inflate-app: no src/App.tsx.zlib.b64, skip')
  process.exit(0)
}
const b64 = fs.readFileSync(b64Path, 'utf8').trim()
const buf = zlib.inflateSync(Buffer.from(b64, 'base64'))
fs.writeFileSync(outPath, buf)
console.log('inflate-app: wrote src/App.tsx (' + buf.length + ' bytes)')
