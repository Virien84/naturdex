// What NaturDex thinks the photo shows: one answer, a choice of three, or
// "not sure". Safety warnings always come first.
import { UNSURE_REMINDER, displayName, withArticle } from '../ml/classifier.js'

// `sure` is the species NaturDex is confident about: its warning has no "?"
function Warnings({ warnings, sure }) {
  return warnings.map(({ level, text, species }) => (
    <p key={text} className={`banner ${level}`}>
      {level === 'danger' ? '⚠️' : '✋'}{' '}
      {species !== sure && <strong>Could it be {withArticle(species)}? </strong>}
      {text}
    </p>
  ))
}

function Percent({ value }) {
  return <span className="hint">{Math.round(value * 100)}%</span>
}

function Choice({ candidate, onPick }) {
  const { species, probability } = candidate
  return (
    <button type="button" className="choice" onClick={() => onPick(candidate)}>
      <span>
        <strong>{displayName(species)}</strong>
        <br />
        <em>{species.scientific}</em> · {species.kind}
      </span>
      <Percent value={probability} />
    </button>
  )
}

export default function SpeciesCard({ result, onPick, onRetake }) {
  const { verdict, candidates, warnings } = result
  const [best] = candidates

  return (
    <div className="card">
      <Warnings warnings={warnings} sure={verdict === 'confident' ? best.species : null} />

      {verdict === 'confident' && (
        <>
          <h2>
            It's {withArticle(best.species)}! <Percent value={best.probability} />
          </h2>
          <p>
            <em>{best.species.scientific}</em> · {best.species.kind}
          </p>
          {best.species.safety.protected && <p className="hint">🛡️ Protected species: look, but don't disturb it.</p>}
          <button type="button" className="primary" onClick={() => onPick(best)}>
            Add to my NaturDex
          </button>
          <details>
            <summary>Not this one?</summary>
            {candidates.slice(1, 3).map((c) => (
              <Choice key={c.species.key} candidate={c} onPick={onPick} />
            ))}
          </details>
        </>
      )}

      {verdict === 'maybe' && (
        <>
          <h2>Which one is it?</h2>
          {candidates.slice(0, 3).map((c) => (
            <Choice key={c.species.key} candidate={c} onPick={onPick} />
          ))}
        </>
      )}

      {verdict === 'unsure' && (
        <>
          <h2>Hmm, I'm not sure…</h2>
          <p>Try again closer, with the plant or animal in the middle of the photo.</p>
          <p className="banner caution">✋ {UNSURE_REMINDER}</p>
        </>
      )}

      <button type="button" className="link" onClick={onRetake}>
        {verdict === 'unsure' ? 'Take another photo' : 'None of these — take another photo'}
      </button>
    </div>
  )
}
