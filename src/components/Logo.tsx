type Props = {
  size?: number
  className?: string
  /** When true, use pearl mark (for dark backgrounds). When false, use dark sphere (for light backgrounds). */
  dark?: boolean
}

/** Quantumy brand mark — dark sphere on light UI, pearl on dark UI */
export default function Logo({ size = 32, className = '', dark = false }: Props) {
  const src = dark ? '/logo-dark.svg' : '/logo.svg'
  return (
    <img
      src={src}
      alt="Quantumy"
      width={size}
      height={size}
      className={className}
      draggable={false}
      decoding="async"
      fetchPriority={size >= 48 ? 'high' : 'auto'}
    />
  )
}
