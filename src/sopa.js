// Direcciones como [fila, columna]
const DIRS = [
  [0, 1], // →
  [1, 0], // ↓
  [1, 1], // ↘
  [-1, 1], // ↗
  [0, -1], // ←
  [-1, 0], // ↑
  [-1, -1], // ↖
  [1, -1], // ↙
]

export const LEVELS = [
  { id: 'facil', name: 'Fácil', hint: '8×8 · → ↓', size: 8, count: 6, dirs: DIRS.slice(0, 2) },
  { id: 'media', name: 'Media', hint: '10×10 · + diagonales', size: 10, count: 8, dirs: DIRS.slice(0, 4) },
  { id: 'dificil', name: 'Difícil', hint: '12×12 · todas', size: 12, count: 10, dirs: DIRS },
]

// Para adivinar la dirección de un arrastre: índice = ángulo / 45° (0 = →, sentido horario)
export const SNAP_DIRS = [
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
]

const FILLER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZAEIOUAEIOSNRLDT'

export function normalize(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1))

function tryPlace(grid, size, word, dirs) {
  const len = word.length
  for (let attempt = 0; attempt < 300; attempt++) {
    const [dr, dc] = dirs[rand(0, dirs.length - 1)]
    const r = rand(dr === 1 ? 0 : dr === -1 ? len - 1 : 0, dr === 1 ? size - len : size - 1)
    const c = rand(dc === 1 ? 0 : dc === -1 ? len - 1 : 0, dc === 1 ? size - len : size - 1)

    const cells = []
    let fits = true
    for (let i = 0; i < len; i++) {
      const idx = (r + dr * i) * size + (c + dc * i)
      if (grid[idx] && grid[idx] !== word[i]) {
        fits = false
        break
      }
      cells.push(idx)
    }
    if (!fits) continue

    cells.forEach((idx, i) => (grid[idx] = word[i]))
    return cells
  }
  return null
}

/** Genera una sopa de letras con palabras de `names`. */
export function generatePuzzle(names, level) {
  const { size, count, dirs } = level

  const seen = new Set()
  const candidates = []
  for (const name of names) {
    const word = normalize(name)
    if (word.length < 3 || word.length > size || seen.has(word)) continue
    seen.add(word)
    candidates.push({ name, word })
  }

  // Un par de candidatas extra por si alguna no logra ubicarse; las largas primero
  const pool = shuffle(candidates)
    .slice(0, count + 4)
    .sort((a, b) => b.word.length - a.word.length)

  const grid = Array(size * size).fill('')
  const words = []
  for (const cand of pool) {
    if (words.length === count) break
    const cells = tryPlace(grid, size, cand.word, dirs)
    if (cells) words.push({ ...cand, cells })
  }

  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) grid[i] = FILLER[rand(0, FILLER.length - 1)]
  }

  return { size, grid, words: shuffle(words) }
}
