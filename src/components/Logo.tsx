import { useEffect, useState } from 'react'

type Props = {
  size?: number
  className?: string
  /**
   * Explicit theme override.
   * - true  → light mark (for dark backgrounds)
   * - false → dark mark (for light backgrounds)
   * - omit  → auto-follow html.dark
   */
  dark?: boolean
  animated?: boolean
}

function readIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/** Quantumy brand mark — monochrome orbital sphere */
export default function Logo({ size = 32, className = '', dark, animated = false }: Props) {
  const [autoDark, setAutoDark] = useState(readIsDark)

  useEffect(() => {
    if (dark !== undefined) return
    const root = document.documentElement
    const sync = () => setAutoDark(root.classList.contains('dark'))
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [dark])

  const isDark = dark !== undefined ? dark : autoDark
  const src = isDark ? '/logo-dark.svg' : '/logo.svg'

  return (
    <img
      src={src}
      alt="Quantumy"
      width={size}
      height={size}
      className={`${animated ? 'animate-float' : ''} ${className}`.trim()}
      draggable={false}
      decoding="async"
      fetchPriority={size >= 48 ? 'high' : 'auto'}
      style={{
        filter: isDark
          ? 'drop-shadow(0 2px 12px rgba(255,255,255,0.12))'
          : 'drop-shadow(0 2px 10px rgba(0,0,0,0.18))',
      }}
    />
  )
}
