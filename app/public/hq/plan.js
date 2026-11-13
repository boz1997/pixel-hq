/**
 * The floor plan, in meters: the fixed rooms along the back wall, a glass room per department in rows, the café and
 * the WC at the front, and a walking grid of half-meter cells with the walls and furniture blocked.
 */

export const CELL = 0.5
export const WALL_H = 1.9
export const OUTER_H = 2.7
export const ROOM_D = 5.4
const TABLE_L = 2.4
export const TABLE_D = 1.15
const TABLE_GAP = 1.0
const SEATS_PER_TABLE = 4
const ROW_MAX = 27
const CORRIDOR = 1.8
const BACK_D = 6.4
const FRONT_D = 6
const MARGIN = 0.15

const BACK_ROOMS = [
  { id: 'manager', kind: 'manager', name: 'Manager', w: 8 },
  { id: 'meeting', kind: 'meeting', name: 'Meeting room', w: 7 },
  { id: 'library', kind: 'library', name: 'Library', w: 6 },
  { id: 'studio', kind: 'studio', name: 'Studio', w: 5.6 },
]

/** A seat at a desk: a north seat faces south (+z, rotation 0), a south seat faces north. */
function deskOf(room, slot) {
  const t = Math.floor(slot / SEATS_PER_TABLE)
  const k = slot % SEATS_PER_TABLE
  const tx = room.x + 1.5 + t * (TABLE_L + TABLE_GAP)
  const tz = room.z + ROOM_D / 2 - 0.1
  const x = tx + (k % 2 === 0 ? 0.6 : 1.8)
  const isNorth = k < 2
  const z = isNorth ? tz - TABLE_D / 2 - 0.45 : tz + TABLE_D / 2 + 0.45
  const rot = isNorth ? 0 : Math.PI
  const lz = isNorth ? tz - 0.22 : tz + 0.22
  const side = isNorth ? -1 : 1
  return {
    slot,
    seat: { x, z, rot, pose: 'sit' },
    laptop: { x, z: lz, rot },
    pill: { x, y: 1.62, z },
    sides: [
      { x: x - 0.55, z: z + side * 0.35, rot, pose: 'stand' },
      { x: x + 0.55, z: z + side * 0.35, rot, pose: 'stand' },
    ],
  }
}

/** Tables a department room holds, and the room's width for them. */
export const tablesOf = slots => Math.min(3, Math.max(1, Math.ceil(slots / SEATS_PER_TABLE)))
const roomWidth = tables => 3 + tables * TABLE_L + (tables - 1) * TABLE_GAP

