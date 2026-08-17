import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import App from './App.tsx'
import AdminApp from './admin/AdminApp.tsx'
import { useCodeBlockCopy } from './hooks/useCodeBlockCopy'
import './index.css'
import './index-part2.css'
import './animations.css'
import './chat-glow-modes.css'

function CodeCopyBoot({ children }: { children: React.ReactNode }) {
  useCodeBlockCopy()
  return <>{children}</>
}

const isAdminPath =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CodeCopyBoot>
      {isAdminPath ? <AdminApp /> : <App />}
      <Analytics />
    </CodeCopyBoot>
  </StrictMode>,
)

/**
 * PWA service worker registration + update handling.
 *
 * Debug helpers (DevTools console):
 *   await window.__quantumySW.version()
 *   await window.__quantumySW.clearCache()
 *   await window.__quantumySW.update()
 *   await window.__quantumySW.unregister()
 */
if ('serviceWorker' in navigator) {
  const swDebug = {
    async version() {
      const reg = await navigator.serviceWorker.getRegistration()
      const sw = navigator.serviceWorker.controller || reg?.active
      if (!sw) return { version: null, cache: null, controlling: false }
      return new Promise((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.data?.type === 'SW_VERSION') {
            navigator.serviceWorker.removeEventListener('message', onMsg)
            resolve({ ...e.data, controlling: !!navigator.serviceWorker.controller })
          }
        }
        navigator.serviceWorker.addEventListener('message', onMsg)
        sw.postMessage({ type: 'GET_VERSION' })
        setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', onMsg)
          resolve({ version: 'timeout', controlling: !!navigator.serviceWorker.controller })
        }, 2000)
      })
    },
    async clearCache() {
      const reg = await navigator.serviceWorker.getRegistration()
      const sw = navigator.serviceWorker.controller || reg?.active
      if (sw) sw.postMessage({ type: 'CLEAR_CACHE' })
      // Also clear Cache Storage from the page side
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      return { cleared: true }
    },
    async update() {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) return { updated: false }
      await reg.update()
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      return { updated: true }
    },
    async unregister() {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      return { unregistered: regs.length }
    },
  }

  ;(window as unknown as { __quantumySW: typeof swDebug }).__quantumySW = swDebug

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

      // If a new worker is already waiting, activate it
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      }

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            // New version ready — activate immediately
            worker.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })

      // Check for updates on load + periodically while the tab is open
      reg.update().catch(() => {})
      setInterval(() => {
        reg.update().catch(() => {})
      }, 5 * 60 * 1000)

      // Reload once when the new SW takes control (avoids mixed old/new assets)
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })
    } catch {
      /* offline / private mode */
    }
  })
}
