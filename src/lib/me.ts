import { useSyncExternalStore } from 'react'
import type { ManagerId } from './types'

/**
 * "Pick your seat": which of the twelve the person holding this phone is.
 *
 * There is no sign-in on this site and there never will be, but a member who
 * picks their seat once gets their own rows lit in their colour on every
 * table, their bets first on the Book, and their name glowing wherever it is
 * printed. It is a preference, not an identity — nothing trusts it — so it
 * lives in localStorage like the motion and music switches.
 */

const KEY = 'wacl.me'
const EVENT = 'wacl:me'

export function getMe(): ManagerId | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setMe(id: ManagerId | null): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    /* private browsing — the in-memory value still notifies subscribers */
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/** The seat picked on this device, or null. Re-renders when it changes. */
export function useMe(): ManagerId | null {
  return useSyncExternalStore(subscribe, getMe, () => null)
}
