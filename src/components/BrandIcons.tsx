/** Official-style brand marks for connectors */

type IconProps = { size?: number; className?: string }

export function GmailIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#EA4335" d="M12 13.5L3.75 7.2V18c0 .83.67 1.5 1.5 1.5h2.25V11.7L12 16.05l4.5-4.35V19.5H18.75c.83 0 1.5-.67 1.5-1.5V7.2L12 13.5z" />
      <path fill="#34A853" d="M18.75 4.5H16.5L12 7.95 7.5 4.5H5.25c-.45 0-.87.2-1.15.54L12 11.55l7.9-6.51A1.5 1.5 0 0 0 18.75 4.5z" />
      <path fill="#FBBC04" d="M5.25 4.5v7.2l-2.65-2.04A1.5 1.5 0 0 1 3.75 4.5h1.5z" />
      <path fill="#4285F4" d="M18.75 4.5h1.5c.55 0 1.05.3 1.32.78L18.75 11.7V4.5z" />
    </svg>
  )
}

export function DriveIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M8.18 4.5h7.64L19.5 11H11.86L8.18 4.5z" />
      <path fill="#34A853" d="M4.5 19.5h6.36L14.55 12H8.18L4.5 19.5z" />
      <path fill="#FBBC04" d="M15.82 19.5H19.5l-3.68-7.5h-3.69l3.69 7.5z" />
    </svg>
  )
}

export function SheetsIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#0F9D58" d="M14.25 3H6.75A1.5 1.5 0 0 0 5.25 4.5v15A1.5 1.5 0 0 0 6.75 21h10.5a1.5 1.5 0 0 0 1.5-1.5V7.5L14.25 3z" />
      <path fill="#87CEAC" d="M14.25 3v4.5h4.5L14.25 3z" />
      <path fill="#fff" d="M8.25 10.5h7.5v1.2H8.25v-1.2zm0 2.4h7.5v1.2H8.25v-1.2zm0 2.4h5.25v1.2H8.25v-1.2z" />
    </svg>
  )
}
