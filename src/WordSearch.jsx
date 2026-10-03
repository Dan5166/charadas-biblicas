import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES } from './words'
import { LEVELS, SNAP_DIRS, generatePuzzle } from './sopa'

const COLORS = [
  '#ff8a8a', '#ffb86b', '#ffe066', '#8ce99a', '#66d9e8',
  '#74a7ff', '#b197fc', '#f783ac', '#a9e34b', '#63e6be',
]

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const sameCells = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/** Ajusta el arrastre a una línea recta (8 direcciones) dentro del tablero. */
function snapSelection(start, cur, size) {
  const dr = cur.r - start.r
  const dc = cur.c - start.c
  if (dr === 0 && dc === 0) return [start.r * size + start.c]

  const k = (Math.round(Math.atan2(dr, dc) / (Math.PI / 4)) + 8) % 8
  const [sr, sc] = SNAP_DIRS[k]
  let len = Math.round((dr * sr + dc * sc) / (sr * sr + sc * sc))
  while (len > 0) {
    const er = start.r + sr * len
    const ec = start.c + sc * len
    if (er >= 0 && er < size && ec >= 0 && ec < size) break
    len--
  }
  const cells = []
  for (let i = 0; i <= len; i++) cells.push((start.r + sr * i) * size + (start.c + sc * i))
  return cells
}

