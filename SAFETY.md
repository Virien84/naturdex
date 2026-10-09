# Safety in NaturDex

NaturDex is used by children on school field trips. These are the rules the app follows,
and where the data behind them comes from.

## 1. Look, don't touch

Every species card can carry a short warning, chosen by `embeddings/safety.py`:

| Level | Examples | Message |
|---|---|---|
| **danger** | Baskian viper and every other snake, Asian hornet, pine processionary, foxglove, hemlock water-dropwort, death cap | Stay away, don't touch, tell your teacher |
| **caution** | wasps and bees, nettles, buttercups, ticks, fire salamander | Take care: may sting, irritate or be poisonous if eaten |
| group rule | all mushrooms, all amphibians, all snakes | "Never eat wild mushrooms", "don't touch its delicate skin", snakes always get the **danger** message |
| protected | 283 species protected by Spain or Asturias | "Look, but don't touch or disturb it" |

The dangerous species are hand-curated in [`embeddings/safety/dangerous.csv`](embeddings/safety/dangerous.csv),
each with a source. If one of them has been recorded in the region but is too rare to make the
species list, it is **added anyway**: the classifier can only warn about species it knows.

**NaturDex never says that anything is edible.**

## 2. When in doubt, warn

The classifier is not always sure, so the app is cautious:

- **Precaution rule:** if *any* of the top-5 candidates with at least 5% probability has a warning,
  the app shows it ("This might be a Baskian viper — stay away!"), even if it isn't the top answer.
- **Low confidence:** when the model is unsure, the "take a closer photo" message also reminds
  the child never to approach snakes or touch unknown plants and mushrooms.

Tested with `embeddings/evaluate.py` on 244 recent research-grade iNaturalist photos from Spain
(82 species, including every "danger" species), using the int8 model that ships to the phone:

| | top-1 | top-3 | top-5 | photos of hazardous species that get a warning |
|---|---|---|---|---|
| int8 (phone) | 66% | 81% | 86% | 118 / 124 (95%) |

**Why every snake is "danger":** in the test, the model identified a venomous Baskian viper as a
harmless viperine snake with 96% confidence. Children can't tell them apart either, so NaturDex
never relies on that difference.

The 6 photos without a warning are two Baskian vipers camouflaged in leaf litter (hard to spot even
for people), a dull fire salamander at night, a gold-striped salamander, a brown-tail moth and a hemlock
(*Conium maculatum*) plant. In all of them the top answer was below 90% or plainly wrong, so the
low-confidence message — which carries a safety reminder — is what protects the child there.

## 3. Hide where threatened species live

Photos keep their GPS position, but for threatened species the position is hidden
(`hide_location`), as iNaturalist does, so a shared album can't lead anyone to a nest or a rare plant.
A species is threatened if it is "Vulnerable" or "In danger of extinction" in the Spanish or
Asturian catalogue, or VU/EN/CR on the IUCN Red List, or listed in
[`embeddings/safety/sensitive.csv`](embeddings/safety/sensitive.csv) (e.g. the wolf, which is persecuted).

## 4. Data never leaves the phone

No accounts, no uploads, no analytics. Photos, positions and the album live in the phone's
IndexedDB. The model runs on the device.

## 5. Facts come from verified sources

Species facts come from curated sources (GBIF, Wikipedia). An AI model may only rephrase
them for children, never invent them.

## Sources

- **Spain:** *Listado de Especies Silvestres en Régimen de Protección Especial* and *Catálogo Español
  de Especies Amenazadas* (Royal Decree 139/2011), spreadsheet updated 30 June 2025 by MITECO.
- **Asturias:** Annex I of the 2017 draft decree for the *Catálogo Asturiano de Especies Amenazadas*.
  The catalogues in force (Decrees 32/1990 and 65/1995) are not available as machine-readable text.
- **IUCN Red List** categories, through the GBIF API.

## Known limitations

- When only a subspecies is listed (often a Canary Islands one), the whole species is marked as
  protected but not as threatened.
- The Asturian list comes from a draft that was never approved; it is used because, for a
  safety feature, covering too much is better than covering too little.
- The hazard list is not a medical reference. When in doubt, the rule is always: don't touch.
