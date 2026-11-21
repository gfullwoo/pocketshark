import { useMemo } from 'react'

/** Drifting "marine snow" particles behind everything. Pure CSS animation. */
export function MarineSnow() {
  const flakes = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => {
        const r = (n: number) => ((Math.sin(i * 9301 + n * 49297) + 1) / 2) // deterministic
        return {
          left: `${r(1) * 100}%`,
          size: 1 + r(2) * 2.6,
          dur: 18 + r(3) * 26,
          delay: -r(4) * 40,
          op: 0.15 + r(5) * 0.45,
          glow: i % 7 === 0,
        }
      }),
    [],
  )
  return (
    <div className="snow" aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          className={f.glow ? 'flake flake--glow' : 'flake'}
          style={{ left: f.left, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`, opacity: f.op }}
        />
      ))}
    </div>
  )
}