export function makePlan(departments) {
  const rooms = []
  const desks = new Map()
  const furniture = []
  const zones = { library: [], studio: [], cafe: [], meeting: [], wc: [], exit: null, manager: null }

  let x = MARGIN
  for (const def of BACK_ROOMS) {
    rooms.push({ ...def, x, z: MARGIN, d: BACK_D, walls: { n: false, w: x <= MARGIN ? false : true, e: true, s: true }, door: { side: 's', at: def.w - 1.9, len: 1.4 } })
    x += def.w
  }
  let width = x + MARGIN

  let z = MARGIN + BACK_D + CORRIDOR
  let rowX = MARGIN
  let rowsUsed = 0
  for (const dept of departments) {
    const tables = tablesOf(dept.slots)
    const w = roomWidth(tables)
    if (rowX > MARGIN && rowX + w > Math.max(ROW_MAX, width - MARGIN)) {
      z += ROOM_D + CORRIDOR
      rowX = MARGIN
    }
    rowsUsed = Math.max(rowsUsed, 1)
    const room = { id: `dept:${dept.id}`, kind: 'dept', dept, name: dept.name, color: dept.color, x: rowX, z, w, d: ROOM_D, tables, walls: { n: true, w: rowX > MARGIN, e: true, s: true }, door: { side: 's', at: 0.4, len: 1.4 } }
    rooms.push(room)
    for (let t = 0; t < tables; t++) {
      furniture.push({ kind: 'table', x: room.x + 1.5 + t * (TABLE_L + TABLE_GAP), z: room.z + ROOM_D / 2 - 0.1 - TABLE_D / 2, w: TABLE_L, d: TABLE_D, room: room.id })
    }
    for (let slot = 0; slot < tables * SEATS_PER_TABLE; slot++) {
      const desk = deskOf(room, slot)
      furniture.push({ kind: 'chair', ...desk.seat, room: room.id, slot })
      const member = dept.members.find(s => s.slot === slot)
      if (member) desks.set(member.id, { ...desk, sessionId: member.id, room, color: dept.color })
    }
    rowX += w + 0.25
    width = Math.max(width, rowX + MARGIN)
  }
  width = Math.max(width, 22)
  const fitsBeside = rowsUsed > 0 && width - MARGIN - rowX >= 12 + 0.6 + 3
  const cafeX = fitsBeside ? rowX + 0.3 : MARGIN
  const zFront = fitsBeside ? z : rowsUsed > 0 ? z + ROOM_D + CORRIDOR : z
  const cafeD = fitsBeside ? ROOM_D : FRONT_D
  const depth = zFront + cafeD + (fitsBeside ? CORRIDOR : 0) + MARGIN

  const cafe = { id: 'cafe', kind: 'cafe', name: 'Café', x: cafeX, z: zFront, w: 12, d: cafeD, walls: null }
  const wc = { id: 'wc', kind: 'wc', name: 'WC', x: cafeX + 12.6, z: zFront + 0.4, w: 3, d: 3.2, walls: { n: true, w: true, e: true, s: true }, door: { side: 'n', at: 0.8, len: 1.4 }, isFrosted: true }
  rooms.push(cafe, wc)

  // The manager's office: the boss's desk, the home of Claude, the boards and the lamp on the back wall.
  const m = rooms.find(r => r.id === 'manager')
  furniture.push({ kind: 'bossDesk', x: m.x + 2.7, z: m.z + 2.2, w: 2.6, d: 1.0, room: 'manager' })
  furniture.push({ kind: 'shelf', x: m.x + 0.05, z: m.z + 3.2, w: 0.45, d: 2.2, rot: Math.PI / 2, room: 'manager' })
  furniture.push({ kind: 'rug', x: m.x + 4, z: m.z + 3.9, r: 1.9, color: '#9c4a52', room: 'manager' })
  furniture.push({ kind: 'plant', x: m.x + 0.6, z: m.z + 5.8, s: 1.2 })
  zones.manager = { home: { x: m.x + 4, z: m.z + 3.9, rot: 0, pose: 'stand' }, spots: [{ x: m.x + 2, z: m.z + 4.6, rot: 0.6 }, { x: m.x + 6, z: m.z + 4.8, rot: -0.6 }, { x: m.x + 6.4, z: m.z + 3.4, rot: -0.3 }, { x: m.x + 2.6, z: m.z + 5.6, rot: 0.2 }, { x: m.x + 4, z: m.z + 1.6, rot: 0 }], room: m }

  // The meeting room: one long table, eight chairs, a screen on the back wall.
  const mt = rooms.find(r => r.id === 'meeting')
  const tcx = mt.x + mt.w / 2
  const tcz = mt.z + 3.3
  furniture.push({ kind: 'meetingTable', x: tcx - 1.8, z: tcz - 0.7, w: 3.6, d: 1.4, room: 'meeting' })
  for (const dx of [-1.2, 0, 1.2]) {
    zones.meeting.push({ x: tcx + dx, z: tcz - 1.15, rot: 0, pose: 'sit' })
    zones.meeting.push({ x: tcx + dx, z: tcz + 1.15, rot: Math.PI, pose: 'sit' })
  }
  zones.meeting.push({ x: tcx - 2.35, z: tcz, rot: Math.PI / 2, pose: 'sit' }, { x: tcx + 2.35, z: tcz, rot: -Math.PI / 2, pose: 'sit' })
  for (const seat of zones.meeting) furniture.push({ kind: 'chair', ...seat, room: 'meeting' })
  furniture.push({ kind: 'plant', x: mt.x + 0.5, z: mt.z + 5.9, s: 1 })

  // The library: shelves on the back wall, two reading tables, lamps.
  const lb = rooms.find(r => r.id === 'library')
  furniture.push({ kind: 'shelf', x: lb.x + 0.6, z: lb.z + 0.05, w: 2.3, d: 0.45, rot: 0, room: 'library' })
  furniture.push({ kind: 'shelf', x: lb.x + 3.1, z: lb.z + 0.05, w: 2.3, d: 0.45, rot: 0, room: 'library' })
  for (const [dx, dz] of [[1.6, 2.6], [4.2, 2.6]]) {
    furniture.push({ kind: 'readingTable', x: lb.x + dx - 0.55, z: lb.z + dz - 0.4, w: 1.1, d: 0.8, room: 'library' })
    zones.library.push({ x: lb.x + dx, z: lb.z + dz - 0.85, rot: 0, pose: 'sit' }, { x: lb.x + dx, z: lb.z + dz + 0.85, rot: Math.PI, pose: 'sit' })
  }
  zones.library.push({ x: lb.x + 1.2, z: lb.z + 4.7, rot: Math.PI * 0.75, pose: 'sit' })
  for (const seat of zones.library.slice(0, 4)) furniture.push({ kind: 'chair', ...seat, room: 'library' })
  furniture.push({ kind: 'armchair', ...zones.library[4], color: '#4f7cc9', room: 'library' })

  // The studio: easels, paint on the floor.
  const st = rooms.find(r => r.id === 'studio')
  for (const dx of [1.3, 2.8, 4.3]) {
    furniture.push({ kind: 'easel', x: st.x + dx, z: st.z + 2.7, room: 'studio' })
    zones.studio.push({ x: st.x + dx, z: st.z + 3.55, rot: Math.PI, pose: 'stand' })
  }
  furniture.push({ kind: 'splat', x: st.x + 1.8, z: st.z + 4.6, r: 0.35, color: '#e5534b' }, { kind: 'splat', x: st.x + 3.9, z: st.z + 5.1, r: 0.28, color: '#3d6fd6' }, { kind: 'splat', x: st.x + 2.9, z: st.z + 1.4, r: 0.22, color: '#f2c037' })

  // The café: two sofas facing over a low table, two armchairs, a counter with stools and an espresso machine.
  const cx = cafe.x
  const cz = cafe.z
  furniture.push({ kind: 'rug', x: cx + 3.4, z: cz + 3, r: 2.3, color: '#d8cbb8' })
  furniture.push({ kind: 'sofa', x: cx + 3.4, z: cz + 1.45, w: 2.4, rot: 0, color: '#6b8f71' })
  furniture.push({ kind: 'sofa', x: cx + 3.4, z: cz + 4.55, w: 2.4, rot: Math.PI, color: '#6b8f71' })
  furniture.push({ kind: 'lowTable', x: cx + 2.75, z: cz + 2.6, w: 1.3, d: 0.8 })
  for (const dx of [-0.75, 0, 0.75]) {
    zones.cafe.push({ x: cx + 3.4 + dx, z: cz + 1.55, rot: 0, pose: 'sit' })
    zones.cafe.push({ x: cx + 3.4 + dx, z: cz + 4.45, rot: Math.PI, pose: 'sit' })
  }
  for (const dz of [2.3, 3.7]) {
    furniture.push({ kind: 'armchair', x: cx + 5.6, z: cz + dz, rot: -Math.PI / 2, color: '#c27c4e' })
    zones.cafe.push({ x: cx + 5.6, z: cz + dz, rot: -Math.PI / 2, pose: 'sit' })
  }
  furniture.push({ kind: 'counter', x: cx + 7.6, z: cz + 0.4, w: 3.4, d: 0.75 })
  furniture.push({ kind: 'espresso', x: cx + 10.4, z: cz + 0.75 })
  for (const dx of [0.6, 1.7, 2.8]) {
    zones.cafe.push({ x: cx + 7.6 + dx, z: cz + 1.55, rot: Math.PI, pose: 'stool' })
    furniture.push({ kind: 'stool', x: cx + 7.6 + dx, z: cz + 1.55 })
  }
  furniture.push({ kind: 'plant', x: cx + 0.5, z: cz + 5.6, s: 1.3 }, { kind: 'plant', x: cx + 11.4, z: cz + 5.5, s: 1.1 }, { kind: 'plant', x: cx + 6.8, z: cz + 0.5, s: 0.9 })

  zones.wc.push({ x: wc.x + 1.5, z: wc.z + 2.1, rot: 0, pose: 'hide' })
  furniture.push({ kind: 'plant', x: wc.x + 2.6, z: wc.z + 2.8, s: 0.7 })

  const entrance = { x: width - 2.2, z: depth - 0.25 }
  zones.exit = { x: entrance.x, z: depth - 0.25, rot: Math.PI, pose: 'stand' }
  furniture.push({ kind: 'plant', x: width - 0.6, z: MARGIN + BACK_D + 0.7, s: 1.1 }, { kind: 'plant', x: width - 0.6, z: depth - 1.2, s: 1.2 })

  const grid = makeGrid(width, depth, rooms, furniture, [...desks.values()], zones)
  return { width, depth, rooms, desks, furniture, zones, entrance, grid, signature: '' }
}

