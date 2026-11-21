import front from '../assets/photos/front.jpg'
import side from '../assets/photos/side.jpg'
import threeQuarter from '../assets/photos/three-quarter.jpg'
import top from '../assets/photos/top.jpg'

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
