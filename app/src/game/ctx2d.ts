// A small Canvas2D-style facade over a Skia canvas, so the drawing code from the
// Glow & Gulp web game (shark, prey, big shark, cave and reef) runs unchanged.
// Only the subset the game uses is implemented. Arcs and ellipses are sampled
// into line segments, which keeps their behavior identical to the browser's.
import {
  BlurStyle, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode,
  type SkCanvas, type SkColor, type SkFont, type SkPaint, type SkPathBuilder, type SkPicture, type SkShader,
} from '@shopify/react-native-skia'

export interface Gradient {
  addColorStop(offset: number, color: string): void
}

/** The drawing API the game code is written against (a subset of CanvasRenderingContext2D). */
export interface Ctx2D {
  fillStyle: string | Gradient
  strokeStyle: string | Gradient
  lineWidth: number
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
  globalAlpha: number
  shadowBlur: number
  shadowColor: string
  font: string
  textAlign: 'left' | 'center' | 'right' | 'start' | 'end'
  textBaseline: 'top' | 'middle' | 'alphabetic' | 'bottom'
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(rad: number): void
  scale(x: number, y: number): void
  beginPath(): void
  closePath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void
  fill(): void
  stroke(): void
  fillRect(x: number, y: number, w: number, h: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient
}

class SkGradient implements Gradient {
  stops: { o: number; c: string }[] = []
  constructor(public kind: 'linear' | 'radial', public a: number[]) {}
  addColorStop(o: number, c: string) {
    this.stops.push({ o, c })
  }
  shader(): SkShader {
    const stops = [...this.stops].sort((x, y) => x.o - y.o)
    const colors = stops.map((s) => Skia.Color(s.c))
    const pos = stops.map((s) => s.o)
    const [x0, y0, x1, y1, r0, r1] = this.a
    return this.kind === 'linear'
      ? Skia.Shader.MakeLinearGradient({ x: x0, y: y0 }, { x: x1, y: y1 }, colors, pos, TileMode.Clamp)
      : Skia.Shader.MakeTwoPointConicalGradient({ x: x0, y: y0 }, r0, { x: x1, y: y1 }, r1, colors, pos, TileMode.Clamp)
  }
}

interface Style {
  fillStyle: string | Gradient
  strokeStyle: string | Gradient
  lineWidth: number
  lineCap: Ctx2D['lineCap']
  lineJoin: Ctx2D['lineJoin']
  globalAlpha: number
  shadowBlur: number
  shadowColor: string
  font: string
  textAlign: Ctx2D['textAlign']
  textBaseline: Ctx2D['textBaseline']
}

const colorCache = new Map<string, SkColor>()
function color(c: string): SkColor {
  let v = colorCache.get(c)
  if (!v) {
    v = Skia.Color(c)
    if (colorCache.size > 500) colorCache.clear()
    colorCache.set(c, v)
  }
  return v
}

const fontCache = new Map<number, SkFont>()

export class SkiaCtx implements Ctx2D {
  private st: Style = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    globalAlpha: 1, shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)', font: '16px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic',
  }
  private stack: Style[] = []
  private path: SkPathBuilder = Skia.PathBuilder.Make()
  private cur: { x: number; y: number } | null = null
  private start: { x: number; y: number } | null = null
  private paint: SkPaint = Skia.Paint()

  constructor(private c: SkCanvas, private makeFont: (size: number) => SkFont) {
    this.paint.setAntiAlias(true)
  }

  get fillStyle() { return this.st.fillStyle }
  set fillStyle(v) { this.st.fillStyle = v }
  get strokeStyle() { return this.st.strokeStyle }
  set strokeStyle(v) { this.st.strokeStyle = v }
  get lineWidth() { return this.st.lineWidth }
  set lineWidth(v) { this.st.lineWidth = v }
  get lineCap() { return this.st.lineCap }
  set lineCap(v) { this.st.lineCap = v }
  get lineJoin() { return this.st.lineJoin }
  set lineJoin(v) { this.st.lineJoin = v }
  get globalAlpha() { return this.st.globalAlpha }
  set globalAlpha(v) { this.st.globalAlpha = Math.max(0, Math.min(1, v)) }
  get shadowBlur() { return this.st.shadowBlur }
  set shadowBlur(v) { this.st.shadowBlur = v }
  get shadowColor() { return this.st.shadowColor }
  set shadowColor(v) { this.st.shadowColor = v }
  get font() { return this.st.font }
  set font(v) { this.st.font = v }
  get textAlign() { return this.st.textAlign }
  set textAlign(v) { this.st.textAlign = v }
  get textBaseline() { return this.st.textBaseline }
  set textBaseline(v) { this.st.textBaseline = v }

  save() { this.stack.push({ ...this.st }); this.c.save() }
  restore() { const s = this.stack.pop(); if (s) this.st = s; this.c.restore() }
  translate(x: number, y: number) { this.c.translate(x, y) }
  rotate(rad: number) { this.c.rotate((rad * 180) / Math.PI, 0, 0) }
  scale(x: number, y: number) { this.c.scale(x, y) }

  beginPath() { this.path = Skia.PathBuilder.Make(); this.cur = this.start = null }
  closePath() { if (this.cur) { this.path.close(); this.cur = this.start } }
  moveTo(x: number, y: number) { this.path.moveTo(x, y); this.cur = this.start = { x, y } }
  lineTo(x: number, y: number) {
    if (!this.cur) return this.moveTo(x, y)
    this.path.lineTo(x, y); this.cur = { x, y }
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    if (!this.cur) this.moveTo(cx, cy)
    this.path.quadTo(cx, cy, x, y); this.cur = { x, y }
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, x: number, y: number) {
    if (!this.cur) this.moveTo(a, b)
    this.path.cubicTo(a, b, c, d, x, y); this.cur = { x, y }
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw)
  }
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false) {
    const TAU = Math.PI * 2
    let sweep = a1 - a0
    if (!ccw && sweep < 0) sweep = (sweep % TAU) + TAU
    if (ccw && sweep > 0) sweep = (sweep % TAU) - TAU
    if (Math.abs(a1 - a0) >= TAU) sweep = ccw ? -TAU : TAU
    const n = Math.max(8, Math.ceil((Math.abs(sweep) / TAU) * 40))
    const cr = Math.cos(rot), sr = Math.sin(rot)
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n
      const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry
      const px = x + ex * cr - ey * sr, py = y + ex * sr + ey * cr
      if (i === 0 && !this.cur) this.moveTo(px, py)
      else this.lineTo(px, py)
    }
  }

  private applyPaint(style: string | Gradient, stroke: boolean) {
    const p = this.paint
    p.setMaskFilter(null)
    p.setStyle(stroke ? PaintStyle.Stroke : PaintStyle.Fill)
    if (stroke) {
      p.setStrokeWidth(this.st.lineWidth)
      p.setStrokeCap(this.st.lineCap === 'round' ? StrokeCap.Round : this.st.lineCap === 'square' ? StrokeCap.Square : StrokeCap.Butt)
      p.setStrokeJoin(this.st.lineJoin === 'round' ? StrokeJoin.Round : this.st.lineJoin === 'bevel' ? StrokeJoin.Bevel : StrokeJoin.Miter)
    }
    if (typeof style === 'string') {
      p.setShader(null)
      const col = color(style)
      p.setColor(col)
      p.setAlphaf(col[3] * this.st.globalAlpha)
    } else {
      p.setColor(color('#000'))
      p.setShader((style as SkGradient).shader())
      p.setAlphaf(this.st.globalAlpha)
    }
    return p
  }

  /** Canvas2D shadows with zero offset are a blurred copy underneath: draw that first. */
  private shadow(draw: (p: SkPaint) => void, stroke: boolean) {
    if (this.st.shadowBlur <= 0) return
    const sc = color(this.st.shadowColor)
    if (sc[3] === 0) return
    const p = this.applyPaint(this.st.shadowColor, stroke)
    p.setAlphaf(sc[3] * this.st.globalAlpha)
    p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, this.st.shadowBlur / 2, true))
    draw(p)
    p.setMaskFilter(null)
  }

  fill() {
    const path = this.path.build()
    this.shadow((p) => this.c.drawPath(path, p), false)
    this.c.drawPath(path, this.applyPaint(this.st.fillStyle, false))
  }
  stroke() {
    const path = this.path.build()
    this.shadow((p) => this.c.drawPath(path, p), true)
    this.c.drawPath(path, this.applyPaint(this.st.strokeStyle, true))
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const r = Skia.XYWHRect(x, y, w, h)
    this.shadow((p) => this.c.drawRect(r, p), false)
    this.c.drawRect(r, this.applyPaint(this.st.fillStyle, false))
  }
  clearRect() { /* each frame is recorded onto a fresh picture */ }

  fillText(text: string, x: number, y: number) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.st.font)?.[1] ?? 16)
    let font = fontCache.get(size)
    try {
      if (!font) { font = this.makeFont(size); fontCache.set(size, font) }
    } catch {
      return // no system font available (e.g. the web preview): skip the text, keep the frame
    }
    const w = font.measureText(text).width
    const dx = this.st.textAlign === 'center' ? -w / 2 : this.st.textAlign === 'right' || this.st.textAlign === 'end' ? -w : 0
    const dy = this.st.textBaseline === 'middle' ? size * 0.35 : this.st.textBaseline === 'top' ? size * 0.8 : 0
    const p = this.applyPaint(this.st.fillStyle, false)
    this.c.drawText(text, x + dx, y + dy, p, font)
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient {
    return new SkGradient('linear', [x0, y0, x1, y1])
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient {
    return new SkGradient('radial', [x0, y0, x1, y1, r0, r1])
  }

  drawPicture(pic: SkPicture) { this.c.drawPicture(pic) }
}

/** Record drawing into a picture for <Picture /> to display. */
export function record(W: number, H: number, makeFont: (size: number) => SkFont, draw: (ctx: SkiaCtx) => void): SkPicture {
  const rec = Skia.PictureRecorder()
  const canvas = rec.beginRecording(Skia.XYWHRect(0, 0, W, H))
  draw(new SkiaCtx(canvas, makeFont))
  return rec.finishRecordingAsPicture()
}
