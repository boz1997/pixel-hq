import * as THREE from 'three'

import { prefs } from './data.js'
import { animate, lookOf, makeDog, makeMascot, makePerson } from './people.js'
import { CELL, findPath, isFree } from './plan.js'
import { hash, pick, rnd } from './util.js'

const SPEED = 1.45
const IDLE_TO_CAFE_MS = 25_000
const WC_MS = 15_000
const DELIVER_MS = 2_500
const CHEER_MS = 2_200
export const CHAT = ['☕ coffee?', 'so, weekends?', 'did you see the PR?', '…', 'tea?', 'ha!', 'one more deploy', 'who moved my mug', 'brb', 'lunch?']
export const PANIC = ['!!', 'AAA!', '503?!', 'is it down?', 'retry!', 'the API!', 'overloaded?!', 'refresh!!', 'help!', 'who pushed?', 'status page!']
export const PANIC_BOSS = ['STAY CALM!', 'checking status…', 'everyone, breathe', 'who broke it?!']
const CONFETTI = ['#e0484d', '#f2c037', '#3ecf6e', '#3d6fd6', '#d46a9a', '#ffffff']

export function createSim(world) {
  const group = new THREE.Group()
  group.name = 'people'
  world.scene.add(group)
  return {
    world,
    group,
    plan: null,
    outage: null,
    workers: new Map(),
    helpers: new Map(),
    manager: null,
    dogs: [],
    reserved: new Map(),
    delivered: new Set(),
    everSeen: new Set(),
    lastState: new Map(),
    lastPr: new Map(),
    lastResult: new Map(),
    particles: [],
    isFirstLoad: true,
  }
}

// ------------------------------------------------------------------ places

function release(sim, e) {
  if (e.spotKey) sim.reserved.delete(e.spotKey)
  e.spotKey = null
}

function reserveFrom(sim, e, zone, spots, prefix) {
  const free = spots.map((spot, i) => ({ spot, key: `${prefix}:${i}` })).filter(({ key }) => !sim.reserved.has(key) || sim.reserved.get(key) === e.id)
  if (free.length === 0) return null
  const choice = pick(free)
  sim.reserved.set(choice.key, e.id)
  e.spotKey = choice.key
  return choice.spot
}

function panicSpot(sim, e) {
  const { grid } = sim.plan
  for (let tries = 0; tries < 30; tries++) {
    const x = e.x + rnd(-7, 7)
    const z = e.z + rnd(-7, 7)
    const c = Math.floor(x / CELL)
    const r = Math.floor(z / CELL)
    if (isFree(grid, c, r)) return { x: (c + 0.5) * CELL, z: (r + 0.5) * CELL, rot: 0, pose: 'stand' }
  }
  return null
}

function place(e, spot) {
  e.x = spot.x
  e.z = spot.z
  e.rot = spot.rot ?? e.rot
  e.path = []
}

/** Sends an entity to a zone: its desk, a seat of a room, beside a desk, the exit, or running around in a panic. */
export function goTo(sim, e, zone, ownerKey) {
  if (e.dest === zone && e.target) return
  release(sim, e)
  const { plan } = sim
  const desk = ownerKey ? plan.desks.get(ownerKey) : null
  let spot = null
  if (zone === 'panic') spot = panicSpot(sim, e)
  else if (zone === 'desk') spot = desk?.seat ?? null
  else if (zone === 'side') spot = desk ? reserveFrom(sim, e, zone, desk.sides, `side:${ownerKey}`) : null
  else if (zone === 'exit') spot = plan.zones.exit
  else if (plan.zones[zone]) spot = reserveFrom(sim, e, zone, plan.zones[zone], zone)
  if (!spot && zone !== 'desk' && zone !== 'exit' && desk) {
    zone = 'desk'
    spot = desk.seat
  }
  if (!spot) return
  e.dest = zone
  e.target = spot
  if (zone === 'panic') {
    e.hidden = false
    e.wcDone = true
  }
  if (sim.isFirstLoad || e.placeDirectly) {
    e.placeDirectly = false
    place(e, spot)
  } else {
    e.path = findPath(plan.grid, { x: e.x, z: e.z }, spot)
    if (e.path.length === 0 && Math.hypot(e.x - spot.x, e.z - spot.z) > 0.1) place(e, spot)
  }
}

export const arrived = e => Boolean(e.target) && e.path.length === 0 && Math.hypot(e.x - e.target.x, e.z - e.target.z) < 0.06

