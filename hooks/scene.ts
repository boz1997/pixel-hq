import type { DeskState, Live } from '../types'
import type { Desk, Room } from './model'
import { LIMIT_NAMES, ago, clip, hash, resets } from './model'
import {
  BASE_PALETTE, CAT, CAT_PALETTE, CHAIR, CHAIR_PALETTE, CHECK, CLAUDE, CROWN, HAIRS, HAIR_STYLES, HATS, HAT_COLORS,
  HAT_NAMES, INK, MASCOT, MINI, PERSON, PLANT, PLANT_PALETTE, SHIRTS, SKINS,
} from './sprites'
import type { Rows } from './sprites'

export const W = 236
const M = 6
const COLS = 4
const CELL_W = 56
const CELL_H = 62
const ROOM_HEAD = 14
const ROOM_PAD = 6
const EMPTY_ROOM_H = 24
const HQ_H = 94

const FONT = 'font-family="ui-monospace,Menlo,Consolas,monospace"'

const ROOM_TINTS = ['#dcd3c0', '#cfd8e3', '#d6dccb', '#e2d2d8', '#d9d4e4', '#d4dedd']

const DOTS: Record<DeskState, string> = {
  working: '#3ecf6e',
  waiting: '#f5b82e',
  idle: '#8fb4e8',
  done: '#2e9d57',
  failed: '#e5534b',
  away: '#9aa0b5',
}

export type Counts = { desks: number; present: number; working: number; waiting: number }

export type View = { rooms: Room[]; me: Live; picked?: string; counts: Counts }

const esc = (text: string): string => text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)

const rect = (x: number, y: number, w: number, h: number, fill: string, inner = ''): string =>
  inner === ''
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}">${inner}</rect>`

const anim = (attr: string, values: string, dur: string, extra = ''): string =>
  `<animate attributeName="${attr}" values="${values}" dur="${dur}" repeatCount="indefinite"${extra}/>`

const move = (values: string, dur: string, extra = ''): string =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}" repeatCount="indefinite"${extra}/>`

const use = (id: string, x: number, y: number, extra = ''): string => `<use href="#${id}" x="${x}" y="${y}"${extra}/>`

const text = (x: number, y: number, size: number, fill: string, value: string, extra = ''): string =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${size}" fill="${fill}" shape-rendering="geometricPrecision"${extra}>${esc(value)}</text>`

/** The cells whose key is `key`, as one path of row runs. */
function runs(rows: Rows, key: string, dx = 0, dy = 0): string {
  let d = ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (row[x] !== key) {
        x++
        continue
      }
      let n = 1
      while (x + n < row.length && row[x + n] === key) n++
      d += `M${x + dx} ${y + dy}h${n}v1h-${n}z`
      x += n
    }
  })
  return d
}

type Layer = { rows: Rows; palette: Record<string, string>; dx?: number; dy?: number }

function paths(layers: Layer[]): string {
  return layers
    .map(layer => {
      const keys = new Set(layer.rows.join('').replace(/\./g, ''))
      return [...keys]
        .map(key => {
          const fill = layer.palette[key]
          if (fill === undefined) return ''
          const d = runs(layer.rows, key, layer.dx ?? 0, layer.dy ?? 0)
          return d ? `<path d="${d}" fill="${fill}"/>` : ''
        })
        .join('')
    })
    .join('')
}

const symbol = (id: string, layers: Layer[]): string => `<symbol id="${id}" overflow="visible">${paths(layers)}</symbol>`

// ---------------------------------------------------------------- looks

export type Look = { hair: string; skin: string; shirt: string; style: number; hat: string; hatColor: string }

export function lookOf(seed: number): Look {
  return {
    shirt: SHIRTS[seed % SHIRTS.length]!,
    hair: HAIRS[(seed >>> 4) % HAIRS.length]!,
    skin: SKINS[(seed >>> 8) % SKINS.length]!,
    style: (seed >>> 12) % HAIR_STYLES.length,
    hat: HAT_NAMES[(seed >>> 16) % HAT_NAMES.length]!,
    hatColor: HAT_COLORS[(seed >>> 20) % HAT_COLORS.length]!,
  }
}

