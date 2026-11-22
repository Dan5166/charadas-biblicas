import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Cualquier imagen que se deje en src/rompecabezas/ aparece sola en el juego.
// El nombre del archivo es el título: "Arca de Noé.jpg" → "Arca de Noé".
const FILES = import.meta.glob('./rompecabezas/*.{jpg,jpeg,png,webp,avif,gif,JPG,JPEG,PNG,WEBP,AVIF,GIF}', {
  eager: true,
  query: '?url',
  import: 'default',
})

function toTitle(path) {
  const name = decodeURIComponent(path.split('/').pop()).replace(/\.[^.]+$/, '')
  const t = name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const IMAGES = Object.entries(FILES)
  .map(([path, url]) => ({ url, title: toTitle(path) }))
  .sort((a, b) => a.title.localeCompare(b.title, 'es'))

const PIECES = [4, 9, 16, 25, 36, 49, 64, 100]
const STORAGE_KEY = 'charadas-biblicas:rompecabezas'
const RANDOM = '__azar__'
const SNAP = 0.35 // distancia para encajar, en fracción del tamaño de una pieza
const TAB_SIZE = 0.32 // cuánto sobresale una lengüeta, en fracción del tamaño de una pieza

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (s && PIECES.includes(s.pieces)) return s
  } catch {
    // sin almacenamiento disponible
  }
  return { pieces: 16, image: RANDOM }
}

/** Filas y columnas que se acercan al número de piezas pedido, según la forma de la imagen. */
function gridFor(pieces, ratio) {
  const cols = Math.max(2, Math.round(Math.sqrt(pieces * ratio)))
  const rows = Math.max(2, Math.round(pieces / cols))
  return { cols, rows }
}

const coin = () => (Math.random() < 0.5 ? 1 : -1)

/** Lengüetas al azar: para cada borde interno, hacia qué lado sale. */
function makeTabs(cols, rows) {
  const h = Array.from({ length: rows + 1 }, (_, r) => Array.from({ length: cols }, () => (r === 0 || r === rows ? 0 : coin())))
  const v = Array.from({ length: rows }, () => Array.from({ length: cols + 1 }, (_, c) => (c === 0 || c === cols ? 0 : coin())))
  const tabs = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) tabs.push({ t: -h[r][c], r: v[r][c + 1], b: h[r + 1][c], l: -v[r][c] })
  return tabs
}

// Forma de la lengüeta: tramos [control 1, control 2, fin] en (avance a lo largo del borde, salida hacia afuera).
const TAB = [
  [[0.4, 0], [0.44, 0.03], [0.41, 0.09]],
  [[0.35, 0.19], [0.38, 0.3], [0.5, 0.3]],
  [[0.62, 0.3], [0.65, 0.19], [0.59, 0.09]],
  [[0.56, 0.03], [0.6, 0], [0.65, 0]],
]

function edge(ax, ay, bx, by, sign) {
  if (!sign) return ` L ${bx} ${by}`
  const dx = bx - ax
  const dy = by - ay
  const P = ([t, n]) => `${(ax + dx * t + dy * n * sign).toFixed(1)} ${(ay + dy * t - dx * n * sign).toFixed(1)}`
  let d = ` L ${P([0.35, 0])}`
  for (const [a, b, c] of TAB) d += ` C ${P(a)} ${P(b)} ${P(c)}`
  return d + ` L ${bx} ${by}`
}

function piecePath(s, m, t) {
  const a = m
  const b = m + s
  return `M ${a} ${a}${edge(a, a, b, a, t.t)}${edge(b, a, b, b, t.r)}${edge(b, b, a, b, t.b)}${edge(a, b, a, a, t.l)} Z`
}

/**
 * Tamaño de pieza, posición del tablero y zona del montón según el espacio disponible.
 * Busca la pieza más grande posible que deje espacio suficiente para el montón.
 */