const speedOf = (sim, e) => {
  const isPanic = e.dest === 'panic' || (sim.outage?.level === 'down' && (e.kind === 'manager' || e.kind === 'dog'))
  return SPEED * (isPanic ? 2.3 : 1) * (e.kind === 'dog' ? 1.15 : 1)
}

function stepEntity(sim, e, dt) {
  const speed = speedOf(sim, e)
  e.pace = speed / SPEED
  let budget = speed * Math.min(dt, 3)
  let moved = false
  while (budget > 0 && e.path.length > 0) {
    const next = e.path[0]
    const dx = next.x - e.x
    const dz = next.z - e.z
    const d = Math.hypot(dx, dz)
    if (d > 0.001) e.heading = Math.atan2(dx, dz)
    if (d <= budget) {
      e.x = next.x
      e.z = next.z
      e.path.shift()
      budget -= d
    } else {
      e.x += (dx / d) * budget
      e.z += (dz / d) * budget
      budget = 0
    }
    moved = true
  }
  e.walking = moved
  const wanted = e.walking ? e.heading : arrived(e) ? e.target.rot ?? e.rot : e.rot
  let diff = wanted - e.rot
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  e.rot += diff * Math.min(1, dt * 10)
}

// ------------------------------------------------------------------ who is where

function spawnWorker(sim, s, now) {
  const look = lookOf(hash(s.id), sim.plan.desks.get(s.id)?.color ?? '#64748b')
  const fig = makePerson(look)
  sim.group.add(fig.root)
  const at = sim.plan.zones.exit
  const w = { kind: 'worker', id: s.id, fig, session: s, x: at.x, z: at.z, rot: Math.PI, heading: Math.PI, path: [], target: null, dest: null, walking: false, nextTrip: now + rnd(90_000, 240_000), wcDone: true, sayAt: now + rnd(3000, 15000), nextPose: now + rnd(6000, 14000), placeDirectly: sim.everSeen.has(s.id) }
  sim.workers.set(s.id, w)
  return w
}

function removeEntity(sim, map, e) {
  release(sim, e)
  sim.group.remove(e.fig.root)
  map.delete(e.id)
}

function wantedZone(sim, w, now) {
  const live = w.session.live
  const st = w.session.state
  if (st === 'away') return 'exit'
  if (sim.outage?.level === 'down' && prefs.mode !== 'calm') return 'panic'
  if (prefs.mode === 'calm') return 'desk'
  if (w.hidden) return 'wc'
  if (st === 'working' && live?.verb === 'browsing') return 'library'
  if (st === 'working' && live?.verb === 'designing') return 'studio'
  if (st === 'idle' || st === 'done') {
    if (w.dest === 'wc' && !w.wcDone) return 'wc'
    const idleFor = now - (live?.since ?? now)
    if (w.breakZone && now < w.breakUntil && !(w.breakZone === 'wc' && w.wcDone)) return w.breakZone
    w.breakZone = null
    if (!w.nextBreak) w.nextBreak = now + rnd(20_000, 140_000)
    if (idleFor > IDLE_TO_CAFE_MS && now > w.nextBreak) {
      w.breakZone = pick(['cafe', 'cafe', 'cafe', 'wc', 'library'])
      w.breakUntil = now + (w.breakZone === 'wc' ? 30_000 : rnd(45_000, 100_000))
      w.nextBreak = w.breakUntil + rnd(120_000, 320_000)
      if (w.breakZone === 'wc') w.wcDone = false
      return w.breakZone
    }
  }
  return 'desk'
}

/** A new plan: everyone drops their seat and finds their way again. */
export function replan(sim, plan) {
  sim.plan = plan
  sim.reserved.clear()
  for (const e of [...sim.workers.values(), ...sim.helpers.values()]) {
    e.dest = null
    e.target = null
    e.path = []
    e.spotKey = null
  }
  if (sim.manager) {
    place(sim.manager, plan.zones.manager.home)
    sim.manager.target = plan.zones.manager.home
  }
}

