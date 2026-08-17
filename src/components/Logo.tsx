type Props = {
  size?: number
  className?: string
  /** When true, use pearl mark (for dark backgrounds). When false, use dark sphere (for light backgrounds). */
  dark?: boolean
  /** Subtle floating animation */
  animated?: boolean
}

/** Quantumy brand mark — orbital sphere with quantum core */
export default function Logo({ size = 32, className = '', dark = false, animated = false }: Props) {
  const src = dark ? '/logo-dark.svg' : '/logo.svg'
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
      style={{ filter: 'grayscale(1)' }}
    />
  )
}