function computeLayout(W, H, cols, rows, n) {
  const gap = 10
  const pad = 4
  const wide = W > H * 1.1
  const maxS = Math.floor(Math.min((W - 2 * pad) / cols, (H - 2 * pad) / rows))
  let s = maxS
  for (; s > 14; s--) {
    const trayW = wide ? W - cols * s - gap - pad : W
    const trayH = wide ? H : H - rows * s - gap - pad
    const cell = s * (1 + 2 * TAB_SIZE * 0.6)
    if (trayW >= cell && trayH >= cell && trayW * trayH >= n * cell * cell * 0.6) break
  }
  const bw = cols * s
  const bh = rows * s
  const bx = wide ? pad : Math.round((W - bw) / 2)
  const by = wide ? Math.round((H - bh) / 2) : pad
  const tray = wide
    ? { x: bx + bw + gap, y: 0, w: W - (bx + bw + gap), h: H }
    : { x: 0, y: by + bh + gap, w: W, h: H - (by + bh + gap) }
  return { W, H, s, m: Math.round(s * TAB_SIZE), bx, by, bw, bh, tray, wide }
}

/** Reparte piezas dentro del montón; con `tidy` las ordena en filas con un poco de desorden. */
function scatter(list, L, tidy) {
  const { tray, s, m, W, H } = L
  const minX = tray.x + m
  const minY = tray.y + m
  const spanX = Math.max(0, tray.w - s - 2 * m)
  const spanY = Math.max(0, tray.h - s - 2 * m)
  const k = Math.max(1, Math.ceil(Math.sqrt((list.length * (spanX + s)) / (spanY + s || 1))))
  const lines = Math.ceil(list.length / k)
  const order = [...list].sort(() => Math.random() - 0.5)
  return new Map(
    order.map((p, i) => {
      let x, y
      if (tidy) {
        x = minX + (k > 1 ? (spanX * (i % k)) / (k - 1) : spanX / 2) + (Math.random() - 0.5) * s * 0.15
        y = minY + (lines > 1 ? (spanY * Math.floor(i / k)) / (lines - 1) : spanY / 2) + (Math.random() - 0.5) * s * 0.15
      } else {
        x = minX + Math.random() * spanX
        y = minY + Math.random() * spanY
      }
      return [p.id, { fx: Math.min(Math.max(x, 0), W - s) / W, fy: Math.min(Math.max(y, 0), H - s) / H }]
    }),
  )
}

function vibrate(ms) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // sin vibración
  }
}

