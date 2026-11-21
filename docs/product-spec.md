# Pocket Shark Plush: Product Spec

A plush version of the American pocket shark (*Mollisquama mississippiensis*), sold at mypocketshark.com. It's a single design: gray minky with glow-in-the-dark accents, in three sizes. Product photos are in `web/src/assets/photos/`.

## Lineup

| Size | Length (nose to tail) | Retail | SKU |
|---|---|---|---|
| Pocket | 5" | $19 | `PS-POCKET` |
| Cuddle | 12" | $39 | `PS-CUDDLE` |
| Jumbo | 18" | $69 | `PS-JUMBO` |

The real shark measures 5.5", so the 5" Pocket is essentially life-size. That's the main marketing hook. Prices are set in `server/src/catalog.ts`.

## Design (per the sample photos)

- **Body:** soft gray short-pile minky with darker gray mottling and a center seam over the head. The head is round with a blunt snout, and the body tapers to an upturned tail.
- **Fins:** two rounded dorsal fins, two pectoral fins, small pelvic fins and a forked tail. All are stuffed soft, never stiffened.
- **Pockets:** a working pocket behind each pectoral fin, lined in glow-in-the-dark fabric (pale green in daylight).
- **Face:** glossy black locking safety eyes, an embroidered smile, and three embroidered gill slits on each side.
- **Spots:** rows of light stitched spots down the back and sides, a nod to the real shark's photophores. **Open question:** are these stitched in glow thread?

## Glow-in-the-dark accents

- **Material:** phosphorescent fabric (typically a strontium aluminate pigment) for the pocket linings, plus glow thread if the spots are meant to glow too.
- **Verify on samples:** how long it takes to charge (target is 10–15 minutes under a lamp), how bright it is in the first minutes, and how long the glow stays visible. The site copy says the glow "fades gently"; keep it in line with what the samples actually do.
- **Care:** heat and heavy washing reduce brightness, so the care instructions say surface wash only.

## Materials

- **Shell:** gray minky, about 2 mm pile.
- **Pocket lining:** glow-in-the-dark fabric.
- **Fill:** new polyester fiberfill. No loose pellets or beads.
- **Eyes:** locking plastic safety eyes with washers, which must pass the ASTM F963 torque and tension tests.
- **Embroidery:** polyester thread.

## Labels and packaging

- **Sewn-in law tag:** fiber content ("All new material consisting of polyester fibers"), country of origin, age grade (3+), care (surface wash), and a CPSIA tracking label (manufacturer, production date, batch or lot).
- **Hang tag:** a pocket-shark fact card (life-size callout, caught in 2010, named in 2019), plus a "charge me in the light" instruction.
- **Packaging:** a polybag with a suffocation warning, then a mailer. For the 18", consider vacuum compression to cut shipping volume.

## Compliance (US, ages 3+)

- **ASTM F963 toy safety:** use and abuse testing, seam strength, small parts, eye torque and tension, sharp points and edges, and flammability.
- **CPSIA:** lead and phthalates testing by a CPSC-accepted third-party lab, and a Children's Product Certificate (CPC) for each product before selling.
- **Glow pigment:** have the lab include the glow fabric in heavy-metals testing.
- **State labeling:** some states have had stuffed-toy registration or law-label rules. Check what currently applies before printing tags.

## Manufacturing path

1. Send this spec and the photos to 2–3 plush makers for quotes. Ask whether the minimum order is per size or overall.
2. Sample the 12" first, then the 5" and 18".
3. Do lab testing and the CPC on the final production samples.
4. Make the first production run.
5. Shoot a lights-off photo of the glow for the site.

## Open decisions

- Final prices once landed cost is known.
- Whether the spots glow (glow thread) or are standard stitching.
- Return policy and ship-time copy. The site currently says 30 days and 3–7 business days.
