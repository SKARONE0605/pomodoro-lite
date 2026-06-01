import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { motion } from 'framer-motion'

export const ELECTRIC_CONFIG = {
  timeClampSec: 0.05,
  svg: {
    strokes: {
      outer: { width: 3,   color: 'rgba(173,216,230,0.75)' },
      mid:   { width: 2.2, color: 'rgba(135,206,250,0.55)' },
      core:  { width: 1.2, opacity: 0.95, color: 'white'  },
    },
    glowBlur: 0.9,
  },
  speeds: [-1.32, 0.42, 0.95] as [number, number, number],
  shimmer: { speed: 4.2, freq: 8.5, amp: 0.25 },
  segments: 48,
  freqs: [0.7, 2.7, 3.9] as [number, number, number],
  easeStiffness: 6,
  clipOffset: 25,
  amps: [0.4, -0.8, 0.6] as [number, number, number],
} as const

interface DiagonalSliderProps {
  leftComponent?:  ReactNode
  rightComponent?: ReactNode
  leftImage?:  string
  rightImage?: string
  leftAlt?:  string
  rightAlt?: string
}

function ShaderCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef    = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true })
    if (!gl) return

    const vert = `
      attribute vec2 a_position;
      void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
    `
    const frag = `
      precision highp float;
      uniform float iTime;
      uniform vec2  iResolution;

      vec3 random3(vec3 c) {
        float j = 4096.0*sin(dot(c,vec3(17.0,59.4,15.0)));
        vec3 r;
        r.z = fract(512.0*j); j *= .125;
        r.x = fract(512.0*j); j *= .125;
        r.y = fract(512.0*j);
        return r - 0.5;
      }
      const float F3 = 0.3333333;
      const float G3 = 0.1666667;
      float simplex3d(vec3 p) {
        vec3 s = floor(p + dot(p, vec3(F3)));
        vec3 x = p - s + dot(s, vec3(G3));
        vec3 e  = step(vec3(0.0), x - x.yzx);
        vec3 i1 = e*(1.0 - e.zxy);
        vec3 i2 = 1.0 - e.zxy*(1.0 - e);
        vec3 x1 = x - i1 + G3;
        vec3 x2 = x - i2 + 2.0*G3;
        vec3 x3 = x - 1.0 + 3.0*G3;
        vec4 w, d;
        w.x = dot(x,x); w.y = dot(x1,x1); w.z = dot(x2,x2); w.w = dot(x3,x3);
        w = max(0.6 - w, 0.0);
        d.x = dot(random3(s),      x);
        d.y = dot(random3(s+i1),   x1);
        d.z = dot(random3(s+i2),   x2);
        d.w = dot(random3(s+1.0),  x3);
        w *= w; w *= w; d *= w;
        return dot(d, vec4(52.0));
      }
      float noise(vec3 m) {
        return 0.5333333*simplex3d(m)   +0.2666667*simplex3d(2.0*m)
              +0.1333333*simplex3d(4.0*m)+0.0666667*simplex3d(8.0*m);
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / iResolution.xy * 2.0 - 1.0;
        vec2 p  = gl_FragCoord.xy / iResolution.x;
        float intensity = noise(vec3(p*12.0+12.0, iTime*0.25));
        float t = clamp((uv.x * -uv.x * 0.16) + 0.15, 0., 1.);
        float y = abs(intensity * -t + uv.y);
        float g = pow(y, 0.14);
        vec3 col = vec3(2.0, 2.1, 2.3);
        col = col * -g + col;
        col = col * col; col = col * col;
        gl_FragColor = vec4(col, dot(col, vec3(0.299, 0.587, 0.114)));
      }
    `

    const mkShader = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null }
      return s
    }
    const mkProg = (v: WebGLShader, f: WebGLShader) => {
      const p = gl.createProgram()!
      gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p)
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); return null }
      return p
    }

    const vs = mkShader(gl.VERTEX_SHADER,   vert)
    const fs = mkShader(gl.FRAGMENT_SHADER, frag)
    if (!vs || !fs) return
    const prog = mkProg(vs, fs)
    if (!prog) return

    const aPos  = gl.getAttribLocation(prog, 'a_position')
    const uTime = gl.getUniformLocation(prog, 'iTime')
    const uRes  = gl.getUniformLocation(prog, 'iResolution')

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)

    const render = (t: number) => {
      if (!canvas || !gl) return
      const w = canvas.clientWidth, h = canvas.clientHeight
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.useProgram(prog)
      gl.enableVertexAttribArray(aPos)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
      gl.uniform1f(uTime, t * 0.001)
      gl.uniform2f(uRes, w, h)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`${className} pointer-events-none bg-transparent`}
      style={{ display: 'block' }}
    />
  )
}

