type Props = {
  size?: number
  className?: string
}

/** Quantumy brand mark — always the current logo.svg */
export default function Logo({ size = 32, className = '' }: Props) {
  return (
    <img
      src="/logo.svg"
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