function personSymbol(id: string, look: Look): string {
  const rows = [...HAIR_STYLES[look.style]!, ...PERSON.slice(4)]
  const palette = { ...BASE_PALETTE, h: look.hair, s: look.skin, c: look.shirt, C: look.hatColor }
  const layers: Layer[] = [{ rows, palette }]
  const hat = HATS[look.hat]
  if (hat) layers.push({ rows: hat.rows, palette, dy: hat.dy })
  return symbol(id, layers)
}

/** A subagent's small figure: its own hair, skin and shirt by its id. */
function miniSymbol(id: string, seed: number): string {
  const palette = {
    ...BASE_PALETTE,
    h: HAIRS[(seed >>> 4) % HAIRS.length]!,
    s: SKINS[(seed >>> 8) % SKINS.length]!,
    c: SHIRTS[(seed >>> 2) % SHIRTS.length]!,
  }
  return symbol(id, [{ rows: MINI, palette }])
}

const DESK = symbol('hq-desk', [
  {
    rows: [
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
    ],
    palette: {
      k: INK, u: '#5a5f73', t: '#b9844f', T: '#8d5f36', L: '#6b4423',
      f: '#f4f5f8', g: '#c7cad5', m: '#efe9de', w: '#8b5a2b',
    },
  },
])

const CHAIR_SYMBOL = symbol('hq-chair', [{ rows: CHAIR, palette: CHAIR_PALETTE }])
const MASCOT_SYMBOL = symbol('hq-boss', [
  { rows: MASCOT, palette: BASE_PALETTE },
  { rows: CROWN, palette: BASE_PALETTE, dx: 4, dy: -3 },
])
const PLANT_SYMBOL = symbol('hq-plant', [{ rows: PLANT, palette: PLANT_PALETTE }])
const CHECK_SYMBOL = symbol('hq-check', [{ rows: CHECK, palette: { L: '#2e9d57' } }])
const CAT_SYMBOL = symbol('hq-cat', [{ rows: CAT, palette: CAT_PALETTE }])

const STYLE =
  '<style>' +
  '@keyframes hq-cat{0%{transform:translate(0,0) scaleX(1)}45%{transform:translate(78px,0) scaleX(1)}50%{transform:translate(78px,0) scaleX(-1)}95%{transform:translate(0,0) scaleX(-1)}100%{transform:translate(0,0) scaleX(1)}}' +
  '.hq-cat{animation:hq-cat 18s linear infinite;transform-box:fill-box;transform-origin:center}' +
  '</style>'

/** The wire bin by the boss's desk: it fills with paper as this session's context does. */
function bin(context: number | undefined, x: number, y: number): string {
  const balls = Math.min(6, Math.round((context ?? 0) / 17))
  let out = rect(x, y, 10, 9, '#5c6270') + rect(x + 1, y + 1, 8, 7, '#2d3340')
  for (let i = 0; i < balls; i++) out += rect(x + 1.5 + (i % 3) * 2.5, y + 6 - Math.floor(i / 3) * 2.5, 2, 2, '#f4f5f8')
  return out
}

// ---------------------------------------------------------------- screens

