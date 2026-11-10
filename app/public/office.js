// Pixel HQ: the office of every Claude Code session, as a living scene.
// Data comes from /api/state (what each session's mod published); everything else is here.
import {
  BASE_PALETTE, CHAIR, CHAIR_PALETTE, CHECK, DESK, DESK_PALETTE, DOG, DOG_PALETTE, INK, MUG, MUG_PALETTE,
  PAPER, PAPER_PALETTE, PLANT, PLANT_PALETTE, hash, lookOf, mascot, mini, person, raster,
} from './sprites.js'

const T = 16
const COLS = 48
const ZOOM = 2
const HALL = { x0: 12, x1: 14 }
const WALL_L = 11
const WALL_R = 15
const DESK_W = 6
const DESK_H = 5
const PER_ROW = 5
const LOBBY_CAP = 10

const STALE_MS = 75_000
const DONE_MS = 90_000
const IDLE_TO_CAFE_MS = 25_000
const WC_MS = 15_000
const DELIVER_MS = 2_500
const SPEED = 90 // px per second
const SIM_MS = 40

const ROOMS_LEFT = {
  office: { top: 0, h: 10, name: 'MANAGER', tint: '#e9dcc0' },
  meeting: { top: 10, h: 7, name: 'MEETING', tint: '#d9d4e4' },
  library: { top: 17, h: 7, name: 'LIBRARY', tint: '#dcd3c0' },
  studio: { top: 24, h: 7, name: 'STUDIO', tint: '#e2d2d8' },
  cafe: { top: 31, h: 7, name: 'CAFÉ', tint: '#d6dccb' },
  wc: { top: 38, h: 4, name: 'WC', tint: '#cfd8e3' },
}
const LEFT_H = 42

const SEATS = {
  meeting: [[2, 12], [2, 14], [9, 12], [9, 14], [4, 11], [7, 11], [4, 15], [7, 15]],
  library: [[2, 21], [4, 21], [6, 21], [8, 21], [1, 22], [9, 22]],
  studio: [[2, 27], [5, 27], [8, 27]],
  cafe: [[1, 35], [3, 35], [6, 35], [8, 35], [2, 36], [7, 36]],
  wc: [[9, 40]],
}
const FURNITURE = [
  ...range(3, 8).flatMap(c => range(12, 14).map(r => [c, r])),
  ...range(0, 10).map(c => [c, 18]),
  [2, 20], [4, 20], [6, 20], [8, 20],
  [2, 26], [5, 26], [8, 26],
  ...range(0, 6).map(c => [c, 32]),
  [2, 35], [7, 35],
  ...range(3, 6).flatMap(c => [[c, 4], [c, 5]]),
  [8, 2], [9, 2], [10, 2], [8, 3], [9, 3], [10, 3],
  [9, 6],
]
const ROOM_TINTS = ['#dcd3c0', '#cfd8e3', '#d6dccb', '#e2d2d8', '#d9d4e4', '#d4dedd']
const DOTS = { working: '#3ecf6e', waiting: '#f5b82e', idle: '#8fb4e8', done: '#2e9d57', failed: '#e5534b', away: '#9aa0b5' }
const CHAT = ['☕', 'so, weekends?', 'did you see the PR?', '…', 'tea?', 'ha!', 'one more deploy', 'who moved my mug', 'brb']

function range(a, b) {
  const out = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}
const norm = id => String(id ?? '').replace(/^local_/, '')
const keyOf = live => norm(live.ccdId || live.id)
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const rnd = (a, b) => a + Math.random() * (b - a)
const pick = list => list[Math.floor(Math.random() * list.length)]

function shownState(live, now) {
  if (!live || now - live.at > STALE_MS) return 'away'
  if (live.state === 'done' || live.state === 'failed') return now - live.since > DONE_MS ? 'idle' : live.state
  return live.state
}

// ------------------------------------------------------------------ data

const password = { value: sessionStorage.getItem('pixel-hq-password') ?? '' }

/** What this browser chose: a calm office (everyone at their desk) or a lively one, and which rooms are folded. */
const prefs = {
  mode: localStorage.getItem('pixel-hq-mode') === 'calm' ? 'calm' : 'lively',
  collapsed: new Set(JSON.parse(localStorage.getItem('pixel-hq-collapsed') ?? '[]')),
}
function setMode(mode) {
  prefs.mode = mode
  localStorage.setItem('pixel-hq-mode', mode)
  document.getElementById('mode-calm').classList.toggle('on', mode === 'calm')
  document.getElementById('mode-lively').classList.toggle('on', mode === 'lively')
  for (const e of [...workers.values(), ...helpers.values()]) {
    e.dest = null
    e.goal = null
    if (e.hidden) {
      e.hidden = false
      e.wcDone = true
    }
  }
  if (layout) syncEntities(sessionsOf())
}
function toggleRoom(id) {
  if (prefs.collapsed.has(id)) prefs.collapsed.delete(id)
  else prefs.collapsed.add(id)
  localStorage.setItem('pixel-hq-collapsed', JSON.stringify([...prefs.collapsed]))
  onData()
}
document.getElementById('mode-calm').addEventListener('click', () => setMode('calm'))
document.getElementById('mode-lively').addEventListener('click', () => setMode('lively'))
document.getElementById(prefs.mode === 'calm' ? 'mode-calm' : 'mode-lively').classList.add('on')
let data = { at: 0, roster: null, lives: {} }
let fetchedAt = 0
let isRemote = false

async function poll() {
  try {
    const res = await fetch('/api/state', { headers: password.value ? { 'x-pixel-hq-password': password.value } : {}, cache: 'no-store' })
    if (res.status === 401) {
      gate(true)
      return
    }
    if (!res.ok) throw new Error(String(res.status))
    data = await res.json()
    fetchedAt = Date.now()
    gate(false)
    onData()
  } catch (error) {
    document.getElementById('fresh').textContent = `no data: ${error.message}`
  }
}

function gate(isOpen) {
  document.getElementById('gate').classList.toggle('open', isOpen)
  isRemote = isRemote || isOpen
}
document.getElementById('gate-form').addEventListener('submit', event => {
  event.preventDefault()
  password.value = document.getElementById('gate-pw').value
  sessionStorage.setItem('pixel-hq-password', password.value)
  document.getElementById('gate-err').textContent = ''
  void poll().then(() => {
    if (document.getElementById('gate').classList.contains('open')) document.getElementById('gate-err').textContent = 'wrong password'
  })
})

// ------------------------------------------------------------------ rooms and the grid

