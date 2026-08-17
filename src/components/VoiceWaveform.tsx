import { useEffect, useRef } from 'react'

type Props = {
  stream: MediaStream | null
  active: boolean
  dark?: boolean
  bars?: number
  className?: string
}

/**
 * Live mic waveform (Grok-style) driven by Web Audio AnalyserNode.
 * Falls back to a gentle CSS pulse if analyser isn't available.
 */
export default function VoiceWaveform({ stream, active, dark = true, bars = 24, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  useEffect(() => {
    if (!active || !stream || !canvasRef.current) {
      cancelAnimationFrame(rafRef.current)
      try {
        sourceRef.current?.disconnect()
        analyserRef.current?.disconnect()
        void ctxRef.current?.close()
      } catch {
        /* ignore */
      }
      sourceRef.current = null
      analyserRef.current = null
      ctxRef.current = null
      return
    }

    const canvas = canvasRef.current
    const c2d = canvas.getContext('2d')
    if (!c2d) return

    let cancelled = false
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const audioCtx = new AudioCtx()
    ctxRef.current = audioCtx
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 64
    analyser.smoothingTimeConstant = 0.72
    analyserRef.current = analyser

    try {
      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      sourceRef.current = source
    } catch {
      /* stream may already be stopped */
    }

    const data = new Uint8Array(analyser.frequencyBinCount)

    const draw = () => {
      if (cancelled) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr)
        canvas.height = Math.floor(h * dpr)
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      analyser.getByteFrequencyData(data)
      c2d.clearRect(0, 0, w, h)

      const barCount = bars
      const gap = 2.5
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount)
      const mid = h / 2
      const color = dark ? 'rgba(250,250,250,0.92)' : 'rgba(10,10,10,0.88)'

      for (let i = 0; i < barCount; i++) {
        // Sample across bins; emphasize mid frequencies for a natural voice shape
        const idx = Math.floor((i / barCount) * (data.length * 0.7)) + 1
        const v = data[idx] / 255
        const minH = 3
        const maxH = h * 0.88
        const barH = minH + v * v * maxH
        const x = i * (barW + gap)
        const y = mid - barH / 2
        c2d.fillStyle = color
        // Rounded bars
        const r = Math.min(barW / 2, 2)
        c2d.beginPath()
        c2d.moveTo(x + r, y)
        c2d.arcTo(x + barW, y, x + barW, y + barH, r)
        c2d.arcTo(x + barW, y + barH, x, y + barH, r)
        c2d.arcTo(x, y + barH, x, y, r)
        c2d.arcTo(x, y, x + barW, y, r)
        c2d.closePath()
        c2d.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    void audioCtx.resume().then(() => {
      if (!cancelled) draw()
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      try {
        sourceRef.current?.disconnect()
        analyserRef.current?.disconnect()
        void ctxRef.current?.close()
      } catch {
        /* ignore */
      }
      sourceRef.current = null
      analyserRef.current = null
      ctxRef.current = null
    }
  }, [active, stream, dark, bars])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-10 ${className}`}
      aria-hidden
    />
  )
}
