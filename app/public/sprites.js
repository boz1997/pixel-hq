// Pixel art for the office: one string per row, one character per pixel, '.' transparent.
// Letters are palette keys; a look fills h (hair), s (skin), c (shirt) and C (hat).

export const INK = '#23262f'
export const CLAUDE = '#d97757'
export const CLAUDE_DARK = '#b85f42'

export const BASE_PALETTE = {
  k: INK, e: INK, m: '#b5524f', w: '#ffffff', p: '#3d4258',
  G: '#f2c037', R: '#e0484d', o: CLAUDE, O: CLAUDE_DARK, L: '#2e9d57',
}

export const SHIRTS = ['#4f7cc9', '#8a6fd1', '#3f9a68', '#e08a2b', '#c95a4a', '#2fa3a0', '#d46a9a', '#c9a227', '#6b7bd6', '#7a9a3a', '#e07a5f', '#5c8d89']
export const HAIRS = ['#2b2420', '#6b4a2f', '#1e1e24', '#c9a25a', '#a5492e', '#8a8a8a', '#3b2a4a', '#d8c8a8']
export const SKINS = ['#f3cfa6', '#e6b48c', '#c98f62', '#8f5d3d', '#f7dcc0']
export const HAT_COLORS = ['#e0484d', '#3f6fd8', '#2a2a33', '#6cc24a', '#f2c037', '#8e6ad8']

/** A person, 10 wide and 15 tall: the head and body; the legs come from LEGS by frame. */
export const PERSON_TOP = [
  '..hhhhhh..',
  '.hhhhhhhh.',
  'hhhhhhhhhh',
  'hssssssssh',
  '.ssessess.',
  '.ssssssss.',
  '..ssmmss..',
  '...ssss...',
  '.cccccccc.',
  'cccccccccc',
  'cccccccccc',
  '.cccccccc.',
]
export const LEGS = {
  stand: ['..pppppp..', '..pp..pp..', '..kk..kk..'],
  walk1: ['..pppppp..', '.pp....pp.', '.kk....kk.'],
  walk2: ['..pppppp..', '...pppp...', '...kkkk...'],
  sit: ['.pppppppp.', '.pp....pp.', '.kk....kk.'],
}
export const HAIR_STYLES = [
  ['..hhhhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', 'hssssssssh'],
  ['...hhhh...', '..hhhhhh..', '.hhhhhhhh.', '.ssssssss.'],
  ['..hhhhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', 'hhsssssshh'],
  ['..h.hh.h..', '.hhhhhhhh.', '.hhhhhhhh.', '.ssssssss.'],
  ['..........', '...ssss...', '.ssssssss.', '.ssssssss.'],
]
export const HATS = {
  cap: { rows: ['..CCCCCC..', '.CCCCCCCC.', 'CCCCCCCCCC'], dy: -1 },
  beanie: { rows: ['....ww....', '..CCCCCC..', '.CCCCCCCC.', 'CwCwCwCwCw'], dy: -2 },
  phones: { rows: ['..kkkkkk..', '.k......k.', 'kk......kk'], dy: -1 },
  bow: { rows: ['.......RR.', '......RRR.', '.......RR.'], dy: -1 },
  glasses: { rows: ['kkkk..kkkk', 'k..kkkk..k', 'kkkk..kkkk'], dy: 4 },
}
export const HAT_NAMES = ['none', 'none', 'cap', 'beanie', 'phones', 'bow', 'glasses', 'none']

/** A helper, 6 wide and 8 tall: a subagent. */
export const MINI_TOP = ['.hhhh.', 'hhhhhh', '.sese.', '.ssss.', '.cccc.', 'cccccc']
export const MINI_LEGS = { stand: ['.pppp.', '.k..k.'], walk1: ['.pppp.', 'k....k'], walk2: ['.pppp.', '..kk..'], sit: ['.pppp.', '.k..k.'] }

/** The manager: an orange block with two eye slits and four legs, 16 wide and 11 tall. */
export const MASCOT = [
  '.kkkkkkkkkkkkkk.',
  'kooooooooooooook',
  'kookkoooooookkok',
  'kookkoooooookkok',
  'kooooooooooooook',
  'kooooooooooooook',
  'kooooooooooooook',
  'kOOOOOOOOOOOOOOk',
  '.kkkkkkkkkkkkkk.',
  '..kk.kk..kk.kk..',
  '..kk.kk..kk.kk..',
]
export const MASCOT_WALK = [
  '.kkkkkkkkkkkkkk.',
  'kooooooooooooook',
  'kookkoooooookkok',
  'kookkoooooookkok',
  'kooooooooooooook',
  'kooooooooooooook',
  'kooooooooooooook',
  'kOOOOOOOOOOOOOOk',
  '.kkkkkkkkkkkkkk.',
  '.kk...kk.kk...kk',
  '.kk...kk.kk...kk',
]
export const CROWN = ['G.G..G.G', 'GGGGGGGG', 'GGRGGRGG']

/** An empty chair with a coat over its back, for a desk nobody is at. */
export const CHAIR = [
  '..kkkkkk..',
  '.kccBBBBk.',
  '.kcccBBBk.',
  '.kccBBBBk.',
  '.kcBBBBBk.',
  '..kkkkkk..',
  '.kSSSSSSk.',
  '.kSSSSSSk.',
  '..k....k..',
  '..k....k..',
]
export const CHAIR_PALETTE = { k: INK, B: '#4b5060', S: '#5f6470', c: '#c47a3d' }