/** Which sessions are in the office and where, from the sidebar's roster and the live desks. */
function sessionsOf() {
  const now = Date.now()
  const byKey = new Map()
  const isSpare = s => /^spare-/.test(s.title ?? '')
  for (const s of data.roster?.sessions ?? []) if (!isSpare(s)) byKey.set(norm(s.id), { ...s, id: norm(s.id) })
  for (const live of Object.values(data.lives)) {
    const key = keyOf(live)
    if (isSpare(live)) continue
    if (!byKey.has(key)) {
      byKey.set(key, { id: key, ccdId: live.ccdId, title: live.title, cwd: live.cwd, groupId: live.groupId, isPinned: live.isPinned, lastActivityAt: live.at, link: live.link })
    }
  }
  const liveByKey = new Map(Object.values(data.lives).map(live => [keyOf(live), live]))
  return [...byKey.values()].map(s => {
    const live = liveByKey.get(s.id)
    return { ...s, live, state: shownState(live, now), lastActivityAt: Math.max(s.lastActivityAt ?? 0, live?.at ?? 0) }
  })
}

const assign = new Map() // session key -> { roomId, slot }

function roomsOf(sessions) {
  const groups = [...(data.roster?.groups ?? [])].sort((a, b) => a.order - b.order)
  const known = new Set(groups.map(g => g.id))
  const byRecency = [...sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  const rooms = []
  for (const g of groups) {
    const members = byRecency.filter(s => s.groupId === g.id && !s.isPinned)
    if (members.length > 0) rooms.push({ id: g.id, name: g.name, members })
  }
  const pinned = byRecency.filter(s => s.isPinned)
  if (pinned.length > 0) rooms.push({ id: 'pinned', name: '★ PINNED', members: pinned })
  const lobby = byRecency.filter(s => !s.isPinned && (s.groupId == null || !known.has(s.groupId))).slice(0, LOBBY_CAP)
  if (lobby.length > 0 || rooms.length === 0) rooms.push({ id: 'lobby', name: 'LOBBY', members: lobby })
  // Stable desks: a member keeps its slot; a newcomer takes the lowest free one.
  for (const room of rooms) {
    const taken = new Set()
    for (const s of room.members) {
      const had = assign.get(s.id)
      if (had && had.roomId === room.id) taken.add(had.slot)
    }
    for (const s of room.members) {
      const had = assign.get(s.id)
      if (had && had.roomId === room.id) continue
      let slot = 0
      while (taken.has(slot)) slot++
      taken.add(slot)
      assign.set(s.id, { roomId: room.id, slot })
    }
    const slots = Math.max(...room.members.map(s => assign.get(s.id).slot), 0)
    room.rows = Math.max(1, Math.ceil((slots + 1) / PER_ROW))
  }
  for (const key of [...assign.keys()]) if (!sessions.some(s => s.id === key)) assign.delete(key)
  return rooms
}

let layout = null

function buildLayout(sessions) {
  const rooms = roomsOf(sessions)
  let top = 0
  const bands = rooms.map((room, i) => {
    const isCollapsed = prefs.collapsed.has(room.id)
    const band = { ...room, top, isCollapsed, h: isCollapsed ? 1 : 1 + room.rows * DESK_H + 1, tint: ROOM_TINTS[i % ROOM_TINTS.length] }
    top += band.h
    return band
  })
  const ROWS = Math.max(LEFT_H, top)
  const blocked = Array.from({ length: ROWS }, () => new Uint8Array(COLS))
  const block = (c, r) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) blocked[r][c] = 1
  }
  // The left rooms: their walls, the doors in them, and what stands in them.
  for (const room of Object.values(ROOMS_LEFT)) {
    const door = room.top + Math.floor(room.h / 2)
    for (let r = room.top; r < room.top + room.h; r++) if (r !== door) block(WALL_L, r)
    if (room.top > 0) for (let c = 0; c <= WALL_L; c++) block(c, room.top)
  }
  for (let r = LEFT_H; r < ROWS; r++) for (let c = 0; c <= WALL_L; c++) block(c, r)
  for (const [c, r] of FURNITURE) block(c, r)
  // The right bands: a wall with one door each, a header row, the desks.
  const desks = new Map()
  for (const band of bands) {
    for (let c = WALL_R; c < COLS; c++) block(c, band.top)
    for (let r = band.top; r < band.top + band.h; r++) if (r !== band.top + 2) block(WALL_R, r)
    if (band.isCollapsed) continue
    for (const s of band.members) {
      const { slot } = assign.get(s.id)
      const c = WALL_R + 1 + (slot % PER_ROW) * DESK_W
      const r = band.top + 1 + Math.floor(slot / PER_ROW) * DESK_H
      for (let dc = 1; dc <= 4; dc++) for (let dr = 0; dr <= 2; dr++) block(c + dc, r + dr)
      desks.set(s.id, { c, r, stand: [c + 2, r + 3], side: [c + 3, r + 3], sides: [[c + 3, r + 3], [c + 4, r + 3], [c + 5, r + 3]], band })
    }
  }
  for (let r = top; r < ROWS; r++) for (let c = WALL_R; c < COLS; c++) block(c, r)
  return { rooms: bands, ROWS, blocked, desks, entrance: [HALL.x0 + 1, ROWS - 1], signature: JSON.stringify(bands.map(b => [b.id, b.isCollapsed, b.members.map(s => s.id)])) }
}

function isFree(c, r) {
  return r >= 0 && r < layout.ROWS && c >= 0 && c < COLS && layout.blocked[r][c] === 0
}

/** The shortest walk between two tiles, as tiles; an unreachable goal gives none. */
function findPath(from, to) {
  if (!layout) return []
  const key = (c, r) => r * COLS + c
  const start = key(from[0], from[1])
  const goal = key(to[0], to[1])
  if (start === goal) return []
  const prev = new Map([[start, -1]])
  const queue = [start]
  while (queue.length > 0) {
    const cur = queue.shift()
    if (cur === goal) break
    const c = cur % COLS
    const r = Math.floor(cur / COLS)
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc
      const nr = r + dr
      const next = key(nc, nr)
      if (prev.has(next)) continue
      if (!(isFree(nc, nr) || next === goal)) continue
      prev.set(next, cur)
      queue.push(next)
    }
  }
  if (!prev.has(goal)) return []
  const path = []
  for (let at = goal; at !== start; at = prev.get(at)) path.push([at % COLS, Math.floor(at / COLS)])
  return path.reverse()
}

// ------------------------------------------------------------------ seats

const seated = new Map() // "zone:c,r" -> entity id

