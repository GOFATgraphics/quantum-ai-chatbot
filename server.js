/**
 * Production server for Render.
 * Reuses the existing Vercel-style handlers in /api without rewriting them.
 */
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.set('trust proxy', 1)

// Chat + file attachments can be large; SSE streams run for minutes.
app.use(express.json({ limit: '30mb' }))
app.use(express.urlencoded({ extended: true, limit: '30mb' }))
app.use((req, res, next) => {
  req.setTimeout(0)
  res.setTimeout(0)
  next()
})

const handlerCache = new Map()

async function loadHandler(relPath) {
  const normalized = relPath.replace(/^\/+/, '').replace(/\/+$/, '')
  if (handlerCache.has(normalized)) return handlerCache.get(normalized)
  const file = path.join(__dirname, 'api', `${normalized}.js`)
  if (!fs.existsSync(file)) {
    handlerCache.set(normalized, null)
    return null
  }
  const mod = await import(pathToFileURL(file).href)
  const handler = mod.default
  handlerCache.set(normalized, handler || null)
  return handler || null
}

app.all(/^\/api(?:\/|$)/, async (req, res) => {
  const rel = req.path.replace(/^\/api\/?/, '').replace(/\/+$/, '')
  if (!rel) return res.status(404).json({ error: 'Not found' })
  try {
    const handler = await loadHandler(rel)
    if (!handler) return res.status(404).json({ error: `No API route: /api/${rel}` })
    await handler(req, res)
  } catch (err) {
    console.error('API adapter error:', err)
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Internal server error' })
    }
  }
})

const dist = path.join(__dirname, 'dist')
app.use(
  express.static(dist, {
    setHeaders(res, filePath) {
      if (filePath.endsWith(`${path.sep}sw.js`) || filePath.endsWith('/sw.js')) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  }),
)

app.get('*', (req, res) => {
  res.sendFile(path.join(dist, 'index.html'))
})

const port = Number(process.env.PORT) || 10000
app.listen(port, '0.0.0.0', () => {
  console.log(`Quantumy listening on ${port}`)
})