/** A desk seen from the front: two shelves of screens, a keyboard, papers, a mug. 44 x 26. */
export const DESK = [
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.............kkkkkkkkkkkkkkkkkk.............',
  '.....................kk.....................',
  '..................kkkkkkkk..................',
  '...fffffff..........................mmmm....',
  '...fggggggf.....uuuuuuuuuuuu........mwwmm...',
  '...fffffff......uuuuuuuuuuuu........mwwmm...',
  '....................................mmmm....',
  'tttttttttttttttttttttttttttttttttttttttttttt',
  'tttttttttttttttttttttttttttttttttttttttttttt',
  'tttttttttttttttttttttttttttttttttttttttttttt',
  'tttttttttttttttttttttttttttttttttttttttttttt',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  '..LL..................................LL....',
  '..LL..................................LL....',
]
export const DESK_PALETTE = { k: INK, u: '#5a5f73', t: '#b9844f', T: '#8d5f36', L: '#6b4423', f: '#f4f5f8', g: '#c7cad5', m: '#efe9de', w: '#8b5a2b' }

export const PLANT = ['...gg...', '..gggg..', '.gGgggGg', '..gggg..', '...bb...', '..bbbb..', '..bbbb..']
export const PLANT_PALETTE = { g: '#4f9a55', G: '#7bd17f', b: '#b5653d' }

export const CAT = [
  ['.........a.a', '.........aaa', 'a.aaaaaaaaea', '.aaaaaaaaaaa', '.aaaaaaaaaa.', '.a..a..a..a.'],
  ['.........a.a', '.........aaa', '.aaaaaaaaaea', 'a.aaaaaaaaaa', '.aaaaaaaaaa.', 'a..a....a..a'],
]
export const CAT_PALETTE = { a: '#8a7a6a', e: '#222222' }

export const CHECK = ['....L', '...L.', 'L.L..', '.L...']
export const PAPER = ['wwwww', 'wggww', 'wgggw', 'wggww', 'wwwww']
export const PAPER_PALETTE = { w: '#f4f5f8', g: '#9aa0b5' }
export const MUG = ['mmmm.', 'mwwmm', 'mwwmm', 'mmmm.']
export const MUG_PALETTE = { m: '#efe9de', w: '#8b5a2b' }
export const BOOK = ['bbb', 'bwb', 'bbb']

const cache = new Map()

/** Draws rows into an offscreen canvas, once per (rows, palette) pair. */
export function raster(rows, palette, key) {
  const id = key ?? `${rows.join('|')}#${Object.entries(palette).join(',')}`
  const hit = cache.get(id)
  if (hit) return hit
  const w = Math.max(...rows.map(r => r.length))
  const h = rows.length
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = palette[row[x]]
      if (fill === undefined || row[x] === '.') continue
      ctx.fillStyle = fill
      ctx.fillRect(x, y, 1, 1)
    }
  })
  cache.set(id, canvas)
  return canvas
}

export function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

export function lookOf(seed) {
  return {
    shirt: SHIRTS[seed % SHIRTS.length],
    hair: HAIRS[(seed >>> 4) % HAIRS.length],
    skin: SKINS[(seed >>> 8) % SKINS.length],
    style: (seed >>> 12) % HAIR_STYLES.length,
    hat: HAT_NAMES[(seed >>> 16) % HAT_NAMES.length],
    hatColor: HAT_COLORS[(seed >>> 20) % HAT_COLORS.length],
  }
}

/** A person of one look in one pose, with the hat drawn over the head. 10 x 18 (3 rows of hat room above). */
export function person(look, pose = 'stand') {
  const key = `person:${JSON.stringify(look)}:${pose}`
  const hit = cache.get(key)
  if (hit) return hit
  const palette = { ...BASE_PALETTE, h: look.hair, s: look.skin, c: look.shirt, C: look.hatColor }
  const rows = [...HAIR_STYLES[look.style], ...PERSON_TOP.slice(4), ...LEGS[pose]]
  const canvas = document.createElement('canvas')
  canvas.width = 10
  canvas.height = 18
  const ctx = canvas.getContext('2d')
  ctx.drawImage(raster(rows, palette), 0, 3)
  const hat = HATS[look.hat]
  if (hat) ctx.drawImage(raster(hat.rows, palette), 0, 3 + hat.dy)
  cache.set(key, canvas)
  return canvas
}

export function mini(seed, pose = 'stand') {
  const palette = {
    ...BASE_PALETTE,
    h: HAIRS[(seed >>> 4) % HAIRS.length],
    s: SKINS[(seed >>> 8) % SKINS.length],
    c: SHIRTS[(seed >>> 2) % SHIRTS.length],
  }
  return raster([...MINI_TOP, ...MINI_LEGS[pose]], palette, `mini:${seed}:${pose}`)
}

export function mascot(isWalking) {
  const canvas = raster(isWalking ? MASCOT_WALK : MASCOT, BASE_PALETTE, `mascot:${isWalking}`)
  const key = `mascot+crown:${isWalking}`
  const hit = cache.get(key)
  if (hit) return hit
  const out = document.createElement('canvas')
  out.width = 16
  out.height = 14
  const ctx = out.getContext('2d')
  ctx.drawImage(canvas, 0, 3)
  ctx.drawImage(raster(CROWN, BASE_PALETTE), 4, 0)
  cache.set(key, out)
  return out
}
