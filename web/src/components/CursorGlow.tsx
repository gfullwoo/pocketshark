import { useEffect, useRef } from 'react'

/**
 * Lights-out only: a soft green light that trails the mouse, like a little
 * bioluminescent glow. Mouse/trackpad only (no effect on touch screens).
 */
export function CursorGlow({ on }: { on: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!on || !el || !window.matchMedia('(pointer: fine)').matches) return
    let x = -500
    let y = -500
    let raf = 0
    const draw = () => {
      raf = 0
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      x = e.clientX
      y = e.clientY
      el.classList.add('is-active')
      if (!raf) raf = requestAnimationFrame(draw)
    }
    const leave = () => el.classList.remove('is-active')
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
      if (raf) cancelAnimationFrame(raf)
      el.classList.remove('is-active')
    }
  }, [on])

  return <div ref={ref} className="cursor-glow" aria-hidden />
}
