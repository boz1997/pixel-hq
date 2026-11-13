import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js'

import { SEAT_H } from './world.js'

const SKINS = ['#f2d1b3', '#e8b98f', '#d39a6a', '#a8714a', '#7a4f33', '#f6dcc4']
const HAIRS = ['#2b2120', '#4a3226', '#7a4b2a', '#c99a5b', '#1d1d22', '#8c3b2b', '#d9c7a0', '#5b5f66']
const PANTS = ['#2d3240', '#3b4252', '#26303d', '#4a4f5c', '#30353f']
const STYLES = ['short', 'bun', 'long', 'bob', 'spiky', 'pony', 'cap', 'short']

const mats = new Map()
const mat = (color, extra = {}) => {
  const key = `${color}|${JSON.stringify(extra)}`
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }))
  return mats.get(key)
}

const GEO = {
  leg: new THREE.CapsuleGeometry(0.068, 0.2, 4, 10),
  arm: new THREE.CapsuleGeometry(0.052, 0.17, 4, 10),
  hand: new THREE.SphereGeometry(0.052, 12, 10),
  shoe: new THREE.BoxGeometry(0.12, 0.06, 0.17),
  torso: new RoundedBoxGeometry(0.36, 0.4, 0.26, 3, 0.1),
  head: new THREE.SphereGeometry(0.21, 24, 18),
  eye: new THREE.SphereGeometry(0.022, 8, 6),
  cap: new THREE.SphereGeometry(0.222, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
  bun: new THREE.SphereGeometry(0.09, 14, 10),
  back: new RoundedBoxGeometry(0.36, 0.34, 0.12, 2, 0.05),
  spike: new THREE.ConeGeometry(0.05, 0.12, 6),
  visor: new THREE.BoxGeometry(0.26, 0.025, 0.14),
  mug: new THREE.CylinderGeometry(0.04, 0.035, 0.09, 10),
  phone: new THREE.BoxGeometry(0.06, 0.11, 0.012),
  paper: new THREE.BoxGeometry(0.2, 0.01, 0.26),
  glasses: new THREE.TorusGeometry(0.04, 0.008, 6, 14),
}

/** A face and clothes picked by the session's seed; the shirt is the department's color. */
export function lookOf(seed, shirt) {
  const at = n => (seed >>> n) & 0xff
  return {
    skin: SKINS[at(0) % SKINS.length],
    hair: HAIRS[at(5) % HAIRS.length],
    style: STYLES[at(10) % STYLES.length],
    pants: PANTS[at(15) % PANTS.length],
    shirt,
    hasGlasses: at(20) % 5 === 0,
  }
}

function hairOf(look, head) {
  const hair = mat(look.hair, { roughness: 0.9 })
  const cap = new THREE.Mesh(GEO.cap, hair)
  cap.rotation.x = -0.35
  cap.position.set(0, 0.012, -0.012)
  head.add(cap)
  if (look.style === 'bun') {
    const bun = new THREE.Mesh(GEO.bun, hair)
    bun.position.set(0, 0.2, -0.08)
    head.add(bun)
  }
  if (look.style === 'long' || look.style === 'bob') {
    const back = new THREE.Mesh(GEO.back, hair)
    back.position.set(0, look.style === 'long' ? -0.12 : -0.04, -0.12)
    back.scale.y = look.style === 'long' ? 1 : 0.6
    head.add(back)
  }
  if (look.style === 'pony') {
    const tail = new THREE.Mesh(GEO.arm, hair)
    tail.position.set(0, -0.05, -0.23)
    tail.rotation.x = 0.4
    head.add(tail)
  }
  if (look.style === 'spiky') {
    for (const [x, z] of [[-0.08, 0.02], [0, 0.04], [0.08, 0.02], [0, -0.08]]) {
      const spike = new THREE.Mesh(GEO.spike, hair)
      spike.position.set(x, 0.22, z)
      head.add(spike)
    }
  }
  if (look.style === 'cap') {
    cap.material = mat(look.shirt, { roughness: 0.6 })
    const visor = new THREE.Mesh(GEO.visor, cap.material)
    visor.position.set(0, 0.09, 0.2)
    head.add(visor)
  }
}

/** A person, standing at the origin and facing +z; `scale` makes a subagent. */
export function makePerson(look, scale = 1) {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const hip = 0.36
  const shirt = mat(look.shirt, { roughness: 0.7 })
  const skin = mat(look.skin, { roughness: 0.6 })
  const pants = mat(look.pants, { roughness: 0.8 })
  const shoe = mat('#22252b', { roughness: 0.6 })
  const parts = { body }
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.085, hip, 0)
    const leg = new THREE.Mesh(GEO.leg, pants)
    leg.position.y = -0.17
    const foot = new THREE.Mesh(GEO.shoe, shoe)
    foot.position.set(0, -0.33, 0.03)
    pivot.add(leg, foot)
    body.add(pivot)
    parts[side < 0 ? 'legL' : 'legR'] = pivot
  }
  const torso = new THREE.Mesh(GEO.torso, shirt)
  torso.position.y = hip + 0.18
  body.add(torso)
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.215, hip + 0.33, 0)
    const arm = new THREE.Mesh(GEO.arm, shirt)
    arm.position.y = -0.12
    const hand = new THREE.Mesh(GEO.hand, skin)
    hand.position.y = -0.24
    pivot.add(arm, hand)
    body.add(pivot)
    parts[side < 0 ? 'armL' : 'armR'] = pivot
    parts[side < 0 ? 'handL' : 'handR'] = hand
  }
  const head = new THREE.Group()
  head.position.y = hip + 0.58
  const skull = new THREE.Mesh(GEO.head, skin)
  head.add(skull)
  const eye = mat('#1b1c20', { roughness: 0.3 })
  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(GEO.eye, eye)
    e.position.set(side * 0.075, 0.01, 0.196)
    head.add(e)
    if (look.hasGlasses) {
      const lens = new THREE.Mesh(GEO.glasses, mat('#1b1c20'))
      lens.position.set(side * 0.075, 0.01, 0.205)
      head.add(lens)
    }
  }
  hairOf(look, head)
  body.add(head)
  parts.head = head
  const mug = new THREE.Mesh(GEO.mug, mat('#ffffff'))
  mug.position.set(0, -0.3, 0.04)
  mug.visible = false
  parts.handR.add(mug)
  const phone = new THREE.Mesh(GEO.phone, mat('#1d1f24'))
  phone.position.set(0, -0.05, 0.05)
  phone.rotation.x = -0.6
  phone.visible = false
  parts.handR.add(phone)
  const paper = new THREE.Mesh(GEO.paper, mat('#fbfbf7'))
  paper.position.set(0, 0.02, 0.06)
  paper.visible = false
  parts.handL.add(paper)
  Object.assign(parts, { mug, phone, paper })
  root.scale.setScalar(scale)
  root.traverse(o => {
    if (o.isMesh) o.castShadow = true
  })
  return { root, parts, phase: Math.random() * 10, kind: 'person' }
}

