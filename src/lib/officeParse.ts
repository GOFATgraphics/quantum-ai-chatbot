/**
 * Client-side text extraction for Office formats.
 *
 * Parsing happens in the browser on purpose. These files are ZIP archives, so
 * the extracted text is a fraction of the binary — sending text instead of the
 * file keeps the request well under Vercel's body limit, needs no server-side
 * dependency, and reuses the plain-text attachment path that already works.
 *
 * The parsers are heavy, so each is loaded on demand: a user who never attaches
 * one of these never downloads them.
 */

export type OfficeKind = 'docx' | 'xlsx' | 'pptx'

export type ParsedOffice = {
  text: string
  truncated: boolean
  totalChars: number
}

/** Matches the ceiling used for pasted text attachments, with room for a contract. */
const MAX_CHARS = 60_000

export function officeKind(file: File): OfficeKind | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) return 'docx'
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return 'xlsx'
  if (name.endsWith('.pptx')) return 'pptx'
  const t = file.type
  if (t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx'
  if (t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx'
  if (t === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx'
  return null
}

/** Legacy .doc/.xls/.ppt are a different, binary format — these parsers can't read them. */
export function isLegacyOffice(file: File): boolean {
  return /\.(doc|xls|ppt)$/i.test(file.name)
}

function cap(raw: string): ParsedOffice {
  const text = raw.replace(/\n{3,}/g, '\n\n').trim()
  if (text.length <= MAX_CHARS) return { text, truncated: false, totalChars: text.length }
  return {
    text: text.slice(0, MAX_CHARS),
    truncated: true,
    totalChars: text.length,
  }
}

async function parseDocx(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value || ''
}

async function parseXlsx(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buf, { type: 'array' })
  const chunks: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) chunks.push(`--- Sheet: ${name} ---\n${csv.trim()}`)
  }
  return chunks.join('\n\n')
}

async function parsePptx(buf: ArrayBuffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buf)
  // Slide order is slide1.xml, slide2.xml, … — sort numerically, not lexically,
  // or slide10 lands before slide2.
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (s: string) => Number(s.match(/slide(\d+)\.xml$/)?.[1] || 0)
      return n(a) - n(b)
    })

  const out: string[] = []
  for (let i = 0; i < slides.length; i++) {
    // Label with the slide's own number, not its position — a deck whose files
    // aren't a contiguous 1..N would otherwise get citations that point at the
    // wrong slide.
    const slideNo = slides[i].match(/slide(\d+)\.xml$/)?.[1] ?? String(i + 1)
    const xml = await zip.files[slides[i]].async('string')
    // <a:t> holds the visible text runs; paragraphs break on </a:p>.
    const text = xml
      .replace(/<\/a:p>/g, '\n')
      .replace(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g, (_m, t: string) => t + ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim()
    if (text) out.push(`--- Slide ${slideNo} ---\n${text}`)
  }
  return out.join('\n\n')
}

export async function parseOfficeFile(file: File, kind: OfficeKind): Promise<ParsedOffice> {
  const buf = await file.arrayBuffer()
  if (kind === 'docx') return cap(await parseDocx(buf))
  if (kind === 'xlsx') return cap(await parseXlsx(buf))
  return cap(await parsePptx(buf))
}