/** The monitor's picture, 16 x 10 at (x, y), by what the person at it does. */
function screen(state: DeskState, verb: string, x: number, y: number): string {
  const dark = rect(x, y, 16, 10, '#1e2233')
  switch (state) {
    case 'away':
      return rect(x, y, 16, 10, '#2a2d3a')
    case 'idle':
      return rect(x, y, 16, 10, '#16213a') + rect(x + 7, y + 4, 2, 2, '#8fc9ea', anim('opacity', '0.2;1;0.2', '3s'))
    case 'waiting':
      return dark + rect(x + 3, y + 2, 10, 6, '#f5b82e') + rect(x + 7, y + 3, 2, 2, INK) + rect(x + 7, y + 6, 2, 1, INK)
    case 'done':
      return rect(x, y, 16, 10, '#1b2b24') + use('hq-check', x + 6, y + 3)
    case 'failed':
      return rect(x, y, 16, 10, '#3a1e22') + rect(x + 5, y + 2, 2, 6, '#e5534b') + rect(x + 9, y + 2, 2, 6, '#e5534b')
    default:
      break
  }
  switch (verb) {
    case 'reading':
    case 'searching':
      return (
        rect(x, y, 16, 10, '#f1f3f7') +
        rect(x + 2, y + 2, 12, 1, '#9aa0b5') +
        rect(x + 2, y + 4, 10, 1, '#9aa0b5') +
        rect(x + 2, y + 6, 12, 1, '#ffd54f') +
        rect(x + 2, y + 8, 8, 1, '#9aa0b5')
      )
    case 'running':
      return (
        rect(x, y, 16, 10, '#0b0d12') +
        rect(x + 2, y + 2, 1, 1, '#3ecf6e') +
        rect(x + 4, y + 2, 8, 1, '#cfd3dc') +
        rect(x + 2, y + 4, 10, 1, '#6b7080') +
        rect(x + 2, y + 6, 1, 1, '#3ecf6e') +
        rect(x + 4, y + 6, 2, 1, '#3ecf6e', anim('opacity', '1;0', '0.8s', ' calcMode="discrete"'))
      )
    case 'browsing':
      return (
        rect(x, y, 16, 10, '#ffffff') +
        rect(x, y, 16, 2, '#dfe3ea') +
        rect(x + 2, y + 3, 12, 3, '#8fc9ea') +
        rect(x + 2, y + 7, 5, 2, '#3d6fd6') +
        rect(x + 9, y + 7, 5, 2, '#c7cad5')
      )
    case 'delegating':
    case 'messaging':
      return (
        dark +
        rect(x + 6, y + 1, 4, 3, '#f5b82e') +
        rect(x + 7, y + 4, 2, 1, '#9aa0b5') +
        rect(x + 3, y + 5, 10, 1, '#9aa0b5') +
        rect(x + 2, y + 6, 4, 3, '#3d8fe0') +
        rect(x + 10, y + 6, 4, 3, '#3d8fe0')
      )
    default:
      return (
        dark +
        rect(x + 2, y + 2, 6, 1, '#c678dd') +
        rect(x + 9, y + 2, 4, 1, '#61afef') +
        rect(x + 4, y + 4, 8, 1, '#98c379') +
        rect(x + 4, y + 6, 5, 1, '#e5c07b') +
        rect(x + 2, y + 8, 2, 1, '#98c379', anim('width', '1;10;1', '1.4s'))
      )
  }
}

// ---------------------------------------------------------------- labels

/** A name tag centred on cx: a dark pill with a status dot. */
function tag(cx: number, y: number, label: string, dot: string, isMe: boolean): string {
  const w = Math.min(CELL_W - 2, Math.ceil(label.length * 2.75 + 11))
  const x = cx - w / 2
  return (
    `<g shape-rendering="geometricPrecision">` +
    `<rect x="${x}" y="${y}" width="${w}" height="8" rx="4" fill="${isMe ? '#3b2f12' : '#1f2130'}" fill-opacity="0.88"${isMe ? ' stroke="#f2c037" stroke-width="0.6"' : ''}/>` +
    `<circle cx="${x + 4.5}" cy="${y + 4}" r="1.6" fill="${dot}"/>` +
    text(x + 7.5, y + 5.8, 4.4, '#ffffff', label, ' font-weight="600"') +
    `</g>`
  )
}

/** A speech bubble over a desk, its tail at the bottom left, kept inside the canvas. */
function bubble(x: number, y: number, line: string, fill: string, ink: string): string {
  const w = Math.ceil(line.length * 2.65 + 6)
  const left = Math.max(1, Math.min(x, W - w - 1))
  return (
    `<g shape-rendering="geometricPrecision">` +
    `<rect x="${left}" y="${y}" width="${w}" height="9" rx="2.5" fill="${fill}" stroke="${INK}" stroke-width="0.6"/>` +
    `<path d="M${left + 6} ${y + 9}l2 2.5l2-2.5z" fill="${fill}"/>` +
    text(left + 3, y + 6.3, 4.4, ink, line) +
    `</g>`
  )
}

function motion(state: DeskState): string {
  switch (state) {
    case 'working':
      return move('0 0;0 -1;0 0', '0.5s')
    case 'waiting':
      return move('0 0;0 -3;0 0', '0.6s')
    case 'idle':
      return move('0 0;0 0.6;0 0', '2.6s')
    default:
      return ''
  }
}

