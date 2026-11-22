import { useMemo, useState } from 'react'
import { BOOKS, BOOK_INDEX, SECTIONS, scoreGuess, versesFor } from './versiculos'

const PRESETS = [5, 10, 15, 20, 30]
const TESTAMENTS = [
  ['ambos', 'Toda la Biblia'],
  ['at', 'Antiguo T.'],
  ['nt', 'Nuevo T.'],
]
const STORAGE_KEY = 'charadas-biblicas:citas'

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (s && Array.isArray(s.names) && s.names.length && s.total > 0) return s
  } catch {
    // sin almacenamiento disponible
  }
  return { names: ['Jugador 1', 'Jugador 2'], total: 10, testament: 'ambos' }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function verdict(points, exact) {
  if (exact) return ['¡Exacto!', 'good']
  if (points >= 50) return ['Muy cerca', 'good']
  if (points >= 30) return ['Cerca', 'mid']
  if (points > 0) return ['Algo lejos', 'mid']
  return ['Lejos', 'bad']
}

export default function Citas({ onBack }) {
  const [settings, setSettings] = useState(loadSettings)
  const [game, setGame] = useState(null) // { players, deck, round, phase, last }

  const save = (s) => {
    setSettings(s)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      // ignorar
    }
  }

  const start = () => {
    const players = settings.names.map((n, i) => ({ name: n.trim() || `Jugador ${i + 1}`, score: 0, hits: 0, turns: 0 }))
    const deck = shuffle(versesFor(settings.testament)).slice(0, settings.total)
    setGame({ players, deck, round: 0, phase: 'play', last: null, history: [] })
  }

  if (!game) return <Setup settings={settings} save={save} onStart={start} onBack={onBack} />

  const toSetup = () => setGame(null)

  if (game.phase === 'end') return <End game={game} onAgain={start} onSetup={toSetup} />

  const verse = game.deck[game.round]
  const playerIdx = game.round % game.players.length

  if (game.phase === 'reveal') {
    const isLast = game.round + 1 >= game.deck.length
    return (
      <Reveal
        game={game}
        verse={verse}
        isLast={isLast}
        onExit={toSetup}
        onNext={() =>
          setGame((g) => (isLast ? { ...g, phase: 'end' } : { ...g, round: g.round + 1, phase: 'play', last: null }))
        }
      />
    )
  }

  return (
    <Play
      key={game.round}
      game={game}
      verse={verse}
      player={game.players[playerIdx]}
      testament={settings.testament}
      onExit={toSetup}
      onAnswer={(guess, usedHint) => {
        const answer = BOOK_INDEX[verse[0]]
        const points = scoreGuess(guess, answer, usedHint)
        setGame((g) => ({
          ...g,
          phase: 'reveal',
          players: g.players.map((p, i) =>
            i === playerIdx
              ? { ...p, score: p.score + points, hits: p.hits + (guess === answer ? 1 : 0), turns: p.turns + 1 }
              : p,
          ),
          last: { guess, answer, points, usedHint, playerIdx },
          history: [...g.history, { verse, guess, points, usedHint, playerIdx }],
        }))
      }}
    />
  )
}

