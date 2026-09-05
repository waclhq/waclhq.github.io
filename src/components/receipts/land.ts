/**
 * Scroll the window so `node` sits under the sticky bars, honouring its own
 * scroll-margin-top. scrollIntoView is not used on purpose: a tile lives
 * inside a panel's horizontal scroll track, and once an inner scroller is
 * involved the browser aligns the track rather than the tile, dropping the
 * margin — the tile ends up under the rail.
 */
export function landOn(node: HTMLElement, behavior: ScrollBehavior = 'auto'): void {
  const margin = parseFloat(getComputedStyle(node).scrollMarginTop) || 0
  const top = node.getBoundingClientRect().top + window.scrollY - margin
  window.scrollTo({ top: Math.max(0, top), behavior })
}