function bubbleOf(desk: Desk): string {
  const x = 0
  switch (desk.state) {
    case 'working': {
      const line = desk.detail ? `${desk.verb} ${desk.detail}` : desk.verb
      return line ? bubble(x, 1, clip(line, 17), '#ffffff', '#333333') : ''
    }
    case 'waiting':
      return bubble(x, 1, clip(`! ${desk.detail || 'needs you'}`, 17), '#fff1c2', '#7a4d00')
    case 'done':
      return bubble(x, 1, clip(`✓ ${desk.detail || 'done'}`, 17), '#e3f6ea', '#1f6b3a')
    case 'failed':
      return bubble(x, 1, clip(`✗ ${desk.detail || 'failed'}`, 17), '#fde3e1', '#8b2b24')
    default:
      return ''
  }
}

function tooltip(desk: Desk, now: number): string {
  const lines = [desk.title, `${desk.state}${desk.verb && desk.state === 'working' ? ` · ${desk.verb} ${desk.detail}`.trimEnd() : ''}`]
  for (const helper of desk.helpers) {
    const doing = helper.isFailed ? ' ✗' : helper.isDone ? ' ✓' : helper.verb ? ` · ${helper.verb} ${helper.detail ?? ''}`.trimEnd() : ''
    lines.push(`↳ ${helper.label}${doing}`)
  }
  if (desk.pr) lines.push(`PR #${desk.pr.number} ${desk.pr.state.toLowerCase()}`)
  if (desk.cwd) lines.push(desk.cwd)
  if (desk.lastActivityAt > 0) lines.push(`last active ${ago(now - desk.lastActivityAt)} ago`)
  return lines.join('\n')
}

/** One desk cell, CELL_W x CELL_H, at (ox, oy). */
function cell(desk: Desk, ox: number, oy: number, isPicked: boolean, now: number): string {
  const dim = desk.state === 'away'
  const ring = desk.isMe
    ? `<rect x="${ox + 1}" y="${oy + 1}" width="${CELL_W - 2}" height="${CELL_H - 2}" rx="3" fill="#f2c037" fill-opacity="0.12" stroke="#f2c037" stroke-width="0.8">${anim('stroke-opacity', '1;0.35;1', '2.4s')}</rect>`
    : isPicked
      ? `<rect x="${ox + 1}" y="${oy + 1}" width="${CELL_W - 2}" height="${CELL_H - 2}" rx="3" fill="none" stroke="#3d6fd6" stroke-width="0.8" stroke-dasharray="2 1.5"/>`
      : ''
  // Hands at the keyboard: they type while the person works.
  const hands = (() => {
    if (dim) return ''
    const skin = lookOf(desk.seed).skin
    const typing = desk.state === 'working'
    const hand = (x: number, delay: string) =>
      rect(x, oy + 39, 2, 2, skin, typing ? move('0 0;0 -1;0 0', '0.3s', ` begin="${delay}"`) : '')
    return hand(ox + 21, '0s') + hand(ox + 33, '0.15s')
  })()
  const who = dim
    ? use('hq-chair', ox + 23, oy + 33)
    : `<g>${motion(desk.state)}${use(`hq-p${desk.seed}`, ox + 23, oy + 30)}${hands}</g>`
  // Steam off the mug while the session idles.
  const steam =
    !dim && desk.state === 'idle'
      ? [0, 1, 2]
          .map(i =>
            rect(ox + 42 + i, oy + 25 - (i % 2), 1, 1, '#ffffff', move('0 0;0 -3', '1.8s', ` begin="${i * 0.5}s"`) + anim('opacity', '0;0.9;0', '1.8s', ` begin="${i * 0.5}s"`)),
          )
          .join('')
      : ''
  // The session's subagents stand beside the desk, three at most, the rest counted.
  const crew = dim ? [] : desk.helpers.slice(0, 3)
  const badge =
    crew
      .map((helper, i) => {
        const x = ox + 36 + i * 7
        const y = oy + 36
        const isOff = helper.isDone
        const mark = helper.isFailed
          ? rect(x + 2, y - 6, 1, 3, '#e5534b') + rect(x + 2, y - 2, 1, 1, '#e5534b')
          : isOff
            ? use('hq-check', x + 1, y - 7)
            : ''
        const hop = isOff ? '' : move('0 0;0 -1;0 0', '0.45s', ` begin="${(i * 0.15).toFixed(2)}s"`)
        return `<g${isOff ? ' opacity="0.55" filter="url(#hq-grey)"' : ''}>${hop}${use(`hq-m${hash(helper.id)}`, x, y)}</g>${mark}`
      })
      .join('') +
    (!dim && desk.helpers.length > 3
      ? text(ox + CELL_W - 2, oy + 33, 4.2, '#3d6fd6', `+${desk.helpers.length - 3}`, ' text-anchor="end" font-weight="700"')
      : '')
  const label = clip(desk.title, 15)
  return (
    `<g${dim ? ' opacity="0.62"' : ''}>` +
    ring +
    use('hq-desk', ox + 6, oy + 12) +
    screen(desk.state, desk.verb, ox + 20, oy + 13) +
    who +
    steam +
    `</g>` +
    badge +
    `<g transform="translate(${ox + 2} ${oy})">${bubbleOf(desk)}</g>` +
    tag(ox + CELL_W / 2, oy + 50, label, DOTS[desk.state], desk.isMe) +
    `<rect x="${ox}" y="${oy}" width="${CELL_W}" height="${CELL_H}" fill="#000" fill-opacity="0" pointer-events="all"><title>${esc(tooltip(desk, now))}</title></rect>`
  )
}

