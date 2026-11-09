// Pixel art: one string per row, one character per pixel, '.' transparent.
// Letters are palette keys; a look fills h (hair), s (skin), c (shirt) and C (hat).

export type Rows = readonly string[]

export const INK = '#23262f'
export const CLAUDE = '#d97757'
export const CLAUDE_DARK = '#b85f42'

export const BASE_PALETTE: Record<string, string> = {
  k: INK,
  e: INK,
  m: '#b5524f',
  w: '#ffffff',
  p: '#3d4258',
  G: '#f2c037',
  R: '#e0484d',
  o: CLAUDE,
  O: CLAUDE_DARK,
}

export const SHIRTS = [
  '#4f7cc9', '#8a6fd1', '#3f9a68', '#e08a2b', '#c95a4a', '#2fa3a0',
  '#d46a9a', '#c9a227', '#6b7bd6', '#7a9a3a', '#e07a5f', '#5c8d89',
]
export const HAIRS = ['#2b2420', '#6b4a2f', '#1e1e24', '#c9a25a', '#a5492e', '#8a8a8a', '#3b2a4a', '#d8c8a8']
export const SKINS = ['#f3cfa6', '#e6b48c', '#c98f62', '#8f5d3d', '#f7dcc0']
export const HAT_COLORS = ['#e0484d', '#3f6fd8', '#2a2a33', '#6cc24a', '#f2c037', '#8e6ad8']

/** A person, 10 wide and 15 tall; rows 0-3 are swapped for the hair style. */
export const PERSON: Rows = [
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
  '..pppppp..',
  '..pp..pp..',
  '..kk..kk..',
]

export const HAIR_STYLES: Rows[] = [
  ['..hhhhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', 'hssssssssh'],
  ['...hhhh...', '..hhhhhh..', '.hhhhhhhh.', '.ssssssss.'],
  ['..hhhhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', 'hhsssssshh'],
  ['..h.hh.h..', '.hhhhhhhh.', '.hhhhhhhh.', '.ssssssss.'],
  ['..........', '...ssss...', '.ssssssss.', '.ssssssss.'],
]

/** Hats sit over the head: `dy` is how many rows above the person's top row they start. */
export type Hat = { rows: Rows; dy: number }

export const HATS: Record<string, Hat> = {
  cap: { rows: ['..CCCCCC..', '.CCCCCCCC.', 'CCCCCCCCCC'], dy: -1 },
  beanie: { rows: ['....ww....', '..CCCCCC..', '.CCCCCCCC.', 'CwCwCwCwCw'], dy: -2 },
  phones: { rows: ['..kkkkkk..', '.k......k.', 'kk......kk'], dy: -1 },
  bow: { rows: ['.......RR.', '......RRR.', '.......RR.'], dy: -1 },
  glasses: { rows: ['kkkk..kkkk', 'k..kkkk..k', 'kkkk..kkkk'], dy: 4 },
}

export const HAT_NAMES = ['none', 'none', 'cap', 'beanie', 'phones', 'bow', 'glasses', 'none']

/** The manager: an orange block with two eye slits and four legs, 16 wide and 11 tall. */
export const MASCOT: Rows = [
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

export const CROWN: Rows = ['G.G..G.G', 'GGGGGGGG', 'GGRGGRGG']

/** An empty chair with a coat over its back, for a desk nobody is at. */
export const CHAIR: Rows = [
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
export const CHAIR_PALETTE: Record<string, string> = { k: INK, B: '#4b5060', S: '#5f6470', c: '#c47a3d' }

export const CHECK: Rows = ['....L', '...L.', 'L.L..', '.L...']
export const BANG: Rows = ['R', 'R', 'R', '.', 'R']

export const PLANT: Rows = [
  '...gg...',
  '..gggg..',
  '.gGgggGg',
  '..gggg..',
  '...bb...',
  '..bbbb..',
  '..bbbb..',
]
export const PLANT_PALETTE: Record<string, string> = { g: '#4f9a55', G: '#7bd17f', b: '#b5653d' }

/** A cat, 12 wide and 6 tall, facing right, tail up. */
export const CAT: Rows = [
  '.........a.a',
  '.........aaa',
  'a.aaaaaaaaea',
  '.aaaaaaaaaaa',
  '.aaaaaaaaaa.',
  '.a..a..a..a.',
]
export const CAT_PALETTE: Record<string, string> = { a: '#8a7a6a', e: '#222222' }

/** A helper, 6 wide and 8 tall: a subagent beside its session's desk. */
export const MINI: Rows = ['.hhhh.', 'hhhhhh', '.sese.', '.ssss.', '.cccc.', 'cccccc', '.pppp.', '.k..k.']
