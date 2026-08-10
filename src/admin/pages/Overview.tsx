type Props = {
  dark: boolean
}

export default function Overview({ dark }: Props) {
  const cards = [
    { label: 'Total users', value: '—', hint: 'Coming in Batch 2' },
    { label: 'Conversations', value: '—', hint: 'Coming in Batch 2' },
    { label: 'Messages today', value: '—', hint: 'Coming in Batch 2' },
    { label: 'Active connectors', value: '—', hint: 'Coming in Batch 2' },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className={`text-xl font-semibold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
          Overview
        </h2>
        <p className={`mt-1 text-sm ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          Product metrics will appear here in the next batch.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-2xl border p-4 ${
              dark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className={`text-[11px] font-medium uppercase tracking-wider ${dark ? 'text-slate-500' : 'text-slate-400'}`}>
              {c.label}
            </div>
            <div className={`mt-2 text-2xl font-semibold tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>
              {c.value}
            </div>
            <div className={`mt-1 text-xs ${dark ? 'text-slate-600' : 'text-slate-400'}`}>{c.hint}</div>
          </div>
        ))}
      </div>

      <div
        className={`rounded-2xl border p-5 ${
          dark ? 'bg-white/[0.03] border-white/10' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <h3 className={`text-sm font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>Admin shell ready</h3>
        <p className={`mt-1.5 text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
          You are viewing the protected admin area. Only users with{' '}
          <code className={`text-xs px-1.5 py-0.5 rounded ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>is_admin = true</code>{' '}
          can access this page. Next we will wire real stats from Supabase.
        </p>
      </div>
    </div>
  )
}