/** Claude, the manager: an orange block on four legs, with a crown. */
export function makeMascot() {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const orange = mat('#d97757', { roughness: 0.55 })
  const dark = mat('#b65a3d', { roughness: 0.6 })
  const block = new THREE.Mesh(new RoundedBoxGeometry(0.64, 0.42, 0.44, 4, 0.09), orange)
  block.position.y = 0.42
  body.add(block)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.02), mat('#1b1c20'))
    eye.position.set(side * 0.13, 0.46, 0.225)
    body.add(eye)
    const claw = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.12, 0.16, 2, 0.04), orange)
    claw.position.set(side * 0.38, 0.4, 0.02)
    body.add(claw)
  }
  const legs = []
  for (const [x, z] of [[-0.21, 0.13], [0.21, 0.13], [-0.21, -0.13], [0.21, -0.13]]) {
    const pivot = new THREE.Group()
    pivot.position.set(x, 0.22, z)
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.09), dark)
    leg.position.y = -0.11
    pivot.add(leg)
    body.add(pivot)
    legs.push(pivot)
  }
  const gold = mat('#e6b422', { roughness: 0.3, metalness: 0.6 })
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.07, 18, 1, true), gold)
  ring.position.y = 0.68
  body.add(ring)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), gold)
    spike.position.set(Math.sin(a) * 0.15, 0.755, Math.cos(a) * 0.15)
    body.add(spike)
  }
  root.traverse(o => {
    if (o.isMesh) o.castShadow = true
  })
  return { root, parts: { body, legs }, phase: 0, kind: 'mascot' }
}

