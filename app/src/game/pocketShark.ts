// Drawing a pocket shark: the player's own, and each friend with a slightly
// different color pattern (body tint, spots and glow color).
import type { Ctx2D } from './ctx2d'

const TAU = Math.PI * 2

export interface SharkLook {
  fin: string
  top: string // back
  bottom: string // belly side
  spots: 'dots' | 'freckles' | 'bands'
  spot: string
  /** Glow pocket color, "r,g,b". */
  glow: string
  blush?: boolean
}

/** The player's pocket shark (gray with pale dots and a green glow). */
export const PLAYER_LOOK: SharkLook = { fin: '#6f7b88', top: '#aeb9c4', bottom: '#64707d', spots: 'dots', spot: 'rgba(228,238,248,.55)', glow: '125,255,154' }

/** One look per friend (friend n uses pattern n - 1). */
export const FRIEND_LOOKS: SharkLook[] = [
  { fin: '#8a7660', top: '#d8c3a0', bottom: '#8f7b5f', spots: 'freckles', spot: 'rgba(110,80,50,.45)', glow: '255,214,102', blush: true }, // sandy, gold glow
  { fin: '#7c6a94', top: '#c2b5dd', bottom: '#77699a', spots: 'dots', spot: 'rgba(250,240,255,.6)', glow: '255,143,177' }, // lavender, pink glow
  { fin: '#5f8a7c', top: '#addccb', bottom: '#5f8d7e', spots: 'bands', spot: 'rgba(40,90,80,.45)', glow: '92,225,255' }, // mint, cyan glow
  { fin: '#9a6a5a', top: '#e6bba6', bottom: '#9c6d5c', spots: 'dots', spot: 'rgba(255,245,235,.6)', glow: '125,255,154', blush: true }, // peach
  { fin: '#58708f', top: '#a8c0de', bottom: '#5b7395', spots: 'freckles', spot: 'rgba(30,50,80,.4)', glow: '255,214,102' }, // sky blue
  { fin: '#8a5f70', top: '#d8aabd', bottom: '#8d6274', spots: 'bands', spot: 'rgba(110,50,80,.4)', glow: '92,225,255' }, // rose
  { fin: '#6d7a52', top: '#c3cf9e', bottom: '#727f56', spots: 'dots', spot: 'rgba(250,255,230,.55)', glow: '255,143,177' }, // moss
  { fin: '#5d6170', top: '#b9bdcc', bottom: '#5f6475', spots: 'bands', spot: 'rgba(40,44,60,.5)', glow: '255,214,102' }, // slate
  { fin: '#98724a', top: '#e6c08c', bottom: '#9a764c', spots: 'dots', spot: 'rgba(255,250,235,.6)', glow: '92,225,255' }, // caramel
  { fin: '#5a7e93', top: '#a9d2e6', bottom: '#5b8197', spots: 'freckles', spot: 'rgba(30,70,90,.4)', glow: '255,143,177', blush: true }, // ice blue
]
// friends 11–20 reuse the patterns above with the spots swapped, so each still looks a bit different
for (let i = 0; i < 10; i++) {
  const b = FRIEND_LOOKS[i]
  FRIEND_LOOKS.push({ ...b, spots: b.spots === 'dots' ? 'bands' : b.spots === 'bands' ? 'freckles' : 'dots', blush: !b.blush })
}

export function friendLook(pattern: number): SharkLook {
  return FRIEND_LOOKS[((pattern % FRIEND_LOOKS.length) + FRIEND_LOOKS.length) % FRIEND_LOOKS.length]
}

export interface SharkPose {
  x: number
  y: number
  dir: number // 1 = facing right
  tilt: number
  /** Body length scale (1 = 80 px). */
  scale: number
  t: number
  /** Glow strength 0–1. */
  glow: number
  /** Mouth open 0–1 (eating). */
  mouth: number
  mood: 'normal' | 'resting' | 'scared' | 'happy'
}

