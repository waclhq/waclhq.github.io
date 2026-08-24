import { useEffect, useRef } from 'react'

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
  vec2 c1 = vec2(0.5 + 0.4 * sin(T * 0.10), 0.5 + 0.4 * cos(T * 0.13));
  vec2 c2 = vec2(0.5 + 0.4 * cos(T * 0.07 + 2.0), 0.5 + 0.4 * sin(T * 0.09 + 2.0));
  vec2 c3 = vec2(0.5 + 0.4 * sin(T * 0.05 + 4.0), 0.5 + 0.4 * cos(T * 0.06 + 4.0));
  vec3 base = green * exp(-3.2 * distance(uv, c1))
            + amber * exp(-3.4 * distance(uv, c2))
            + teal  * exp(-3.8 * distance(uv, c3));

  vec3 col = vec3(0.043, 0.055, 0.071);            // charcoal floor
  col += base * (0.22 + 1.05 * vein + speck);       // veins carry the light
  col += vein * base * base * 0.6;                  // hot cores where colour pools
  gl_FragColor = vec4(col, 1.0);
}`

/** Render scale — caustics are soft, and 2/3 keeps phones cool. */
const SCALE = 0.66

export default function Backdrop({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const failedRef = useRef(false)

  useEffect(() => {
    if (!enabled || failedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return

    let raf = 0
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

      const tick = (time: number) => {
        raf = requestAnimationFrame(tick)
        const w = Math.floor(window.innerWidth * SCALE)
        const h = Math.floor(window.innerHeight * SCALE)
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        gl.viewport(0, 0, w, h)
        gl.uniform2f(uR, w, h)
        gl.uniform1f(uT, time / 1000)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      }
      raf = requestAnimationFrame(tick)
    } catch (error) {
      // One layer dark beats a broken page; the aurora blobs remain.
      failedRef.current = true
      console.error('backdrop shader failed:', error)
    }

    return () => cancelAnimationFrame(raf)
  }, [enabled])

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
            'linear-gradient(180deg, rgba(11,14,18,0.55) 0%, rgba(11,14,18,0.22) 32%, rgba(11,14,18,0.30) 70%, rgba(11,14,18,0.44) 100%)',
        }}
      />
    </div>
  )
}