/** A black labrador; its collar red unless another color is given. */
export function makeDog(collarColor = '#e0484d') {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const fur = mat('#1d1d21', { roughness: 0.85 })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 6, 12), fur)
  torso.rotation.x = Math.PI / 2
  torso.position.set(0, 0.36, 0)
  body.add(torso)
  const head = new THREE.Group()
  head.position.set(0, 0.5, 0.32)
  const skull = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.22, 2, 0.06), fur)
  const snout = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.1, 0.14, 2, 0.03), fur)
  snout.position.set(0, -0.04, 0.14)
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mat('#0b0b0d'))
  nose.position.set(0, -0.01, 0.215)
  head.add(skull, snout, nose)
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.08), fur)
    ear.position.set(side * 0.11, -0.03, -0.02)
    ear.rotation.z = side * 0.25
    head.add(ear)
    const eye = new THREE.Mesh(GEO.eye, mat('#3a2a1a'))
    eye.position.set(side * 0.055, 0.04, 0.11)
    head.add(eye)
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.036, 8, 20), mat(collarColor, { roughness: 0.4 }))
  collar.position.set(0, 0.45, 0.23)
  collar.rotation.x = Math.PI / 2.4
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 14), mat('#e6b422', { roughness: 0.3, metalness: 0.7 }))
  tag.rotation.x = Math.PI / 2
  tag.position.set(0, 0.36, 0.335)
  body.add(head, collar, tag)
  const legs = []
  for (const [x, z] of [[-0.09, 0.2], [0.09, 0.2], [-0.09, -0.2], [0.09, -0.2]]) {
    const pivot = new THREE.Group()
    pivot.position.set(x, 0.3, z)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.3, 8), fur)
    leg.position.y = -0.15
    pivot.add(leg)
    body.add(pivot)
    legs.push(pivot)
  }
  const tail = new THREE.Group()
  tail.position.set(0, 0.42, -0.32)
  const tailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.018, 0.26, 6), fur)
  tailMesh.position.y = 0.12
  tail.add(tailMesh)
  tail.rotation.x = -0.7
  body.add(tail)
  root.traverse(o => {
    if (o.isMesh) o.castShadow = true
  })
  return { root, parts: { body, legs, tail, head }, phase: 0, kind: 'dog' }
}

const ease = (current, target, k) => current + (target - current) * k

/**
 * Moves the limbs for what the entity is doing: `a` holds walking, its pace, whether it sits, types, waits, panics,
 * or strikes a pose (`stretch`, `sip`, `phone`, `cheer`), and whether it carries a paper.
 */
