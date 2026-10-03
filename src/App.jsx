import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES } from './words'
import WordSearch from './WordSearch'

const DURATIONS = [30, 60, 90, 0] // 0 = sin límite
const STORAGE_KEY = 'charadas-biblicas:settings'

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (s && Array.isArray(s.selected) && DURATIONS.includes(s.duration)) return s
  } catch {
    // sin almacenamiento disponible
  }
  return { selected: CATEGORIES.map((c) => c.id), duration: 60 }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let audioCtx
function beep(freq = 600, ms = 120, type = 'sine') {
  try {
    audioCtx ??= new (window.AudioContext || window['webkitAudioContext'])()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000)
    osc.connect(gain).connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + ms / 1000)
  } catch {
    // audio no disponible
  }
}

function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // sin vibración
  }
}

async function enterLandscape() {
  try {
    await document.documentElement.requestFullscreen?.()
    await screen.orientation?.lock?.('landscape')
  } catch {
    // no soportado (ej. iOS): el juego funciona igual
  }
}

function leaveLandscape() {
  try {
    screen.orientation?.unlock?.()
    if (document.fullscreenElement) document.exitFullscreen()
  } catch {
    // ignorar
  }
}

export default function App() {
  const [screenName, setScreenName] = useState('home') // home | menu | game | results | sopa
  const [settings, setSettings] = useState(loadSettings)
  const [log, setLog] = useState([])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      // ignorar
    }
  }, [settings])

  const words = useMemo(
    () => CATEGORIES.filter((c) => settings.selected.includes(c.id)).flatMap((c) => c.words),
    [settings.selected],
  )

  const start = () => {
    beep(400, 60)
    enterLandscape()
    setScreenName('game')
  }

  const toMenu = () => {
    leaveLandscape()
    setScreenName('menu')
  }

  if (screenName === 'game') {
    return (
      <Game
        words={words}
        duration={settings.duration}
        onFinish={(result) => {
          setLog(result)
          setScreenName('results')
        }}
        onExit={toMenu}
      />
    )
  }

  if (screenName === 'results') {
    return <Results log={log} onAgain={start} onMenu={toMenu} />
  }

  if (screenName === 'sopa') {
    return <WordSearch onBack={() => setScreenName('home')} />
  }

  if (screenName === 'home') {
    return <Home onCharadas={() => setScreenName('menu')} onSopa={() => setScreenName('sopa')} />
  }

  return (
    <Menu
      settings={settings}
      setSettings={setSettings}
      count={words.length}
      onStart={start}
      onBack={() => setScreenName('home')}
    />
  )
}

function Home({ onCharadas, onSopa }) {
  return (
    <main className="menu">
      <header>
        <div className="logo">📖</div>
        <h1>Juegos Bíblicos</h1>
        <p className="tagline">Elige un juego</p>
      </header>

      <button className="game-card" onClick={onCharadas}>
        <span className="emoji">🎭</span>
        <span>
          <b>Charadas</b>
          <small>Celular en la frente: izquierda pasa, derecha acierta</small>
        </span>
      </button>

      <button className="game-card" onClick={onSopa}>
        <span className="emoji">🔍</span>
        <span>
          <b>Sopa de letras</b>
          <small>Generada al momento por categoría</small>
        </span>
      </button>
    </main>
  )
}