/** Draw a pocket shark in the given look and pose. */
export function drawPocketShark(ctx: Ctx2D, look: SharkLook, p: SharkPose) {
  const { t, glow: gI, mouth } = p
  const resting = p.mood === 'resting', scared = p.mood === 'scared'
  ctx.save()
  ctx.translate(p.x, p.y); ctx.rotate(p.tilt); ctx.scale(p.dir * p.scale, p.scale)
  ctx.translate(scared ? Math.sin(t * 55) * 0.9 : 0, Math.sin(t * (resting ? 1 : 3)) * 2) // trembles when scared
  const wag = Math.sin(t * (resting ? 2 : 8)) * 3
  ctx.fillStyle = look.fin
  ctx.beginPath(); ctx.moveTo(-36, -3); ctx.lineTo(-56, -17 + wag); ctx.quadraticCurveTo(-50, -2, -55, 9 + wag); ctx.lineTo(-36, 4); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-2, -13); ctx.quadraticCurveTo(-8, -25, -15, -11); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(-20, -9); ctx.quadraticCurveTo(-25, -19, -30, -6); ctx.closePath(); ctx.fill()
  const bg = ctx.createLinearGradient(0, -16, 0, 16)
  bg.addColorStop(0, look.top); bg.addColorStop(1, look.bottom)
  ctx.fillStyle = bg
  ctx.beginPath(); ctx.moveTo(33, 1); ctx.bezierCurveTo(33, -14, 16, -17, -2, -14); ctx.bezierCurveTo(-18, -11, -30, -6, -40, -3)
  ctx.lineTo(-40, 4); ctx.bezierCurveTo(-30, 8, -16, 14, 0, 15); ctx.bezierCurveTo(18, 16, 33, 14, 33, 1); ctx.closePath(); ctx.fill()
  // markings
  ctx.fillStyle = look.spot
  if (look.spots === 'dots') {
    for (const [x, y] of [[6, -11], [-6, -10], [-17, -7], [-27, -4], [0, -6], [-12, -4]]) { ctx.beginPath(); ctx.arc(x, y, 1.3, 0, TAU); ctx.fill() }
  } else if (look.spots === 'freckles') {
    for (const [x, y] of [[8, -12], [3, -9], [-3, -12], [-9, -8], [-14, -10], [-19, -6], [-24, -7], [-29, -3], [-5, -5], [-16, -3], [12, -8]]) {
      ctx.beginPath(); ctx.arc(x, y, 0.9, 0, TAU); ctx.fill()
    }
  } else {
    ctx.strokeStyle = look.spot; ctx.lineWidth = 2.6; ctx.lineCap = 'round'
    for (const x of [-4, -16, -27]) { ctx.beginPath(); ctx.moveTo(x + 2, -12 + Math.abs(x) * 0.12); ctx.quadraticCurveTo(x - 1, -6, x + 1, -1); ctx.stroke() }
    ctx.lineCap = 'butt'
  }
  ctx.strokeStyle = 'rgba(40,50,60,.6)'; ctx.lineWidth = 1.2
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(11 - i * 3.5, -3); ctx.lineTo(10 - i * 3.5, 5); ctx.stroke() }
  // glow pocket
  ctx.save()
  ctx.shadowColor = `rgb(${look.glow})`; ctx.shadowBlur = 6 + gI * 26; ctx.fillStyle = `rgba(${look.glow},${0.35 + gI * 0.65})`
  ctx.beginPath(); ctx.ellipse(1, 8, 4.5, 2.4, -0.2, 0, TAU); ctx.fill()
  ctx.restore()
  ctx.fillStyle = look.fin
  ctx.beginPath(); ctx.moveTo(8, 10); ctx.quadraticCurveTo(4, 24, -4, 17); ctx.quadraticCurveTo(-1, 12, 8, 10); ctx.closePath(); ctx.fill()
  if (look.blush && !scared) { ctx.fillStyle = 'rgba(255,140,160,.35)'; ctx.beginPath(); ctx.ellipse(22, 3, 3.6, 2, 0, 0, TAU); ctx.fill() }
  if (resting) {
    // closed, sleepy eye
    ctx.strokeStyle = '#0b1118'; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(21, -5, 3.2, 0.2, Math.PI - 0.2); ctx.stroke()
  } else if (scared) {
    // wide, worried eye with a tiny pupil, a sad brow and a tear
    ctx.fillStyle = '#f4f8fc'; ctx.strokeStyle = '#2a333d'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.ellipse(21, -4, 5.6, 6.2, 0, 0, TAU); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#0b1118'; ctx.beginPath(); ctx.arc(21.5, -2.6, 2, 0, TAU); ctx.fill()
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(15.5, -11.5); ctx.quadraticCurveTo(21, -15.5, 26.5, -15); ctx.stroke() // sad, raised brow
    ctx.lineCap = 'butt'
    const drip = (t * 0.9) % 1
    ctx.fillStyle = `rgba(150,215,255,${0.95 * (1 - drip * 0.7)})`
    ctx.beginPath(); ctx.moveTo(18, 2 + drip * 12); ctx.quadraticCurveTo(15.8, 6 + drip * 12, 18, 7.4 + drip * 12)
    ctx.quadraticCurveTo(20.2, 6 + drip * 12, 18, 2 + drip * 12); ctx.fill() // a tear
    // shiver marks over its head
    ctx.strokeStyle = 'rgba(190,225,255,.8)'; ctx.lineWidth = 1.4
    for (const [x, y] of [[4, -22], [12, -25], [20, -23]]) {
      ctx.beginPath(); ctx.moveTo(x - 2, y + 2); ctx.lineTo(x, y - 2); ctx.lineTo(x + 2, y + 2); ctx.stroke()
    }
  } else if (p.mood === 'happy') {
    // happy, squinting eye ^
    ctx.strokeStyle = '#0b1118'; ctx.lineWidth = 2; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(21, -2.5, 3.4, Math.PI + 0.35, TAU - 0.35); ctx.stroke()
    ctx.lineCap = 'butt'
  } else {
    ctx.fillStyle = '#0b1118'; ctx.beginPath(); ctx.arc(21, -4, 3.4, 0, TAU); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(22.2, -5.2, 1.1, 0, TAU); ctx.fill()
  }
  if (scared) { ctx.strokeStyle = '#2a333d'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(26, 10, 4, Math.PI + 0.5, TAU - 0.4); ctx.stroke() } // wobbly frown
  else if (mouth > 0.05) { ctx.fillStyle = '#2a1a22'; ctx.beginPath(); ctx.ellipse(27, 6, 3, 1 + mouth * 3, 0, 0, TAU); ctx.fill() }
  else if (p.mood === 'happy') { ctx.fillStyle = '#2a1a22'; ctx.beginPath(); ctx.arc(26, 5, 3.6, 0.1, Math.PI - 0.1); ctx.fill() } // big smile
  else { ctx.strokeStyle = '#2a333d'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(26, 4, 3.5, 0.3, 1.6); ctx.stroke() }
  ctx.restore()
}
