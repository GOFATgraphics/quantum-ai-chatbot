import { useState, useEffect } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

function readStoredMode(): ThemeMode {
  try {
    const t = localStorage.getItem('quantumy-theme')
    if (t === 'dark' || t === 'light' || t === 'system') return t
  } catch { /* ignore */ }
  return 'system'
}

// Background/foreground come from the --background/--foreground design
// tokens (src/index.css) — never hardcode a hex here, or this drifts from
// the token values again.
function applyThemeDom(dark: boolean, themeMode: ThemeMode) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  // Instant switch — no CSS transition on theme tokens
  root.style.setProperty('color-scheme', dark ? 'dark' : 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? 'hsl(0 0% 19%)' : 'hsl(0 0% 100%)')
  try {
    localStorage.setItem('quantumy-theme', themeMode)
  } catch { /* ignore */ }
}

export function useTheme() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(readStoredMode)
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const dark = themeMode === 'dark' || (themeMode === 'system' && systemDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    onChange()
    mq.addEventListener?.('change', onChange)
    mq.addListener?.(onChange)
    return () => {
      mq.removeEventListener?.('change', onChange)
      mq.removeListener?.(onChange)
    }
  }, [])

  // Apply immediately on every theme change (no transition delay)
  useEffect(() => {
    applyThemeDom(dark, themeMode)
  }, [dark, themeMode])

  const cycleTheme = () => {
    setThemeMode((m) => {
      const next = m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system'
      const nextDark = next === 'dark' || (next === 'system' && systemDark)
      // Synchronous DOM update so the switch feels instant
      applyThemeDom(nextDark, next)
      return next
    })
  }

  const setDark = (updater: boolean | ((d: boolean) => boolean)) => {
    const next = typeof updater === 'function' ? updater(dark) : updater
    const mode: ThemeMode = next ? 'dark' : 'light'
    applyThemeDom(next, mode)
    setThemeMode(mode)
  }

  return { dark, themeMode, setThemeMode, setDark, cycleTheme, systemDark }
}