// ------------------------------------------------------------------ the walking grid

function makeGrid(width, depth, rooms, furniture, desks, zones) {
  const cols = Math.ceil(width / CELL)
  const rows = Math.ceil(depth / CELL)
  const blocked = new Uint8Array(cols * rows)
  const mark = (x0, z0, x1, z1, value = 1) => {
    const c0 = Math.max(0, Math.floor(Math.min(x0, x1) / CELL))
    const c1 = Math.min(cols - 1, Math.floor((Math.max(x0, x1) - 0.001) / CELL))
    const r0 = Math.max(0, Math.floor(Math.min(z0, z1) / CELL))
    const r1 = Math.min(rows - 1, Math.floor((Math.max(z0, z1) - 0.001) / CELL))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[r * cols + c] = value
  }
  mark(0, 0, width, 0.2)
  mark(0, 0, 0.2, depth)
  for (const room of rooms) {
    if (!room.walls) continue
    const { x, z, w, d } = room
    const t = 0.06
    const gap = room.door
    const seg = (side, x0, z0, x1, z1) => {
      if (!room.walls[side]) return
      if (gap && gap.side === side) {
        const horizontal = side === 'n' || side === 's'
        const start = horizontal ? x + gap.at : z + gap.at
        const end = start + gap.len
        if (horizontal) {
          mark(x0, z0 - t, start, z1 + t)
          mark(end, z0 - t, x1, z1 + t)
        } else {
          mark(x0 - t, z0, x1 + t, start)
          mark(x0 - t, end, x1 + t, z1)
        }
      } else mark(x0 - t, z0 - t, x1 + t, z1 + t)
    }
    seg('n', x, z, x + w, z)
    seg('s', x, z + d, x + w, z + d)
    seg('w', x, z, x, z + d)
    seg('e', x + w, z, x + w, z + d)
  }
  for (const f of furniture) {
    if (['table', 'bossDesk', 'meetingTable', 'readingTable', 'lowTable', 'counter'].includes(f.kind)) mark(f.x, f.z, f.x + f.w, f.z + f.d)
    if (f.kind === 'shelf') mark(f.x, f.z, f.x + f.w, f.z + f.d)
    if (f.kind === 'sofa') mark(f.x - f.w / 2, f.rot ? f.z + 0.1 : f.z - 0.45, f.x + f.w / 2, f.rot ? f.z + 0.45 : f.z - 0.1)
    if (f.kind === 'easel') mark(f.x - 0.35, f.z - 0.3, f.x + 0.35, f.z + 0.3)
    if (f.kind === 'espresso' || f.kind === 'plant') mark(f.x - 0.25, f.z - 0.25, f.x + 0.25, f.z + 0.25)
  }
  const spots = [...desks.flatMap(d => [d.seat, ...d.sides]), ...zones.library, ...zones.studio, ...zones.cafe, ...zones.meeting, ...zones.wc, zones.exit, zones.manager.home, ...zones.manager.spots]
  for (const s of spots) if (s) mark(s.x - 0.01, s.z - 0.01, s.x + 0.01, s.z + 0.01, 0)
  return { cols, rows, blocked }
}

