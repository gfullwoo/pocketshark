import { useCallback, useState } from 'react'

interface Swim {
  id: number
  dir: 1 | -1
  top: number
  dur: number
  delay: number
  scale: number
}

let seq = 0
function roll(first = false): Swim {
  return {
    id: seq++,
    dir: Math.random() < 0.5 ? 1 : -1,
    top: 8 + Math.random() * 80,
    dur: 26 + Math.random() * 22,
    delay: first ? Math.random() * 12 : 2 + Math.random() * 14,
    scale: 0.55 + Math.random() * 0.75,
  }
}

/** A few glowing pocket sharks drifting across the background at random heights, speeds and directions. */
export function SwimmingSharks({ count = 3 }: { count?: number }) {
  const [swims, setSwims] = useState<Swim[]>(() => Array.from({ length: count }, () => roll(true)))
  const reroll = useCallback((i: number) => setSwims((ss) => ss.map((s, j) => (j === i ? roll() : s))), [])

  return (
    <div className="swimmers" aria-hidden>
      {swims.map((s, i) => (
        <div
          key={s.id}
          className={`swimmer ${s.dir === 1 ? 'swimmer--ltr' : 'swimmer--rtl'}`}
          style={{ top: `${s.top}%`, animationDuration: `${s.dur}s`, animationDelay: `${s.delay}s` }}
          onAnimationEnd={(e) => e.target === e.currentTarget && reroll(i)}
        >
          <div className="swimmer__bob" style={{ animationDuration: `${3 + s.scale * 2}s` }}>
            <svg viewBox="0 0 120 52" width={120 * s.scale} height={52 * s.scale} style={{ transform: s.dir === 1 ? 'scaleX(-1)' : undefined }}>
              <path d="M52,13 C53,4 63,2 66,8 C67,11 65,13 62,15 Z" />
              <path d="M77,18 C78,11 85,11 87,15 L85,21 Z" />
              <path d="M8,27 C8,15 22,9 38,10 C60,11 80,16 96,22 L111,9 C114,17 111,24 106,27 C110,31 113,37 111,43 L96,32 C80,38 58,42 38,42 C20,42 8,39 8,27 Z" />
              <path d="M36,38 C38,47 46,51 51,49 C49,44 47,40 44,37 Z" />
              <path className="swimmer__pocket" d="M40,26 Q44,22 47,27" />
              <circle className="swimmer__eye" cx="22" cy="22" r="3.2" />
            </svg>
          </div>
        </div>
      ))}
    </div>
  )
}
