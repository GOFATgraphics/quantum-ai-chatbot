type Props = {
  size?: number
  className?: string
  /** Kept for API compatibility; pearl mark is used for both themes */
  dark?: boolean
}

/** Quantumy brand mark — pearl sphere, readable on light and dark backgrounds */
export default function Logo({ size = 32, className = '' }: Props) {
  return (
    <img
      src="/logo-dark.svg"
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
