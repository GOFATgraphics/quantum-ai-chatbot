/** Brand marks for connectors — approximate official colors/shapes */

type IconProps = { size?: number; className?: string }

export function GmailIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size * (40 / 48)} viewBox="0 0 48 40" className={className} aria-hidden>
      <path fill="#4285F4" d="M4 16h10v20.5A3.5 3.5 0 0 1 10.5 40H8a4 4 0 0 1-4-4V16z" />
      <path fill="#34A853" d="M44 16H34v20.5a3.5 3.5 0 0 0 3.5 3.5H40a4 4 0 0 0 4-4V16z" />
      <path fill="#C5221F" d="M4 16V7.5A3.5 3.5 0 0 1 7.5 4H10a4 4 0 0 1 4 4v3.3L4 18.5V16z" />
      <path fill="#FBBC04" d="M44 16V7.5A3.5 3.5 0 0 0 40.5 4H38a4 4 0 0 0-4 4v3.3l10 7.2V16z" />
      <path fill="#EA4335" d="M4 15.5 24 30 44 15.5v-6a3.5 3.5 0 0 0-5.6-2.8L24 17 9.6 6.7A3.5 3.5 0 0 0 4 9.5v6z" />
    </svg>
  )
}

export function DriveIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#188038" d="M18 6h12l6.5 11.3h-25L18 6z" />
      <path fill="#34A853" d="M6.5 30 18 10.5 24.5 21.5 13 41Z" />
      <path fill="#FBBC04" d="M30 10.5 41.5 30 30 41 24.5 21.5Z" />
      <path fill="#4285F4" d="M13 41h22l-5.5-9.5H18.5Z" />
      <path fill="#EA4335" d="M35.5 31.5 41.5 30 35 41 29.5 31.5Z" />
    </svg>
  )
}

export function SheetsIcon({ size = 22, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#0F9D58" d="M12 4h16l8 8v30a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      <path fill="#0A7A44" d="M28 4v8h8L28 4z" />
      <rect x="15" y="18" width="18" height="16" rx="1" fill="#fff" />
      <rect x="17.3" y="20.3" width="6" height="5" fill="#0F9D58" />
      <rect x="24.7" y="20.3" width="6" height="5" fill="#0F9D58" />
      <rect x="17.3" y="26.7" width="6" height="5" fill="#0F9D58" />
      <rect x="24.7" y="26.7" width="6" height="5" fill="#0F9D58" />
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
      <path fill="#547DBF" d="M10 6h22v14H10z" />
      <path fill="#3E6AB0" d="M32 6h6a2 2 0 0 1 2 2v12h-8z" />
      <path fill="#FBBC04" d="M32 20h8v14h-8z" />
      <path fill="#188038" d="M10 34h8v8h-6a2 2 0 0 1-2-2z" />
      <path fill="#34A853" d="M18 34h14v8H18z" />
      <path fill="#EA4335" d="M32 34h8v6a2 2 0 0 1-2 2h-6z" />
      <path fill="#547DBF" d="M10 20h8v14h-8z" />
      <rect x="18" y="20" width="14" height="14" fill="#fff" />
      <text x="25" y="31.5" textAnchor="middle" fontSize="13.5" fontWeight="700" fill="#547DBF" fontFamily="Arial,sans-serif">31</text>
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