function takeSeat(zone, id) {
  for (const [c, r] of SEATS[zone]) {
    const k = `${zone}:${c},${r}`
    if (!seated.has(k)) {
      seated.set(k, id)
      return { zone, c, r }
    }
  }
  return null
}

function takeSide(ownerKey, id) {
  const desk = layout.desks.get(ownerKey)
  if (!desk) return null
  for (const [c, r] of desk.sides) {
    const k = `side:${ownerKey}:${c},${r}`
    if (!seated.has(k)) {
      seated.set(k, id)
      return { zone: `side:${ownerKey}`, c, r }
    }
  }
  return null
}

function leaveSeat(entity) {
  if (!entity.seat) return
  seated.delete(`${entity.seat.zone}:${entity.seat.c},${entity.seat.r}`)
  entity.seat = null
}

// ------------------------------------------------------------------ entities

const workers = new Map()
const helpers = new Map()
const delivered = new Set()
const everSeen = new Set()
let manager = null
let dog = null
let selected = null
let isFirstLoad = true

const centerOf = ([c, r]) => ({ x: c * T + T / 2, y: r * T + T / 2 })

function spawn(kind, at, extra) {
  const { x, y } = centerOf(at)
  return { kind, x, y, tile: at, path: [], dest: null, seat: null, frame: 0, dir: 1, hidden: false, bubble: null, ...extra }
}

function walkTo(entity, tile) {
  const from = [Math.round((entity.x - T / 2) / T), Math.round((entity.y - T / 2) / T)]
  entity.path = findPath(from, tile)
  entity.goal = tile
}

/** Moves an entity along its path by `dt` seconds; a long gap (a background tab) is caught up in one go. */
function step(entity, dt) {
  if (entity.path.length === 0) {
    entity.isWalking = false
    return
  }
  let budget = SPEED * Math.min(dt, 3)
  while (budget > 0 && entity.path.length > 0) {
    const next = centerOf(entity.path[0])
    const dx = next.x - entity.x
    const dy = next.y - entity.y
    const d = Math.hypot(dx, dy)
    if (Math.abs(dx) > 0.5) entity.dir = dx > 0 ? 1 : -1
    if (d <= budget) {
      entity.x = next.x
      entity.y = next.y
      entity.tile = entity.path.shift()
      budget -= d
    } else {
      entity.x += (dx / d) * budget
      entity.y += (dy / d) * budget
      budget = 0
    }
  }
  entity.isWalking = entity.path.length > 0
  entity.frame += Math.max(1, Math.round(dt * 60))
}

const arrived = entity => entity.path.length === 0 && entity.goal && entity.tile[0] === entity.goal[0] && entity.tile[1] === entity.goal[1]

/** Where a worker wants to be, from what its session is doing. */
function wantedZone(w, now) {
  const live = w.session.live
  const st = w.session.state
  if (st === 'away') return 'exit'
  if (prefs.mode === 'calm') return 'desk'
  if (w.hidden) return 'wc'
  if (st === 'working' && live?.verb === 'browsing') return 'library'
  if (st === 'working' && live?.verb === 'designing') return 'studio'
  if (st === 'idle') {
    const idleFor = now - (live?.since ?? now)
    if (w.dest === 'wc' && !w.wcDone) return 'wc'
    if (idleFor > IDLE_TO_CAFE_MS) {
      if (now > w.nextTrip && (w.dest === 'cafe' || w.dest === 'desk')) {
        w.nextTrip = now + rnd(150_000, 320_000)
        w.wcDone = false
        return 'wc'
      }
      return 'cafe'
    }
  }
  return 'desk'
}

function goTo(entity, zone, ownerKey) {
  if (entity.dest === zone && entity.goal) return
  leaveSeat(entity)
  let tile = null
  if (zone === 'desk') tile = layout.desks.get(ownerKey)?.stand ?? null
  else if (zone === 'side') {
    const seat = takeSide(ownerKey, entity.id)
    if (seat) {
      entity.seat = seat
      tile = [seat.c, seat.r]
    } else tile = layout.desks.get(ownerKey)?.side ?? null
  } else if (zone === 'exit') tile = layout.entrance
  else {
    const seat = takeSeat(zone, entity.id)
    if (seat) {
      entity.seat = seat
      tile = [seat.c, seat.r]
    } else {
      zone = 'desk'
      tile = layout.desks.get(ownerKey)?.stand ?? null
    }
  }
  if (!tile) return
  entity.dest = zone
  if (isFirstLoad || entity.placeDirectly || !layout.desks.size) {
    entity.placeDirectly = false
    entity.x = centerOf(tile).x
    entity.y = centerOf(tile).y
    entity.tile = tile
    entity.path = []
    entity.goal = tile
  } else walkTo(entity, tile)
}

function syncEntities(sessions) {
  const now = Date.now()
  const seen = new Set()
  for (const s of sessions) {
    seen.add(s.id)
    let w = workers.get(s.id)
    if (!layout.desks.has(s.id)) {
      // Its room is folded away: nobody of it is on the floor.
      if (w) {
        leaveSeat(w)
        workers.delete(s.id)
      }
      for (const [id, e] of helpers) if (e.owner === s.id) {
        leaveSeat(e)
        helpers.delete(id)
      }
      continue
    }
    if (!w && s.state !== 'away') {
      w = spawn('worker', layout.entrance, { id: s.id, session: s, look: lookOf(hash(s.id)), nextTrip: now + rnd(90_000, 240_000), wcDone: true, sayAt: now + rnd(3000, 15000), placeDirectly: everSeen.has(s.id) })
      workers.set(s.id, w)
    }
    everSeen.add(s.id)
    if (!w) continue
    w.session = s
    const zone = wantedZone(w, now)
    if (zone !== w.dest || !w.goal) goTo(w, zone, s.id)
    if (zone === 'desk' && w.dest === 'desk' && w.goal) {
      const stand = layout.desks.get(s.id)?.stand
      if (stand && (w.goal[0] !== stand[0] || w.goal[1] !== stand[1])) walkTo(w, stand)
    }
    // Subagents at the meeting table; a finished one brings its paper over, then leaves.
    const live = s.live
    const liveHelpers = s.state === 'away' ? [] : live?.helpers ?? []
    for (const h of liveHelpers) {
      const id = `${s.id}/${h.id}`
      if (delivered.has(id)) continue
      let e = helpers.get(id)
      if (!e) {
        e = spawn('helper', layout.entrance, { id, owner: s.id, seed: hash(h.id), helper: h, phase: h.isDone ? 'delivering' : 'working', placeDirectly: everSeen.has(id) })
        everSeen.add(id)
        helpers.set(id, e)
        if (h.isDone && isFirstLoad) {
          delivered.add(id)
          helpers.delete(id)
          continue
        }
      }
      e.helper = h
      if (h.isDone && e.phase === 'working') e.phase = 'delivering'
      if (e.phase === 'working') goTo(e, prefs.mode === 'calm' ? 'side' : 'meeting', s.id)
      else if (e.phase === 'delivering') goTo(e, 'side', s.id)
    }
    for (const [id, e] of helpers) {
      if (e.owner !== s.id) continue
      if (!liveHelpers.some(h => `${s.id}/${h.id}` === id) && e.phase !== 'leaving') {
        e.phase = 'leaving'
        goTo(e, 'exit', s.id)
      }
    }
  }
  for (const [id, w] of workers) {
    if (!seen.has(id)) {
      w.session = { ...w.session, state: 'away' }
      goTo(w, 'exit', id)
    }
  }
  for (const [id, e] of helpers) {
    if (!workers.has(e.owner) && e.phase !== 'leaving') {
      e.phase = 'leaving'
      goTo(e, 'exit', e.owner)
    }
  }
  if (!manager) {
    manager = spawn('manager', [4, 7], { id: 'manager', home: [4, 7], nextWalk: now + rnd(40_000, 90_000) })
    manager.goal = [4, 7]
  }
  if (!dog) {
    dog = spawn('dog', [13, 20], { id: 'dog', nextMove: now + 2000 })
    dog.goal = [13, 20]
  }
  isFirstLoad = false
}