// ---------------------------------------------------------------- rooms

const roomHeight = (room: Room): number => {
  if (room.desks.length === 0) return EMPTY_ROOM_H
  const rows = Math.ceil(room.desks.length / COLS)
  return ROOM_HEAD + rows * CELL_H + ROOM_PAD
}

export function heightOf(rooms: Room[]): number {
  return HQ_H + rooms.reduce((sum, room) => sum + roomHeight(room) + 2, 0) + 2
}

function roomBand(room: Room, index: number, y: number, picked: string | undefined, now: number): string {
  const h = roomHeight(room)
  const tint = ROOM_TINTS[index % ROOM_TINTS.length]!
  const working = room.desks.filter(d => d.state === 'working' || d.state === 'waiting').length
  const present = room.desks.filter(d => d.isPresent).length
  const note =
    room.desks.length === 0
      ? ''
      : `${present}/${room.desks.length + room.more} in · ${working} busy`
  const icon = room.kind === 'pinned' ? '★ ' : room.kind === 'lobby' ? '' : ''
  let out =
    rect(0, y, W, h, tint) +
    rect(0, y, W, 1, '#a39a86') +
    rect(0, y + ROOM_HEAD - 1, W, 0.8, '#b8b0a0') +
    text(M + 1, y + 9.5, 5.6, '#4a4234', `${icon}${clip(room.name.toUpperCase(), 22)}`, ' font-weight="700" letter-spacing="0.6"') +
    (note ? text(W - M - 1, y + 9.5, 4.4, '#6b6252', note, ' text-anchor="end"') : '')
  if (room.desks.length === 0) {
    out += text(W / 2, y + ROOM_HEAD + 6.5, 4.6, '#8a8272', 'nobody here yet', ' text-anchor="middle"')
    return out
  }
  room.desks.forEach((desk, i) => {
    const ox = M + (i % COLS) * CELL_W + 1
    const oy = y + ROOM_HEAD + Math.floor(i / COLS) * CELL_H
    out += cell(desk, ox, oy, picked === desk.id, now)
  })
  if (room.more > 0) {
    out += text(W - M - 1, y + h - 2, 4.4, '#6b6252', `+${room.more} more`, ' text-anchor="end"')
  }
  // The door at the bottom, and a plant by it.
  out += rect(W / 2 - 8, y + h - 3, 16, 3, '#b49c78') + use('hq-plant', W - M - 10, y + h - 11)
  return out
}

// ---------------------------------------------------------------- the boss's office

