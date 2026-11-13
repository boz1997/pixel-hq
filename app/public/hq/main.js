import * as THREE from 'three'

import { departmentsOf, modelName, outageOf, poll, prefs, resetsIn, sessionsOf, store, usagePeak, usageRows } from './data.js'
import { createNav } from './nav.js'
import { makePlan, tablesOf } from './plan.js'
import { behave, createSim, replan, sync, update } from './sim.js'
import { buildStaticLabels, createUi, select, showGate, stopTour, tickTour, updateHud, updateMovingLabels, updateStaticLabels } from './ui.js'
import { REDUCED_MOTION } from './util.js'
import { buildOffice, createWorld } from './world.js'

const world = createWorld(document.getElementById('stage'))
const sim = createSim(world)
let plan = null
let fly = null
let outage = null

const ui = createUi(world, sim, {
  poll: tick,
  fit: () => frameAll(),
  onModeChange: () => {
    for (const e of [...sim.workers.values(), ...sim.helpers.values()]) {
      e.dest = null
      e.target = null
      if (e.hidden) {
        e.hidden = false
        e.wcDone = true
      }
    }
    refresh()
  },
})
ui.onFold = () => refresh()
ui.focusRoom = room => flyTo({ x: room.x + room.w / 2, y: 0, z: room.z + room.d / 2 }, Math.max(11, room.w * 1.5), false)
ui.flyToSession = (id, isBrief) => {
  const w = sim.workers.get(id)
  const at = w ? { x: w.x, z: w.z } : plan?.desks.get(id)?.seat
  if (at) flyTo({ x: at.x, y: 0.7, z: at.z }, isBrief ? 11 : 8.5, true)
}
ui.onTourEnd = () => frameAll()

// ------------------------------------------------------------------ the camera

const WIDE = new THREE.Vector3(0.6, 0.85, 0.66).normalize()
const CLOSE = new THREE.Vector3(0.52, 0.62, 0.78).normalize()
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

function flyTo(target, dist, isClose, isInstant = false) {
  const t = new THREE.Vector3(target.x, target.y ?? 0, target.z)
  const position = t.clone().add((isClose ? CLOSE : WIDE).clone().multiplyScalar(dist))
  if (isInstant || REDUCED_MOTION) {
    world.camera.position.copy(position)
    world.controls.target.copy(t)
    world.controls.update()
    fly = null
    return
  }
  fly = { from: { position: world.camera.position.clone(), target: world.controls.target.clone() }, to: { position, target: t }, t: 0 }
}

/** Where to stand so the whole office fits between the HUD at the top and the task bar at the bottom, centered there. */
function fitView() {
  const cam = world.camera.clone()
  const { w: W, h: H } = world.size
  const top = 1 - (2 * 74) / H
  const bottom = -1 + (2 * ((document.getElementById('taskbar')?.offsetHeight ?? 90) + 22)) / H
  const left = -0.94
  const right = 0.94
  const corners = []
  for (const x of [0, plan.width]) for (const z of [0, plan.depth]) for (const y of [0, 2.7]) corners.push(new THREE.Vector3(x, y, z))
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const caster = new THREE.Raycaster()
  const place = (target, dist) => {
    cam.position.copy(target).add(WIDE.clone().multiplyScalar(dist))
    cam.lookAt(target)
    cam.updateMatrixWorld()
  }
  const box = () => {
    const ps = corners.map(c => c.clone().project(cam))
    return { minx: Math.min(...ps.map(p => p.x)), maxx: Math.max(...ps.map(p => p.x)), miny: Math.min(...ps.map(p => p.y)), maxy: Math.max(...ps.map(p => p.y)) }
  }
  const onGround = (x, y) => {
    caster.setFromCamera(new THREE.Vector2(x, y), cam)
    return caster.ray.intersectPlane(ground, new THREE.Vector3())
  }
  const target = new THREE.Vector3(plan.width / 2, 0, plan.depth / 2)
  let dist = 40
  for (let round = 0; round < 4; round++) {
    let lo = 4
    let hi = 300
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      place(target, mid)
      const b = box()
      if (b.maxx - b.minx <= right - left && b.maxy - b.miny <= top - bottom) hi = mid
      else lo = mid
    }
    dist = hi
    place(target, dist)
    const b = box()
    const from = onGround((b.minx + b.maxx) / 2, (b.miny + b.maxy) / 2)
    const to = onGround((left + right) / 2, (top + bottom) / 2)
    if (!from || !to) break
    target.add(from.sub(to))
    target.y = 0
  }
  return { target, dist }
}

function frameAll(isInstant = false) {
  if (!plan) return
  const { target, dist } = fitView()
  flyTo(target, dist, false, isInstant)
}

world.controls.addEventListener('start', () => {
  fly = null
  stopTour(ui, true)
})