export default function Rompecabezas({ onBack }) {
  const [settings, setSettings] = useState(loadSettings)
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const save = (patch) => {
    const s = { ...settings, ...patch }
    setSettings(s)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      // ignorar
    }
  }

  const start = (image) => {
    setLoading(true)
    setError('')
    const img = new Image()
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight
      const { cols, rows } = gridFor(settings.pieces, ratio)
      const pieces = Array.from({ length: cols * rows }, (_, id) => ({
        id,
        r: Math.floor(id / cols),
        c: id % cols,
        placed: false,
        fx: null,
        fy: null,
        z: id + 2,
      }))
      setGame({ id: Date.now(), image, cols, rows, tabs: makeTabs(cols, rows), pieces, top: pieces.length + 2, startedAt: null, endedAt: null })
      setLoading(false)
    }
    img.onerror = () => {
      setLoading(false)
      setError('No se pudo abrir esa imagen. Prueba con otra.')
    }
    img.src = image.url
  }

  const pickImage = () => {
    if (settings.image === RANDOM) return IMAGES[Math.floor(Math.random() * IMAGES.length)]
    return IMAGES.find((i) => i.title === settings.image) ?? IMAGES[0]
  }

  if (game) {
    return (
      <Board
        key={game.id}
        game={game}
        setGame={setGame}
        onAgain={() => start(game.image)}
        onNext={() => {
          const others = IMAGES.filter((i) => i.url !== game.image.url)
          start(others.length ? others[Math.floor(Math.random() * others.length)] : game.image)
        }}
        onExit={() => setGame(null)}
      />
    )
  }

  return (
    <main className="menu puz-menu">
      <button className="back" onClick={onBack}>← Inicio</button>
      <header>
        <div className="logo">🧩</div>
        <h1>Rompecabezas</h1>
        <p className="tagline">Arma las escenas de la Biblia</p>
      </header>

      {IMAGES.length === 0 ? (
        <section className="puz-empty">
          <b>Todavía no hay imágenes</b>
          <p>
            Copia las imágenes en la carpeta <code>src/rompecabezas</code> del proyecto. El nombre del archivo será el
            título, por ejemplo <code>Arca de Noé.jpg</code>.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h2>Imagen</h2>
            <div className="puz-gallery">
              <button
                className={'puz-thumb random' + (settings.image === RANDOM ? ' on' : '')}
                onClick={() => save({ image: RANDOM })}
              >
                <span className="puz-dice">🎲</span>
                <small>Al azar</small>
              </button>
              {IMAGES.map((img) => (
                <button
                  key={img.url}
                  className={'puz-thumb' + (settings.image === img.title ? ' on' : '')}
                  onClick={() => save({ image: img.title })}
                >
                  <img src={img.url} alt="" loading="lazy" />
                  <small>{img.title}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>Número de piezas</h2>
            <div className="chips">
              {PIECES.map((n) => (
                <button
                  key={n}
                  className={'chip' + (settings.pieces === n ? ' on' : '')}
                  onClick={() => save({ pieces: n })}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="puz-note">Si la imagen no es cuadrada, el número se ajusta un poco a su forma.</p>
          </section>

          <p className="puz-howto">Arrastra las piezas del montón al tablero. Cuando una queda cerca de su lugar, encaja sola.</p>

          {error && <p className="error">{error}</p>}

          <button className="play puz-play" onClick={() => start(pickImage())} disabled={loading}>
            {loading ? 'Cargando…' : '¡Armar!'} <small>{settings.pieces} piezas</small>
          </button>
        </>
      )}
    </main>
  )
}

function Board({ game, setGame, onAgain, onNext, onExit }) {
  const { image, cols, rows, tabs, pieces, startedAt, endedAt } = game
  const won = endedAt !== null
  const areaRef = useRef(null)
  const drag = useRef(null)
  const [L, setL] = useState(null)
  const [guide, setGuide] = useState(true)
  const [now, setNow] = useState(Date.now())

  // Medir el espacio de juego y volver a medir si cambia (girar el celular, cambiar la ventana).
  useLayoutEffect(() => {
    const el = areaRef.current
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setL(computeLayout(r.width, r.height, cols, rows, cols * rows))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cols, rows])

  // Primera vez: amontonar las piezas al costado.
  useEffect(() => {
    if (!L || pieces.some((p) => p.fx !== null)) return
    const pos = scatter(pieces, L, false)
    setGame((g) => ({ ...g, pieces: g.pieces.map((p) => ({ ...p, ...pos.get(p.id) })) }))
  }, [L, pieces, setGame])

  useEffect(() => {
    if (!startedAt || won) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [startedAt, won])

  useEffect(() => {
    let lock
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => lock?.release().catch(() => {})
  }, [])

  const paths = useMemo(() => (L ? tabs.map((t) => piecePath(L.s, L.m, t)) : []), [L, tabs])

  const elapsed = startedAt ? Math.floor(((endedAt ?? now) - startedAt) / 1000) : 0
  const placed = pieces.filter((p) => p.placed).length
  const ready = L && pieces.every((p) => p.fx !== null)
  const smallHint = L && !L.wide && L.s < 40 && placed === 0 && !won

  const posOf = (p) => (p.placed ? { x: L.bx + p.c * L.s, y: L.by + p.r * L.s } : { x: p.fx * L.W, y: p.fy * L.H })

  const onDown = (e, p) => {
    if (won || p.placed) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const outer = e.currentTarget.parentElement
    outer.classList.add('dragging')
    outer.style.zIndex = game.top + 1
    const lift = e.pointerType === 'touch' ? Math.round(Math.min(36, L.s * 0.6)) : 0
    drag.current = { id: p.id, sx: e.clientX, sy: e.clientY, ...posOf(p), outer, dx: 0, dy: -lift, lift }
    outer.style.transform = `translate(0px, ${-lift}px)`
    setGame((g) => ({
      ...g,
      top: g.top + 1,
      startedAt: g.startedAt ?? Date.now(),
      pieces: g.pieces.map((q) => (q.id === p.id ? { ...q, z: g.top + 1 } : q)),
    }))
  }

  const onMove = (e) => {
    const d = drag.current
    if (!d) return
    d.dx = e.clientX - d.sx
    d.dy = e.clientY - d.sy - d.lift
    d.outer.style.transform = `translate(${d.dx}px, ${d.dy}px)`
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    d.outer.classList.remove('dragging')
    d.outer.style.transform = ''
    if (Math.hypot(d.dx, d.dy + d.lift) < 6) {
      // fue solo un toque: la pieza vuelve a donde estaba
      d.dx = 0
      d.dy = 0
    }
    const x =Math.min(Math.max(d.x + d.dx, 0), L.W - L.s)
    const y = Math.min(Math.max(d.y + d.dy, 0), L.H - L.s)
    const p = pieces.find((q) => q.id === d.id)
    const tx = L.bx + p.c * L.s
    const ty = L.by + p.r * L.s
    const snap = Math.hypot(x - tx, y - ty) < L.s * SNAP
    setGame((g) => {
      const list = g.pieces.map((q) => (q.id === d.id ? (snap ? { ...q, placed: true } : { ...q, fx: x / L.W, fy: y / L.H }) : q))
      const done = list.every((q) => q.placed)
      return { ...g, pieces: list, endedAt: done ? Date.now() : null }
    })
    if (snap) vibrate(placed + 1 === pieces.length ? [60, 60, 140] : 25)
  }

  const tidy = () => {
    if (!L) return
    const pos = scatter(
      pieces.filter((p) => !p.placed),
      L,
      true,
    )
    setGame((g) => ({ ...g, pieces: g.pieces.map((p) => (pos.has(p.id) ? { ...p, ...pos.get(p.id) } : p)) }))
  }

  return (
    <main className="jig">
      <div className="jig-top">
        <button className="exit" onClick={onExit} aria-label="Salir">✕</button>
        <div className="jig-stats">
          <span>{fmt(elapsed)}</span>
          <span>
            {placed}/{pieces.length}
          </span>
        </div>
        <button
          className={'jig-tool' + (guide ? ' on' : '')}
          onClick={() => setGuide((g) => !g)}
          aria-pressed={guide}
          title="Mostrar la imagen tenue en el tablero"
        >
          👁 <span>Guía</span>
        </button>
        <button className="jig-tool" onClick={tidy} disabled={won} title="Ordenar las piezas sueltas">
          ⇅ <span>Ordenar</span>
        </button>
      </div>

      {smallHint && <div className="jig-tip">Gira el celular para que las piezas se vean más grandes</div>}

      <div className="jig-area" ref={areaRef}>
        {L && (
          <div
            className={'jig-board' + (won ? ' won' : '')}
            style={{ left: L.bx, top: L.by, width: L.bw, height: L.bh }}
          >
            {guide && !won && <img src={image.url} alt="" className="jig-ghost" draggable="false" />}
          </div>
        )}

        {ready &&
          pieces.map((p) => {
            const { x, y } = posOf(p)
            const size = L.s + 2 * L.m
            return (
              <div
                key={p.id}
                className={'jig-piece' + (p.placed ? ' placed' : '') + (won ? ' won' : '')}
                style={{ left: x - L.m, top: y - L.m, width: size, height: size, zIndex: p.placed ? 1 : p.z }}
              >
                <div
                  className="jig-shape"
                  data-r={p.r}
                  data-c={p.c}
                  style={{
                    clipPath: `path('${paths[p.id]}')`,
                    backgroundImage: `url("${image.url}")`,
                    backgroundSize: `${cols * L.s}px ${rows * L.s}px`,
                    backgroundPosition: `${L.m - p.c * L.s}px ${L.m - p.r * L.s}px`,
                  }}
                  onPointerDown={(e) => onDown(e, p)}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                />
              </div>
            )
          })}

        {won && (
          <div className="overlay puz-overlay">
            <div className="modal">
              <div className="logo">🎉</div>
              <h1>¡Completado!</h1>
              <p className="tagline">{image.title}</p>
              <p className="tagline">
                {pieces.length} piezas · {fmt(elapsed)}
              </p>
              <div className="actions">
                <button className="play" onClick={onNext}>Otra imagen</button>
                <button className="secondary" onClick={onAgain}>Desarmar de nuevo</button>
                <button className="secondary" onClick={onExit}>Cambiar opciones</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
