import { useEffect, useRef, useState } from 'react'
import { animationsDisabled } from '../../lib/motion'
import { useRevealed } from '../ui'

/**
 * The championship tape. Opens on a poster frame so the slot is the right
 * shape from first paint and the page owes nothing to a 2.4MB file. With
 * motion on, the video mounts a moment after the panel is seen and plays
 * muted; under reduced motion, or before that, a tap loads and plays it.
 */
export default function Tape({
  src,
  poster,
  heading,
  credit,
  description,
}: {
  src: string
  poster: string
  heading: string
  credit: string
  description: string
}) {
  const frame = useRef<HTMLDivElement>(null)
  const revealed = useRevealed(frame)
  const [armed, setArmed] = useState(false)
  const [tapped, setTapped] = useState(false)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!revealed || tapped || animationsDisabled()) return
    // Let the odometer and the board finish before the decoder starts.
    const timer = setTimeout(() => setArmed(true), 1400)
    return () => clearTimeout(timer)
  }, [revealed, tapped])

  useEffect(() => {
    if (!tapped) return
    void video.current?.play().catch(() => {})
  }, [tapped])

  const live = armed || tapped

  return (
    <div ref={frame} className="win desk-tape mx-auto w-full max-w-xl">
      <div className="win-head">
        <span className="label">{heading}</span>
        <span className="label">{credit}</span>
      </div>
      {live ? (
        <video
          ref={video}
          className="block aspect-video w-full bg-black object-contain"
          src={src}
          poster={poster}
          autoPlay={!animationsDisabled()}
          muted
          loop
          playsInline
          controls
          preload="none"
          aria-label={description}
        />
      ) : (
        <button
          type="button"
          className="desk-tape-still"
          onClick={() => setTapped(true)}
          aria-label={`Play the tape: ${description}`}
        >
          <img
            src={poster}
            alt=""
            className="block aspect-video w-full object-cover"
            decoding="async"
          />
          <span className="desk-tape-play" aria-hidden>
            <span className="desk-tape-btn">▶</span>
            <span className="label">Play the tape</span>
          </span>
        </button>
      )}
    </div>
  )
}
