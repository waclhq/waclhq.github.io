import { quoteFor } from '../../lib/desk-quotes'
import { useMinuteClock } from './hooks'

/**
 * The word of the day, hung over the desk: one football quotation, the same
 * for the whole league on a given date. Keyed off the calendar, so it turns
 * over at midnight on its own and costs nothing — no storage, no fetch.
 */
export default function WordOfTheDay() {
  const now = useMinuteClock()
  const quote = quoteFor(now)
  const day = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <figure className="desk-quote">
      <div className="label desk-quote-eyebrow">
        Word of the day <span aria-hidden>·</span> <span className="desk-quote-day">{day}</span>
      </div>
      <blockquote className="desk-quote-text">
        <span aria-hidden>“</span>
        {quote.text}
        <span aria-hidden>”</span>
      </blockquote>
      <figcaption className="desk-quote-by">
        <span aria-hidden>— </span>
        {quote.by}
      </figcaption>
    </figure>
  )
}
