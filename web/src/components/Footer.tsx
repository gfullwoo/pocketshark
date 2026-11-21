import { Logo } from './Logo'

const YEAR = new Date().getFullYear()

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__row">
        <Logo />
        <p>
          A plush tribute to <i>Mollisquama mississippiensis</i>, known from a single 5.5" specimen caught in the Gulf of Mexico.
        </p>
      </div>
      <div className="footer__row footer__fine">
        <span>© {YEAR} mypocketshark.com</span>
        <span>Ages 3+ · Surface wash only · Secure checkout by Stripe</span>
      </div>
    </footer>
  )
}
