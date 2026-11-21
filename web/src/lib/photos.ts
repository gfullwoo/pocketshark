import front from '../assets/photos/front.jpg'
import side from '../assets/photos/side.jpg'
import threeQuarter from '../assets/photos/three-quarter.jpg'
import top from '../assets/photos/top.jpg'
import sizePocket from '../assets/photos/size-pocket.jpg'
import sizeCuddle from '../assets/photos/size-cuddle.jpg'
import sizeJumbo from '../assets/photos/size-jumbo.jpg'
import sizeKeychain from '../assets/photos/size-keychain.jpg'
import type { SizeId } from '../../../server/src/catalog'

export interface Photo {
  id: string
  src: string
  alt: string
  caption: string
}

export const PHOTOS: Photo[] = [
  { id: 'three-quarter', src: threeQuarter, alt: 'Pocket Shark plush, three-quarter view', caption: 'Big glossy eyes, an embroidered smile and gill slits.' },
  { id: 'side', src: side, alt: 'Pocket Shark plush, side view showing the pocket behind the front fin', caption: 'A real pocket behind each front fin, lined in glow-in-the-dark fabric.' },
  { id: 'top', src: top, alt: 'Pocket Shark plush seen from above', caption: 'Stitched spots down the back, a nod to the real shark’s light organs.' },
  { id: 'front', src: front, alt: 'Pocket Shark plush, front view', caption: 'A round, blunt snout, just like the real thing.' },
]

export const HERO = PHOTOS[0]

/** One photo per size, all shot on the same bed so the scale reads. */
export const SIZE_PHOTOS: Record<SizeId, Photo> = {
  keychain: { id: 'size-keychain', src: sizeKeychain, alt: 'Pocket shark keychain plush held in a hand', caption: 'The Keychain: a 5" Pocket on a chain and split ring.' },
  pocket: { id: 'size-pocket', src: sizePocket, alt: '5 inch Pocket shark plush on a bed', caption: 'The 5" Pocket: life-size, palm-sized.' },
  cuddle: { id: 'size-cuddle', src: sizeCuddle, alt: '12 inch Cuddle shark plush on a bed', caption: 'The 12" Cuddle: the everyday hug size.' },
  jumbo: { id: 'size-jumbo', src: sizeJumbo, alt: '18 inch Jumbo shark plush on a bed', caption: 'The 18" Jumbo: takes up half a pillow.' },
}