function Menu({ settings, setSettings, count, onStart, onBack }) {
  const toggle = (id) =>
    setSettings((s) => {
      const has = s.selected.includes(id)
      if (has && s.selected.length === 1) return s
      return { ...s, selected: has ? s.selected.filter((x) => x !== id) : [...s.selected, id] }
    })

  return (
    <main className="menu">
      <button className="back" onClick={onBack}>← Inicio</button>
      <header>
        <div className="logo">📖</div>
        <h1>Charadas Bíblicas</h1>
        <p className="tagline">Pon el celular en tu frente y adivina</p>
      </header>

      <section>
        <h2>Categorías</h2>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={'chip' + (settings.selected.includes(c.id) ? ' on' : '')}
              onClick={() => toggle(c.id)}
            >
              <span>{c.emoji}</span> {c.name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Tiempo</h2>
        <div className="chips">
          {DURATIONS.map((d) => (
            <button
              key={d}
              className={'chip' + (settings.duration === d ? ' on' : '')}
              onClick={() => setSettings((s) => ({ ...s, duration: d }))}
            >
              {d ? `${d} s` : '∞ Sin límite'}
            </button>
          ))}
        </div>
      </section>

      <section className="how">
        <div><b>◀ Izquierda</b> = Pasar</div>
        <div><b>Derecha ▶</b> = ¡Acerté!</div>
      </section>

      <button className="play" onClick={onStart}>
        ¡Jugar! <small>{count} palabras</small>
      </button>
    </main>
  )
}

function Game({ words, duration, onFinish, onExit }) {
  const [phase, setPhase] = useState('countdown') // countdown | playing
  const [count, setCount] = useState(3)
  const [timeLeft, setTimeLeft] = useState(duration)
  const unlimited = duration === 0
  const [word, setWord] = useState('')
  const [score, setScore] = useState(0)
  const [turn, setTurn] = useState(0)
  const [flash, setFlash] = useState(null) // { type, id }

  const deck = useRef({ list: [], i: 0 })
  const log = useRef([])
  const lockedUntil = useRef(0)
  const finished = useRef(false)

  const nextWord = () => {
    const d = deck.current
    if (d.i >= d.list.length) {
      const last = d.list[d.list.length - 1]
      let fresh = shuffle(words)
      if (fresh.length > 1 && fresh[0] === last) fresh = [...fresh.slice(1), fresh[0]]
      d.list = fresh
      d.i = 0
    }
    setWord(d.list[d.i++])
    setTurn((t) => t + 1)
  }

  // Cuenta regresiva
  useEffect(() => {
    if (phase !== 'countdown') return
    if (count === 0) {
      beep(900, 250, 'triangle')
      deck.current = { list: shuffle(words), i: 0 }
      log.current = []
      finished.current = false
      nextWord()
      setPhase('playing')
      return
    }
    beep(500, 100)
    const t = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count])

  // Temporizador
  useEffect(() => {
    if (phase !== 'playing') return
    const startedAt = Date.now()
    const endAt = startedAt + duration * 1000
    let lastBeep = null
    const id = setInterval(() => {
      if (unlimited) {
        setTimeLeft(Math.floor((Date.now() - startedAt) / 1000))
        return
      }
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 5 && left > 0 && left !== lastBeep) {
        lastBeep = left
        beep(700, 80, 'square')
      }
      if (left === 0 && !finished.current) {
        finished.current = true
        clearInterval(id)
        beep(300, 500, 'sawtooth')
        vibrate([200, 100, 200])
        onFinish(log.current)
      }
    }, 200)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Mantener la pantalla encendida
  useEffect(() => {
    let lock
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => lock?.release().catch(() => {})
  }, [])

  const answer = (ok) => {
    if (phase !== 'playing' || finished.current) return
    const now = performance.now()
    if (now < lockedUntil.current) return
    lockedUntil.current = now + 300

    log.current.push({ word, ok })
    if (ok) setScore((s) => s + 1)
    setFlash({ type: ok ? 'ok' : 'skip', id: now })
    if (ok) {
      beep(880, 140, 'triangle')
      vibrate(40)
    } else {
      beep(240, 140, 'triangle')
      vibrate(20)
    }
    nextWord()
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') answer(false)
      if (e.key === 'ArrowRight') answer(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const urgent = !unlimited && phase === 'playing' && timeLeft <= 10
  const finishNow = () => {
    if (finished.current) return
    finished.current = true
    beep(300, 300, 'sawtooth')
    onFinish(log.current)
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className={'game' + (urgent ? ' urgent' : '')}>
      <div
        className="zone skip"
        onPointerDown={(e) => {
          e.preventDefault()
          answer(false)
        }}
      >
        <span className="zone-label">
          <i>◀</i> PASAR
        </span>
      </div>
      <div
        className="zone ok"
        onPointerDown={(e) => {
          e.preventDefault()
          answer(true)
        }}
      >
        <span className="zone-label">
          ¡ACERTÉ! <i>▶</i>
        </span>
      </div>

      {flash && <div key={flash.id} className={'flash ' + flash.type} />}

      <div className="hud">
        {unlimited && phase === 'playing' ? (
          <button className="finish" onPointerDown={(e) => e.stopPropagation()} onClick={finishNow}>
            Terminar
          </button>
        ) : (
          <button className="exit" onPointerDown={(e) => e.stopPropagation()} onClick={onExit}>
            ✕
          </button>
        )}
        <div className="time">
          {unlimited ? (phase === 'playing' ? fmt(timeLeft) : '∞') : phase === 'playing' ? timeLeft : duration}
        </div>
        <div className="score">✔ {score}</div>
      </div>

      <div className="center">
        {phase === 'countdown' ? (
          <>
            <div className="hint">Ponte el celular en la frente</div>
            <div className="big-count" key={count}>{count || '¡YA!'}</div>
          </>
        ) : (
          <div className="word" key={turn}>{word}</div>
        )}
      </div>
    </div>
  )
}

function Results({ log, onAgain, onMenu }) {
  const correct = log.filter((l) => l.ok)
  const skipped = log.filter((l) => !l.ok)

  return (
    <main className="results">
      <h1>¡Tiempo!</h1>
      <div className="final-score">{correct.length}</div>
      <p className="tagline">{correct.length === 1 ? 'palabra acertada' : 'palabras acertadas'}</p>

      <div className="lists">
        <div>
          <h2 className="ok-title">✔ Acertadas</h2>
          <ul>
            {correct.length ? correct.map((l, i) => <li key={i}>{l.word}</li>) : <li className="none">—</li>}
          </ul>
        </div>
        <div>
          <h2 className="skip-title">✖ Pasadas</h2>
          <ul>
            {skipped.length ? skipped.map((l, i) => <li key={i}>{l.word}</li>) : <li className="none">—</li>}
          </ul>
        </div>
      </div>

      <div className="actions">
        <button className="play" onClick={onAgain}>Jugar otra vez</button>
        <button className="secondary" onClick={onMenu}>Menú</button>
      </div>
    </main>
  )
}
