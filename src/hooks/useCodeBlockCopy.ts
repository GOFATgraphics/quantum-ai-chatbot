import { useEffect } from 'react'

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
      const text = codeEl?.textContent || ''
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