export const cellOf = (grid, x, z) => [Math.min(grid.cols - 1, Math.max(0, Math.floor(x / CELL))), Math.min(grid.rows - 1, Math.max(0, Math.floor(z / CELL)))]
export const isFree = (grid, c, r) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows && grid.blocked[r * grid.cols + c] === 0
const centerOf = (c, r) => ({ x: (c + 0.5) * CELL, z: (r + 0.5) * CELL })

/** A free cell near one that is not, so a target inside furniture is still reached. */
function nearestFree(grid, c, r) {
  if (isFree(grid, c, r)) return [c, r]
  for (let d = 1; d < 6; d++) {
    for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) === d && isFree(grid, c + dc, r + dr)) return [c + dc, r + dr]
    }
  }
  return [c, r]
}

function lineOfSight(grid, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 3))
  for (let i = 1; i < steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps
    const z = a.z + ((b.z - a.z) * i) / steps
    for (const [ox, oz] of [[0.12, 0.12], [-0.12, 0.12], [0.12, -0.12], [-0.12, -0.12]]) {
      const [c, r] = cellOf(grid, x + ox, z + oz)
      if (!isFree(grid, c, r)) return false
    }
  }
  return true
}

/** Waypoints from one point to another over the grid, straightened where nothing stands between them. */
export function findPath(grid, from, to) {
  const [c0, r0] = nearestFree(grid, ...cellOf(grid, from.x, from.z))
  const [c1, r1] = nearestFree(grid, ...cellOf(grid, to.x, to.z))
  const start = r0 * grid.cols + c0
  const goal = r1 * grid.cols + c1
  const prev = new Int32Array(grid.cols * grid.rows).fill(-1)
  prev[start] = start
  const queue = [start]
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  let found = start === goal
  for (let head = 0; head < queue.length && !found; head++) {
    const cur = queue[head]
    const c = cur % grid.cols
    const r = Math.floor(cur / grid.cols)
    for (const [dc, dr] of dirs) {
      const nc = c + dc
      const nr = r + dr
      if (!isFree(grid, nc, nr)) continue
      if (dc !== 0 && dr !== 0 && (!isFree(grid, c + dc, r) || !isFree(grid, c, r + dr))) continue
      const next = nr * grid.cols + nc
      if (prev[next] !== -1) continue
      prev[next] = cur
      if (next === goal) {
        found = true
        break
      }
      queue.push(next)
    }
  }
  if (!found) return []
  const cells = []
  for (let cur = goal; cur !== start; cur = prev[cur]) cells.push(cur)
  cells.reverse()
  const points = cells.map(i => centerOf(i % grid.cols, Math.floor(i / grid.cols)))
  points.push({ x: to.x, z: to.z })
  const out = []
  let anchor = { x: from.x, z: from.z }
  let i = 0
  while (i < points.length) {
    let j = points.length - 1
    while (j > i && !lineOfSight(grid, anchor, points[j])) j--
    out.push(points[j])
    anchor = points[j]
    i = j + 1
  }
  return out
}
