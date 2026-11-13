import * as THREE from 'three'

const NAV_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'q', 'e', 'r', 'f', '+', '=', '-', '_'])
const isTyping = el => Boolean(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

/**
 * Moving about the office like a map: drag to move, right-drag or double-click-and-drag to turn and tilt, the wheel or
 * a pinch to zoom toward the pointer, two fingers on a trackpad to slide, and the arrow keys or WASD to walk, with Q E
 * to turn, R F to tilt and + − to zoom.
 */
export function createNav(world, { onMove, onDoubleClick, bounds }) {
  const { controls, camera } = world
  const stage = world.renderer.domElement.parentElement
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
  controls.zoomToCursor = true
  controls.minPolarAngle = 0.12
  controls.maxPolarAngle = 1.3
  const held = new Set()
  let last = { t: 0, x: 0, y: 0 }
  let press = null

  const axes = () => {
    const offset = camera.position.clone().sub(controls.target)
    const forward = new THREE.Vector3(-offset.x, 0, -offset.z)
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
    return { forward, right, dist: offset.length() }
  }
  const shift = v => {
    controls.target.add(v)
    camera.position.add(v)
  }

  // The second press of a double-click turns and tilts instead of moving, for as long as it is held.
  stage.addEventListener(
    'pointerdown',
    e => {
      const now = performance.now()
      const isSecond = e.button === 0 && now - last.t < 330 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 14
      last = { t: now, x: e.clientX, y: e.clientY }
      controls.mouseButtons.LEFT = isSecond ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN
      press = { x: e.clientX, y: e.clientY, isDragged: false }
    },
    { capture: true },
  )
  stage.addEventListener(
    'pointermove',
    e => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) press.isDragged = true
    },
    { capture: true },
  )
  stage.addEventListener('dblclick', e => {
    if (press?.isDragged) return
    onDoubleClick(e)
  })
  stage.addEventListener('contextmenu', e => e.preventDefault())

  // Two fingers on a trackpad slide the office; a pinch and a mouse wheel zoom, as the controls already do.
  stage.addEventListener(
    'wheel',
    e => {
      const isTrackpad = !e.ctrlKey && (e.wheelDeltaY ? e.wheelDeltaY === -3 * e.deltaY : e.deltaMode === 0 && (e.deltaX !== 0 || Math.abs(e.deltaY) < 40))
      if (!isTrackpad) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const { forward, right, dist } = axes()
      const k = dist * 0.0016
      shift(right.multiplyScalar(e.deltaX * k).add(forward.multiplyScalar(-e.deltaY * k)))
      onMove()
    },
    { capture: true, passive: false },
  )

  window.addEventListener('keydown', e => {
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key.toLowerCase()
    if (!NAV_KEYS.has(key)) return
    held.add(key)
    e.preventDefault()
    onMove()
  })
  window.addEventListener('keyup', e => held.delete(e.key.toLowerCase()))
  window.addEventListener('blur', () => held.clear())

  /** Every frame: the held keys walk, turn, tilt and zoom, and the view stays over the office. */
  function step(dt) {
    if (held.size > 0) {
      const { forward, right, dist } = axes()
      const move = new THREE.Vector3()
      if (held.has('arrowup') || held.has('w')) move.add(forward)
      if (held.has('arrowdown') || held.has('s')) move.sub(forward)
      if (held.has('arrowright') || held.has('d')) move.add(right)
      if (held.has('arrowleft') || held.has('a')) move.sub(right)
      if (move.lengthSq() > 0) shift(move.normalize().multiplyScalar(Math.max(2.5, dist * 0.38) * dt))
      const yaw = (held.has('q') ? 1 : 0) - (held.has('e') ? 1 : 0)
      const tilt = (held.has('r') ? 1 : 0) - (held.has('f') ? 1 : 0)
      const zoom = (held.has('+') || held.has('=') ? 1 : 0) - (held.has('-') || held.has('_') ? 1 : 0)
      if (yaw || tilt || zoom) {
        const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
        sph.theta += yaw * dt * 1.5
        sph.phi = Math.min(controls.maxPolarAngle, Math.max(controls.minPolarAngle, sph.phi - tilt * dt))
        sph.radius = Math.min(controls.maxDistance, Math.max(controls.minDistance, sph.radius * (1 - zoom * dt * 0.9)))
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph))
        camera.lookAt(controls.target)
      }
    }
    const b = bounds()
    if (!b) return
    const t = controls.target
    const x = Math.min(b.maxX, Math.max(b.minX, t.x))
    const z = Math.min(b.maxZ, Math.max(b.minZ, t.z))
    if (x !== t.x || z !== t.z) shift(new THREE.Vector3(x - t.x, 0, z - t.z))
  }

  return { step, held }
}