/** Timed behaviour: trips to the WC, chats at the café, the manager's rounds, the dog. */
function behave(now) {
  for (const w of workers.values()) {
    if (w.dest === 'wc' && arrived(w) && !w.hidden && !w.wcDone) {
      w.hidden = true
      w.wcUntil = now + WC_MS
    }
    if (w.hidden && now > w.wcUntil) {
      w.hidden = false
      w.wcDone = true
      leaveSeat(w)
      w.dest = null
      goTo(w, wantedZone(w, now), w.id)
    }
    if (w.dest === 'exit' && arrived(w)) {
      leaveSeat(w)
      workers.delete(w.id)
      if (selected === w.id) select(null)
    }
    if (w.dest === 'cafe' && arrived(w) && now > w.sayAt) {
      w.bubble = { text: pick(CHAT), color: '#ffffff', ink: '#333', until: now + 3500 }
      w.sayAt = now + rnd(6000, 20000)
    }
  }
  for (const [id, e] of helpers) {
    if (e.phase === 'delivering' && arrived(e)) {
      if (!e.deliveredAt) e.deliveredAt = now
      if (now - e.deliveredAt > DELIVER_MS) {
        e.phase = 'leaving'
        delivered.add(id)
        goTo(e, 'exit', e.owner)
      }
    }
    if (e.phase === 'leaving' && arrived(e)) {
      leaveSeat(e)
      helpers.delete(id)
    }
  }
  if (manager) {
    if (now > manager.nextWalk && manager.path.length === 0) {
      const home = manager.tile[0] === manager.home[0] && manager.tile[1] === manager.home[1]
      walkTo(manager, home ? [8, 7] : manager.home)
      manager.nextWalk = now + (home ? 6000 : rnd(40_000, 90_000))
    }
  }
  if (dog && now > dog.nextMove && dog.path.length === 0) {
    const spots = []
    for (let r = 0; r < layout.ROWS; r++) for (let c = HALL.x0; c <= HALL.x1; c++) if (isFree(c, r)) spots.push([c, r])
    for (let r = 33; r <= 37; r++) for (let c = 0; c <= 10; c++) if (isFree(c, r)) spots.push([c, r])
    for (let r = 6; r <= 8; r++) for (let c = 7; c <= 10; c++) if (isFree(c, r)) spots.push([c, r])
    walkTo(dog, pick(spots))
    dog.nextMove = now + rnd(3000, 9000)
  }
}

// ------------------------------------------------------------------ drawing

const canvas = document.getElementById('office')
const ctx = canvas.getContext('2d')
ctx.imageSmoothingEnabled = false

const rect = (x, y, w, h, fill) => {
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
}
const sprite = (img, x, y, flip = false) => {
  if (!flip) {
    ctx.drawImage(img, Math.round(x), Math.round(y))
    return
  }
  ctx.save()
  ctx.translate(Math.round(x) + img.width, Math.round(y))
  ctx.scale(-1, 1)
  ctx.drawImage(img, 0, 0)
  ctx.restore()
}
function label(text, x, y, color = '#4a4234', size = 7, align = 'left', weight = '700') {
  ctx.font = `${weight} ${size}px ui-monospace, Menlo, Consolas, monospace`
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function screen(state, verb, x, y, t) {
  const dark = '#1e2233'
  switch (state) {
    case 'away':
      rect(x, y, 16, 10, '#2a2d3a')
      return
    case 'idle':
      rect(x, y, 16, 10, '#16213a')
      ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t / 900))
      rect(x + 7, y + 4, 2, 2, '#8fc9ea')
      ctx.globalAlpha = 1
      return
    case 'waiting':
      rect(x, y, 16, 10, dark)
      rect(x + 3, y + 2, 10, 6, '#f5b82e')
      rect(x + 7, y + 3, 2, 2, INK)
      rect(x + 7, y + 6, 2, 1, INK)
      return
    case 'done':
      rect(x, y, 16, 10, '#1b2b24')
      sprite(raster(CHECK, { L: '#2e9d57' }), x + 6, y + 3)
      return
    case 'failed':
      rect(x, y, 16, 10, '#3a1e22')
      rect(x + 5, y + 2, 2, 6, '#e5534b')
      rect(x + 9, y + 2, 2, 6, '#e5534b')
      return
    default:
      break
  }
  if (verb === 'reading' || verb === 'searching') {
    rect(x, y, 16, 10, '#f1f3f7')
    rect(x + 2, y + 2, 12, 1, '#9aa0b5')
    rect(x + 2, y + 4, 10, 1, '#9aa0b5')
    rect(x + 2, y + 6, 12, 1, '#ffd54f')
    rect(x + 2, y + 8, 8, 1, '#9aa0b5')
  } else if (verb === 'running') {
    rect(x, y, 16, 10, '#0b0d12')
    rect(x + 2, y + 2, 1, 1, '#3ecf6e')
    rect(x + 4, y + 2, 8, 1, '#cfd3dc')
    rect(x + 2, y + 4, 10, 1, '#6b7080')
    rect(x + 2, y + 6, 1, 1, '#3ecf6e')
    if (Math.floor(t / 400) % 2 === 0) rect(x + 4, y + 6, 2, 1, '#3ecf6e')
  } else if (verb === 'delegating' || verb === 'messaging') {
    rect(x, y, 16, 10, dark)
    rect(x + 6, y + 1, 4, 3, '#f5b82e')
    rect(x + 3, y + 5, 10, 1, '#9aa0b5')
    rect(x + 2, y + 6, 4, 3, '#3d8fe0')
    rect(x + 10, y + 6, 4, 3, '#3d8fe0')
  } else {
    rect(x, y, 16, 10, dark)
    rect(x + 2, y + 2, 6, 1, '#c678dd')
    rect(x + 9, y + 2, 4, 1, '#61afef')
    rect(x + 4, y + 4, 8, 1, '#98c379')
    rect(x + 4, y + 6, 5, 1, '#e5c07b')
    rect(x + 2, y + 8, 1 + Math.floor((t / 150) % 10), 1, '#98c379')
  }
}