export function LightningSplit({
  leftComponent,
  rightComponent,
  leftImage,
  rightImage,
  leftAlt  = 'Left',
  rightAlt = 'Right',
}: DiagonalSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position,   setPosition]   = useState(60)
  const [displayPos, setDisplayPos] = useState(60)
  const [time,       setTime]       = useState(0)

  useEffect(() => {
    let raf = 0, last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(ELECTRIC_CONFIG.timeClampSec, (now - last) / 1000)
      last = now
      setTime(t => t + dt)
      setDisplayPos(p => p + (position - p) * (1 - Math.exp(-ELECTRIC_CONFIG.easeStiffness * dt)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [position])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    setPosition(x < 50 ? 110 : 20)
  }
  const handleMouseLeave = () => setPosition(60)

  const clamp = (v: number) => Math.max(0, Math.min(100, v))

  const { polyPointsStr, clipPolygonStr } = useMemo(() => {
    const { segments: SEG, amps: AMPS, freqs: FREQS, speeds: SPEEDS, shimmer, clipOffset } = ELECTRIC_CONFIG
    const topX    = clamp(displayPos)
    const bottomX = clamp(displayPos - clipOffset)
    const pts: { x: number; y: number }[] = []

    for (let i = 0; i <= SEG; i++) {
      const tN = i / SEG
      const y  = tN * 100
      const base = topX * (1 - tN) + bottomX * tN
      let off = 0
      for (let k = 0; k < AMPS.length; k++)
        off += AMPS[k] * Math.sin(2 * Math.PI * (FREQS[k] * tN + SPEEDS[k] * time) + k * 1.3)
      off += shimmer.amp * Math.sin(2 * Math.PI * (shimmer.freq * tN + shimmer.speed * time))
      pts.push({ y, x: clamp(base + off) })
    }

    const polyPointsStr  = pts.map(p => `${p.x},${p.y}`).join(' ')
    const clipPolygonStr = `polygon(0% 0%, ${pts.map(p => `${p.x}% ${p.y}%`).join(', ')}, 0% 100%)`
    return { polyPointsStr, clipPolygonStr }
  }, [displayPos, time])

  // Build resolved left/right content (props → image → default)
  const defaultLeft = (
    <div className="flex h-full w-full items-center justify-center bg-blue-950">
      <h1 className="text-6xl font-bold text-white">A</h1>
    </div>
  )
  const defaultRight = (
    <div className="flex h-full w-full items-center justify-center bg-purple-950">
      <h1 className="text-6xl font-bold text-white">B</h1>
    </div>
  )
  const leftContent = leftComponent ?? (
    leftImage
      ? <img src={leftImage} alt={leftAlt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : defaultLeft
  )
  const rightContent = rightComponent ?? (
    rightImage
      ? <img src={rightImage} alt={rightAlt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      : defaultRight
  )

  // Shader overlay geometry
  const x1 = position, x2 = clamp(position - 25)
  const W  = typeof window !== 'undefined' ? window.innerWidth  : 1920
  const H  = typeof window !== 'undefined' ? window.innerHeight : 1080
  const rX1 = (x1 / 100) * W, rY1 = 0
  const rX2 = (x2 / 100) * W, rY2 = H
  const angle      = Math.atan2(rY2 - rY1, rX2 - rX1) * (180 / Math.PI)
  const lineLength = Math.hypot(rX2 - rX1, rY2 - rY1)

  const leftClipStyle: CSSProperties & { WebkitClipPath?: string } = {
    WebkitClipPath: clipPolygonStr,
    clipPath: clipPolygonStr,
  }

  return (
    <motion.div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Right — base layer */}
      <div className="pointer-events-auto absolute inset-0 overflow-hidden">
        <div className="h-full w-full">{rightContent}</div>
      </div>

      {/* Left — clipped wavy layer */}
      <div
        className="pointer-events-auto absolute inset-0 overflow-hidden"
        style={leftClipStyle}
      >
        <div className="h-full w-full">{leftContent}</div>
      </div>

      {/* SVG electric arc */}
      <svg
        className="pointer-events-none absolute inset-0 z-30 select-none"
        width="100%" height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="electric-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={ELECTRIC_CONFIG.svg.glowBlur} result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <polyline points={polyPointsStr} fill="none"
          stroke={ELECTRIC_CONFIG.svg.strokes.mid.color}
          strokeWidth={ELECTRIC_CONFIG.svg.strokes.mid.width}
          vectorEffect="non-scaling-stroke" filter="url(#electric-glow)" />
        <polyline points={polyPointsStr} fill="none"
          stroke={ELECTRIC_CONFIG.svg.strokes.core.color}
          strokeOpacity={ELECTRIC_CONFIG.svg.strokes.core.opacity}
          strokeWidth={ELECTRIC_CONFIG.svg.strokes.core.width}
          vectorEffect="non-scaling-stroke" />
        <polyline points={polyPointsStr} fill="none"
          stroke={ELECTRIC_CONFIG.svg.strokes.outer.color}
          strokeWidth={ELECTRIC_CONFIG.svg.strokes.outer.width}
          vectorEffect="non-scaling-stroke" filter="url(#electric-glow)" />
      </svg>

      {/* Shader overlay along the arc */}
      <motion.div
        className="absolute z-20 select-none"
        animate={{ y: rY1, x: rX1, rotate: angle }}
        transition={{ type: 'spring', stiffness: 120, mass: 1.2, damping: 20, restSpeed: 0.001, restDelta: 0.001 }}
        style={{ width: `${lineLength}px`, transformOrigin: 'left center' }}
      >
        <div className="h-8 w-[120vw] -translate-x-16 translate-y-2">
          <div className="pointer-events-none relative h-screen w-screen" style={{ opacity: 0.9 }}>
            <div className="pointer-events-none absolute inset-0 z-20 h-screen w-[100vw] translate-x-[10%] -translate-y-[48%] scale-150 lg:w-screen lg:translate-x-0">
              <ShaderCanvas className="pointer-events-none h-[100vh] w-[200vw]" />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
