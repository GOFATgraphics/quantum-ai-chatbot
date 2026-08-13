import { useEffect } from 'react'

/** If clipboard text is percent-encoded (e.g. Subject:%20Re%3A...), return plain text. */
function decodeForPaste(raw: string): string {
  const s = String(raw || '')
  if (!s) return s
  const pct = (s.match(/%[0-9A-Fa-f]{2}/g) || []).length
  if (pct < 3) return s
  const ratio = pct / Math.max(1, s.length / 3)
  if (ratio < 0.05 && !/%20|%0A|%3A|%2C/i.test(s)) return s
  try {
    let out = s
    for (let i = 0; i < 3; i++) {
      if (!/%[0-9A-Fa-f]{2}/.test(out)) break
      const next = decodeURIComponent(out.replace(/\+/g, ' '))
      if (next === out) break
      out = next
    }
    const stillPct = (out.match(/%[0-9A-Fa-f]{2}/g) || []).length
    if (stillPct < pct && out.includes(' ')) return out
    if (pct >= 5 && out.length > 0) return out
    return s
  } catch {
    return s
  }
}

/** Copy button on fenced ``` code blocks rendered by formatMarkdown */
export function useCodeBlockCopy() {
  useEffect(() => {
    const onClick = async (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      const btn = t?.closest?.('[data-copy-code]') as HTMLElement | null
      if (!btn) return
      e.preventDefault()
      const block = btn.closest('.md-codeblock')
      const codeEl = block?.querySelector('code')
      const text = decodeForPaste(codeEl?.textContent || '')
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        const prev = btn.textContent
        btn.textContent = 'Copied'
        btn.setAttribute('data-copied', '1')
        window.setTimeout(() => {
          btn.textContent = prev || 'Copy'
          btn.removeAttribute('data-copied')
        }, 1600)
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
}
