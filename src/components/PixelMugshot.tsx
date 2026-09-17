import { useEffect, useRef, useState } from 'react'

/**
 * A wanted-poster mugshot. Prefers the league's own pixel portrait at
 * public/media/portraits/<managerId>.webp; when a manager has no portrait on
 * file it falls back to a generated sprite whose every feature — skin, hair
 * colour and cut, brow, expression, facial hair — is derived from a hash of
 * the manager id, so the face is distinct and stable across renders.
 */

const W = 24
const H = 26

const SKINS = ['#f0c8a0', '#dda878', '#c08a5a', '#9c6644', '#7a4b2c', '#5c3720']
const HAIRS = ['#241611', '#3d2415', '#6b4423', '#a8712f', '#c9c9c9', '#1a1a1a']
const PAPER = '#e8dcc0'

function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export default function PixelMugshot({ seed, scale = 3 }: { seed: string; scale?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [usePortrait, setUsePortrait] = useState(true)
  const portraitUrl = `${import.meta.env.BASE_URL}media/portraits/${seed}.webp`

  useEffect(() => {
    setUsePortrait(true)
  }, [seed])

  useEffect(() => {
    if (usePortrait) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W
    canvas.height = H
    canvas.style.width = `${W * scale}px`
    canvas.style.height = `${H * scale}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const h = hash(seed)
    const skin = SKINS[h % SKINS.length]
    const hair = HAIRS[(h >> 3) % HAIRS.length]
    const cut = (h >> 7) % 4 // 0 short, 1 flat-top, 2 receding, 3 shaggy
    const face = (h >> 11) % 3 // expression
    const beard = (h >> 14) % 3 // 0 none, 1 stubble, 2 full

    const rect = (x0: number, y0: number, x1: number, y1: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
    }
    const px = (x: number, y: number, color: string) => {
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }

    // mugshot backdrop: pale board with height lines, like a lineup wall
    rect(0, 0, W - 1, H - 1, '#cbbf9e')
    for (let y = 3; y < H; y += 5) rect(0, y, W - 1, y, '#bdb08c')

    // shoulders
    rect(3, 21, W - 4, H - 1, '#3a4250')
    rect(9, 21, 14, H - 1, '#2b323d')

    // head
    rect(6, 6, 17, 20, skin)
    rect(5, 9, 5, 16, skin)
    rect(18, 9, 18, 16, skin)
    px(4, 12, skin)
    px(19, 12, skin)
    rect(6, 20, 17, 20, '#00000018')

    // hair
    if (cut !== 2) rect(6, 4, 17, 7, hair)
    else rect(8, 4, 15, 6, hair)
    if (cut === 1) rect(6, 3, 17, 3, hair)
    if (cut === 3) {
      rect(5, 5, 5, 11, hair)
      rect(18, 5, 18, 11, hair)
    }
    rect(5, 7, 6, 8, hair)
    rect(17, 7, 18, 8, hair)

    // brows
    rect(8, 10, 10, 10, hair)
    rect(13, 10, 15, 10, hair)

    // eyes
    const eyeY = 12
    px(9, eyeY, '#1b1b1b')
    px(14, eyeY, '#1b1b1b')
    if (face === 1) {
      px(10, eyeY, '#1b1b1b')
      px(15, eyeY, '#1b1b1b')
    }

    // nose
    px(11, 14, '#00000030')
    px(12, 15, '#00000030')

    // mouth
    if (face === 0) {
      rect(10, 17, 13, 17, '#5a3222')
    } else if (face === 1) {
      rect(10, 17, 13, 17, '#5a3222')
      px(9, 16, '#5a3222')
      px(14, 16, '#5a3222')
    } else {
      rect(10, 17, 13, 17, '#5a3222')
      px(14, 16, '#5a3222')
    }

    // facial hair
    if (beard === 1) {
      ctx.globalAlpha = 0.25
      rect(8, 16, 15, 19, hair)
      ctx.globalAlpha = 1
    } else if (beard === 2) {
      rect(7, 16, 16, 19, hair)
      rect(9, 15, 14, 15, hair)
      rect(10, 17, 13, 18, '#5a3222')
    }

    // poster grain
    for (let i = 0; i < 14; i++) {
      const gx = (h >> (i % 12)) % W
      const gy = (h >> ((i + 5) % 13)) % H
      ctx.globalAlpha = 0.08
      px(gx, gy, i % 2 ? '#000' : PAPER)
      ctx.globalAlpha = 1
    }
  }, [seed, scale, usePortrait])

  if (usePortrait) {
    return (
      <img
        src={portraitUrl}
        alt=""
        aria-hidden
        width={H * scale}
        height={H * scale}
        style={{ imageRendering: 'pixelated', objectFit: 'cover', display: 'block' }}
        onError={() => setUsePortrait(false)}
      />
    )
  }

  return <canvas ref={canvasRef} style={{ imageRendering: 'pixelated' }} aria-hidden />
}
