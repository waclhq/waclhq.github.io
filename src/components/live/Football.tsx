/**
 * A little football beside a player's name when his side of the ball is on
 * the field: his offense has it, or, for a defense, the other team does.
 * Static; it moves only when the next update does.
 */
export default function Football() {
  return (
    <svg className="lv-football" viewBox="0 0 20 12" width="16" height="10" role="img" aria-label="On the field">
      <ellipse cx="10" cy="6" rx="9" ry="5.2" />
      <path d="M6 6h8M8 4.4v3.2M10 4.4v3.2M12 4.4v3.2" />
    </svg>
  )
}
