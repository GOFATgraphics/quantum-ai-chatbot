type Props = {
  dark: boolean
  value: number
  label: string
  /** Highlights the tile (e.g. a non-zero overdue count) */
  alert?: boolean
}

export default function StatTile({ dark, value, label, alert }: Props) {
  const card = dark ? 'bg-white/[0.04] ring-1 ring-white/10' : 'bg-black/[0.02] ring-1 ring-black/5'
  const alertCard = dark ? 'bg-rose-500/10 ring-1 ring-rose-400/25' : 'bg-rose-50 ring-1 ring-rose-200'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'

  return (
    <div className={`rounded-2xl px-3 py-3 ${alert ? alertCard : card}`}>
      <p className={`text-2xl font-semibold tabular-nums ${alert ? 'text-rose-500' : ''}`}>{value}</p>
      <p className={`text-[12px] ${alert ? 'text-rose-500/80' : muted}`}>{label}</p>
    </div>
  )
}