/** Brings the people in line with the sessions: who is in, where each wants to be, the subagents, what just ended. */
export function sync(sim, sessions, outage, now) {
  const { plan } = sim
  sim.outage = outage
  const seen = new Set()
  for (const s of sessions) {
    seen.add(s.id)
    let w = sim.workers.get(s.id)
    if (!plan.desks.has(s.id)) {
      if (w) removeEntity(sim, sim.workers, w)
      for (const e of [...sim.helpers.values()]) if (e.owner === s.id) removeEntity(sim, sim.helpers, e)
      continue
    }
    if (!w && s.state !== 'away') w = spawnWorker(sim, s, now)
    sim.everSeen.add(s.id)
    const was = sim.lastState.get(s.id)
    if (was !== undefined && was !== s.state && !sim.isFirstLoad) {
      const at = w ? { x: w.x, z: w.z } : plan.desks.get(s.id).seat
      if (s.state === 'done') {
        burst(sim, at.x, 1.3, at.z, 'confetti')
        if (w) w.cheerUntil = now + CHEER_MS
      }
      if (s.state === 'failed') burst(sim, at.x, 1.2, at.z, 'smoke')
    }
    sim.lastState.set(s.id, s.state)
    const result = s.live?.result
    if (result && result.at !== sim.lastResult.get(s.id)) {
      if (sim.lastResult.has(s.id) && w) w.resultUntil = now + 25_000
      sim.lastResult.set(s.id, result.at)
    }
    const pr = s.pr?.state
    if (pr === 'MERGED' && sim.lastPr.get(s.id) && sim.lastPr.get(s.id) !== 'MERGED' && !sim.isFirstLoad) {
      const cafe = plan.rooms.find(r => r.id === 'cafe')
      burst(sim, cafe.x + 3, 1.5, cafe.z + 3, 'confetti')
      const seat = plan.desks.get(s.id).seat
      burst(sim, seat.x, 1.4, seat.z, 'confetti')
    }
    if (pr) sim.lastPr.set(s.id, pr)
    if (!w) continue
    w.session = s
    const zone = wantedZone(sim, w, now)
    if (zone !== w.dest || !w.target) goTo(sim, w, zone, s.id)
    if (zone === 'desk' && w.dest === 'desk') {
      const seat = plan.desks.get(s.id).seat
      if (w.target !== seat) {
        w.target = seat
        w.path = findPath(plan.grid, { x: w.x, z: w.z }, seat)
      }
    }
    const liveHelpers = s.state === 'away' ? [] : s.live?.helpers ?? []
    for (const h of liveHelpers) {
      const id = `${s.id}/${h.id}`
      if (sim.delivered.has(id)) continue
      let e = sim.helpers.get(id)
      if (!e) {
        if (h.isDone && sim.isFirstLoad) {
          sim.delivered.add(id)
          continue
        }
        const look = lookOf(hash(h.id), plan.desks.get(s.id).color)
        const fig = makePerson(look, 0.72)
        sim.group.add(fig.root)
        const at = plan.zones.exit
        e = { kind: 'helper', id, fig, owner: s.id, helper: h, phase: h.isDone ? 'delivering' : 'working', x: at.x, z: at.z, rot: Math.PI, heading: Math.PI, path: [], target: null, dest: null, placeDirectly: sim.everSeen.has(id) }
        sim.everSeen.add(id)
        sim.helpers.set(id, e)
      }
      e.helper = h
      if (h.isDone && e.phase === 'working') e.phase = 'delivering'
      const isPanic = sim.outage?.level === 'down' && prefs.mode !== 'calm'
      if (e.phase === 'working') goTo(sim, e, isPanic ? 'panic' : prefs.mode === 'calm' ? 'side' : 'meeting', s.id)
      else if (e.phase === 'delivering') goTo(sim, e, 'side', s.id)
    }
    for (const e of sim.helpers.values()) {
      if (e.owner !== s.id) continue
      if (!liveHelpers.some(h => `${s.id}/${h.id}` === e.id) && e.phase !== 'leaving') {
        e.phase = 'leaving'
        goTo(sim, e, 'exit', s.id)
      }
    }
  }
  for (const w of sim.workers.values()) {
    if (!seen.has(w.id)) {
      w.session = { ...w.session, state: 'away' }
      goTo(sim, w, 'exit', w.id)
    }
  }
  for (const e of sim.helpers.values()) {
    if (!sim.workers.has(e.owner) && e.phase !== 'leaving') {
      e.phase = 'leaving'
      goTo(sim, e, 'exit', e.owner)
    }
  }
  if (!sim.manager) {
    const fig = makeMascot()
    sim.group.add(fig.root)
    const home = plan.zones.manager.home
    sim.manager = { kind: 'manager', id: 'manager', fig, x: home.x, z: home.z, rot: 0, heading: 0, path: [], target: home, dest: 'home', nextWalk: now + rnd(40_000, 90_000) }
  }
  if (sim.dogs.length === 0) {
    const cafe = plan.rooms.find(r => r.id === 'cafe')
    const corridor = plan.zones.manager.room.d + 1.0
    const starts = [
      { id: 'dog', collar: '#e0484d', x: cafe.x + 6.5, z: cafe.z + 3 },
      { id: 'dog-blue', collar: '#2f6fe0', x: plan.width / 2, z: corridor },
    ]
    for (const start of starts) {
      const fig = makeDog(start.collar)
      sim.group.add(fig.root)
      sim.dogs.push({ kind: 'dog', id: start.id, fig, x: start.x, z: start.z, rot: 0, heading: 0, path: [], target: null, dest: null, nextMove: now + rnd(1500, 4000) })
    }
  }
  sim.isFirstLoad = false
}

