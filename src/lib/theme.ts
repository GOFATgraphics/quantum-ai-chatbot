import { useState, useEffect } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

function readStoredMode(): ThemeMode {
  try {
    const t = localStorage.getItem('quantumy-theme')
    if (t === 'dark' || t === 'light' || t === 'system') return t
  } catch { /* ignore */ }
  return 'system'
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    const root = document.getElementById('root')
    if (root) {
      root.style.background = dark ? '#111114' : 'transparent'
      root.style.color = dark ? '#ececf1' : ''
    }
    document.body.style.backgroundColor = dark ? '#111114' : ''
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#111114' : '#eef2ff')
    try {
      localStorage.setItem('quantumy-theme', themeMode)
    } catch { /* ignore */ }
  }, [dark, themeMode])

  const cycleTheme = () => {
    setThemeMode((m) => (m === 'system' ? 'light' : m === 'light' ? 'dark' : 'system'))
  }

  const setDark = (updater: boolean | ((d: boolean) => boolean)) => {
    const next = typeof updater === 'function' ? updater(dark) : updater
    setThemeMode(next ? 'dark' : 'light')
  }

  return { dark, themeMode, setThemeMode, setDark, cycleTheme, systemDark }
}
