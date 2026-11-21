import { useEffect, useState } from 'react'
import { useCart } from './lib/cart'
import { useRoute } from './lib/nav'
import { Header } from './components/Header'
import { CartDrawer } from './components/CartDrawer'
import { Footer } from './components/Footer'
import { MarineSnow } from './components/MarineSnow'
import { SwimmingSharks } from './components/SwimmingSharks'
import { Home } from './views/Home'
import { Shop } from './views/Shop'
import { Thanks } from './views/Thanks'
import { Play } from './views/Play'

export default function App() {
  const route = useRoute()
  const cart = useCart()
  const [cartOpen, setCartOpen] = useState(false)
  const [lightsOut, setLightsOut] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('lights-out', lightsOut)
  }, [lightsOut])

  const toggleLights = () => setLightsOut((v) => !v)

  let page
  if (route.path === '/shop') page = <Shop key={route.query.toString()} cart={cart} query={route.query} onAdded={() => setCartOpen(true)} />
  else if (route.path === '/thanks') page = <Thanks query={route.query} onPaid={cart.clear} />
  else if (route.path === '/play') page = <Play />
  else page = <Home />

  return (
    <>
      <MarineSnow />
      <SwimmingSharks />
      <Header count={cart.count} onCart={() => setCartOpen(true)} lightsOut={lightsOut} toggleLights={toggleLights} />
      <main>{page}</main>
      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} />
    </>
  )
}