function drawRoomsLeft(now) {
  const hour = new Date(now).getHours()
  const isNight = hour >= 21 || hour < 6
  const sky = isNight ? '#1b2440' : hour < 8 || hour >= 18 ? '#f0b27a' : '#8fc9ea'
  for (const [id, room] of Object.entries(ROOMS_LEFT)) {
    rect(0, room.top * T, WALL_L * T, room.h * T, room.tint)
    if (room.top > 0) rect(0, room.top * T, (WALL_L + 1) * T, T, '#4b3a2f')
    const door = room.top + Math.floor(room.h / 2)
    for (let r = room.top; r < room.top + room.h; r++) {
      if (r === door) rect(WALL_L * T, r * T, T, T, '#b49c78')
      else rect(WALL_L * T, r * T, T, T, '#4b3a2f')
    }
    label(room.name, 4, (room.top + room.h) * T - 4, '#4a4234', 7)
    if (id === 'office') {
      rect(0, 0, WALL_L * T, 14, '#30334a')
      for (const wx of [6, 110]) {
        rect(wx, 2, 26, 9, INK)
        rect(wx + 1, 3, 24, 7, sky)
        if (isNight) rect(wx + 4, 4, 2, 2, '#fff6c2')
        else rect(wx + 2, 4, 3, 3, '#c4e6f7')
      }
      rect(8, 48, 160, 100, '#8e3b46')
      ctx.strokeStyle = '#c8a049'
      ctx.lineWidth = 1
      ctx.strokeRect(12.5, 52.5, 151, 91)
      rect(3 * T, 4 * T + 8, 4 * T, 12, '#7d4f2e')
      rect(3 * T, 4 * T + 19, 4 * T, 5, '#5a3620')
      rect(3 * T + 6, 4 * T - 8, 20, 14, INK)
      rect(3 * T + 36, 4 * T - 8, 20, 14, INK)
      const busy = [...workers.values()].filter(w => w.session.state === 'working').length
      screen(busy > 0 ? 'working' : 'idle', 'editing', 3 * T + 8, 4 * T - 7, now)
      screen(busy > 0 ? 'working' : 'idle', 'delegating', 3 * T + 38, 4 * T - 7, now)
      rect(3 * T + 18, 4 * T + 26, 28, 6, '#c8971f')
      label('CLAUDE', 3 * T + 32, 4 * T + 31, '#4a2c18', 5, 'center')
      drawBoards(now)
      drawBin()
      sprite(raster(PLANT, PLANT_PALETTE), 150, 130)
    }
    if (id === 'meeting') {
      rect(3 * T, 12 * T + 4, 6 * T, 3 * T - 8, '#c8995f')
      rect(3 * T, 12 * T + 4, 6 * T, 2, '#e0b878')
      for (const [c, r] of SEATS.meeting) rect(c * T + 4, r * T + 4, 8, 8, '#5f6470')
      sprite(raster(PAPER, PAPER_PALETTE), 5 * T + 2, 13 * T + 2)
      sprite(raster(MUG, MUG_PALETTE), 7 * T + 4, 13 * T + 3)
    }
    if (id === 'library') {
      for (let c = 0; c <= 10; c++) {
        rect(c * T, 18 * T, T, T, '#7a5233')
        for (let b = 0; b < 4; b++) rect(c * T + 1 + b * 4, 18 * T + 3 + (b % 2) * 2, 3, 10 - (b % 2) * 2, ['#c95a4a', '#4f7cc9', '#e0b84a', '#3f9a68'][(c + b) % 4])
      }
      for (const c of [2, 4, 6, 8]) {
        rect(c * T + 1, 20 * T + 4, 14, 9, '#b9844f')
        rect(c * T + 1, 20 * T + 12, 14, 2, '#8d5f36')
        rect(c * T + 4, 20 * T + 1, 7, 4, '#f4f5f8')
      }
      sprite(raster(PLANT, PLANT_PALETTE), 160, 20 * T + 8)
    }
    if (id === 'studio') {
      for (const c of [2, 5, 8]) {
        rect(c * T + 2, 26 * T - 6, 12, 14, '#f4f5f8')
        rect(c * T + 1, 26 * T - 7, 14, 1, '#6b4423')
        rect(c * T + 1, 26 * T + 8, 2, 7, '#6b4423')
        rect(c * T + 13, 26 * T + 8, 2, 7, '#6b4423')
        rect(c * T + 4, 26 * T - 3, 5, 4, ['#5b8fd6', '#e5534b', '#f2c037'][c % 3])
        rect(c * T + 6, 26 * T + 2, 6, 3, ['#3f9a68', '#8e6ad8', '#2fa3a0'][c % 3])
      }
    }
    if (id === 'cafe') {
      rect(0, 32 * T, 7 * T, T, '#7a5233')
      rect(0, 32 * T, 7 * T, 3, '#9b6d45')
      rect(2 * T, 31 * T + 4, 18, 10, '#3a3a3a')
      rect(2 * T + 3, 31 * T + 6, 12, 5, '#1d1d1d')
      rect(2 * T + 5, 31 * T + 7, 3, 3, '#e04a3a')
      sprite(raster(MUG, MUG_PALETTE), 4 * T + 6, 31 * T + 9)
      sprite(raster(MUG, MUG_PALETTE), 5 * T + 4, 31 * T + 9)
      for (const c of [2, 7]) {
        rect(c * T, 35 * T + 2, T, T - 4, '#c9a26b')
        rect(c * T + 1, 35 * T + 3, T - 2, 2, '#e0c08a')
        sprite(raster(MUG, MUG_PALETTE), c * T + 5, 35 * T + 5)
      }
      sprite(raster(PLANT, PLANT_PALETTE), 9 * T + 4, 32 * T + 2)
    }
    if (id === 'wc') {
      rect(8 * T, 39 * T, 2 * T, 2 * T + 8, '#e6e8ef')
      rect(8 * T + 4, 39 * T + 4, 24, 12, '#3d6fd6')
      label('WC', 9 * T, 39 * T + 13, '#ffffff', 7, 'center')
      rect(8 * T + 14, 40 * T + 2, 4, 4, '#2d3340')
    }
  }
  // The hall.
  rect(HALL.x0 * T, 0, (HALL.x1 - HALL.x0 + 1) * T, layout.ROWS * T, '#c9c3b5')
  for (let r = 0; r < layout.ROWS; r++) rect(HALL.x0 * T, r * T, (HALL.x1 - HALL.x0 + 1) * T, 1, '#bdb6a6')
  rect((HALL.x0 + 1) * T - 4, layout.ROWS * T - 6, T + 8, 6, '#8e939c')
  label('ENTRANCE', (HALL.x0 + 1) * T + 8, layout.ROWS * T - 9, '#6b6252', 5, 'center')
}

