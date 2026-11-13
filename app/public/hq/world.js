import * as THREE from 'three'
import { OrbitControls } from 'three/addons/OrbitControls.js'
import { CSS2DRenderer } from 'three/addons/CSS2DRenderer.js'
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js'

import { OUTER_H, WALL_H } from './plan.js'

export const TABLE_H = 0.62
export const SEAT_H = 0.4

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra })

/** Planks, drawn once and repeated over the floor. */
function woodTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const g = canvas.getContext('2d')
  const rows = 8
  const h = canvas.height / rows
  for (let r = 0; r < rows; r++) {
    let x = -((r * 173) % 260)
    while (x < canvas.width) {
      const len = 200 + ((r * 97 + x) % 120)
      const shade = 0.92 + (((r * 31 + Math.floor(x)) % 17) / 17) * 0.12
      g.fillStyle = `rgb(${Math.round(222 * shade)},${Math.round(168 * shade)},${Math.round(104 * shade)})`
      g.fillRect(x, r * h, len, h)
      g.fillStyle = 'rgba(120,80,40,0.10)'
      for (let i = 0; i < 5; i++) g.fillRect(x, r * h + 4 + i * (h / 5), len, 1)
      g.fillStyle = 'rgba(90,55,25,0.35)'
      g.fillRect(x, r * h, 2, h)
      x += len
    }
    g.fillStyle = 'rgba(90,55,25,0.45)'
    g.fillRect(0, r * h, canvas.width, 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** A canvas drawn as a texture, redrawn on demand: the logo wall, the boards, the meeting screen, signs. */
export function canvasPanel(width, height, draw, { emissive = true } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * 220)
  canvas.height = Math.round(height * 220)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, ...(emissive ? { emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: 0.55 } : {}) })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  const redraw = (...args) => {
    draw(canvas.getContext('2d'), canvas.width, canvas.height, ...args)
    texture.needsUpdate = true
  }
  redraw()
  return { mesh, redraw }
}

/** Boxes gathered by material and drawn as one instanced mesh each. */
class Boxes {
  constructor() {
    this.byMaterial = new Map()
  }
  add(material, x, y, z, w, h, d, ry = 0) {
    if (!this.byMaterial.has(material)) this.byMaterial.set(material, [])
    this.byMaterial.get(material).push([x, y, z, w, h, d, ry])
  }
  build(parent, geometry) {
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    for (const [material, items] of this.byMaterial) {
      const mesh = new THREE.InstancedMesh(geometry, material, items.length)
      items.forEach(([x, y, z, w, h, d, ry], i) => {
        q.setFromAxisAngle(up, ry)
        m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(w, h, d))
        mesh.setMatrixAt(i, m)
      })
      mesh.castShadow = material.userData.cast !== false
      mesh.receiveShadow = true
      mesh.userData.isStatic = true
      parent.add(mesh)
    }
  }
}

