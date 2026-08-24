/**
 * Client-side audio transcription.
 *
 * Audio goes to /api/stt (ElevenLabs Scribe), which the mic button already
 * uses. The complication is size: the whole request is one body, and Vercel
 * rejects anything past ~4.5MB before the function runs, so a recorded call
 * cannot simply be uploaded.
 *
 * Short clips are sent untouched, at their original quality, in one request.
 * Anything larger is decoded in the browser, downmixed to 16 kHz mono — what
 * speech recognition wants anyway — and sent as a sequence of chunks that are
 * stitched back together. A two-minute voice note stays one fast request; an
 * hour-long call still works, just slowly.
 */
import { supabase } from './supabase'

export type TranscriptResult = {
  text: string
  durationSec: number
  chunks: number
  truncated: boolean
  diarized: boolean
}

export type TranscribeProgress = { done: number; total: number }

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|webm|flac|amr|mp4a|wma)$/i

/** Under this, the file is small enough to send as-is and skip re-encoding entirely. */
const DIRECT_LIMIT_BYTES = 3_000_000

/** 16 kHz mono 16-bit is 32 KB/s; 60s per chunk lands ~2.6MB once base64'd. */
const TARGET_RATE = 16_000
const CHUNK_SECONDS = 60

/** Ceiling on how much of a long recording is transcribed, in seconds. */
const MAX_DURATION_SEC = 3600

export function isAudioFile(file: File): boolean {
  if (AUDIO_EXT.test(file.name)) return true
  const t = (file.type || '').toLowerCase()
  // video/webm and audio/mp4 both show up for ordinary voice recordings.
  return t.startsWith('audio/') || t === 'video/webm'
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // btoa needs a binary string; build it in slices so a long recording does
  // not blow the argument limit on String.fromCharCode.
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

type SttResponse = {
  text?: string
  language_code?: string
  words?: { text?: string; speaker_id?: string; type?: string }[]
  error?: string
}

async function postAudio(audioBase64: string, mimeType: string): Promise<SttResponse> {
  const res = await fetch('/api/stt', {
    method: 'POST',
    headers: await authHeaders(),
    // 'auto' lets Scribe detect the language; trade calls are rarely all English.
    body: JSON.stringify({ audioBase64, mimeType, language: 'auto', diarize: true }),
  })
  const body = (await res.json().catch(() => ({}))) as SttResponse
  if (!res.ok) throw new Error(body?.error || `Transcription failed (${res.status})`)
  return body
}

/**
 * Rebuild the transcript with speaker labels when Scribe returned them.
 * Falls back to the plain text whenever the shape isn't what we expect, so a
 * response without diarization still produces a usable transcript.
 */
function withSpeakers(data: SttResponse): { text: string; diarized: boolean } {
  const words = Array.isArray(data.words) ? data.words : []
  const speakers = new Set(words.map((w) => w?.speaker_id).filter(Boolean))
  if (words.length === 0 || speakers.size < 2) {
    return { text: String(data.text || '').trim(), diarized: false }
  }
  const lines: string[] = []
  let current: string | null = null
  let buf = ''
  for (const w of words) {
    const speaker: string | null = w?.speaker_id || current
    if (speaker !== current) {
      if (buf.trim()) lines.push(`${current}: ${buf.trim()}`)
      current = speaker || null
      buf = ''
    }
    buf += w?.text || ''
  }
  if (buf.trim()) lines.push(`${current}: ${buf.trim()}`)
  const text = lines.join('\n')
  return text.trim() ? { text, diarized: true } : { text: String(data.text || '').trim(), diarized: false }
}

/** Decode to a single 16 kHz mono track. Throws if the browser cannot decode the format. */
async function decodeToMono16k(file: File): Promise<Float32Array> {
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext
  if (!AC || typeof OfflineAudioContext === 'undefined') {
    throw new Error('This browser cannot decode audio for splitting.')
  }
  const ctx = new AC()
  let decoded: AudioBuffer
  try {
    decoded = await ctx.decodeAudioData(await file.arrayBuffer())
  } finally {
    try { await ctx.close() } catch { /* already closed */ }
  }
  const seconds = Math.min(decoded.duration, MAX_DURATION_SEC)
  const frames = Math.max(1, Math.ceil(seconds * TARGET_RATE))
  // One output channel makes the OfflineAudioContext downmix stereo for us.
  const off = new OfflineAudioContext(1, frames, TARGET_RATE)
  const src = off.createBufferSource()
  src.buffer = decoded
  src.connect(off.destination)
  src.start()
  const rendered = await off.startRendering()
  return rendered.getChannelData(0)
}

/** Minimal 16-bit PCM WAV. Scribe accepts it and it needs no encoder dependency. */
function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)      // PCM header size
  view.setUint16(20, 1, true)       // format: PCM
  view.setUint16(22, 1, true)       // channels: mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)       // block align
  view.setUint16(34, 16, true)      // bits per sample
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling, or a sample slightly over 1.0 wraps to full-scale
    // negative and clicks.
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return bytes
}

export async function transcribeAudioFile(
  file: File,
  onProgress?: (p: TranscribeProgress) => void,
): Promise<TranscriptResult> {
  // Small enough to go straight through, keeping the original encoding.
  if (file.size <= DIRECT_LIMIT_BYTES) {
    onProgress?.({ done: 0, total: 1 })
    const data = await postAudio(await fileToBase64(file), file.type || 'audio/mpeg')
    const { text, diarized } = withSpeakers(data)
    onProgress?.({ done: 1, total: 1 })
    return { text, durationSec: 0, chunks: 1, truncated: false, diarized }
  }

  const samples = await decodeToMono16k(file)
  const durationSec = samples.length / TARGET_RATE
  const perChunk = CHUNK_SECONDS * TARGET_RATE
  const total = Math.max(1, Math.ceil(samples.length / perChunk))
  const parts: string[] = []
  let anyDiarized = false

  for (let i = 0; i < total; i++) {
    onProgress?.({ done: i, total })
    const slice = samples.subarray(i * perChunk, Math.min(samples.length, (i + 1) * perChunk))
    if (slice.length === 0) continue
    const data = await postAudio(bytesToBase64(encodeWav(slice, TARGET_RATE)), 'audio/wav')
    const { text, diarized } = withSpeakers(data)
    anyDiarized = anyDiarized || diarized
    if (text) {
      // Chunks are transcribed independently, so a timestamp header is the only
      // thing tying a passage back to a point in the recording.
      const mark = new Date(i * CHUNK_SECONDS * 1000).toISOString().slice(14, 19)
      parts.push(total > 1 ? `[${mark}]\n${text}` : text)
    }
  }
  onProgress?.({ done: total, total })

  return {
    text: parts.join('\n\n').trim(),
    durationSec,
    chunks: total,
    // decodeToMono16k stops at the ceiling, so a longer recording is cut there.
    truncated: durationSec >= MAX_DURATION_SEC - 1,
    diarized: anyDiarized,
  }
}

export function formatDuration(sec: number): string {
  if (!sec || sec < 1) return ''
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}