function Setup({ settings, save, onStart, onBack }) {
  const max = versesFor(settings.testament).length
  const total = Math.min(settings.total, max)
  const [draft, setDraft] = useState(String(total))
  const set = (patch) => save({ ...settings, ...patch })

  const setTotal = (n) => {
    const v = Math.max(1, Math.min(max, Math.round(n) || 1))
    setDraft(String(v))
    set({ total: v })
  }

  return (
    <main className="menu">
      <button className="back" onClick={onBack}>← Inicio</button>
      <header>
        <div className="logo">📜</div>
        <h1>¿De qué libro es?</h1>
        <p className="tagline">Sale una cita y adivinas el libro. Mientras más cerca quedes, más puntos.</p>
      </header>

      <section>
        <h2>Versículos en total</h2>
        <div className="chips">
          {PRESETS.filter((n) => n <= max).map((n) => (
            <button key={n} className={'chip' + (total === n ? ' on' : '')} onClick={() => setTotal(n)}>
              {n}
            </button>
          ))}
          <input
            className="cit-number"
            type="number"
            inputMode="numeric"
            min="1"
            max={max}
            value={draft}
            aria-label="Cantidad de versículos"
            onChange={(e) => {
              setDraft(e.target.value)
              if (e.target.value !== '') setTotal(+e.target.value)
            }}
            onBlur={() => setDraft(String(total))}
          />
        </div>
        <p className="cit-note">Se reparten por turnos. Hay {max} citas disponibles con esta selección.</p>
      </section>

      <section>
        <h2>Citas de</h2>
        <div className="chips">
          {TESTAMENTS.map(([id, label]) => (
            <button
              key={id}
              className={'chip' + (settings.testament === id ? ' on' : '')}
              onClick={() => {
                const m = versesFor(id).length
                const t = Math.min(settings.total, m)
                setDraft(String(t))
                set({ testament: id, total: t })
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Jugadores o equipos</h2>
        <div className="cit-players">
          {settings.names.map((n, i) => (
            <div key={i} className="cit-player">
              <input
                type="text"
                value={n}
                maxLength={24}
                aria-label={`Nombre ${i + 1}`}
                onChange={(e) => set({ names: settings.names.map((x, j) => (j === i ? e.target.value : x)) })}
              />
              {settings.names.length > 1 && (
                <button
                  className="cit-remove"
                  aria-label="Quitar"
                  onClick={() => set({ names: settings.names.filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {settings.names.length < 8 && (
            <button
              className="secondary"
              onClick={() => set({ names: [...settings.names, `Jugador ${settings.names.length + 1}`] })}
            >
              + Agregar jugador
            </button>
          )}
        </div>
      </section>

      <section className="cit-rules">
        <div><span>Libro exacto</span><b>100</b></div>
        <div><span>A 1 libro de distancia</span><b>70</b></div>
        <div><span>Cada libro más lejos</span><b>−7</b></div>
        <div><span>Misma sección, como mínimo</span><b>40</b></div>
        <div><span>Usando la pista</span><b>la mitad</b></div>
      </section>

      <button className="play" onClick={onStart}>
        ¡Jugar! <small>{total} versículos</small>
      </button>
    </main>
  )
}

function Play({ game, verse, player, testament, onAnswer, onExit }) {
  const [guess, setGuess] = useState(null)
  const [hint, setHint] = useState(false)
  const [filter, setFilter] = useState('')
  const answerSec = BOOKS[BOOK_INDEX[verse[0]]].sec
  const multi = game.players.length > 1

  const sections = useMemo(() => {
    const f = plain(filter.trim())
    return SECTIONS.map((s, si) => ({ ...s, si, books: s.b.filter((n) => !f || plain(n).includes(f)) })).filter(
      (s) => s.books.length && (testament === 'ambos' || (testament === 'nt') === s.si >= 5),
    )
  }, [filter, testament])

  return (
    <main className="menu cit-play">
      <div className="cit-top">
        <button className="exit" onClick={onExit} aria-label="Salir">✕</button>
        <div className="cit-turn">{multi ? <>Turno de <b>{player.name}</b></> : 'Tu turno'}</div>
        <div className="score">{game.round + 1}/{game.deck.length}</div>
      </div>

      <blockquote className="cit-verse" key={game.round}>
        {verse[2]}
        <span className="cit-ref">— ¿? {verse[1]}</span>
      </blockquote>

      {hint ? (
        <div className="cit-hint">Pista: {SECTIONS[answerSec].n}</div>
      ) : (
        <button className="secondary" onClick={() => setHint(true)}>
          💡 Pista: ver la sección (vale la mitad)
        </button>
      )}

      <input
        className="cit-filter"
        type="text"
        placeholder="Buscar libro…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        aria-label="Buscar libro"
        autoComplete="off"
      />

      <div className="cit-groups">
        {sections.length ? (
          sections.map((s) => (
            <section key={s.si}>
              <h2>{s.n}</h2>
              <div className="chips">
                {s.books.map((n) => (
                  <button
                    key={n}
                    className={'chip cit-book' + (guess === BOOK_INDEX[n] ? ' on' : '')}
                    onClick={() => setGuess(BOOK_INDEX[n])}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="cit-note">Ningún libro coincide con “{filter}”.</p>
        )}
      </div>

      <button className="play cit-go" disabled={guess === null} onClick={() => onAnswer(guess, hint)}>
        {guess === null ? 'Elige un libro' : `Responder: ${BOOKS[guess].name}`}
      </button>
    </main>
  )
}

function FullVerse({ verse }) {
  const [book, ref, , full] = verse
  return (
    <blockquote className="cit-verse small cit-full">
      {full.map(([n, t]) => (
        <p key={n}>
          <sup>{n}</sup>
          {t}
        </p>
      ))}
      <span className="cit-ref">— {book} {ref} (RVR1960)</span>
    </blockquote>
  )
}

function CanonStrip({ guess, answer }) {
  const lo = Math.min(guess, answer)
  const hi = Math.max(guess, answer)
  return (
    <div className="cit-canon-wrap">
      <div
        className="cit-canon"
        role="img"
        aria-label={`Tu respuesta: ${BOOKS[guess].name}. Correcta: ${BOOKS[answer].name}`}
      >
        {BOOKS.map((b) => (
          <i
            key={b.i}
            title={b.name}
            className={
              (b.i >= lo && b.i <= hi ? 'span ' : '') + (b.i === answer ? 'ans ' : '') + (b.i === guess ? 'gue' : '')
            }
          />
        ))}
      </div>
      <div className="cit-legend">
        <span className="l-gue">Tu respuesta</span>
        <span className="l-ans">Correcta</span>
        <span>Génesis → Apocalipsis</span>
      </div>
    </div>
  )
}

function Board({ players }) {
  const sorted = [...players].sort((a, b) => b.score - a.score)
  const top = sorted[0].score
  return (
    <ul className="cit-board">
      {sorted.map((p, i) => (
        <li key={i} className={p.score === top && top > 0 ? 'lead' : ''}>
          <span>
            {p.name}
            {p.turns > 0 && <small> · {p.hits} de {p.turns} exactos</small>}
          </span>
          <b>{p.score}</b>
        </li>
      ))}
    </ul>
  )
}

function Reveal({ game, verse, isLast, onNext, onExit }) {
  const { guess, answer, points, usedHint, playerIdx } = game.last
  const d = Math.abs(guess - answer)
  const [label, tone] = verdict(points, d === 0)
  const multi = game.players.length > 1
  const next = game.players[(game.round + 1) % game.players.length]

  return (
    <main className="menu cit-play">
      <div className="cit-top">
        <button className="exit" onClick={onExit} aria-label="Salir">✕</button>
        <div className="cit-turn">{multi ? <b>{game.players[playerIdx].name}</b> : 'Resultado'}</div>
        <div className="score">{game.round + 1}/{game.deck.length}</div>
      </div>

      <div className={'cit-result ' + tone}>
        <div>
          <div className="cit-verdict">{label}</div>
          <div className="cit-note">
            {d === 0 ? 'Diste en el libro justo' : `A ${d} ${d === 1 ? 'libro' : 'libros'} de distancia`}
            {usedHint && ' · con pista'}
          </div>
        </div>
        <div className="cit-points">+{points}</div>
      </div>

      <div className="cit-compare">
        <div>
          <h2>Tu respuesta</h2>
          <b>{BOOKS[guess].name}</b>
          <small>{SECTIONS[BOOKS[guess].sec].n}</small>
        </div>
        <div>
          <h2>Correcta</h2>
          <b>{BOOKS[answer].name} {verse[1]}</b>
          <small>{SECTIONS[BOOKS[answer].sec].n}</small>
        </div>
      </div>

      <CanonStrip guess={guess} answer={answer} />

      <section>
        <h2>El versículo completo</h2>
        <FullVerse verse={verse} />
      </section>

      {multi ? (
        <section>
          <h2>Marcador</h2>
          <Board players={game.players} />
        </section>
      ) : (
        <p className="tagline">Puntaje: {game.players[0].score} de {(game.round + 1) * 100}</p>
      )}

      <button className="play" onClick={onNext}>
        {isLast ? 'Ver resultados' : multi ? `Siguiente: ${next.name}` : 'Siguiente cita'}
      </button>
    </main>
  )
}

function End({ game, onAgain, onSetup }) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score)
  const winners = sorted.filter((p) => p.score === sorted[0].score)
  const multi = game.players.length > 1

  return (
    <main className="results">
      <h1>{multi ? (winners.length > 1 ? '¡Empate!' : `¡Gana ${winners[0].name}!`) : '¡Terminaste!'}</h1>
      <div className="final-score">{sorted[0].score}</div>
      <p className="tagline">puntos · {game.deck.length} versículos (máximo 100 por cita)</p>
      <Board players={game.players} />

      <section className="cit-review">
        <h2>Los versículos de la partida</h2>
        {game.history.map((h, i) => {
          const answer = BOOK_INDEX[h.verse[0]]
          const [, tone] = verdict(h.points, h.guess === answer)
          return (
            <div key={i} className="cit-review-item">
              <div className="cit-review-head">
                <span>
                  {i + 1}. {multi && <b>{game.players[h.playerIdx].name}: </b>}
                  {h.guess === answer ? 'acertó' : `respondió ${BOOKS[h.guess].name}`}
                  {h.usedHint && ' (con pista)'}
                </span>
                <b className={'cit-tone ' + tone}>+{h.points}</b>
              </div>
              <FullVerse verse={h.verse} />
            </div>
          )
        })}
      </section>

      <div className="actions">
        <button className="play" onClick={onAgain}>Jugar otra vez</button>
        <button className="secondary" onClick={onSetup}>Cambiar ajustes</button>
      </div>
    </main>
  )
}
