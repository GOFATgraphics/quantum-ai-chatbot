import { useState } from 'react'
import { Copy, Check, ThumbsUp, ThumbsDown, Volume2, Share2 } from 'lucide-react'

type Props = {
  content: string
  dark: boolean
}

export default function MessageActions({ content, dark }: Props) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState<'up' | 'down' | null>(null)

  const muted = dark
    ? 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.08]'
    : 'text-slate-400 hover:text-slate-700 hover:bg-black/[0.04]'
  const active = dark
    ? 'text-indigo-300 bg-indigo-500/15'
    : 'text-indigo-600 bg-indigo-50'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const speak = () => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(content.replace(/[#*_`]/g, ''))
    u.rate = 1
    window.speechSynthesis.speak(u)
  }

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: content })
      } else {
        await navigator.clipboard.writeText(content)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div
      className={`inline-flex items-center gap-0.5 mt-2.5 px-1 py-0.5 rounded-full ${
        dark ? 'bg-white/[0.03]' : 'bg-black/[0.02]'
      }`}
    >
      <button type="button" onClick={copy} className={`p-1.5 rounded-full transition ${muted}`} title="Copy">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <button type="button" onClick={share} className={`p-1.5 rounded-full transition ${muted}`} title="Share">
        <Share2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={speak} className={`p-1.5 rounded-full transition ${muted}`} title="Read aloud">
        <Volume2 className="w-3.5 h-3.5" />
      </button>
      <span className={`w-px h-3 mx-0.5 ${dark ? 'bg-white/10' : 'bg-black/8'}`} />
      <button
        type="button"
        onClick={() => setLiked(liked === 'up' ? null : 'up')}
        className={`p-1.5 rounded-full transition ${liked === 'up' ? active : muted}`}
        title="Good response"
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setLiked(liked === 'down' ? null : 'down')}
        className={`p-1.5 rounded-full transition ${liked === 'down' ? active : muted}`}
        title="Bad response"
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
