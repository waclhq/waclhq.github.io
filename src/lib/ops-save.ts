import { friendlySaveError } from './github'

/**
 * Save failures in words the commissioner can act on. github.ts already
 * translates the common cases (offline, expired token, a clash, rate limit);
 * this catches the rest — a malformed reply, a parser blowing up — before it
 * reaches a phone screen as a stack-trace fragment.
 */
export function plainSaveError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/Cannot read|undefined|null|is not a function|Unexpected token|JSON|TypeError/i.test(message)) {
    return 'The save did not go through — GitHub sent back something unexpected. Nothing was changed; try again in a moment.'
  }
  return friendlySaveError(cause)
}