function board(x: number, y: number, w: number, h: number, title: string): string {
  return (
    rect(x + 6, y + h, 2, 4, INK) +
    rect(x + w - 8, y + h, 2, 4, INK) +
    rect(x, y, w, h, INK) +
    rect(x + 1, y + 1, w - 2, h - 2, '#1f2130') +
    rect(x + 1, y + 1, w - 2, 7, '#2a2d3e') +
    text(x + 4, y + 6, 4.4, '#9aa0b5', title, ' font-weight="700"')
  )
}

function bar(x: number, y: number, w: number, percent: number, color: string): string {
  const filled = Math.round((w * Math.min(100, Math.max(0, percent))) / 100)
  return rect(x, y, w, 3, '#3b3e4f') + (filled > 0 ? rect(x, y, filled, 3, color) : '')
}

function contextBoard(me: Live, x: number, y: number): string {
  const w = 50
  const percent = me.context
  return (
    board(x, y, w, 40, 'CONTEXT') +
    text(x + 4, y + 21, 10, '#ef8a3a', percent === undefined ? '—' : `${percent}%`, ' font-weight="700"') +
    text(x + 4, y + 29, 4.2, '#9aa0b5', percent === undefined ? 'no reading yet' : 'of this session') +
    bar(x + 4, y + 33, w - 8, percent ?? 0, '#5b8def')
  )
}

function limitsBoard(me: Live, now: number, x: number, y: number): string {
  const w = 50
  const limits = (me.limits ?? []).slice(0, 2)
  const rows = limits
    .map((limit, i) => {
      const top = y + 11 + i * 15
      return (
        text(x + 4, top + 3, 4.4, '#e6e8ef', LIMIT_NAMES[limit.kind] ?? limit.kind, ' font-weight="600"') +
        text(x + w - 4, top + 3, 4.4, '#e6e8ef', `${limit.percentUsed}%`, ' text-anchor="end"') +
        bar(x + 4, top + 5, w - 8, limit.percentUsed, limit.percentUsed >= 90 ? '#e5534b' : '#5b8def') +
        text(x + 4, top + 12.5, 3.8, '#8a8fa6', resets(limit.resetsAt, now))
      )
    })
    .join('')
  return board(x, y, w, 40, 'USAGE') + (rows || text(x + 4, y + 22, 4.4, '#8a8fa6', 'no reading yet'))
}

function hqBand(view: View, now: number): string {
  const { counts, me } = view
  const says =
    counts.waiting > 0
      ? `${counts.waiting} need${counts.waiting === 1 ? 's' : ''} you`
      : counts.working > 0
        ? `${counts.working} at work`
        : counts.present > 0
          ? 'all quiet'
          : 'nobody in yet'
  const mood: DeskState = counts.waiting > 0 ? 'waiting' : counts.working > 0 ? 'working' : 'idle'
  const hour = new Date(now).getHours()
  const isNight = hour >= 21 || hour < 6
  const sky = isNight ? '#1b2440' : hour < 8 || hour >= 18 ? '#f0b27a' : '#8fc9ea'
  const window = (x: number) =>
    rect(x, 2, 26, 9, INK) +
    rect(x + 1, 3, 24, 7, sky) +
    (isNight
      ? rect(x + 4, 4, 2, 2, '#fff6c2') + rect(x + 18, 5, 1, 1, '#fff6c2') + rect(x + 9, 7, 1, 1, '#fff6c2')
      : rect(x + 2, 4, 3, 3, '#c4e6f7')) +
    rect(x + 12, 3, 1, 7, INK)
  const sign = `HQ · ${counts.desks} desk${counts.desks === 1 ? '' : 's'} · ${counts.present} in · ${counts.working} busy`
  return (
    rect(0, 0, W, HQ_H, '#e9dcc0') +
    rect(0, 0, W, 13, '#30334a') +
    rect(0, 13, W, 1.5, '#1f2133') +
    window(6) +
    window(W - 32) +
    rect(W / 2 - 46, 2, 92, 9, '#f4f5f8') +
    text(W / 2, 8.4, 4.4, INK, sign, ' text-anchor="middle" font-weight="700"') +
    // the rug and the boss's desk
    rect(8, 20, 92, 70, '#8e3b46') +
    `<rect x="11" y="23" width="86" height="64" fill="none" stroke="#c8a049" stroke-width="0.8"/>` +
    rect(20, 48, 66, 11, '#7d4f2e') +
    rect(20, 58, 66, 4, '#5a3620') +
    rect(26, 36, 20, 13, INK) +
    screen(mood, 'editing', 28, 37) +
    rect(35, 49, 2, 1, INK) +
    rect(60, 36, 20, 13, INK) +
    screen(mood === 'working' ? 'working' : 'idle', 'delegating', 62, 37) +
    rect(69, 49, 2, 1, INK) +
    rect(40, 61, 26, 5, '#c8971f') +
    text(53, 65, 3.6, '#4a2c18', 'CLAUDE', ' text-anchor="middle" font-weight="700" letter-spacing="0.6"') +
    `<g>${motion(mood)}${use('hq-boss', 45, 68)}</g>` +
    `<g transform="translate(38 20)">${bubble(0, 1, clip(says, 19), mood === 'waiting' ? '#fff1c2' : '#ffffff', mood === 'waiting' ? '#7a4d00' : '#333333')}</g>` +
    tag(53, 82, 'Claude · manager', DOTS[mood], false) +
    contextBoard(me, 112, 24) +
    limitsBoard(me, now, 172, 24) +
    use('hq-plant', W - M - 12, HQ_H - 14) +
    bin(me.context, 104, 68) +
    `<g class="hq-cat"><g transform="translate(120 ${HQ_H - 9})">${use('hq-cat', 0, 0)}</g></g>` +
    `<rect x="0" y="0" width="${W}" height="${HQ_H}" fill="#000" fill-opacity="0" pointer-events="all"><title>${esc(`Claude, the manager\n${says}\n${counts.present} of ${counts.desks} sessions have someone in`)}</title></rect>`
  )
}

