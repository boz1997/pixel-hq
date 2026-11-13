/** Small helpers the 3D office shares. */

export const STALE_MS = 75_000
export const DONE_MS = 90_000

export const norm = id => String(id ?? '').replace(/^local_/, '')
export const keyOf = live => norm(live.ccdId || live.id)
export const clip = (text, max) => {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
export const rnd = (a, b) => a + Math.random() * (b - a)
export const pick = list => list[Math.floor(Math.random() * list.length)]
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** What a desk shows: a live entry gone quiet is away; a finished turn shows as done for a while, then idle. */
export function shownState(live, now) {
  if (!live || now - live.at > STALE_MS) return 'away'
  if (live.state === 'done' || live.state === 'failed') return now - live.since > DONE_MS ? 'idle' : live.state
  return live.state
}

export const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const ago = ms => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`
}
