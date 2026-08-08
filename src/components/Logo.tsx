type Props = {
  size?: number
  className?: string
}

export default function Logo({ size = 32, className = '' }: Props) {
  return (
    <img
      src="/logo.svg"
      alt="Quantumy"
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}
