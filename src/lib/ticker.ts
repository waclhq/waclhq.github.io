/**
 * One animation clock for the canvases that share a page.
 *
 * Every fire used to run its own requestAnimationFrame loop. Five burning
 * bets meant five callbacks a frame, each waking the main thread on its own
 * schedule — and the room's shader, which draws from the same thread, went
 * ragged behind them. One loop drives them all instead, and it watches its
 * own cost: when frames start running long it halves the rate it offers
 * subscribers rather than letting everything degrade together.
 */

type Subscriber = (seconds: number) => void

const subscribers = new Set<Subscriber>()
let frame = 0
let last = 0
/** Simulation seconds handed to subscribers; independent of real elapsed time. */
let clock = 0
/** Smoothed frame interval, so a slow device is noticed within a few frames. */
let cadence = 16.7
/** Target step: 36fps when there is room, 18 when the page is struggling. */
let step = 1000 / 36

function tick(now: number) {
  frame = requestAnimationFrame(tick)
  if (document.hidden) return
  if (last) {
    const delta = Math.min(now - last, 100)
    cadence += (delta - cadence) * 0.1
    // A page holding 60fps has room for the full rate; one that has slipped
    // past ~28ms a frame gets half, which it can actually deliver.
    step = cadence > 28 ? 1000 / 18 : 1000 / 36
  }
  if (now - last < step - 3) return
  last = now
  clock += step / 1000
  for (const run of subscribers) run(clock)
}

/** Subscribe to the shared clock. Returns an unsubscribe. */
export function subscribe(run: Subscriber): () => void {
  subscribers.add(run)
  if (!frame) {
    last = 0
    frame = requestAnimationFrame(tick)
  }
  return () => {
    subscribers.delete(run)
    if (subscribers.size === 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }
}
