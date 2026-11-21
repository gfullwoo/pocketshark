import { Logo } from './Logo'
import { go, scrollToId } from '../lib/nav'

interface Props {
  count: number
  onCart: () => void
  lightsOut: boolean
  toggleLights: () => void
}

function section(id: string) {
  if (window.location.hash && window.location.hash !== '#/') {
    go('/')
    setTimeout(() => scrollToId(id), 60)
  } else scrollToId(id)
}

export function Header({ count, onCart, lightsOut, toggleLights }: Props) {
  return (
    <header className="header">
      <Logo />
      <nav className="header__nav">
        <a href="#/shop">Shop</a>
        <button className="link" onClick={() => section('real-shark')}>The real shark</button>
        <button className="link" onClick={() => section('faq')}>FAQ</button>
      </nav>
      <div className="header__actions">
        <button className={`lights ${lightsOut ? 'is-on' : ''}`} onClick={toggleLights} aria-pressed={lightsOut} title="Lights out">
          <span className="lights__knob" />
          <span className="lights__label">{lightsOut ? 'Lights on' : 'Lights out'}</span>
        </button>
        <button className="cart-btn" onClick={onCart} aria-label={`Cart, ${count} items`}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M6 7h12l-1.2 11.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 7Z M9 7V6a3 3 0 0 1 6 0v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          {count > 0 && <span className="cart-btn__n">{count}</span>}
        </button>
      </div>
    </header>
  )
}