/** A double-click zooms in on that spot, or flies to the person there and opens their card. */
function onDoubleClick(e) {
  const rect = canvas.getBoundingClientRect()
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  ray.setFromCamera(ndc, world.camera)
  const people = [...sim.workers.values()]
  const hits = ray.intersectObjects(people.map(p => p.fig.root), true)
  if (hits.length > 0) {
    let o = hits[0].object
    while (o && !people.some(p => p.fig.root === o)) o = o.parent
    const who = people.find(p => p.fig.root === o)
    if (who) {
      ui.selected = null
      select(ui, who.id)
      ui.flyToSession(who.id)
      return
    }
  }
  const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
  if (!point) return
  const offset = world.camera.position.clone().sub(world.controls.target)
  const dist = Math.max(world.controls.minDistance + 1, offset.length() * 0.55)
  const target = new THREE.Vector3(point.x, 0, point.z)
  fly = { from: { position: world.camera.position.clone(), target: world.controls.target.clone() }, to: { position: target.clone().add(offset.normalize().multiplyScalar(dist)), target }, t: 0 }
}

const nav = createNav(world, {
  onMove: () => {
    fly = null
    stopTour(ui, true)
  },
  onDoubleClick: e => onDoubleClick(e),
  bounds: () => (plan ? { minX: -2, maxX: plan.width + 2, minZ: -2, maxZ: plan.depth + 2 } : null),
})

// ------------------------------------------------------------------ picking

const ray = new THREE.Raycaster()
const ndc = new THREE.Vector2()
let down = null
const canvas = world.renderer.domElement
canvas.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY }
})
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return
  const rect = canvas.getBoundingClientRect()
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
  ray.setFromCamera(ndc, world.camera)
  const people = [...sim.workers.values(), ...sim.helpers.values()]
  const hits = ray.intersectObjects(people.map(p => p.fig.root), true)
  if (hits.length > 0) {
    let o = hits[0].object
    while (o && !people.some(p => p.fig.root === o)) o = o.parent
    const who = people.find(p => p.fig.root === o)
    if (who) {
      select(ui, who.kind === 'helper' ? who.owner : who.id)
      return
    }
  }
  const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.62), new THREE.Vector3())
  if (point && plan) {
    let best = null
    for (const desk of plan.desks.values()) {
      const d = Math.hypot(point.x - desk.laptop.x, point.z - desk.laptop.z)
      if (d < 0.75 && (!best || d < best.d)) best = { d, id: desk.sessionId }
    }
    if (best) {
      select(ui, best.id)
      return
    }
  }
  if (!ui.tour) select(ui, null)
})

// ------------------------------------------------------------------ the data

async function tick() {
  const result = await poll()
  showGate(result === 'locked')
  if (result === 'ok') refresh()
  return result
}

const SCREEN = {
  working: ['#8fc2ff', 0.95],
  waiting: ['#f5b82e', 0.9],
  done: ['#3ecf6e', 0.8],
  failed: ['#e5534b', 0.85],
  idle: ['#4c6a8a', 0.35],
  away: ['#000000', 0],
}
let boardsKey = ''

function refresh() {
  const now = Date.now()
  const sessions = sessionsOf(now)
  const { shown, folded } = departmentsOf(sessions)
  ui.folded = folded
  outage = outageOf(now)
  const signature = JSON.stringify(shown.map(d => [d.id, d.name, d.color, tablesOf(d.slots), d.members.map(s => [s.id, s.slot])]))
  if (!plan || plan.signature !== signature) {
    const isFirst = !plan
    plan = makePlan(shown)
    plan.signature = signature
    buildOffice(world, plan)
    replan(sim, plan)
    buildStaticLabels(ui, plan, shown)
    boardsKey = ''
    if (isFirst) frameAll(true)
  }
  sync(sim, sessions, outage, now)
  updateStaticLabels(ui, shown, now)
  updateHud(ui, sessions, now, outage)
  const byId = new Map(sessions.map(s => [s.id, s]))
  for (const [id, laptop] of world.handles.laptops) {
    const [color, intensity] = SCREEN[byId.get(id)?.state ?? 'away']
    laptop.screen.emissive.set(color)
    laptop.screen.emissiveIntensity = intensity
  }
  const focus = [...sessions].filter(s => s.live).sort((a, b) => b.live.at - a.live.at)[0]
  const rows = usageRows(now).slice(0, 3).map(r => ({ name: r.name, percent: r.percentUsed, note: r.percentUsed >= 90 && r.resetsAt ? `resets ${resetsIn(r.resetsAt, now)}` : '' }))
  const helper = sessions.flatMap(s => (s.live?.helpers ?? []).filter(x => !x.isDone).map(x => `${x.label}${x.verb ? ` · ${x.verb} ${x.detail ?? ''}` : ''}`))[0]
  const key = JSON.stringify([focus?.live?.context, rows, helper])
  if (key !== boardsKey) {
    boardsKey = key
    world.handles.panels.context.redraw(focus?.live?.context === undefined ? [] : [{ big: true, percent: focus.live.context }])
    world.handles.panels.usage.redraw(rows)
    world.handles.panels.meeting.redraw(helper ? clipText(helper, 60) : 'No meeting right now')
  }
  void modelName
  void prefs
}