function drawBoards(now) {
  const fresh = [...Object.values(data.lives)].sort((a, b) => b.at - a.at)
  const withLimits = fresh.find(l => (l.limits ?? []).length > 0)
  const focus = (selected && data.lives[[...workers.values()].find(w => w.id === selected)?.session.live?.id]) ?? fresh[0]
  const board = (x, y, w, h, title) => {
    rect(x, y + h, 2, 3, INK)
    rect(x + w - 2, y + h, 2, 3, INK)
    rect(x, y, w, h, INK)
    rect(x + 1, y + 1, w - 2, h - 2, '#1f2130')
    rect(x + 1, y + 1, w - 2, 7, '#2a2d3e')
    label(title, x + 3, y + 6, '#9aa0b5', 5)
  }
  const bar = (x, y, w, percent, color) => {
    rect(x, y, w, 3, '#3b3e4f')
    rect(x, y, Math.round((w * Math.min(100, Math.max(0, percent))) / 100), 3, color)
  }
  board(118, 20, 48, 30, 'CONTEXT')
  label(focus?.context === undefined ? '—' : `${focus.context}%`, 121, 38, '#ef8a3a', 10)
  bar(121, 43, 42, focus?.context ?? 0, '#5b8def')
  board(118, 56, 48, 34, 'USAGE')
  const limits = (withLimits?.limits ?? []).slice(0, 2)
  if (limits.length === 0) label('no reading', 121, 74, '#8a8fa6', 5)
  limits.forEach((limit, i) => {
    const top = 56 + 10 + i * 12
    const name = { five_hour: 'Session', seven_day: 'Weekly', spend_limit: 'Spend' }[limit.kind] ?? limit.kind
    label(`${name} ${limit.percentUsed}%`, 121, top + 4, '#e6e8ef', 5)
    bar(121, top + 6, 42, limit.percentUsed, limit.percentUsed >= 90 ? '#e5534b' : '#5b8def')
  })
}

function drawBin() {
  const fresh = [...Object.values(data.lives)].sort((a, b) => b.at - a.at)[0]
  const balls = Math.min(6, Math.round((fresh?.context ?? 0) / 17))
  const x = 9 * T + 3
  const y = 6 * T + 4
  rect(x, y, 10, 9, '#5c6270')
  rect(x + 1, y + 1, 8, 7, '#2d3340')
  for (let i = 0; i < balls; i++) rect(x + 1.5 + (i % 3) * 2.5, y + 6 - Math.floor(i / 3) * 2.5, 2, 2, '#f4f5f8')
}

function drawBands(now) {
  for (const band of layout.rooms) {
    rect(WALL_R * T, band.top * T, (COLS - WALL_R) * T, band.h * T, band.tint)
    rect(WALL_R * T, band.top * T, (COLS - WALL_R) * T, T, '#a39a86')
    for (let r = band.top; r < band.top + band.h; r++) {
      if (r === band.top + 2) rect(WALL_R * T, r * T, T, T, '#b49c78')
      else rect(WALL_R * T, r * T, T, T, '#4b3a2f')
    }
    const present = band.members.filter(s => s.state !== 'away').length
    const busy = band.members.filter(s => s.state === 'working' || s.state === 'waiting').length
    label(band.isCollapsed ? '▸' : '▾', WALL_R * T + 21, band.top * T + 11.5, '#2b2620', 8)
    label(band.name, WALL_R * T + 32, band.top * T + 11, '#2b2620', 7)
    label(`${present}/${band.members.length} in · ${busy} busy`, COLS * T - 6, band.top * T + 11, '#4a4234', 6, 'right', '500')
    if (band.isCollapsed) continue
    for (const s of band.members) {
      const desk = layout.desks.get(s.id)
      const x = (desk.c + 1) * T + 10
      const y = desk.r * T + 8
      const isMine = selected === s.id
      if (isMine) {
        ctx.strokeStyle = '#f2c037'
        ctx.lineWidth = 1
        ctx.strokeRect((desk.c + 0.5) * T + 0.5, desk.r * T - 2.5, 5 * T, 4 * T + 2)
      }
      ctx.globalAlpha = s.state === 'away' ? 0.75 : 1
      sprite(raster(DESK, DESK_PALETTE), x, y)
      const w = workers.get(s.id)
      const atDesk = w && w.dest === 'desk' && arrived(w) && !w.hidden
      screen(s.state === 'away' ? 'away' : atDesk ? s.state : 'idle', s.live?.verb, x + 14, y + 1, now)
      if (s.state === 'away') sprite(raster(CHAIR, CHAIR_PALETTE), desk.stand[0] * T + 3, desk.stand[1] * T - 2)
      ctx.globalAlpha = 1
      tag(clip(s.title, 15), (desk.c + 3) * T, (desk.r + 4) * T + 3, DOTS[s.state], isMine)
    }
    sprite(raster(PLANT, PLANT_PALETTE), COLS * T - 14, (band.top + band.h) * T - 12)
  }
}

