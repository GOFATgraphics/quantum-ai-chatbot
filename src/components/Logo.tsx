type Props = {
  size?: number
  className?: string
  /** When true, use light mark (for dark backgrounds). When false, use dark mark (for light backgrounds). */
  dark?: boolean
  /** Subtle floating animation */
  animated?: boolean
}

/** Quantumy brand mark — Planet Chase */
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
      style={{
        filter: dark
          ? 'drop-shadow(0 2px 12px rgba(255, 255, 255, 0.12))'
          : 'drop-shadow(0 2px 10px rgba(0, 0, 0, 0.18))',
      }}
    />
  )
}
