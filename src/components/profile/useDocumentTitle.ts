import { useEffect } from 'react'

/**
 * Name the tab after the person on it. The Shell names every route after its
 * section ("Managers · WACL League HQ") from its own effect, so ten profiles
 * in the history menu would otherwise read as one entry. Rather than race
 * that write, this sets the page's name and, while the page is mounted,
 * puts it back whenever anything else renames the tab. Leaving the page
 * needs no restore — the Shell retitles the next route.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return
    const apply = () => {
      if (document.title !== title) document.title = title
    }
    apply()
    const node = document.querySelector('title')
    if (!node) return
    const observer = new MutationObserver(apply)
    observer.observe(node, { childList: true, characterData: true, subtree: true })
    return () => observer.disconnect()
  }, [title])
}
