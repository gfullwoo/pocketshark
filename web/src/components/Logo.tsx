export function Logo() {
  return (
    <a href="#/" className="logo" aria-label="My Pocket Shark home">
      <svg viewBox="0 0 64 34" width="44" height="24" aria-hidden>
        <path
          d="M4,20 C3,10 11,5 21,5 C32,5 42,9 50,15 L60,9 C60,13 58,16 56,18 C58,20 60,23 60,27 L50,22 C42,27 30,30 20,29 C10,28 5,26 4,20 Z"
          fill="var(--glow)"
        />
        <circle cx="13" cy="15" r="2.2" fill="var(--abyss)" />
        <path d="M24,22 Q27,19 30,21" stroke="var(--abyss)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className="logo__word">
        my<b>pocket</b>shark
      </span>
    </a>
  )
}
