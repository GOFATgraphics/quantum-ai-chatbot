/** Lightweight markdown → HTML for chat bubbles */
export function formatMarkdown(text: string): string {
  if (!text) return ''

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const lines = escaped.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }
    if (inOl) {
      out.push('</ol>')
      inOl = false
    }
  }

  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      closeLists()
      out.push('<hr class="md-hr" />')
      continue
    }

    const h3 = trimmed.match(/^###\s+(.+)$/)
    if (h3) {
      closeLists()
      out.push(`<h3 class="md-h3">${inline(h3[1])}</h3>`)
      continue
    }
    const h2 = trimmed.match(/^##\s+(.+)$/)
    if (h2) {
      closeLists()
      out.push(`<h2 class="md-h2">${inline(h2[1])}</h2>`)
      continue
    }
    const h1 = trimmed.match(/^#\s+(.+)$/)
    if (h1) {
      closeLists()
      out.push(`<h2 class="md-h2">${inline(h1[1])}</h2>`)
      continue
    }

    const ul = trimmed.match(/^[-•]\s+(.+)$/)
    if (ul) {
      if (inOl) {
        out.push('</ol>')
        inOl = false
      }
      if (!inUl) {
        out.push('<ul class="md-ul">')
        inUl = true
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      continue
    }

    const ol = trimmed.match(/^\d+[.)]\s+(.+)$/)
    if (ol) {
      if (inUl) {
        out.push('</ul>')
        inUl = false
      }
      if (!inOl) {
        out.push('<ol class="md-ol">')
        inOl = true
      }
      out.push(`<li>${inline(ol[1])}</li>`)
      continue
    }

    if (!trimmed) {
      closeLists()
      out.push('<div class="md-gap"></div>')
      continue
    }

    closeLists()
    out.push(`<p class="md-p">${inline(trimmed)}</p>`)
  }

  closeLists()
  return out.join('')
}