const clipText = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// ------------------------------------------------------------------ every frame

function timeOfDay(now) {
  const hour = new Date(now).getHours()
  return hour >= 21 || hour < 6 ? 'night' : hour < 8 || hour >= 18 ? 'dusk' : 'day'
}
const SKY = {
  day: { bg: '#ebe9e4', hemi: 1.15, sun: 2.1, sunColor: '#ffffff', pane: '#000000' },
  dusk: { bg: '#e7dfd4', hemi: 0.95, sun: 1.6, sunColor: '#ffd9a8', pane: '#3a2a20' },
  night: { bg: '#2a2d37', hemi: 0.5, sun: 0.55, sunColor: '#a9b8ff', pane: '#1b2a4a' },
}
let sky = ''

function lights(now) {
  const tod = timeOfDay(now)
  if (tod !== sky) {
    sky = tod
    const s = SKY[tod]
    world.scene.background.set(s.bg)
    world.hemi.intensity = s.hemi
    world.sun.intensity = s.sun
    world.sun.color.set(s.sunColor)
    world.office?.traverse(o => {
      if (o.isMesh && o.material?.color?.getHexString?.() === 'bcd6e3') o.material.emissive.set(s.pane)
    })
  }
  const peak = usagePeak(now)
  const pulse = REDUCED_MOTION ? 0.5 : Math.max(0, Math.sin((now / 1100) * Math.PI * 2)) ** 2
  const blink = Math.floor(now / 500) % 2 === 0 ? 1 : 0.15
  const beacon = world.handles?.beacon
  if (beacon) {
    const level = peak >= 100 ? 0.25 + pulse * 0.75 : peak >= 90 ? blink : 0
    beacon.material.emissiveIntensity = level * 2.2
    beacon.light.intensity = peak >= 100 ? pulse * 9 : peak >= 90 ? blink * 2 : 0
  }
  const siren = outage?.level === 'down' ? (REDUCED_MOTION ? 0.5 : Math.max(0, Math.sin((now / 750) * Math.PI * 2)) ** 2) : 0
  for (const light of world.handles?.sirens ?? []) light.intensity = siren * 14
}

/** The Boz Apps propeller turns like it does on bozapps.net; a stall closes and shows red while someone is in. */
function props(dt) {
  const propeller = world.handles?.propeller
  if (propeller && !REDUCED_MOTION) propeller.rotation.x -= dt * ((Math.PI * 2) / 3.2)
  ;(world.handles?.stalls ?? []).forEach((stall, i) => {
    if (!stall) return
    const who = sim.reserved.get(`wc:${i}`)
    const isIn = Boolean(who && sim.workers.get(who)?.hidden)
    stall.hinge.rotation.y += ((isIn ? 0 : 1.15) - stall.hinge.rotation.y) * Math.min(1, dt * 6)
    stall.lamp.emissive.set(isIn ? '#ff3b30' : '#34c759')
  })
}

let last = performance.now()
let behaveIn = 0
function loop(t) {
  const now = Date.now()
  const dt = Math.min(0.1, Math.max(0, (t - last) / 1000))
  last = t
  if (plan) {
    update(sim, dt, now)
    behaveIn -= dt
    if (behaveIn <= 0) {
      behave(sim, now)
      behaveIn = 0.05
    }
    lights(now)
    props(dt)
    nav.step(dt)
    tickTour(ui, now)
    updateMovingLabels(ui, now)
  }
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 1.2)
    const k = ease(fly.t)
    world.camera.position.lerpVectors(fly.from.position, fly.to.position, k)
    world.controls.target.lerpVectors(fly.from.target, fly.to.target, k)
    if (fly.t >= 1) fly = null
  }
  world.controls.update()
  world.render()
  requestAnimationFrame(loop)
}

window.__hq3d = {
  world,
  sim,
  ui,
  store,
  get plan() {
    return plan
  },
  frameAll,
  flyTo,
  /** Draws one frame at a given size without waiting for the browser, for screenshots of a hidden page. */
  snapshot(w = 1600, h = 1000, steps = 1) {
    world.renderer.setSize(w, h)
    world.labels.setSize(w, h)
    world.camera.aspect = w / h
    world.camera.updateProjectionMatrix()
    for (let i = 0; i < steps; i++) {
      const now = Date.now()
      update(sim, 0.05, now)
      behave(sim, now)
      lights(now)
      props(0.05)
      nav.step(0.05)
      updateMovingLabels(ui, now)
    }
    world.controls.update()
    world.render()
    return world.renderer.domElement.toDataURL('image/png')
  },
}

await tick()
setInterval(tick, 2000)
requestAnimationFrame(loop)
