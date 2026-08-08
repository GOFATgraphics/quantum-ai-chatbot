import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Props = { dark: boolean }

export default function InstallPWA({ dark }: Props) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem('quantum-pwa-dismissed')
    if (dismissed === '1') return

    const ua = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    if (standalone) return

    if (ios) {
      setIsIOS(true)
      setVisible(true)
      return
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem('quantum-pwa-dismissed', '1')
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    setVisible(false)
  }

  if (!visible) return null

  const card = dark
    ? 'bg-[#12121a]/95 border-white/10 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900'

  return (
    <div className="fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] left-3 right-3 sm:left-auto sm:right-6 sm:w-[340px] z-40">
      <div className={`rounded-2xl border shadow-xl backdrop-blur-xl px-4 py-3.5 ${card}`}>
        <div className="flex items-start gap-3">
          <img src="/logo.svg" alt="" width={36} height={36} className="shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Install Quantumy</p>
            <p className={`text-xs mt-0.5 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
              {isIOS
                ? 'Tap Share, then “Add to Home Screen” for the full app.'
                : 'Add to your home screen — faster launch on phone and desktop.'}
            </p>
            <div className="flex gap-2 mt-2.5">
              {!isIOS && deferred && (
                <button
                  onClick={install}
                  className="h-8 px-3 rounded-full text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Install
                </button>
              )}
              <button
                onClick={dismiss}
                className={`h-8 px-3 rounded-full text-xs font-medium ${dark ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={dismiss} className={`p-1 rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
            <X className="w-4 h-4 opacity-50" />
          </button>
        </div>
      </div>
    </div>
  )
}