function tag(text, cx, y, dot, isMine) {
  ctx.font = '700 6px ui-monospace, Menlo, Consolas, monospace'
  const w = Math.ceil(ctx.measureText(text).width) + 12
  const x = cx - w / 2
  ctx.fillStyle = isMine ? '#3b2f12' : 'rgba(31,33,48,0.88)'
  ctx.beginPath()
  ctx.roundRect(x, y - 7, w, 9, 4)
  ctx.fill()
  if (isMine) {
    ctx.strokeStyle = '#f2c037'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  ctx.fillStyle = dot
  ctx.beginPath()
  ctx.arc(x + 4.5, y - 2.5, 1.7, 0, Math.PI * 2)
  ctx.fill()
  label(text, x + 8, y, '#ffffff', 6)
}

function bubble(text, cx, y, fill = '#ffffff', ink = '#333333') {
  ctx.font = '500 6px ui-monospace, Menlo, Consolas, monospace'
  const w = Math.ceil(ctx.measureText(text).width) + 8
  const x = Math.max(2, Math.min(cx - w / 2, COLS * T - w - 2))
  ctx.fillStyle = fill
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.roundRect(x, y - 10, w, 10, 3)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 2, y)
  ctx.lineTo(cx, y + 3)
  ctx.lineTo(cx + 2, y)
  ctx.fillStyle = fill
  ctx.fill()
  label(text, x + 4, y - 3, ink, 6, 'left', '500')
}

function drawEntities(now) {
  const all = [...workers.values(), ...helpers.values(), manager, dog].filter(e => e && !e.hidden)
  all.sort((a, b) => a.y - b.y)
  for (const e of all) {
    const walking = e.isWalking
    const frame = walking ? (Math.floor(e.frame / 8) % 2 === 0 ? 'walk1' : 'walk2') : 'stand'
    if (e.kind === 'worker') {
      const s = e.session
      const sitting = !walking && (e.dest === 'cafe' || e.dest === 'library') && arrived(e)
      const img = person(e.look, sitting ? 'sit' : frame)
      const hop = s.state === 'working' && !walking && arrived(e) ? Math.round(Math.abs(Math.sin(now / 160))) : 0
      const bounce = s.state === 'waiting' ? Math.round(Math.abs(Math.sin(now / 150)) * 3) : 0
      if (selected === e.id) {
        ctx.strokeStyle = '#f2c037'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.ellipse(e.x, e.y + 7, 8, 3, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      sprite(img, e.x - 5, e.y - 10 - hop - bounce, e.dir < 0)
      if (e.dest === 'library' && arrived(e)) sprite(raster(['bbb', 'bwb', 'bbb'], { b: '#4f7cc9', w: '#fff' }), e.x + 4, e.y - 2)
      if (e.dest === 'studio' && arrived(e)) rect(e.x + 5, e.y - 4, 3, 5, '#e5534b')
      const text = bubbleText(e, now)
      if (text) bubble(text.text, e.x, e.y - 14 - bounce, text.fill, text.ink)
      if (e.dest !== 'desk' && !walking) {
        const row = e.seat ? SEATS[e.seat.zone].findIndex(([c, r]) => c === e.seat.c && r === e.seat.r) % 2 : 0
        tag(clip(s.title, 10), e.x, e.y + 14 + row * 8, DOTS[s.state], selected === e.id)
      }
    } else if (e.kind === 'helper') {
      const img = mini(e.seed, e.phase === 'working' && !walking && arrived(e) ? 'sit' : frame)
      const hop = e.phase === 'working' && arrived(e) ? Math.round(Math.abs(Math.sin(now / 170 + e.seed))) : 0
      sprite(img, e.x - 3, e.y - 3 - hop, e.dir < 0)
      if (e.phase !== 'working') sprite(raster(PAPER, PAPER_PALETTE), e.x + 2, e.y - 6)
      if (e.helper?.isFailed) rect(e.x - 1, e.y - 10, 1, 4, '#e5534b')
      if (e.phase === 'working' && arrived(e) && e.helper?.verb) bubble(clip(`${e.helper.verb} ${e.helper.detail ?? ''}`.trim(), 16), e.x, e.y - 7, '#ffffff', '#333')
      if (e.phase === 'delivering' && arrived(e)) bubble('here you go', e.x, e.y - 7, '#e3f6ea', '#1f6b3a')
    } else if (e.kind === 'manager') {
      const busy = [...workers.values()].filter(w => w.session.state === 'working').length
      const waiting = [...workers.values()].filter(w => w.session.state === 'waiting').length
      const hop = busy > 0 && !walking ? Math.round(Math.abs(Math.sin(now / 180))) : 0
      sprite(mascot(walking && Math.floor(e.frame / 8) % 2 === 0), e.x - 8, e.y - 7 - hop, e.dir < 0)
      const says = waiting > 0 ? `${waiting} need${waiting === 1 ? 's' : ''} you` : busy > 0 ? `${busy} at work` : workers.size > 0 ? 'all quiet' : 'nobody in yet'
      bubble(says, e.x, e.y - 12, waiting > 0 ? '#fff1c2' : '#ffffff', waiting > 0 ? '#7a4d00' : '#333')
      tag('Claude · manager', e.x, e.y + 14, DOTS[waiting > 0 ? 'waiting' : busy > 0 ? 'working' : 'idle'], false)
    } else if (e.kind === 'dog') {
      const f = walking ? Math.floor(e.frame / 6) % 2 : 0
      sprite(raster(DOG[f], DOG_PALETTE, `dog${f}`), e.x - 7, e.y + 1, e.dir < 0)
    }
  }
}

function bubbleText(w, now) {
  const s = w.session
  const live = s.live
  if (w.bubble && now < w.bubble.until) return { text: w.bubble.text, fill: w.bubble.color, ink: w.bubble.ink }
  if (w.isWalking) return null
  switch (s.state) {
    case 'working': {
      const line = live?.detail ? `${live.verb} ${live.detail}` : live?.verb ?? ''
      return line ? { text: clip(line, 22), fill: '#ffffff', ink: '#333333' } : null
    }
    case 'waiting':
      return { text: clip(`! ${live?.detail || 'needs you'}`, 22), fill: '#fff1c2', ink: '#7a4d00' }
    case 'done':
      return { text: clip(`✓ ${live?.detail || 'done'}`, 22), fill: '#e3f6ea', ink: '#1f6b3a' }
    case 'failed':
      return { text: clip(`✗ ${live?.detail || 'failed'}`, 22), fill: '#fde3e1', ink: '#8b2b24' }
    default:
      return null
  }
}

function drawWalls() {
  // The outer frame of what is not a room: where the bands end before the left column does, and the reverse.
  for (let r = 0; r < layout.ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!layout.blocked[r][c]) continue
      const inLeft = c <= WALL_L && r < LEFT_H
      const inRight = c >= WALL_R && layout.rooms.some(b => r >= b.top && r < b.top + b.h)
      if (!inLeft && !inRight && !(c >= HALL.x0 && c <= HALL.x1)) rect(c * T, r * T, T, T, '#3a2e26')
    }
  }
}

