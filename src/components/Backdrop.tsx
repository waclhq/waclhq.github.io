import { useEffect, useRef, useState } from 'react'

/**
 * The room the site lives in: liquid-glass caustics — light through a
 * rippled surface — rendered by a WebGL shader. Domain-warped noise folds
 * into bright veins that carry three drifting aurora colour centres.
 *
 * Readability is a designed layer, not luck: a graded charcoal veil sits on
 * top of the shader, heaviest where page titles live, so text never fights
 * the light. Panels are opaque and float above it all.
 *
 * With FX off there is no GL at all — the static CSS aurora blobs stand in,
 * per the site's motion rules. A GPU that refuses the shader gets the same
 * fallback rather than a black room.
 */

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'

// Apple GPUs run mediump at fp16, which collapses sin-hash noise to a flat
// field — always take highp when the hardware offers it.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 R; uniform float T;
// stadium hours (0 day, 1 dusk, 2 late) and the seat-holder's colour
uniform float H; uniform vec3 ME; uniform float MEON;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x),
             mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 5; k++) { v += a * n(p); p = p * 2.03 + 7.7; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / R;
  vec2 p = uv * vec2(R.x / R.y, 1.0) * 3.2;
  float t = T * 0.055;

  // domain warp: the surface kneading itself
  vec2 q = vec2(fbm(p + t), fbm(p - t * 0.8 + 5.2));
  float v = fbm((p + 1.5 * q) * 2.1 + t * 0.4);

  // fold the field into caustic veins with fine speckle between
  float vein = pow(1.0 - abs(2.0 * fract(v * 2.4) - 1.0), 3.2);
  float speck = pow(1.0 - abs(2.0 * fract(v * 7.0) - 1.0), 6.0) * 0.5;

  // aurora colour centres drifting beneath the surface
  vec3 green = vec3(0.33, 0.83, 0.22);
  vec3 amber = vec3(1.00, 0.71, 0.21);
  vec3 teal  = vec3(0.17, 0.85, 0.82);
  // dusk warms the green toward the amber; after eleven the teal goes deep
  float dusk = step(0.5, H) * (1.0 - step(1.5, H));
  float late = step(1.5, H);
  green = mix(green, amber * 0.85, 0.35 * dusk);
  teal  = mix(teal, vec3(0.09, 0.42, 0.60), late);
  vec2 c1 = vec2(0.5 + 0.4 * sin(T * 0.10), 0.5 + 0.4 * cos(T * 0.13));
  vec2 c2 = vec2(0.5 + 0.4 * cos(T * 0.07 + 2.0), 0.5 + 0.4 * sin(T * 0.09 + 2.0));
  vec2 c3 = vec2(0.5 + 0.4 * sin(T * 0.05 + 4.0), 0.5 + 0.4 * cos(T * 0.06 + 4.0));
  vec3 base = green * exp(-3.2 * distance(uv, c1))
            + amber * exp(-3.4 * distance(uv, c2))
            + teal  * exp(-3.8 * distance(uv, c3));
  // your seat: a fourth, fainter colour centre drifting with the others,
  // so the room is subtly yours once you have picked one
  vec2 c4 = vec2(0.5 + 0.42 * cos(T * 0.08 + 1.0), 0.5 + 0.42 * sin(T * 0.11 + 3.0));
  base += ME * exp(-3.0 * distance(uv, c4)) * 0.85 * MEON;

  float dim = 1.0 - 0.32 * late;                    // late: the house lights come down
  vec3 col = vec3(0.043, 0.055, 0.071);            // charcoal floor
  col += base * (0.14 + 0.55 * vein + speck * 0.6) * dim; // veins carry the light, dimmed
  col += vein * base * base * 0.25 * dim;           // hot cores kept below text-level
  gl_FragColor = vec4(col, 1.0);
}`

/** Render scale — caustics are soft; 2/3 on desktop, half on phones. The
 *  governor below can halve it again on a device that cannot keep up. */
const BASE_SCALE = typeof window !== 'undefined' && window.innerWidth < 700 ? 0.5 : 0.66
/** Sustained frame interval that means the room is costing more than it is
 *  worth: ~24fps. Two strikes and the shader gives way to the CSS aurora. */
const STRUGGLING_MS = 42
const PATIENCE = 90
/**
 * The glass moves slowly; 30 frames a second is indistinguishable and halves
 * the GPU bill. The margin matters: on a device already delivering frames at
 * 30Hz — a busy page, Low Power Mode — a bare "skip anything under 33.3ms"
 * test lands right on the cadence, so jitter drops every other frame and the
 * room stutters at 15fps. Allow a frame that is nearly due.
 */
const FRAME_MS = 1000 / 30
const FRAME_SLACK = 6

export default function Backdrop({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const failedRef = useRef(false)
  // Bumped to re-run the effect after the GPU hands the context back.
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!enabled || failedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    let raf = 0
    // A phone under memory pressure takes the GL context away mid-scroll and
    // the room simply freezes. Ask to keep the canvas (preventDefault), stop
    // drawing into a dead context, and rebuild when it comes back.
    const onLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(raf)
      raf = 0
    }
    const onRestored = () => setGeneration((n) => n + 1)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    try {
      const gl = canvas.getContext('webgl', { antialias: false })
      if (!gl) throw new Error('WebGL unavailable')

      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type)!
        gl.shaderSource(shader, source)
        gl.compileShader(shader)
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed')
        }
        return shader
      }
      const program = gl.createProgram()!
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'link failed')
      }
      gl.useProgram(program)

      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(program, 'p')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      const uR = gl.getUniformLocation(program, 'R')
      const uT = gl.getUniformLocation(program, 'T')
      const uH = gl.getUniformLocation(program, 'H')
      const uMe = gl.getUniformLocation(program, 'ME')
      const uMeOn = gl.getUniformLocation(program, 'MEON')

      // The room reads the Shell's stamps: data-hours on the root and the
      // seat-holder's --me-color. Sampled once a second, not every frame.
      let sampledAt = -1
      let hours = 0
      let me: [number, number, number] | null = null
      const sample = (time: number) => {
        if (time - sampledAt < 1000) return
        sampledAt = time
        const stamp = document.documentElement.dataset.hours
        hours = stamp === 'late' ? 2 : stamp === 'dusk' ? 1 : 0
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--me-color').trim()
        const hex = /^#([0-9a-f]{6})$/i.exec(raw)
        if (hex) {
          const n = parseInt(hex[1], 16)
          me = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
        } else me = null
      }

      let lastDraw = 0
      let lastFrame = 0
      let cadence = 16.7
      let scale = BASE_SCALE
      let strikes = 0
      let judged = 0
      const tick = (time: number) => {
        raf = requestAnimationFrame(tick)
        if (document.hidden) return
        // What the display is actually giving us, smoothed. When it is
        // already at or below the target rate, every frame gets drawn. A gap
        // longer than a fifth of a second is a pause — a scroll, a tab
        // switch, the phone thinking about something else — not a frame
        // rate, and counting it would slander the device.
        const gap = lastFrame ? time - lastFrame : 0
        lastFrame = time
        if (gap > 200) {
          judged = 0
          return
        }
        if (gap) cadence += (Math.min(gap, 60) - cadence) * 0.1
        if (cadence < FRAME_MS - FRAME_SLACK && time - lastDraw < FRAME_MS - FRAME_SLACK) return
        lastDraw = time

        // The governor. A phone that cannot hold a frame is a phone where
        // this room is the reason, so the room gets out of the way: once at
        // half resolution, and if that is not enough, entirely — the CSS
        // aurora is nearly free and nobody has to know why.
        if (++judged > PATIENCE) {
          judged = 0
          if (cadence > STRUGGLING_MS) {
            strikes += 1
            if (strikes === 1) scale = BASE_SCALE * 0.62
            else {
              failedRef.current = true
              cancelAnimationFrame(raf)
              raf = 0
              setGeneration((n) => n + 1)
              return
            }
          } else strikes = 0
        }

        const w = Math.floor(window.innerWidth * scale)
        const h = Math.floor(window.innerHeight * scale)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        gl.viewport(0, 0, w, h)
        sample(time)
        gl.uniform2f(uR, w, h)
        gl.uniform1f(uT, time / 1000)
        gl.uniform1f(uH, hours)
        gl.uniform3f(uMe, me?.[0] ?? 0, me?.[1] ?? 0, me?.[2] ?? 0)
        gl.uniform1f(uMeOn, me ? 1 : 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
      raf = requestAnimationFrame(tick)
    } catch (error) {
      // One layer dark beats a broken page; the aurora blobs remain.
      failedRef.current = true
      console.error('backdrop shader failed:', error)
    }

    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [enabled, generation])

  const shaderOn = enabled && !failedRef.current

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      {shaderOn ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <>
          <div className="aurora-blob aurora-a" />
          <div className="aurora-blob aurora-b" />
          <div className="aurora-blob aurora-c" />
        </>
      )}
      {/* The readability veil: heaviest up top where titles and ledes sit on
          bare background, lighter mid-screen so the glass still glows. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(11,14,18,0.60) 0%, rgba(11,14,18,0.30) 32%, rgba(11,14,18,0.36) 70%, rgba(11,14,18,0.48) 100%)',
        }}
      />
    </div>
  )
}
