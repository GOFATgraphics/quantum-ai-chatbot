/** Lightweight markdown → HTML for chat bubbles (sanitized) */
export function formatMarkdown(text: string): string {
  if (!text) return ''

  // Escape HTML first so raw tags/scripts cannot be injected
  const escaped = text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')

  const lines = escaped.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false
  let inTable = false
  let tableRows: string[][] = []

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

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) {
      inTable = false
      tableRows = []
      return
    }
    const isSep = (cells: string[]) =>
      cells.every((c) => /^:?-{2,}:?$/.test(c.trim()) || c.trim() === '')

    const rows = tableRows.filter((r) => !isSep(r))
    if (rows.length === 0) {
      inTable = false
      tableRows = []
      return
    }

    out.push('<div class="md-table-wrap"><table class="md-table">')
    rows.forEach((cells, idx) => {
      const tag = idx === 0 ? 'th' : 'td'
      out.push('<tr>')
      cells.forEach((c) => {
        out.push(`<${tag}>${inline(c.trim())}</${tag}>`)
      })
      out.push('</tr>')
    })
    out.push('</table></div>')
    inTable = false
    tableRows = []
  }

  const isSafeUrl = (url: string) => {
    try {
      const u = new URL(url.replace(/&/g, '&'))
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  }

  const shortenUrl = (url: string) => {
    try {
      const u = new URL(url.replace(/&/g, '&'))
      if (u.hostname.includes('docs.google.com')) {
        if (u.pathname.includes('/document/')) return 'Open Google Doc'
        if (u.pathname.includes('/spreadsheets/')) return 'Open Spreadsheet'
        if (u.pathname.includes('/presentation/')) return 'Open Slides'
        return 'Open in Drive'
      }
      if (u.hostname.includes('drive.google.com')) return 'Open in Drive'
      return u.hostname + (u.pathname.length > 24 ? u.pathname.slice(0, 20) + '…' : u.pathname)
    } catch {
      return url.length > 48 ? url.slice(0, 45) + '…' : url
    }
  }

  const inline = (s: string) => {
    let t = s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')

    // Markdown links [label](url) — only http(s)
    t = t.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      (_m, label, url) => {
        if (!isSafeUrl(url)) return label
        return `<a class="md-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      }
    )

    // Bare URLs
    t = t.replace(
      /(?<!href="|">)(https?:\/\/[^\s<>"')\]]+)/g,
      (url) => {
        if (!isSafeUrl(url)) return url
        return `<a class="md-link" href="${url}" target="_blank" rel="noopener noreferrer">${shortenUrl(url)}</a>`
      }
    )

    return t
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (trimmed.includes('|') && /^\|?.+\|.+\|?$/.test(trimmed)) {
      closeLists()
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim())
      if (cells.length >= 2) {
        if (!inTable) {
          inTable = true
          tableRows = []
        }
        tableRows.push(cells)
        continue
      }
    } else if (inTable) {
      flushTable()
    }

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

  flushTable()
  closeLists()
  return out.join('')
}