let simAt = Date.now()
function simulate() {
  const now = Date.now()
  const dt = (now - simAt) / 1000
  simAt = now
  if (!layout) return
  for (const e of [...workers.values(), ...helpers.values(), manager, dog]) if (e) step(e, dt)
  behave(now)
}
setInterval(simulate, SIM_MS)

function frame() {
  const now = Date.now()
  if (layout) {
    ctx.setTransform(ZOOM, 0, 0, ZOOM, 0, 0)
    rect(0, 0, COLS * T, layout.ROWS * T, '#4b3a2f')
    drawRoomsLeft(now)
    drawBands(now)
    drawWalls()
    drawEntities(now)
  }
  requestAnimationFrame(frame)
}

// ------------------------------------------------------------------ the data arriving

function onData() {
  const sessions = sessionsOf()
  const next = buildLayout(sessions)
  if (!layout || next.signature !== layout.signature) {
    layout = next
    canvas.width = COLS * T * ZOOM
    canvas.height = layout.ROWS * T * ZOOM
    ctx.imageSmoothingEnabled = false
    for (const e of [...workers.values(), ...helpers.values()]) {
      e.dest = null
      e.goal = null
    }
  } else {
    layout.desks = next.desks
    layout.rooms = next.rooms
  }
  syncEntities(sessions)
  const present = sessions.filter(s => s.state !== 'away').length
  const working = sessions.filter(s => s.state === 'working').length
  const waiting = sessions.filter(s => s.state === 'waiting').length
  document.getElementById('counts').textContent = `${sessions.length} desks · ${present} in · ${working} working · ${waiting} waiting for you`
  document.getElementById('mode').textContent = data.isDemo ? 'demo office' : `${data.sources ?? 0} store file${data.sources === 1 ? '' : 's'}${isRemote ? ' · locked' : ''}`
  if (selected) renderPanel()
}

setInterval(() => {
  const age = Math.round((Date.now() - fetchedAt) / 1000)
  const el = document.getElementById('fresh')
  if (fetchedAt > 0) el.textContent = `updated ${age}s ago`
  el.className = age > 10 ? 'warn' : 'dim'
}, 1000)

// ------------------------------------------------------------------ the panel

function select(key) {
  selected = key
  const panel = document.getElementById('panel')
  panel.classList.toggle('open', key !== null)
  if (key) renderPanel()
}

function renderPanel() {
  const s = sessionsOf().find(one => one.id === selected)
  const panel = document.getElementById('panel')
  if (!s) {
    panel.innerHTML = ''
    return
  }
  const live = s.live
  const room = layout?.rooms.find(b => b.members.some(m => m.id === s.id))
  const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
  const when = at => new Date(at).toTimeString().slice(0, 8)
  const ago = ms => {
    const sec = Math.max(0, Math.round(ms / 1000))
    return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : sec < 172800 ? `${Math.floor(sec / 3600)}h` : `${Math.floor(sec / 86400)}d`
  }
  const stateLine =
    s.state === 'away'
      ? `away · last active ${ago(Date.now() - s.lastActivityAt)} ago`
      : `${s.state}${live?.verb && s.state === 'working' ? ` · ${live.verb} ${live.detail ?? ''}` : ''}${s.state === 'waiting' && live?.detail ? ` · ${live.detail}` : ''}`
  const helpersHtml = (live?.helpers ?? [])
    .map(h => `<li>${h.isFailed ? '✗' : h.isDone ? '✓' : '●'} ${esc(h.label)} <span class="t">${esc(h.type)}</span>${h.verb && !h.isDone ? ` · ${esc(h.verb)} ${esc(h.detail ?? '')}` : ''}</li>`)
    .join('')
  const logHtml = [...(live?.log ?? [])]
    .reverse()
    .map(entry => `<li><span class="t">${when(entry.at)}</span>${entry.who ? `<span class="who">${esc(entry.who)} </span>` : ''}${esc(entry.verb)} ${esc(entry.detail)} <span class="t">${esc(entry.tool.replace(/^mcp__(.+?)__/, '$1 › '))}</span></li>`)
    .join('')
  panel.innerHTML = `
    <span class="close" id="panel-close">✕</span>
    <h2>${esc(s.title)}</h2>
    <div class="room">${esc(room?.name ?? '')}${s.cwd ? ` · ${esc(s.cwd.split('/').filter(Boolean).pop() ?? '')}` : ''}${s.pr ? ` · PR #${s.pr.number} ${esc(String(s.pr.state).toLowerCase())}` : ''}</div>
    <div class="state ${s.state}">${esc(stateLine)}</div>
    ${live?.context !== undefined ? `<div class="dim">context ${live.context}% · ${live.turns ?? 0} turn${live.turns === 1 ? '' : 's'}</div>` : ''}
    ${helpersHtml ? `<h3>Subagents</h3><ul>${helpersHtml}</ul>` : ''}
    <h3>Last calls</h3>
    <ul>${logHtml || '<li class="t">nothing logged yet</li>'}</ul>
    <div class="actions">
      ${s.link ? `<a class="primary" href="${esc(s.link)}">Open in Claude</a>` : ''}
      <button id="panel-copy">Copy link</button>
    </div>`
  document.getElementById('panel-close').onclick = () => select(null)
  document.getElementById('panel-copy').onclick = () => {
    if (s.link) void navigator.clipboard?.writeText(s.link)
  }
}

canvas.addEventListener('click', event => {
  if (!layout) return
  const box = canvas.getBoundingClientRect()
  const x = ((event.clientX - box.left) / box.width) * COLS * T
  const y = ((event.clientY - box.top) / box.height) * layout.ROWS * T
  for (const w of workers.values()) {
    if (!w.hidden && Math.abs(x - w.x) <= 8 && y >= w.y - 12 && y <= w.y + 10) {
      select(w.id)
      return
    }
  }
  for (const [key, desk] of layout.desks) {
    if (x >= desk.c * T && x < (desk.c + DESK_W) * T && y >= desk.r * T && y < (desk.r + DESK_H) * T) {
      select(key)
      return
    }
  }
  for (const band of layout.rooms) {
    if (x >= WALL_R * T && y >= band.top * T && y < (band.top + 1) * T) {
      toggleRoom(band.id)
      return
    }
  }
  select(null)
})

// A handle for debugging from the console.
window.__hq = { get layout() { return layout }, workers, helpers, prefs, findPath, setMode, sessionsOf }

void poll()
setInterval(poll, 2000)
requestAnimationFrame(frame)
