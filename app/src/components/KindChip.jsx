// Coloured label for what kind of living thing a species is ("bird",
// "butterfly"…), like the type badges of a Pokédex. Kinds are grouped into a
// few colours so kids learn to tell the big groups apart.
const GROUPS = {
  plant: ['plant', 'fern', 'grass', 'conifer'],
  fungus: ['fungus', 'lichen'],
  bird: ['bird'],
  mammal: ['mammal'],
  herp: ['reptile', 'amphibian', 'turtle'],
  spider: ['spider', 'harvestman', 'arachnid'],
  mollusc: ['snail or slug'],
}

function groupOf(kind) {
  for (const [group, kinds] of Object.entries(GROUPS)) if (kinds.includes(kind)) return group
  return 'insect' // moths, butterflies, beetles, bees, flies…
}

export default function KindChip({ kind }) {
  return <span className={`chip chip-${groupOf(kind)}`}>{kind}</span>
}
