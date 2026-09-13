/** Render cron: hit the notes-reminders endpoint the same way Vercel Cron did. */
const appUrl = (process.env.APP_URL || '').replace(/\/$/, '')
const secret = process.env.CRON_SECRET || ''
if (!appUrl) {
  console.error('APP_URL is required')
  process.exit(1)
}
const res = await fetch(`${appUrl}/api/cron/notes-reminders`, {
  method: 'GET',
  headers: secret ? { Authorization: `Bearer ${secret}` } : {},
})
const text = await res.text()
console.log(res.status, text.slice(0, 500))
if (!res.ok) process.exit(1)
