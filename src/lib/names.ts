/** Extract a friendly first name from profile or email */
export function getFirstName(
  fullName?: string | null,
  email?: string | null
): string {
  if (fullName && fullName.trim()) {
    const first = fullName.trim().split(/\s+/)[0]
    if (first) return capitalize(first)
  }

  if (email) {
    const local = email.split('@')[0] || ''
    // ahmad.gofat / ahmad_gofat / ahmadgofat123 → Ahmad
    const cleaned = local.replace(/[0-9]+/g, '')
    const parts = cleaned.split(/[._\-+]/)
    if (parts[0] && parts[0].length >= 2) return capitalize(parts[0])
    // CamelCase split: ahmadGofat → ahmad
    const camel = cleaned.match(/^[a-z]+/i)
    if (camel) return capitalize(camel[0])
  }

  return 'there'
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

export function getTimeGreeting(date = new Date()): string {
  const h = date.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 22) return 'Good evening'
  return 'Hello'
}
