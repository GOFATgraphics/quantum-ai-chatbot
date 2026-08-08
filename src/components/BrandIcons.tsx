/** Brand marks for connectors — approximate official colors/shapes */

type IconProps = { size?: number; className?: string }

export function GmailIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#4285F4" d="M6 10v24.5c0 1.4 1.1 2.5 2.5 2.5H14V22.2l10 7.7 10-7.7V37h5.5c1.4 0 2.5-1.1 2.5-2.5V10L24 23.5 6 10z" />
      <path fill="#34A853" d="M42 10H37L24 20.1 11 10H6l18 13.9L42 10z" />
      <path fill="#EA4335" d="M6 10l18 13.9L42 10v-1.5c0-1.4-1.1-2.5-2.5-2.5H8.5C7.1 6 6 7.1 6 8.5V10z" />
      <path fill="#C5221F" d="M6 10v24.5c0 1.4 1.1 2.5 2.5 2.5H14V22.2L6 16.1V10z" />
      <path fill="#FBBC04" d="M42 10v6.1l-8 6.1V37h5.5c1.4 0 2.5-1.1 2.5-2.5V10z" />
    </svg>
  )
}

export function DriveIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#4285F4" d="M16.5 38h15L38.25 26H22.5L16.5 38z" />
      <path fill="#34A853" d="M9.75 26L16.5 38h15L24.75 26H9.75z" />
      <path fill="#FBBC04" d="M24.75 10L9.75 26h15l15-16H24.75z" />
      <path fill="#188038" d="M16.5 38l7.5-12h-15L16.5 38z" />
      <path fill="#1967D2" d="M31.5 38l6.75-12h-15L31.5 38z" />
      <path fill="#FABB05" d="M24.75 10l7.5 16h15L39.75 10H24.75z" />
    </svg>
  )
}

export function SheetsIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#0F9D58" d="M10 6h20l8 8v28a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path fill="#87CEAC" d="M30 6v8h8L30 6z" />
      <path fill="#fff" d="M16 20h16v2.5H16V20zm0 5h16v2.5H16V25zm0 5h16v2.5H16V30zm0 5h10v2.5H16V35z" />
      <path fill="#fff" fillOpacity=".9" d="M16 20h2.5v17.5H16zM25.5 20H28v17.5h-2.5z" />
    </svg>
  )
}

export function DocsIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#4285F4" d="M10 6h20l8 8v28a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
      <path fill="#A1C2FA" d="M30 6v8h8L30 6z" />
      <path fill="#fff" d="M16 22h16v2.2H16V22zm0 5h16v2.2H16V27zm0 5h16v2.2H16V32zm0 5h10v2.2H16V37z" />
    </svg>
  )
}

export function CalendarIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#1A73E8" d="M8 10h32a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z" />
      <path fill="#4285F4" d="M6 12h36v8H6z" />
      <path fill="#EA4335" d="M34 12h10v8H34z" />
      <path fill="#FBBC04" d="M34 20h10v14H34z" />
      <path fill="#34A853" d="M6 34h28v8H6z" />
      <path fill="#188038" d="M6 20h8v22H6z" />
      <rect x="14" y="22" width="18" height="14" rx="1" fill="#fff" />
      <text x="23" y="34" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1A73E8" fontFamily="system-ui,sans-serif">31</text>
    </svg>
  )
}

export function OutlookIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#0A66C2" d="M22 12h18a2 2 0 0 1 2 2v20a2 2 0 0 1-2 2H22V12z" />
      <path fill="#28A8EA" d="M22 16h20v16H22z" />
      <path fill="#0364B8" d="M8 14h18v20H8a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" />
      <path fill="#0A66C2" d="M8 14h16v20H8a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" />
      <circle cx="16" cy="24" r="5.5" fill="#fff" />
      <text x="16" y="27.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0A66C2" fontFamily="system-ui,sans-serif">O</text>
    </svg>
  )
}

export function ExcelIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#185C37" d="M18 10h22a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H18V10z" />
      <path fill="#21A366" d="M18 14h24v20H18z" />
      <path fill="#107C41" d="M8 14h18v20H8a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" />
      <text x="15" y="28.5" textAnchor="middle" fontSize="14" fontWeight="800" fill="#fff" fontFamily="system-ui,sans-serif">X</text>
    </svg>
  )
}
