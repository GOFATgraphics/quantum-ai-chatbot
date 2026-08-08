type Props = {
  size?: number
  className?: string
  /** When true, use the light pearl mark (visible on dark backgrounds) */
  dark?: boolean
}

/** Quantumy brand mark — dark sphere for light UI, pearl mark for dark UI */
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
