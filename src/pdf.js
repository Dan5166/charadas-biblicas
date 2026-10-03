const PAGE_W = 210
const MARGIN = 15
const GRID_W = PAGE_W - MARGIN * 2

function drawGrid(doc, puzzle, top, cell, highlightWords) {
  const { size, grid } = puzzle
  const left = MARGIN

  // Respuestas: cápsula detrás de cada palabra, dibujada antes que las letras
  if (highlightWords) {
    doc.setDrawColor(255, 213, 79)
    doc.setLineWidth(cell * 0.78)
    doc.setLineCap('round')
    for (const w of highlightWords) {
      const a = w.cells[0]
      const b = w.cells[w.cells.length - 1]
      const ax = left + (a % size) * cell + cell / 2
      const ay = top + Math.floor(a / size) * cell + cell / 2
      const bx = left + (b % size) * cell + cell / 2
      const by = top + Math.floor(b / size) * cell + cell / 2
      doc.line(ax, ay, bx, by)
    }
    doc.setLineCap('butt')
  }

  doc.setDrawColor(90, 80, 140)
  doc.setLineWidth(0.6)
  doc.roundedRect(left - 2, top - 2, cell * size + 4, cell * size + 4, 2, 2)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(cell * 1.5)
  doc.setTextColor(30, 20, 70)
  grid.forEach((letter, idx) => {
    const x = left + (idx % size) * cell + cell / 2
    const y = top + Math.floor(idx / size) * cell + cell / 2
    doc.text(letter, x, y, { align: 'center', baseline: 'middle' })
  })
}

function drawWordList(doc, words, top, checkboxes) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(30, 20, 70)
  doc.text(`Palabras a encontrar (${words.length})`, MARGIN, top)

  const cols = 3
  const colW = GRID_W / cols
  const rowH = 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  words.forEach((w, i) => {
    const x = MARGIN + (i % cols) * colW
    const y = top + 9 + Math.floor(i / cols) * rowH
    let textX = x
    if (checkboxes) {
      doc.setDrawColor(90, 80, 140)
      doc.setLineWidth(0.3)
      doc.rect(x, y - 3.4, 3.8, 3.8)
      textX = x + 6
    }
    doc.text(w.name, textX, y)
  })
}

function drawHeader(doc, title, subtitle) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(30, 20, 70)
  doc.text(title, PAGE_W / 2, 22, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(110, 100, 150)
  doc.text(subtitle, PAGE_W / 2, 30, { align: 'center' })
}

/**
 * Crea el PDF de una sopa de letras (A4 vertical).
 * options: { categoryName, levelName, answers }
 */
export async function buildPuzzlePdf(puzzle, { categoryName, levelName, answers }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const cell = GRID_W / puzzle.size
  const gridTop = 42
  const subtitle = `${categoryName}  ·  ${levelName} (${puzzle.size} x ${puzzle.size})`

  drawHeader(doc, 'Sopa de Letras Bíblica', subtitle)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(110, 100, 150)
  doc.text('Nombre: ______________________________', MARGIN, 38)
  drawGrid(doc, puzzle, gridTop + 2, cell)
  drawWordList(doc, puzzle.words, gridTop + 2 + cell * puzzle.size + 14, true)

  if (answers) {
    doc.addPage()
    drawHeader(doc, 'Respuestas', subtitle)
    drawGrid(doc, puzzle, gridTop, cell, puzzle.words)
    drawWordList(doc, puzzle.words, gridTop + cell * puzzle.size + 14, false)
  }

  return doc
}

export async function downloadPuzzlePdf(puzzle, options) {
  const doc = await buildPuzzlePdf(puzzle, options)
  const slug = (s) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  doc.save(`sopa-letras-${slug(options.categoryName)}-${slug(options.levelName)}.pdf`)
}
