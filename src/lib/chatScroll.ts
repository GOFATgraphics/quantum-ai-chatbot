/** Reliable chat list scrolling helpers for mobile keyboards + streaming. */

export const NEAR_BOTTOM_PX = 140

export function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null
  return (el.closest('[data-scrollable="true"]') as HTMLElement | null) || null
}

export function distanceFromBottom(scroller: HTMLElement): number {
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
}

export function isNearBottom(scroller: HTMLElement, threshold = NEAR_BOTTOM_PX): boolean {
  return distanceFromBottom(scroller) <= threshold
}

export type ScrollToBottomOpts = {
  /** Prefer instant jump for open-chat / force; smooth only when already near bottom. */
  behavior?: ScrollBehavior
  /** When true, always scroll even if user scrolled up. */
  force?: boolean
}

/**
 * Scroll the chat scroller to the bottom.
 * Uses scrollTop assignment (more reliable than scrollIntoView on iOS/Android
 * with visualViewport + fixed shells).
 */
export function scrollChatToBottom(
  endEl: HTMLElement | null,
  opts: ScrollToBottomOpts = {},
): void {
  const { behavior = 'auto', force = true } = opts
  if (!endEl) return

  const scroller = getScrollParent(endEl)
  if (scroller) {
    if (!force && !isNearBottom(scroller)) return
    const top = scroller.scrollHeight
    if (behavior === 'smooth' && typeof scroller.scrollTo === 'function') {
      try {
        scroller.scrollTo({ top, behavior: 'smooth' })
        return
      } catch {
        /* fall through */
      }
    }
    scroller.scrollTop = top
    return
  }

  try {
    endEl.scrollIntoView({ behavior, block: 'end' })
  } catch {
    /* ignore */
  }
}

/** Double-rAF then scroll — waits for layout after React commit / images. */
export function scrollChatToBottomAfterLayout(
  endEl: HTMLElement | null,
  opts: ScrollToBottomOpts = {},
): void {
  if (!endEl) return
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollChatToBottom(endEl, opts)
      // One more pass after fonts/images may expand height
      window.setTimeout(() => scrollChatToBottom(endEl, opts), 50)
    })
  })
}
