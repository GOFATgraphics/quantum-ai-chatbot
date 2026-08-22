import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, ArrowLeft, Check, Loader2, Briefcase, Sparkles, Target, User } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Logo from './Logo'

type Props = {
  onComplete: (profile: { preferredName: string }) => void
}

const GOALS = [
  { id: 'email', label: 'Email & inbox' },
  { id: 'docs', label: 'Docs & Drive' },
  { id: 'writing', label: 'Writing & drafts' },
  { id: 'planning', label: 'Planning & focus' },
  { id: 'research', label: 'Research' },
  { id: 'coding', label: 'Coding & tech' },
]

const STEPS = ['welcome', 'name', 'birthday', 'role', 'goals', 'done'] as const
type Step = (typeof STEPS)[number]

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [role, setRole] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idx = STEPS.indexOf(step)
  const progress = ((idx + 1) / STEPS.length) * 100

  const toggleGoal = (id: string) => {
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))
  }

  const next = () => {
    setError(null)
    if (step === 'name' && !name.trim()) {
      setError('Please enter a name we can use.')
      return
    }
    const i = STEPS.indexOf(step)
    if (i < STEPS.length - 1) setStep(STEPS[i + 1])
  }

  const back = () => {
    setError(null)
    const i = STEPS.indexOf(step)
    if (i > 0) setStep(STEPS[i - 1])
  }

  const finish = async () => {
    setSaving(true)
    setError(null)
    try {
      const preferredName = name.trim()
      const { error: err } = await supabase.auth.updateUser({
        data: {
          preferred_name: preferredName,
          full_name: preferredName,
          date_of_birth: dob || null,
          role: role.trim() || null,
          goals,
          onboarding_complete: true,
        },
      })
      if (err) throw err
      onComplete({ preferredName })
    } catch (e: any) {
      setError(e.message || 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const card =
    'w-full max-w-md rounded-[28px] bg-card/95 backdrop-blur-xl border border-border shadow-[0_24px_80px_rgba(0,0,0,0.18)] p-6 sm:p-8'

  return (
    <div className="min-h-dvh w-full flex flex-col items-center justify-center relative overflow-hidden px-5 py-10 bg-background">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[520px] h-[360px] rounded-full bg-foreground/10 blur-[110px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-foreground/5 blur-[90px]" />
      </div>

      <div className="relative z-10 w-full max-w-md mb-6">
        <div className="h-1 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-primary"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={`relative z-10 ${card}`}
        >
          {step === 'welcome' && (
            <div className="text-center">
              <div className="flex justify-center mb-5">
                {/* Light card → dark sphere mark */}
                <Logo size={72} dark={false} />
              </div>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">Welcome to Quantumy</h1>
              <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">
                A few quick questions so we can personalize how we work together. Takes under a minute.
              </p>
              <button type="button" onClick={next} className="mt-8 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition">
                Get started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {step === 'name' && (
            <div>
              <div className="w-11 h-11 rounded-2xl bg-secondary text-foreground flex items-center justify-center mb-4">
                <User className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">What should we call you?</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">This is how Quantumy will greet you.</p>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} placeholder="e.g. Shehu" className="mt-5 w-full h-12 rounded-2xl px-4 text-[16px] outline-none border border-border focus:border-ring focus:ring-2 focus:ring-ring/20 bg-muted" />
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={back} className="h-12 w-12 rounded-2xl border border-border flex items-center justify-center text-muted-foreground hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
                <button type="button" onClick={next} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition">Continue</button>
              </div>
            </div>
          )}

          {step === 'birthday' && (
            <div>
              <div className="w-11 h-11 rounded-2xl bg-secondary text-foreground flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">When’s your birthday?</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Optional — helps with personal touches. You can skip.</p>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-5 w-full h-12 rounded-2xl px-4 text-[16px] outline-none border border-border focus:border-ring focus:ring-2 focus:ring-ring/20 bg-muted" />
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={back} className="h-12 w-12 rounded-2xl border border-border flex items-center justify-center text-muted-foreground hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
                <button type="button" onClick={next} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition">{dob ? 'Continue' : 'Skip'}</button>
              </div>
            </div>
          )}

          {step === 'role' && (
            <div>
              <div className="w-11 h-11 rounded-2xl bg-secondary text-foreground flex items-center justify-center mb-4">
                <Briefcase className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">What do you do?</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Role, company, or how you spend your days.</p>
              <input autoFocus value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} placeholder="e.g. Product designer at Acme" className="mt-5 w-full h-12 rounded-2xl px-4 text-[16px] outline-none border border-border focus:border-ring focus:ring-2 focus:ring-ring/20 bg-muted" />
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={back} className="h-12 w-12 rounded-2xl border border-border flex items-center justify-center text-muted-foreground hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
                <button type="button" onClick={next} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition">{role.trim() ? 'Continue' : 'Skip'}</button>
              </div>
            </div>
          )}

          {step === 'goals' && (
            <div>
              <div className="w-11 h-11 rounded-2xl bg-secondary text-foreground flex items-center justify-center mb-4">
                <Target className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">What should Quantumy help with?</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">Pick any that apply. You can change this later.</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {GOALS.map((g) => {
                  const on = goals.includes(g.id)
                  return (
                    <button key={g.id} type="button" onClick={() => toggleGoal(g.id)} className={`h-11 rounded-2xl text-sm font-medium border transition flex items-center justify-center gap-1.5 ${
                      on ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-foreground border-border hover:border-ring'
                    }`}>
                      {on && <Check className="w-3.5 h-3.5" />}
                      {g.label}
                    </button>
                  )
                })}
              </div>
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={back} className="h-12 w-12 rounded-2xl border border-border flex items-center justify-center text-muted-foreground hover:bg-accent"><ArrowLeft className="w-4 h-4" /></button>
                <button type="button" onClick={next} className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition">Continue</button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="flex justify-center mb-4">
                {/* Light card → dark sphere mark */}
                <Logo size={64} dark={false} />
              </div>
              <h2 className="text-2xl font-semibold text-foreground tracking-tight">
                You’re all set{name.trim() ? `, ${name.trim()}` : ''}
              </h2>
              <p className="mt-2 text-[15px] text-muted-foreground leading-relaxed">
                Quantumy will use your preferences to help with email, files, and day-to-day work.
              </p>
              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
              <button type="button" onClick={finish} disabled={saving} className="mt-8 w-full h-12 rounded-2xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Start chatting <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