export default function WordSearch({ onBack }) {
  const [cat, setCat] = useState('mix')
  const [levelId, setLevelId] = useState('media')
  const [puzzle, setPuzzle] = useState(null)
  const [pdf, setPdf] = useState(false)
  const [answers, setAnswers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const build = (catId = cat, lvId = levelId) => {
    const level = LEVELS.find((l) => l.id === lvId)
    const names = CATEGORIES.filter((c) => catId === 'mix' || c.id === catId).flatMap((c) => c.words)
    return { level, puzzle: generatePuzzle(names, level) }
  }

  const create = (catId, lvId) => setPuzzle(build(catId, lvId).puzzle)

  const submit = async () => {
    if (!pdf) return create()
    setBusy(true)
    setError('')
    try {
      const { level, puzzle: p } = build()
      const categoryName = cat === 'mix' ? 'Mezcla' : CATEGORIES.find((c) => c.id === cat).name
      const { downloadPuzzlePdf } = await import('./pdf')
      await downloadPuzzlePdf(p, { categoryName, levelName: level.name, answers })
    } catch {
      setError('No se pudo crear el PDF. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (puzzle) {
    return <Board puzzle={puzzle} onNew={() => create()} onExit={() => setPuzzle(null)} />
  }

  return (
    <main className="menu">
      <button className="back" onClick={onBack}>← Inicio</button>
      <header>
        <div className="logo">🔍</div>
        <h1>Sopa de Letras</h1>
        <p className="tagline">Encuentra los nombres bíblicos escondidos</p>
      </header>

      <section>
        <h2>Categoría</h2>
        <div className="chips">
          <button className={'chip' + (cat === 'mix' ? ' on' : '')} onClick={() => setCat('mix')}>
            <span>🎲</span> Mezcla
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={'chip' + (cat === c.id ? ' on' : '')}
              onClick={() => setCat(c.id)}
            >
              <span>{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Dificultad</h2>
        <div className="levels">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={'chip level' + (levelId === l.id ? ' on' : '')}
              onClick={() => setLevelId(l.id)}
            >
              <b>{l.name}</b>
              <small>{l.hint}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="options">
        <label className="check">
          <input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />
          <span>📄 Descargar en PDF</span>
        </label>
        {pdf && (
          <label className="check sub">
            <input type="checkbox" checked={answers} onChange={(e) => setAnswers(e.target.checked)} />
            <span>Incluir hoja de respuestas</span>
          </label>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      <button className="play" onClick={submit} disabled={busy}>
        {busy ? 'Creando PDF…' : pdf ? 'Descargar PDF' : 'Generar sopa'}
      </button>
    </main>
  )
}

function Board({ puzzle, onNew, onExit }) {
  const { size, grid, words } = puzzle
  const [found, setFound] = useState([]) // índices de `words`, en orden de hallazgo
  const [sel, setSel] = useState([])
  const [hint, setHint] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const boardRef = useRef(null)
  const start = useRef(null)
  const selRef = useRef([])
  const won = found.length === words.length

  useEffect(() => {
    if (won) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [won])

  useEffect(() => {
    if (hint === null) return
    const t = setTimeout(() => setHint(null), 1800)
    return () => clearTimeout(t)
  }, [hint])

  // celda -> color del último hallazgo que la contiene
  const cellColor = useMemo(() => {
    const map = new Map()
    found.forEach((wi, order) => {
      words[wi].cells.forEach((idx) => map.set(idx, COLORS[order % COLORS.length]))
    })
    return map
  }, [found, words])

  const cellFromEvent = (e) => {
    const rect = boardRef.current.getBoundingClientRect()
    const clamp = (n) => Math.min(size - 1, Math.max(0, n))
    return {
      c: clamp(Math.floor(((e.clientX - rect.left) / rect.width) * size)),
      r: clamp(Math.floor(((e.clientY - rect.top) / rect.height) * size)),
    }
  }

  const updateSel = (cells) => {
    selRef.current = cells
    setSel(cells)
  }

  const onDown = (e) => {
    if (won) return
    boardRef.current.setPointerCapture(e.pointerId)
    start.current = cellFromEvent(e)
    updateSel(snapSelection(start.current, start.current, size))
  }

  const onMove = (e) => {
    if (!start.current) return
    updateSel(snapSelection(start.current, cellFromEvent(e), size))
  }

  const onUp = () => {
    if (!start.current) return
    start.current = null
    const cells = selRef.current
    const reversed = [...cells].reverse()
    const hit = words.findIndex(
      (w, i) => !found.includes(i) && (sameCells(w.cells, cells) || sameCells(w.cells, reversed)),
    )
    if (hit >= 0) {
      setFound((f) => [...f, hit])
      try {
        navigator.vibrate?.(40)
      } catch {
        // sin vibración
      }
    }
    updateSel([])
  }

  const giveHint = () => {
    const pending = words.map((w, i) => i).filter((i) => !found.includes(i))
    if (!pending.length) return
    setHint(words[pending[Math.floor(Math.random() * pending.length)]].cells[0])
  }

  const selSet = new Set(sel)

  return (
    <main className="sopa">
      <div className="sopa-top">
        <button className="exit" onClick={onExit}>✕</button>
        <div className="time">{fmt(elapsed)}</div>
        <div className="score">{found.length}/{words.length}</div>
      </div>

      <div
        ref={boardRef}
        className="board"
        style={{ '--size': size }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {grid.map((letter, idx) => (
          <div
            key={idx}
            className={'cell' + (selSet.has(idx) ? ' sel' : '') + (hint === idx ? ' hint' : '')}
            style={cellColor.has(idx) && !selSet.has(idx) ? { background: cellColor.get(idx), color: '#1b1440' } : undefined}
          >
            {letter}
          </div>
        ))}
      </div>

      <ul className="wordlist">
        {words.map((w, i) => {
          const order = found.indexOf(i)
          return (
            <li
              key={w.word}
              className={order >= 0 ? 'done' : ''}
              style={order >= 0 ? { background: COLORS[order % COLORS.length] } : undefined}
            >
              {w.name}
            </li>
          )
        })}
      </ul>

      <button className="secondary hint-btn" onClick={giveHint} disabled={won}>
        💡 Pista
      </button>

      {won && (
        <div className="overlay">
          <div className="modal">
            <div className="logo">🎉</div>
            <h1>¡Completada!</h1>
            <p className="tagline">Tiempo: {fmt(elapsed)}</p>
            <div className="actions">
              <button className="play" onClick={onNew}>Nueva sopa</button>
              <button className="secondary" onClick={onExit}>Cambiar opciones</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