export function createWorld(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.domElement.className = 'gl'
  container.appendChild(renderer.domElement)

  const labels = new CSS2DRenderer()
  labels.domElement.className = 'labels'
  container.appendChild(labels.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#ebe9e4')

  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minPolarAngle = 0.3
  controls.maxPolarAngle = 1.18
  controls.minDistance = 5
  controls.maxDistance = 140
  controls.screenSpacePanning = false

  const hemi = new THREE.HemisphereLight('#ffffff', '#d9cbb4', 1.15)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#ffffff', 2.1)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 4
  scene.add(sun)
  scene.add(sun.target)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), mat('#e9e7e2', { roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.13
  ground.receiveShadow = true
  scene.add(ground)

  const world = { renderer, labels, scene, camera, controls, hemi, sun, ground, office: null, size: { w: 1, h: 1 } }
  world.resize = () => {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    world.size = { w, h }
    renderer.setSize(w, h)
    labels.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  world.render = () => {
    renderer.render(scene, camera)
    labels.render(scene, camera)
  }
  world.resize()
  window.addEventListener('resize', world.resize)
  return world
}

// ------------------------------------------------------------------ the building

const M = {}
function materials() {
  if (M.ready) return M
  M.wall = mat('#f6f5f1', { roughness: 0.95 })
  M.wallCap = mat('#e4e1da')
  M.pane = mat('#bcd6e3', { roughness: 0.15, metalness: 0.2, emissive: '#000000' })
  M.paneFrame = mat('#ffffff', { roughness: 0.5 })
  M.glass = new THREE.MeshStandardMaterial({ color: '#d7e7ee', transparent: true, opacity: 0.17, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide })
  M.glass.userData.cast = false
  M.frosted = new THREE.MeshStandardMaterial({ color: '#eef3f5', transparent: true, opacity: 0.42, roughness: 0.4, depthWrite: false, side: THREE.DoubleSide })
  M.frosted.userData.cast = false
  M.frame = mat('#24272d', { roughness: 0.45, metalness: 0.2 })
  M.deskTop = mat('#e8b26a', { roughness: 0.55 })
  M.deskLeg = mat('#d9d9d9', { roughness: 0.4, metalness: 0.35 })
  M.chair = mat('#2d3036', { roughness: 0.65 })
  M.chairSeat = mat('#3a3e46', { roughness: 0.7 })
  M.laptop = mat('#c8ccd3', { roughness: 0.35, metalness: 0.45 })
  M.pot = mat('#c8734a', { roughness: 0.8 })
  M.leaf = mat('#5aa65a', { roughness: 0.8 })
  M.leafDark = mat('#3f8c4a', { roughness: 0.8 })
  M.shelf = mat('#b98a58', { roughness: 0.7 })
  M.books = ['#d65a4a', '#3d6fd6', '#f2c037', '#2e9d57', '#7c5cff', '#ef8a3a', '#e6e8ef'].map(c => mat(c, { roughness: 0.7 }))
  M.counter = mat('#f1efea', { roughness: 0.5 })
  M.counterTop = mat('#3a3d44', { roughness: 0.3, metalness: 0.3 })
  M.metal = mat('#b9bec7', { roughness: 0.25, metalness: 0.8 })
  M.dark = mat('#1f2126', { roughness: 0.5 })
  M.white = mat('#fbfbfa', { roughness: 0.6 })
  M.easelWood = mat('#c49a6c', { roughness: 0.7 })
  M.canvas = mat('#fdfcf8', { roughness: 0.9 })
  M.wcWall = mat('#e9f1f3', { roughness: 0.35 })
  M.porcelain = mat('#fbfcfd', { roughness: 0.18, metalness: 0.05 })
  M.partition = mat('#dde6ea', { roughness: 0.45 })
  M.stallDoor = mat('#7cc7b8', { roughness: 0.5 })
  M.chrome = mat('#d9dee4', { roughness: 0.12, metalness: 0.9 })
  M.mirror = mat('#cfe0e6', { roughness: 0.04, metalness: 0.95 })
  M.quartz = mat('#f4f3ef', { roughness: 0.25 })
  M.cabinet = mat('#9fb3ba', { roughness: 0.6 })
  M.brandInk = mat('#0c2e29', { roughness: 0.55 })
  M.brandTeal = mat('#31dbc9', { roughness: 0.35, metalness: 0.2, emissive: '#31dbc9', emissiveIntensity: 0.45 })
  M.ready = true
  return M
}

const unitBox = new THREE.BoxGeometry(1, 1, 1)
const rounded = new Map()
const roundedBox = (w, h, d, r) => {
  const key = `${w}|${h}|${d}|${r}`
  if (!rounded.has(key)) rounded.set(key, new RoundedBoxGeometry(w, h, d, 3, r))
  return rounded.get(key)
}
const colorMats = new Map()
const colored = (color, extra) => {
  const key = `${color}|${JSON.stringify(extra ?? {})}`
  if (!colorMats.has(key)) colorMats.set(key, mat(color, extra))
  return colorMats.get(key)
}

/** Builds the office for a plan: floor, outer walls with windows, glass rooms, furniture. Answers the handles the rest needs. */
export function buildOffice(world, plan) {
  if (world.office) disposeOffice(world)
  const m = materials()
  const group = new THREE.Group()
  group.name = 'office'
  const boxes = new Boxes()
  const { width: W, depth: D } = plan

  const wood = woodTexture()
  wood.repeat.set(W / 4.5, D / 4.5)
  const floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.62 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, D), [m.wallCap, m.wallCap, floorMat, m.wallCap, m.wallCap, m.wallCap])
  floor.position.set(W / 2, -0.06, D / 2)
  floor.receiveShadow = true
  group.add(floor)

  // Outer walls on the back and the left, with windows; the front and the right stay open to look in.
  boxes.add(m.wall, W / 2, OUTER_H / 2, -0.075, W + 0.15, OUTER_H, 0.15)
  boxes.add(m.wall, -0.075, OUTER_H / 2, D / 2, 0.15, OUTER_H, D)
  boxes.add(m.wallCap, W / 2, OUTER_H + 0.02, -0.075, W + 0.15, 0.04, 0.17)
  boxes.add(m.wallCap, -0.075, OUTER_H + 0.02, D / 2, 0.17, 0.04, D)
  const windows = []
  for (const { at, width } of windowSpots(W, plan.wallItems?.back ?? [])) {
    boxes.add(m.paneFrame, at, 1.6, 0.012, width, 1.36, 0.02)
    windows.push({ x: at, y: 1.6, z: 0.026, ry: 0, width })
  }
  for (const { at, width } of windowSpots(D, plan.wallItems?.left ?? [])) {
    boxes.add(m.paneFrame, 0.012, 1.6, at, 0.02, 1.36, width)
    windows.push({ x: 0.026, y: 1.6, z: at, ry: Math.PI / 2, width })
  }
  const paneGeo = new THREE.PlaneGeometry(1, 1.2)
  for (const w of windows) {
    const pane = new THREE.Mesh(paneGeo, m.pane)
    pane.scale.x = w.width - 0.16
    pane.position.set(w.x, w.y, w.z)
    pane.rotation.y = w.ry
    group.add(pane)
    boxes.add(m.paneFrame, w.x, w.y, w.z + (w.ry ? 0 : 0.004), w.ry ? 0.012 : 0.04, 1.2, w.ry ? 0.04 : 0.012)
  }

  // Glass rooms with dark frames and a door gap; a department's skirting carries its color.
  for (const room of plan.rooms) {
    if (!room.walls) continue
    const glass = room.isFrosted ? m.frosted : m.glass
    const skirt = room.color ? colored(room.color, { roughness: 0.5 }) : m.frame
    const wall = (side, x0, z0, x1, z1) => {
      if (!room.walls[side]) return
      const horizontal = z0 === z1
      const len = horizontal ? x1 - x0 : z1 - z0
      const segments = []
      if (room.door?.side === side) {
        const a = room.door.at
        segments.push([0, a], [a + room.door.len, len])
      } else segments.push([0, len])
      for (const [s0, s1] of segments) {
        const l = s1 - s0
        if (l <= 0.05) continue
        const mid = s0 + l / 2
        const cx = horizontal ? x0 + mid : x0
        const cz = horizontal ? z0 : z0 + mid
        const ry = horizontal ? 0 : Math.PI / 2
        if (room.kind === 'wc') {
          boxes.add(m.wcWall, cx, 0.3, cz, l, 0.6, 0.06, ry)
          boxes.add(glass, cx, 0.6 + (WALL_H - 0.6) / 2, cz, l, WALL_H - 0.6, 0.025, ry)
        } else boxes.add(glass, cx, WALL_H / 2, cz, l, WALL_H, 0.025, ry)
        boxes.add(m.frame, cx, WALL_H, cz, l + 0.035, 0.035, 0.035, ry)
        boxes.add(skirt, cx, 0.03, cz, l, 0.06, 0.05, ry)
        const posts = Math.max(1, Math.round(l / 1.6))
        for (let i = 0; i <= posts; i++) {
          const t = s0 + (l * i) / posts
          boxes.add(m.frame, horizontal ? x0 + t : x0, WALL_H / 2, horizontal ? z0 : z0 + t, 0.03, WALL_H, 0.03)
        }
      }
    }
    const { x, z, w, d } = room
    wall('n', x, z, x + w, z)
    wall('s', x, z + d, x + w, z + d)
    wall('w', x, z, x, z + d)
    wall('e', x + w, z, x + w, z + d)
  }

  const handles = { laptops: new Map(), panels: {}, beacon: null, sirens: [], pickables: [], stalls: [], propeller: null }
  if (plan.brand) handles.propeller = brandWall(group, boxes, m, plan.brand)
  for (const f of plan.furniture) furnish(group, boxes, m, f, handles)

  // A laptop at every taken desk; its screen lights by what the session does.
  for (const desk of plan.desks.values()) {
    const g = new THREE.Group()
    g.position.set(desk.laptop.x, TABLE_H, desk.laptop.z)
    g.rotation.y = desk.laptop.rot
    const base = new THREE.Mesh(unitBox, m.laptop)
    base.scale.set(0.36, 0.02, 0.25)
    base.position.y = 0.01
    base.castShadow = true
    const screenMat = new THREE.MeshStandardMaterial({ color: '#1d2027', emissive: '#4c6a8a', emissiveIntensity: 0.5, roughness: 0.3 })
    const screen = new THREE.Mesh(unitBox, screenMat)
    screen.scale.set(0.36, 0.24, 0.014)
    screen.position.set(0, 0.13, 0.12)
    screen.rotation.x = 0.22
    screen.castShadow = true
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12), colored(desk.color, { roughness: 0.5 }))
    mug.position.set(0.32, 0.045, -0.02)
    g.add(base, screen, mug)
    group.add(g)
    handles.laptops.set(desk.sessionId, { group: g, screen: screenMat })
  }

  // The manager's office: a logo wall, the two boards and the lamp on the back wall.
  const mgr = plan.zones.manager.room
  const logo = canvasPanel(3.0, 0.9, (g, w, h) => {
    g.fillStyle = '#7b4e2c'
    g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(255,255,255,0.08)'
    for (let i = 0; i < w; i += 22) g.fillRect(i, 0, 2, h)
    g.fillStyle = '#fff7ea'
    g.font = `800 ${Math.round(h * 0.42)}px Inter, -apple-system, "Segoe UI", sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('PIXEL HQ', w / 2, h / 2 + 4)
  }, { emissive: false })
  logo.mesh.position.set(mgr.x + 2.4, 1.55, 0.035)
  group.add(logo.mesh)
  const board = (title) => canvasPanel(1.25, 0.86, (g, w, h, rows = []) => drawBoard(g, w, h, title, rows))
  handles.panels.context = board('CONTEXT')
  handles.panels.usage = board('USAGE')
  handles.panels.context.mesh.position.set(mgr.x + 5.15, 1.5, 0.035)
  handles.panels.usage.mesh.position.set(mgr.x + 6.55, 1.5, 0.035)
  group.add(handles.panels.context.mesh, handles.panels.usage.mesh)
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#5a1d1d', emissive: '#ff2a2a', emissiveIntensity: 0, roughness: 0.3 })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat)
  beacon.rotation.x = Math.PI / 2
  beacon.position.set(mgr.x + 4.0, 2.2, 0.02)
  const beaconBase = new THREE.Mesh(unitBox, m.dark)
  beaconBase.scale.set(0.3, 0.1, 0.04)
  beaconBase.position.set(mgr.x + 4.0, 2.2, 0.02)
  const beaconLight = new THREE.PointLight('#ff2a2a', 0, 9, 1.6)
  beaconLight.position.set(mgr.x + 4.0, 2.0, 0.6)
  group.add(beacon, beaconBase, beaconLight)
  handles.beacon = { material: beaconMat, light: beaconLight }

  // The meeting room's screen names the subagent at work.
  const mt = plan.rooms.find(r => r.id === 'meeting')
  handles.panels.meeting = canvasPanel(2.4, 1.2, (g, w, h, text = 'No meeting') => {
    g.fillStyle = '#16181d'
    g.fillRect(0, 0, w, h)
    g.fillStyle = '#7c8091'
    g.font = `600 ${Math.round(h * 0.1)}px Inter, -apple-system, sans-serif`
    g.fillText('MEETING', 26, h * 0.2)
    g.fillStyle = '#ffffff'
    g.font = `700 ${Math.round(h * 0.15)}px Inter, -apple-system, sans-serif`
    wrapText(g, text, 26, h * 0.45, w - 52, h * 0.18, 3)
  })
  handles.panels.meeting.mesh.position.set(mt.x + mt.w / 2, 1.35, 0.035)
  group.add(handles.panels.meeting.mesh)

  // Sirens along the corridor, dark until Claude is down.
  for (let x = 4; x < W; x += 8) {
    const light = new THREE.PointLight('#ff2020', 0, 14, 1.5)
    light.position.set(x, 2.6, plan.rooms.find(r => r.id === 'manager').d + 1.1)
    group.add(light)
    handles.sirens.push(light)
  }

  boxes.build(group, unitBox)
  world.scene.add(group)
  world.office = group
  world.handles = handles
  world.plan = plan
  fitSun(world, plan)
  return handles
}

function disposeOffice(world) {
  world.scene.remove(world.office)
  world.office.traverse(o => {
    if (o.isMesh || o.isInstancedMesh) {
      if (o.geometry !== unitBox && ![...rounded.values()].includes(o.geometry)) o.geometry.dispose()
      const ms = Array.isArray(o.material) ? o.material : [o.material]
      for (const mm of ms) {
        if (Object.values(M).includes(mm) || [...colorMats.values()].includes(mm)) continue
        mm.map?.dispose()
        mm.dispose()
      }
    }
  })
  world.office = null
}

function fitSun(world, plan) {
  const { sun } = world
  const cx = plan.width / 2
  const cz = plan.depth / 2
  sun.position.set(cx - 14, 26, cz + 10)
  sun.target.position.set(cx, 0, cz)
  const r = Math.max(plan.width, plan.depth) * 0.75
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 90 })
  sun.shadow.camera.updateProjectionMatrix()
}

function wrapText(g, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(/\s+/)
  let line = ''
  let lines = 0
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (g.measureText(test).width > maxWidth && line) {
      g.fillText(line, x, y + lines * lineHeight)
      lines++
      line = word
      if (lines >= maxLines - 1) break
    } else line = test
  }
  if (line && lines < maxLines) g.fillText(line, x, y + lines * lineHeight)
}

/** A board on the manager's wall: a title, then rows of a name, a percent and a bar. */
function drawBoard(g, w, h, title, rows) {
  g.fillStyle = '#16181d'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#23262e'
  g.fillRect(0, 0, w, h * 0.2)
  g.fillStyle = '#9aa0b5'
  g.font = `700 ${Math.round(h * 0.11)}px Inter, -apple-system, sans-serif`
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillText(title, 18, h * 0.1)
  if (rows.length === 0) {
    g.fillStyle = '#6b7080'
    g.font = `600 ${Math.round(h * 0.1)}px Inter, -apple-system, sans-serif`
    g.fillText('no reading yet', 18, h * 0.55)
    return
  }
  const top = h * 0.24
  const each = (h - top - 10) / Math.max(rows.length, 2)
  rows.slice(0, 3).forEach((row, i) => {
    const y = top + i * each
    const isHigh = row.percent >= 90
    if (row.big) {
      g.fillStyle = '#ef8a3a'
      g.font = `800 ${Math.round(h * 0.3)}px Inter, -apple-system, sans-serif`
      g.fillText(`${row.percent}%`, 18, y + h * 0.2)
      g.fillStyle = '#3b3e4f'
      g.fillRect(18, y + h * 0.42, w - 36, 10)
      g.fillStyle = '#5b8def'
      g.fillRect(18, y + h * 0.42, ((w - 36) * Math.min(100, row.percent)) / 100, 10)
      return
    }
    g.fillStyle = '#e6e8ef'
    g.font = `700 ${Math.round(h * 0.1)}px Inter, -apple-system, sans-serif`
    g.textAlign = 'left'
    g.fillText(row.name, 18, y + each * 0.28)
    g.textAlign = 'right'
    g.fillStyle = isHigh ? '#ff6b6b' : '#e6e8ef'
    g.fillText(`${row.percent}%`, w - 18, y + each * 0.28)
    g.textAlign = 'left'
    g.fillStyle = '#3b3e4f'
    g.fillRect(18, y + each * 0.52, w - 36, 9)
    g.fillStyle = isHigh ? '#e5534b' : '#5b8def'
    g.fillRect(18, y + each * 0.52, ((w - 36) * Math.min(100, row.percent)) / 100, 9)
    if (row.note) {
      g.fillStyle = isHigh ? '#f2a7a3' : '#8a8fa6'
      g.font = `500 ${Math.round(h * 0.075)}px Inter, -apple-system, sans-serif`
      g.fillText(row.note, 18, y + each * 0.85)
    }
  })
}

// ------------------------------------------------------------------ furniture

function plant(group, x, z, s, m) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.13 * s, 0.32 * s, 14), m.pot)
  pot.position.set(x, 0.16 * s, z)
  pot.castShadow = true
  group.add(pot)
  const leaves = [[0, 0.55, 0, 0.22], [0.1, 0.72, 0.05, 0.17], [-0.09, 0.68, -0.06, 0.16], [0.02, 0.86, -0.02, 0.13]]
  leaves.forEach(([dx, dy, dz, r], i) => {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), i % 2 ? m.leafDark : m.leaf)
    leaf.position.set(x + dx * s, dy * s, z + dz * s)
    leaf.castShadow = true
    group.add(leaf)
  })
}

function chair(boxes, m, x, z, rot) {
  const s = Math.sin(rot)
  const c = Math.cos(rot)
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]
  boxes.add(m.chairSeat, x, SEAT_H, z, 0.44, 0.07, 0.42, rot)
  const [bx, bz] = at(0, -0.22)
  boxes.add(m.chair, bx, SEAT_H + 0.27, bz, 0.44, 0.46, 0.06, rot)
  boxes.add(m.chair, x, SEAT_H / 2, z, 0.06, SEAT_H, 0.06, rot)
  boxes.add(m.chair, x, 0.04, z, 0.46, 0.04, 0.08, rot)
  boxes.add(m.chair, x, 0.04, z, 0.08, 0.04, 0.46, rot)
}

function table(boxes, m, f, top = m.deskTop, h = TABLE_H) {
  const { x, z, w, d } = f
  boxes.add(top, x + w / 2, h - 0.025, z + d / 2, w, 0.05, d)
  for (const [lx, lz] of [[0.08, 0.08], [w - 0.08, 0.08], [0.08, d - 0.08], [w - 0.08, d - 0.08]]) boxes.add(m.deskLeg, x + lx, (h - 0.05) / 2, z + lz, 0.05, h - 0.05, 0.05)
}

function furnish(group, boxes, m, f, handles) {
  switch (f.kind) {
    case 'table':
      table(boxes, m, f)
      if (f.room) handles.pickables.push({ kind: 'table', ...f })
      break
    case 'chair':
      chair(boxes, m, f.x, f.z, f.rot)
      break
    case 'bossDesk':
      table(boxes, m, f, colored('#6b4a33', { roughness: 0.5 }), 0.74)
      boxes.add(colored('#5a3c28'), f.x + f.w / 2, 0.37, f.z + f.d - 0.05, f.w - 0.1, 0.7, 0.06)
      for (const dx of [-0.45, 0.45]) {
        boxes.add(m.dark, f.x + f.w / 2 + dx, 0.74 + 0.22, f.z + 0.35, 0.62, 0.38, 0.03)
        boxes.add(m.metal, f.x + f.w / 2 + dx, 0.74 + 0.05, f.z + 0.38, 0.05, 0.1, 0.05)
      }
      boxes.add(colored('#c8971f', { roughness: 0.4, metalness: 0.4 }), f.x + f.w / 2, 0.74 + 0.03, f.z + f.d - 0.18, 0.5, 0.05, 0.1)
      chair(boxes, m, f.x + f.w / 2, f.z - 0.5, 0)
      break
    case 'meetingTable':
      table(boxes, m, f, colored('#f4f2ee', { roughness: 0.4 }), 0.66)
      break
    case 'readingTable':
      table(boxes, m, f, colored('#c9a27a'), 0.62)
      {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), m.metal)
        lamp.position.set(f.x + f.w - 0.15, 0.62 + 0.16, f.z + 0.15)
        const shade = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.12, 16, 1, true), colored('#f2c037', { emissive: '#f2c037', emissiveIntensity: 0.4, side: THREE.DoubleSide }))
        shade.position.set(f.x + f.w - 0.15, 0.62 + 0.36, f.z + 0.15)
        group.add(lamp, shade)
      }
      break
    case 'lowTable':
      table(boxes, m, f, colored('#8a6a4a'), 0.36)
      break
    case 'shelf': {
      const H = 2.0
      const alongX = f.w >= f.d
      const len = alongX ? f.w : f.d
      const cx = f.x + f.w / 2
      const cz = f.z + f.d / 2
      boxes.add(m.shelf, cx, H / 2, cz, f.w, H, f.d)
      for (let level = 0; level < 4; level++) {
        const y = 0.28 + level * 0.46
        let t = 0.08
        let k = level * 3
        while (t < len - 0.12) {
          const bw = 0.07 + ((k * 13) % 5) * 0.015
          const bh = 0.28 + ((k * 7) % 4) * 0.03
          const book = m.books[k % m.books.length]
          const bx = alongX ? f.x + t + bw / 2 : f.x + f.w + 0.001
          const bz = alongX ? f.z + f.d + 0.001 : f.z + t + bw / 2
          boxes.add(book, alongX ? bx : f.x + f.w - 0.12, y + bh / 2, alongX ? f.z + f.d - 0.12 : bz, alongX ? bw : 0.22, bh, alongX ? 0.22 : bw)
          t += bw + 0.012
          k++
        }
      }
      break
    }
    case 'rug': {
      const rug = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r, 0.012, 48), colored(f.color, { roughness: 1 }))
      rug.position.set(f.x, 0.006, f.z)
      rug.receiveShadow = true
      group.add(rug)
      break
    }
    case 'splat': {
      const s = new THREE.Mesh(new THREE.CircleGeometry(f.r, 18), colored(f.color, { roughness: 0.4 }))
      s.rotation.x = -Math.PI / 2
      s.position.set(f.x, 0.004, f.z)
      group.add(s)
      break
    }
    case 'plant':
      plant(group, f.x, f.z, f.s, m)
      break
    case 'easel': {
      const g = new THREE.Group()
      g.position.set(f.x, 0, f.z)
      for (const dx of [-0.25, 0.25]) {
        const leg = new THREE.Mesh(unitBox, m.easelWood)
        leg.scale.set(0.04, 1.5, 0.04)
        leg.position.set(dx, 0.75, 0.05)
        leg.rotation.z = dx > 0 ? -0.12 : 0.12
        leg.castShadow = true
        g.add(leg)
      }
      const canvas = new THREE.Mesh(unitBox, m.canvas)
      canvas.scale.set(0.7, 0.55, 0.03)
      canvas.position.set(0, 1.1, 0.12)
      canvas.rotation.x = -0.12
      canvas.castShadow = true
      const paint = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), colored(['#e5534b', '#3d6fd6', '#f2c037'][Math.round(f.x * 7) % 3]))
      paint.position.set(0.05, 1.12, 0.14)
      paint.rotation.x = -0.12
      g.add(canvas, paint)
      g.rotation.y = Math.PI
      group.add(g)
      break
    }
    case 'sofa': {
      const color = colored(f.color, { roughness: 0.9 })
      const s = Math.sin(f.rot)
      const c = Math.cos(f.rot)
      const at = (lx, lz) => [f.x + lx * c + lz * s, f.z - lx * s + lz * c]
      boxes.add(color, f.x, 0.22, f.z, f.w, 0.32, 0.86, f.rot)
      const [bx, bz] = at(0, -0.34)
      boxes.add(color, bx, 0.5, bz, f.w, 0.5, 0.2, f.rot)
      for (const side of [-1, 1]) {
        const [ax, az] = at(side * (f.w / 2 - 0.08), 0)
        boxes.add(color, ax, 0.36, az, 0.16, 0.36, 0.86, f.rot)
      }
      break
    }
    case 'armchair': {
      const color = colored(f.color, { roughness: 0.9 })
      const rot = f.rot ?? 0
      const s = Math.sin(rot)
      const c = Math.cos(rot)
      boxes.add(color, f.x, 0.22, f.z, 0.72, 0.32, 0.7, rot)
      boxes.add(color, f.x - 0.3 * s, 0.5, f.z - 0.3 * c, 0.72, 0.5, 0.16, rot)
      break
    }
    case 'counter':
      boxes.add(m.counter, f.x + f.w / 2, 0.5, f.z + f.d / 2, f.w, 1.0, f.d)
      boxes.add(m.counterTop, f.x + f.w / 2, 1.02, f.z + f.d / 2, f.w + 0.06, 0.05, f.d + 0.06)
      break
    case 'espresso': {
      boxes.add(m.metal, f.x, 1.2, f.z, 0.42, 0.36, 0.34)
      boxes.add(m.dark, f.x, 1.27, f.z + 0.18, 0.3, 0.12, 0.02)
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 10), m.white)
      cup.position.set(f.x, 1.075, f.z + 0.14)
      group.add(cup)
      handles.espresso = { x: f.x, y: 1.4, z: f.z + 0.1 }
      break
    }
    case 'wcFloor': {
      const tiles = tileTexture()
      tiles.repeat.set(f.w / 0.6, f.d / 0.6)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.d), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.3 }))
      floor.rotation.x = -Math.PI / 2
      floor.position.set(f.x + f.w / 2, 0.004, f.z + f.d / 2)
      floor.receiveShadow = true
      group.add(floor)
      break
    }
    case 'stall':
      handles.stalls[f.i] = stall(group, boxes, m, f)
      break
    case 'wcCounter': {
      boxes.add(m.cabinet, f.x + f.w / 2, 0.42, f.z + f.d / 2, f.w - 0.06, 0.78, f.d - 0.08)
      boxes.add(m.quartz, f.x + f.w / 2, 0.84, f.z + f.d / 2, f.w, 0.06, f.d)
      for (const dz of [0.45, 1.3]) {
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.08, 24), m.porcelain)
        basin.position.set(f.x + f.w / 2 + 0.03, 0.89, f.z + dz)
        basin.castShadow = true
        const water = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), colored('#bfe3ea', { roughness: 0.05, metalness: 0.3 }))
        water.rotation.x = -Math.PI / 2
        water.position.set(f.x + f.w / 2 + 0.03, 0.932, f.z + dz)
        group.add(basin, water)
        boxes.add(m.chrome, f.x + 0.09, 0.97, f.z + dz, 0.04, 0.18, 0.04)
        boxes.add(m.chrome, f.x + 0.15, 1.05, f.z + dz, 0.14, 0.03, 0.03)
        boxes.add(colored('#7cc7b8', { roughness: 0.4 }), f.x + 0.08, 0.93, f.z + dz + 0.25, 0.07, 0.12, 0.07)
      }
      boxes.add(m.dark, f.x + 0.005, 1.48, f.z + f.d / 2, 0.02, 0.84, f.d - 0.1)
      const mirror = canvasPanel(f.d - 0.18, 0.76, (g, w, h) => {
        const sky = g.createLinearGradient(0, 0, w, h)
        sky.addColorStop(0, '#f4fafc')
        sky.addColorStop(0.55, '#cfe2ea')
        sky.addColorStop(1, '#e8f2f6')
        g.fillStyle = sky
        g.fillRect(0, 0, w, h)
        g.fillStyle = 'rgba(255,255,255,0.65)'
        for (const [x, width] of [[0.18, 0.05], [0.27, 0.02], [0.66, 0.04]]) {
          g.beginPath()
          g.moveTo(w * x, h)
          g.lineTo(w * (x + width), h)
          g.lineTo(w * (x + width + 0.22), 0)
          g.lineTo(w * (x + 0.22), 0)
          g.closePath()
          g.fill()
        }
      })
      mirror.mesh.material.emissiveIntensity = 0.35
      mirror.mesh.rotation.y = Math.PI / 2
      mirror.mesh.position.set(f.x + 0.018, 1.48, f.z + f.d / 2)
      group.add(mirror.mesh)
      break
    }
    case 'dryer':
      boxes.add(m.white, f.x + 0.09, 1.2, f.z, 0.16, 0.3, 0.3)
      boxes.add(m.dark, f.x + 0.175, 1.08, f.z, 0.02, 0.04, 0.2)
      boxes.add(m.chrome, f.x + 0.12, 1.33, f.z, 0.1, 0.02, 0.24)
      break
    case 'wcSign': {
      const sign = canvasPanel(0.62, 0.42, (g, w, h) => {
        g.fillStyle = '#1f2128'
        roundRect(g, 0, 0, w, h, h * 0.16)
        g.fill()
        const person = (cx, isDress) => {
          g.fillStyle = '#ffffff'
          g.beginPath()
          g.arc(cx, h * 0.27, h * 0.075, 0, Math.PI * 2)
          g.fill()
          if (isDress) {
            g.beginPath()
            g.moveTo(cx, h * 0.38)
            g.lineTo(cx - h * 0.13, h * 0.7)
            g.lineTo(cx + h * 0.13, h * 0.7)
            g.closePath()
            g.fill()
          } else g.fillRect(cx - h * 0.075, h * 0.38, h * 0.15, h * 0.32)
          g.fillRect(cx - h * 0.05, h * 0.68, h * 0.035, h * 0.16)
          g.fillRect(cx + h * 0.015, h * 0.68, h * 0.035, h * 0.16)
        }
        person(w * 0.2, false)
        person(w * 0.4, true)
        g.fillStyle = '#7cc7b8'
        g.fillRect(w * 0.53, h * 0.22, 3, h * 0.56)
        g.fillStyle = '#ffffff'
        g.font = `800 ${Math.round(h * 0.4)}px Inter, -apple-system, "Segoe UI", sans-serif`
        g.textBaseline = 'middle'
        g.fillText('WC', w * 0.6, h * 0.53)
      })
      sign.mesh.rotation.y = Math.PI / 2
      sign.mesh.position.set(f.x, 1.5, f.z)
      group.add(sign.mesh)
      break
    }
    case 'stool': {
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 18), m.chairSeat)
      seat.position.set(f.x, 0.66, f.z)
      seat.castShadow = true
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.64, 8), m.metal)
      post.position.set(f.x, 0.32, f.z)
      group.add(seat, post)
      break
    }
    default:
      break
  }
}

/** Windows along a wall of `length`, in the gaps between what hangs on it: full ones spaced evenly, a narrower one where only that fits. */
function windowSpots(length, blocked, width = 1.86, between = 1.2, margin = 0.25) {
  const spans = blocked.map(([a, b]) => [a - margin, b + margin]).sort((p, q) => p[0] - q[0])
  const free = []
  let start = 0.5
  for (const [a, b] of spans) {
    if (a > start) free.push([start, a])
    start = Math.max(start, b)
  }
  if (length - 0.5 > start) free.push([start, length - 0.5])
  const spots = []
  for (const [a, b] of free) {
    const n = Math.floor((b - a + between) / (width + between))
    if (n <= 0) {
      if (b - a >= 1.25) spots.push({ at: (a + b) / 2, width: Math.min(1.5, b - a - 0.1) })
      continue
    }
    let x = a + (b - a - (n * width + (n - 1) * between)) / 2 + width / 2
    for (let i = 0; i < n; i++) {
      spots.push({ at: x, width })
      x += width + between
    }
  }
  return spots
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Small square tiles with grout, for the WC floor. */
function tileTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const g = canvas.getContext('2d')
  g.fillStyle = '#c9d3d8'
  g.fillRect(0, 0, 256, 256)
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const shade = (r + c) % 2 === 0 ? '#eef2f4' : '#e2e9ec'
      g.fillStyle = shade
      g.fillRect(c * 64 + 2, r * 64 + 2, 60, 60)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A stall: two partitions, a front with a door that closes on whoever is in, a lamp that says so, a toilet. */
function stall(group, boxes, m, f) {
  const H = 1.55
  const y = 0.12 + H / 2
  boxes.add(m.partition, f.x + f.w / 2, y, f.z, f.w, H, 0.04)
  boxes.add(m.partition, f.x + f.w / 2, y, f.z + f.d, f.w, H, 0.04)
  boxes.add(m.partition, f.x, y, f.z + 0.175, 0.04, H, 0.35)
  boxes.add(m.partition, f.x, y, f.z + f.d - 0.175, 0.04, H, 0.35)
  for (const z of [f.z, f.z + f.d]) for (const x of [f.x, f.x + f.w - 0.05]) boxes.add(m.chrome, x, 0.06, z, 0.04, 0.12, 0.04)
  const hinge = new THREE.Group()
  hinge.position.set(f.x, 0, f.z + 0.35)
  const door = new THREE.Mesh(unitBox, m.stallDoor)
  door.scale.set(0.04, H, f.d - 0.7)
  door.position.set(0, y, (f.d - 0.7) / 2)
  door.castShadow = true
  const lampMat = new THREE.MeshStandardMaterial({ color: '#1f2128', emissive: '#34c759', emissiveIntensity: 1.4 })
  const lamp = new THREE.Mesh(unitBox, lampMat)
  lamp.scale.set(0.12, 0.05, 0.26)
  lamp.position.set(f.x, 0.12 + H + 0.03, f.z + f.d / 2)
  group.add(lamp)
  boxes.add(m.partition, f.x, 0.12 + H - 0.04, f.z + f.d / 2, 0.04, 0.08, f.d - 0.7)
  const handle = new THREE.Mesh(unitBox, m.chrome)
  handle.scale.set(0.03, 0.02, 0.12)
  handle.position.set(-0.035, 0.95, f.d - 0.7 - 0.12)
  hinge.add(door, handle)
  hinge.rotation.y = 1.15
  group.add(hinge)
  const tx = f.x + f.w - 0.36
  const tz = f.z + f.d / 2
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.38, 22), m.porcelain)
  bowl.position.set(tx - 0.05, 0.19, tz)
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 10, 24), m.porcelain)
  seat.rotation.x = Math.PI / 2
  seat.position.set(tx - 0.05, 0.4, tz)
  bowl.castShadow = true
  group.add(bowl, seat)
  boxes.add(m.porcelain, tx + 0.22, 0.58, tz, 0.18, 0.42, 0.44)
  boxes.add(m.chrome, tx + 0.22, 0.8, tz, 0.08, 0.02, 0.08)
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 14), m.white)
  roll.rotation.x = Math.PI / 2
  roll.position.set(tx, 0.7, f.z + 0.08)
  group.add(roll)
  return { hinge, lamp: lampMat }
}

/** The Boz Apps wall: B, a propeller for the O, Z APPS, on the brand's deep green; answers the propeller. */
function brandWall(group, boxes, m, b) {
  boxes.add(m.brandInk, 0.03, b.y, b.z, 0.05, b.h + 0.12, b.w + 0.12)
  boxes.add(m.brandTeal, 0.058, b.y - b.h / 2 - 0.035, b.z, 0.01, 0.025, b.w + 0.12)
  const PX = 220
  let layout = null
  const panel = canvasPanel(b.w, b.h, (g, w, h) => {
    g.fillStyle = '#0c2e29'
    g.fillRect(0, 0, w, h)
    const fontPx = Math.round(h * 0.46)
    g.font = `700 ${fontPx}px "Clash Display", "Avenir Next", Futura, "Segoe UI", sans-serif`
    g.letterSpacing = `${Math.round(fontPx * 0.14)}px`
    g.textBaseline = 'middle'
    g.fillStyle = '#f3f6f4'
    const wB = g.measureText('B').width
    const wRest = g.measureText('Z APPS').width
    const slot = fontPx * 1.22
    const start = (w - (wB + slot + wRest)) / 2
    g.fillText('B', start, h * 0.53)
    g.fillText('Z APPS', start + wB + slot, h * 0.53)
    layout = { center: (start + wB + slot / 2) / w, em: fontPx / PX }
  })
  panel.mesh.material.emissiveIntensity = 0.7
  panel.mesh.rotation.y = Math.PI / 2
  panel.mesh.position.set(0.057, b.y, b.z)
  group.add(panel.mesh)
  const radius = 0.53 * layout.em
  const unit = radius / 11.7
  const propeller = new THREE.Group()
  propeller.position.set(0.085, b.y + 0.01, b.z - (layout.center - 0.5) * b.w)
  const bladeGeo = new THREE.SphereGeometry(1, 24, 16)
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group()
    arm.rotation.x = (i * Math.PI * 2) / 3
    const blade = new THREE.Mesh(bladeGeo, m.brandTeal)
    blade.scale.set(0.014, 5.7 * unit, 2.9 * unit)
    blade.position.y = 6 * unit
    blade.castShadow = true
    arm.add(blade)
    propeller.add(arm)
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(3.1 * unit, 3.1 * unit, 0.04, 28), m.brandTeal)
  hub.rotation.z = Math.PI / 2
  propeller.add(hub)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.4 * unit, 16, 12), colored('#f3f6f4', { roughness: 0.3 }))
  cap.position.x = 0.025
  propeller.add(cap)
  group.add(propeller)
  return propeller
}

export { roundedBox, unitBox, colored, drawBoard }