// ---------------------------------------------------------------- the office

export function drawOffice(view: View, now: number): string {
  const h = heightOf(view.rooms)
  const cast = new Map<string, string>()
  for (const room of view.rooms) {
    for (const desk of room.desks) {
      if (!desk.isPresent) continue
      if (!cast.has(`p${desk.seed}`)) cast.set(`p${desk.seed}`, personSymbol(`hq-p${desk.seed}`, lookOf(desk.seed)))
      for (const helper of desk.helpers.slice(0, 3)) {
        const seed = hash(helper.id)
        if (!cast.has(`m${seed}`)) cast.set(`m${seed}`, miniSymbol(`hq-m${seed}`, seed))
      }
    }
  }
  const defs =
    `<defs>` +
    `<pattern id="hq-floor" width="16" height="16" patternUnits="userSpaceOnUse">` +
    rect(0, 0, 16, 16, '#d3d6df') +
    rect(15, 0, 1, 16, '#c7cad5') +
    rect(0, 15, 16, 1, '#c7cad5') +
    `</pattern>` +
    `<filter id="hq-grey"><feColorMatrix type="saturate" values="0"/></filter>` +
    DESK +
    CHAIR_SYMBOL +
    MASCOT_SYMBOL +
    PLANT_SYMBOL +
    CHECK_SYMBOL +
    CAT_SYMBOL +
    [...cast.values()].join('') +
    `</defs>`

  let y = HQ_H + 2
  let rooms = ''
  view.rooms.forEach((room, i) => {
    rooms += roomBand(room, i, y, view.picked, now)
    y += roomHeight(room) + 2
  })

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMin meet" shape-rendering="crispEdges">` +
    defs +
    STYLE +
    rect(0, 0, W, h, '#4b3a2f') +
    hqBand(view, now) +
    rooms +
    `</svg>`
  )
}

/** What the drawing says, for a reader that cannot see it. */
export function summary(view: View): string {
  const parts = view.rooms.map(room => {
    const who = room.desks.map(d => `${d.title} (${d.state}${d.verb && d.state === 'working' ? `: ${d.verb} ${d.detail}`.trimEnd() : ''})`).join(', ')
    return `${room.name}: ${who || 'empty'}`
  })
  return `Pixel HQ. ${view.counts.desks} sessions, ${view.counts.present} in, ${view.counts.working} working, ${view.counts.waiting} waiting for you. ${parts.join('. ')}.`
}

export { CLAUDE }