/** Timed behaviour: trips to the WC, café chats and poses, deliveries, the panic, the manager's rounds, the dogs. */
export function behave(sim, now) {
  const { plan } = sim
  for (const w of [...sim.workers.values()]) {
    if (w.dest === 'wc' && arrived(w) && !w.hidden && !w.wcDone) {
      w.hidden = true
      w.wcUntil = now + WC_MS
    }
    if (w.hidden && now > w.wcUntil) {
      w.hidden = false
      w.wcDone = true
      release(sim, w)
      w.dest = null
      goTo(sim, w, wantedZone(sim, w, now), w.id)
    }
    if (w.dest === 'exit' && arrived(w)) {
      removeEntity(sim, sim.workers, w)
      continue
    }
    if (w.dest === 'panic') {
      if (w.path.length === 0) {
        w.target = null
        goTo(sim, w, 'panic', w.id)
      }
      if (now > (w.panicSayAt ?? 0)) {
        w.bubble = { text: pick(PANIC), tone: 'panic', until: now + 1600 }
        w.panicSayAt = now + rnd(1800, 4200)
      }
      if (Math.random() < 0.004) burst(sim, w.x, 1.1, w.z, 'paper')
    }
    if (w.dest === 'cafe' && arrived(w) && now > w.sayAt) {
      w.bubble = { text: pick(CHAT), tone: 'chat', until: now + 3500 }
      w.sayAt = now + rnd(6000, 20000)
    }
    if (w.act && now > w.act.until) w.act = null
    if (!w.act && arrived(w) && now > w.nextPose) {
      const kinds = w.dest === 'cafe' ? ['sip', 'phone', 'sip'] : w.session.state === 'idle' || w.session.state === 'done' ? ['stretch'] : []
      if (kinds.length > 0) w.act = { kind: pick(kinds), until: now + (w.dest === 'cafe' ? 2600 : 1500) }
      w.nextPose = now + rnd(7000, 16000)
    }
  }
  for (const e of [...sim.helpers.values()]) {
    if (e.dest === 'panic' && e.path.length === 0) {
      e.target = null
      goTo(sim, e, 'panic', e.owner)
    }
    if (e.phase === 'leaving' && !e.target) goTo(sim, e, 'exit', e.owner)
    if (e.phase === 'delivering' && arrived(e)) {
      if (!e.deliveredAt) e.deliveredAt = now
      if (now - e.deliveredAt > DELIVER_MS) {
        e.phase = 'leaving'
        sim.delivered.add(e.id)
        goTo(sim, e, 'exit', e.owner)
      }
    }
    if (e.phase === 'leaving' && arrived(e)) removeEntity(sim, sim.helpers, e)
  }
  const m = sim.manager
  if (m && m.path.length === 0) {
    const zone = plan.zones.manager
    if (sim.outage?.level === 'down') {
      m.target = pick(zone.spots)
      m.path = findPath(plan.grid, { x: m.x, z: m.z }, m.target)
    } else if (now > m.nextWalk) {
      const isHome = Math.hypot(m.x - zone.home.x, m.z - zone.home.z) < 0.1
      m.target = isHome ? pick(zone.spots) : zone.home
      m.path = findPath(plan.grid, { x: m.x, z: m.z }, m.target)
      m.nextWalk = now + (isHome ? 6000 : rnd(40_000, 90_000))
    }
  }
  for (const dog of sim.dogs) {
    if (now <= dog.nextMove || dog.path.length > 0) continue
    const spot = panicSpot(sim, dog)
    if (spot) {
      dog.target = spot
      dog.path = findPath(plan.grid, { x: dog.x, z: dog.z }, spot)
    }
    dog.nextMove = now + (sim.outage?.level === 'down' ? rnd(200, 700) : rnd(3000, 9000))
  }
}

// ------------------------------------------------------------------ effects

const particleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06)
const smokeGeo = new THREE.SphereGeometry(0.09, 8, 6)
const paperGeo = new THREE.BoxGeometry(0.14, 0.006, 0.18)
const particleMats = new Map()
const particleMat = color => {
  if (!particleMats.has(color)) particleMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }))
  return particleMats.get(color)
}

export function burst(sim, x, y, z, kind) {
  const n = kind === 'confetti' ? 34 : kind === 'paper' ? 4 : 12
  for (let i = 0; i < n && sim.particles.length < 400; i++) {
    const color = kind === 'confetti' ? pick(CONFETTI) : kind === 'paper' ? '#fbfbf7' : pick(['#9a9a9a', '#6f6f6f', '#c0392b', '#bdbdbd'])
    const mesh = new THREE.Mesh(kind === 'smoke' ? smokeGeo : kind === 'paper' ? paperGeo : particleGeo, particleMat(color))
    mesh.position.set(x + rnd(-0.15, 0.15), y, z + rnd(-0.15, 0.15))
    mesh.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3))
    sim.group.add(mesh)
    const v =
      kind === 'confetti'
        ? { x: rnd(-1.2, 1.2), y: rnd(2.2, 3.8), z: rnd(-1.2, 1.2), g: -6.5 }
        : kind === 'paper'
          ? { x: rnd(-1, 1), y: rnd(1, 2), z: rnd(-1, 1), g: -2.2 }
          : { x: rnd(-0.15, 0.15), y: rnd(0.4, 0.8), z: rnd(-0.15, 0.15), g: 0.2 }
    sim.particles.push({ mesh, v, age: 0, life: kind === 'smoke' ? rnd(1.4, 2.2) : rnd(1.1, 1.8), spin: rnd(-6, 6), grow: kind === 'smoke' })
  }
}

function updateParticles(sim, dt) {
  for (let i = sim.particles.length - 1; i >= 0; i--) {
    const p = sim.particles[i]
    p.age += dt
    if (p.age > p.life) {
      sim.group.remove(p.mesh)
      sim.particles.splice(i, 1)
      continue
    }
    p.v.y += p.v.g * dt
    p.mesh.position.x += p.v.x * dt
    p.mesh.position.y = Math.max(0.01, p.mesh.position.y + p.v.y * dt)
    p.mesh.position.z += p.v.z * dt
    p.mesh.rotation.x += p.spin * dt
    p.mesh.rotation.z += p.spin * dt * 0.7
    const life = 1 - p.age / p.life
    p.mesh.scale.setScalar(p.grow ? 1 + (1 - life) * 2.2 : Math.max(0.2, life))
  }
}

// ------------------------------------------------------------------ every frame

/** Moves everyone by `dt` seconds and poses them. */
export function update(sim, dt, now) {
  const all = [...sim.workers.values(), ...sim.helpers.values(), sim.manager, ...sim.dogs].filter(Boolean)
  for (const e of all) stepEntity(sim, e, dt)
  const t = now / 1000
  const isDown = sim.outage?.level === 'down'
  for (const e of all) {
    const root = e.fig.root
    root.position.set(e.x, 0, e.z)
    root.rotation.y = e.rot
    root.visible = !e.hidden
    const here = arrived(e)
    const pose = e.target?.pose
    if (e.kind === 'worker') {
      const st = e.session.state
      const sitting = !e.walking && here && pose === 'sit'
      animate(e.fig, {
        walking: e.walking,
        pace: e.pace,
        sitting,
        stool: !e.walking && here && pose === 'stool',
        typing: sitting && e.dest === 'desk' && st === 'working',
        waiting: st === 'waiting' && !e.walking,
        panic: e.dest === 'panic',
        shake: isDown && prefs.mode === 'calm',
        pose: e.cheerUntil > now ? 'cheer' : e.act?.kind,
      }, dt, t)
    } else if (e.kind === 'helper') {
      const sitting = !e.walking && here && pose === 'sit'
      animate(e.fig, { walking: e.walking, pace: e.pace, sitting, typing: sitting && e.phase === 'working', carrying: e.phase !== 'working', panic: e.dest === 'panic' }, dt, t)
    } else if (e.kind === 'manager') {
      const busy = [...sim.workers.values()].some(w => w.session.state === 'working')
      animate(e.fig, { walking: e.walking, pace: e.pace, busy, panic: isDown }, dt, t)
    } else animate(e.fig, { walking: e.walking, pace: e.pace, panic: isDown }, dt, t)
  }
  updateParticles(sim, Math.min(dt, 0.1))
}
