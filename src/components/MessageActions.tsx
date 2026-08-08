import { useState } from 'react'
import { Copy, Check, ThumbsUp, ThumbsDown, Volume2, Share2 } from 'lucide-react'

type Props = {
  content: string
  dark: boolean
}

export default function MessageActions({ content, dark }: Props) {
  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState<'up' | 'down' | null>(null)

  const muted = dark ? 'text-slate-500 hover:text-slate-300 hover:bg-white/5' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
  const active = dark ? 'text-indigo-300 bg-indigo-500/10' : 'text-indigo-600 bg-indigo-50'

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
    <div className="flex items-center gap-0.5 mt-2 ml-0.5">
      <button type="button" onClick={copy} className={`p-1.5 rounded-full transition ${muted}`} title="Copy">
        {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
      </button>
      <button type="button" onClick={share} className={`p-1.5 rounded-full transition ${muted}`} title="Share">
        <Share2 className="w-4 h-4" />
      </button>
      <button type="button" onClick={speak} className={`p-1.5 rounded-full transition ${muted}`} title="Read aloud">
        <Volume2 className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => setLiked(liked === 'up' ? null : 'up')}
        className={`p-1.5 rounded-full transition ${liked === 'up' ? active : muted}`}
        title="Good response"
      >
        <ThumbsUp className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => setLiked(liked === 'down' ? null : 'down')}
        className={`p-1.5 rounded-full transition ${liked === 'down' ? active : muted}`}
        title="Bad response"
      >
        <ThumbsDown className="w-4 h-4" />
      </button>
    </div>
  )
}