export function animate(figure, a, dt, t) {
  const k = Math.min(1, dt * 12)
  if (figure.kind === 'mascot') {
    const { body, legs } = figure.parts
    if (a.walking) figure.phase += dt * 9 * (a.pace ?? 1)
    legs.forEach((leg, i) => {
      leg.rotation.x = a.walking ? Math.sin(figure.phase + (i % 2 ? Math.PI : 0)) * 0.6 : ease(leg.rotation.x, 0, k)
    })
    body.position.y = a.walking ? Math.abs(Math.sin(figure.phase)) * 0.04 : a.busy ? Math.abs(Math.sin(t * 6)) * 0.03 : ease(body.position.y, 0, k)
    body.rotation.z = a.panic ? Math.sin(t * 20) * 0.08 : ease(body.rotation.z, 0, k)
    return
  }
  if (figure.kind === 'dog') {
    const { body, legs, tail, head } = figure.parts
    if (a.walking) figure.phase += dt * 12 * (a.pace ?? 1)
    legs.forEach((leg, i) => {
      leg.rotation.x = a.walking ? Math.sin(figure.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.7 : ease(leg.rotation.x, 0, k)
    })
    tail.rotation.z = Math.sin(t * (a.walking ? 14 : 6)) * 0.5
    body.position.y = a.walking ? Math.abs(Math.sin(figure.phase)) * 0.03 : 0
    head.rotation.x = a.panic ? Math.sin(t * 10) * 0.15 : ease(head.rotation.x, 0, k)
    return
  }
  const p = figure.parts
  let legL = 0
  let legR = 0
  let armLx = 0
  let armRx = 0
  let armLz = 0.08
  let armRz = -0.08
  let y = 0
  if (a.walking) {
    figure.phase += dt * 8.5 * (a.pace ?? 1)
    const s = Math.sin(figure.phase)
    legL = s * 0.7
    legR = -s * 0.7
    armLx = -s * 0.6
    armRx = s * 0.6
    y = Math.abs(Math.cos(figure.phase)) * 0.035
  }
  if (a.sitting) {
    legL = -1.45
    legR = -1.45
    y = SEAT_H - 0.36 + 0.02
  }
  if (a.stool) {
    legL = -1.2
    legR = -1.2
    y = 0.66 - 0.36 + 0.02
  }
  if (a.typing) {
    armLx = -1.05 + Math.sin(t * 17) * 0.07
    armRx = -1.05 + Math.sin(t * 17 + 1.7) * 0.07
    armLz = 0.18
    armRz = -0.18
  }
  if (a.waiting) {
    y += Math.abs(Math.sin(t * 7)) * 0.07
    armRz = -2.6 + Math.sin(t * 10) * 0.25
    armRx = 0
  }
  if (a.panic) {
    armLz = 2.7 + Math.sin(t * 15) * 0.35
    armRz = -2.7 - Math.sin(t * 15 + 1) * 0.35
    armLx = 0
    armRx = 0
  }
  if (a.shake) p.body.position.x = Math.sin(t * 40) * 0.02
  else p.body.position.x = 0
  if (a.pose === 'stretch') {
    armLz = 2.85
    armRz = -2.85
    armLx = 0
    armRx = 0
  }
  if (a.pose === 'cheer') {
    armRz = -2.7
    armRx = 0
  }
  if (a.pose === 'sip') {
    armRx = -2.1
    armRz = -0.25
  }
  if (a.pose === 'phone') {
    armRx = -1.55
    armRz = -0.2
  }
  if (a.carrying) {
    armLx = -1.2
    armLz = 0.2
  }
  p.legL.rotation.x = ease(p.legL.rotation.x, legL, a.walking ? 1 : k)
  p.legR.rotation.x = ease(p.legR.rotation.x, legR, a.walking ? 1 : k)
  p.armL.rotation.x = ease(p.armL.rotation.x, armLx, a.walking ? 1 : k)
  p.armR.rotation.x = ease(p.armR.rotation.x, armRx, a.walking ? 1 : k)
  p.armL.rotation.z = ease(p.armL.rotation.z, armLz, k)
  p.armR.rotation.z = ease(p.armR.rotation.z, armRz, k)
  p.body.position.y = ease(p.body.position.y, y, a.walking ? 1 : k)
  p.head.rotation.y = a.typing ? Math.sin(t * 0.7 + figure.phase) * 0.15 : ease(p.head.rotation.y, 0, k)
  p.mug.visible = a.pose === 'sip'
  p.phone.visible = a.pose === 'phone'
  p.paper.visible = Boolean(a.carrying)
}
