import { useEffect, useState } from 'react'

type Props = {
  size?: number
  className?: string
  /**
   * Explicit theme override.
   * - true  → white mark (dark backgrounds)
   * - false → black mark (light backgrounds)
   * - omit  → auto-follow html.dark
   */
  dark?: boolean
  animated?: boolean
}

/** Cache-bust so browsers/SW pick up new monochrome assets */
const ASSET_V = 'v9'

function readIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/** Quantumy brand mark — pure black / white orbital sphere */
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
  const src = isDark ? `/logo-dark.svg?${ASSET_V}` : `/logo.svg?${ASSET_V}`

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
    />
  )
}
