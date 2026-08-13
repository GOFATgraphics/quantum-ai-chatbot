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

// PWA: register SW and force clients onto the latest version after deploys
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      reg.update().catch(() => {})
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
