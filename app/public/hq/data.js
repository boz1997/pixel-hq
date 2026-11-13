import { clip, hash, keyOf, norm, shownState } from './util.js'

/** What the server last said, and how this browser likes the office. */
export const store = { data: { at: 0, roster: null, lives: {} }, fetchedAt: 0, isLocked: false }

export const prefs = {
  mode: localStorage.getItem('pixel-hq-mode') === 'calm' ? 'calm' : 'lively',
  folded: new Set(JSON.parse(localStorage.getItem('pixel-hq-3d-folded') ?? '[]')),
  password: sessionStorage.getItem('pixel-hq-password') ?? '',
}

export function savePrefs() {
  localStorage.setItem('pixel-hq-mode', prefs.mode)
  localStorage.setItem('pixel-hq-3d-folded', JSON.stringify([...prefs.folded]))
}

/** Asks the server for the office; answers whether it got it, and why not. */
export async function poll() {
  try {
    const res = await fetch('/api/state', { headers: prefs.password ? { 'x-pixel-hq-password': prefs.password } : {}, cache: 'no-store' })
    if (res.status === 401) return 'locked'
    if (!res.ok) return `error ${res.status}`
    store.data = await res.json()
    store.fetchedAt = Date.now()
    return 'ok'
  } catch (error) {
    return `error ${error.message}`
  }
}

/** Every session in the office: the sidebar's roster, plus any live desk the roster has not caught up with. */
export function sessionsOf(now) {
  const { data } = store
  const byKey = new Map()
  const isSpare = s => /^spare-/.test(s.title ?? '')
  for (const s of data.roster?.sessions ?? []) if (!isSpare(s)) byKey.set(norm(s.id), { ...s, id: norm(s.id) })
  for (const live of Object.values(data.lives)) {
    const key = keyOf(live)
    if (isSpare(live) || byKey.has(key)) continue
    byKey.set(key, { id: key, ccdId: live.ccdId, title: live.title, cwd: live.cwd, groupId: live.groupId, isPinned: live.isPinned, lastActivityAt: live.at, link: live.link })
  }
  const liveByKey = new Map(Object.values(data.lives).map(live => [keyOf(live), live]))
  return [...byKey.values()].map(s => {
    const live = liveByKey.get(s.id)
    return { ...s, live, state: shownState(live, now), lastActivityAt: Math.max(s.lastActivityAt ?? 0, live?.at ?? 0) }
  })
}

export const DEPT_COLORS = ['#7c5cff', '#f0609e', '#f59e0b', '#22a55b', '#3b82f6', '#14b8a6', '#ef6c3a', '#a855f7']
const PINNED_COLOR = '#d4a017'
const LOBBY_COLOR = '#64748b'
export const MAX_MEMBERS = 12
const LOBBY_CAP = 8

const assign = new Map()

/** The departments: the sidebar's groups in its order, then the pinned sessions, then a lobby for the rest. */
export function departmentsOf(sessions) {
  const groups = [...(store.data.roster?.groups ?? [])].sort((a, b) => a.order - b.order)
  const known = new Set(groups.map(g => g.id))
  const byRecency = [...sessions].sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  const all = []
  groups.forEach((g, i) => {
    const members = byRecency.filter(s => s.groupId === g.id && !s.isPinned)
    if (members.length > 0) all.push({ id: g.id, name: g.name, color: DEPT_COLORS[i % DEPT_COLORS.length], members })
  })
  const pinned = byRecency.filter(s => s.isPinned)
  if (pinned.length > 0) all.push({ id: 'pinned', name: '★ Pinned', color: PINNED_COLOR, members: pinned })
  const lobby = byRecency.filter(s => !s.isPinned && (s.groupId == null || !known.has(s.groupId))).slice(0, LOBBY_CAP)
  if (lobby.length > 0 || all.length === 0) all.push({ id: 'lobby', name: 'Lobby', color: LOBBY_COLOR, members: lobby })
  for (const dept of all) {
    dept.more = Math.max(0, dept.members.length - MAX_MEMBERS)
    dept.members = dept.members.slice(0, MAX_MEMBERS)
    const taken = new Set()
    for (const s of dept.members) {
      const had = assign.get(s.id)
      if (had && had.deptId === dept.id && had.slot < MAX_MEMBERS) taken.add(had.slot)
    }
    for (const s of dept.members) {
      const had = assign.get(s.id)
      if (had && had.deptId === dept.id && had.slot < MAX_MEMBERS) continue
      let slot = 0
      while (taken.has(slot)) slot++
      taken.add(slot)
      assign.set(s.id, { deptId: dept.id, slot })
    }
    dept.slots = Math.max(...dept.members.map(s => assign.get(s.id).slot), 0) + 1
    for (const s of dept.members) s.slot = assign.get(s.id).slot
  }
  for (const key of [...assign.keys()]) if (!sessions.some(s => s.id === key)) assign.delete(key)
  return { shown: all.filter(d => !prefs.folded.has(d.id)), folded: all.filter(d => prefs.folded.has(d.id)) }
}

// ------------------------------------------------------------------ usage and limits

const LIMIT_NAMES = { five_hour: 'Session', seven_day: 'Weekly', spend_limit: 'Spend' }
const PLAN_STALE_MS = 30 * 60_000
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A window's name on the board: "Weekly · all models" is Weekly, "Weekly · Fable" is Fable. */
export function windowName(text) {
  const [head = '', tail] = String(text).split('·').map(part => part.trim())
  return clip(tail === undefined || /^all\b/i.test(tail) ? head || String(text) : tail, 12)
}

/** The plan's limits, per model too, while fresh; else the sessions' own windows. */
export function usageRows(now) {
  const { data } = store
  const plan = data.plan
  if (plan && Array.isArray(plan.windows) && plan.windows.length > 0 && now - plan.at < PLAN_STALE_MS) {
    const rows = plan.windows.map(w => ({ name: windowName(w.label), percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    return plan.extra ? [...rows, { name: 'Extra', percentUsed: plan.extra.percentUsed }] : rows
  }
  const withLimits = Object.values(data.lives).sort((a, b) => b.at - a.at).find(l => (l.limits ?? []).length > 0)
  return (withLimits?.limits ?? []).map(l => ({ name: LIMIT_NAMES[l.kind] ?? l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

export const usagePeak = now => Math.max(0, ...usageRows(now).map(row => row.percentUsed))

/** When a window resets: "in 4h 50m" within a day, else "Fri 14:00". */
export function resetsIn(at, now) {
  const when = Date.parse(at)
  if (Number.isNaN(when)) return ''
  const minutes = Math.max(0, Math.round((when - now) / 60000))
  if (minutes < 24 * 60) return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`
  const date = new Date(Math.round(when / 60000) * 60000)
  return `${DAYS[date.getDay()]} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// ------------------------------------------------------------------ outages

const OUTAGE_ERRORS = new Set(['overloaded', 'server_error'])
export const TROUBLE_MS = 10 * 60_000
const STATUS_STALE_MS = 10 * 60_000
const STATUS_PAGE = 'https://status.claude.com'
const IS_DRILL = new URLSearchParams(location.search).has('outage')

/**
 * Whether Claude is in trouble: `down` while the status page reports an outage or a major incident on Claude Code or
 * the API, or sessions keep dying on overloaded and server errors; `slow` for a lesser incident, or once Anthropic is
 * monitoring a fix and nothing else is open. `?outage` runs a drill.
 */
export function outageOf(now) {
  const { data } = store
  if (IS_DRILL) return { level: 'down', title: 'fire drill: this is what an outage looks like', link: null }
  const status = data.status && now - data.status.at < STATUS_STALE_MS ? data.status : null
  const active = (status?.incidents ?? []).filter(i => i.status !== 'monitoring')
  const watched = (status?.incidents ?? []).filter(i => i.status === 'monitoring')
  const incident = active.find(i => i.impact === 'major' || i.impact === 'critical')
  const isFixOut = active.length === 0 && watched.length > 0
  const broken = isFixOut ? undefined : status?.components?.find(c => c.status === 'major_outage' || c.status === 'partial_outage')
  const failing = Object.values(data.lives).filter(l => l.trouble && OUTAGE_ERRORS.has(l.trouble.error) && now - l.trouble.at < TROUBLE_MS)
  if (incident || broken || failing.length > 0) {
    const title = incident?.name ?? (broken ? `${broken.name}: ${broken.status.replace(/_/g, ' ')}` : `${failing.length} session${failing.length === 1 ? '' : 's'} hit ${failing[0].trouble.error.replace(/_/g, ' ')}`)
    return { level: 'down', title, link: incident || broken ? STATUS_PAGE : null }
  }
  if (isFixOut) return { level: 'slow', title: `monitoring a fix: ${watched[0].name}`, link: STATUS_PAGE }
  const minor = active[0]
  const degraded = status?.components?.find(c => c.status === 'degraded_performance')
  if (minor || degraded) return { level: 'slow', title: minor?.name ?? `${degraded.name}: degraded performance`, link: STATUS_PAGE }
  return null
}

// ------------------------------------------------------------------ names

/** "claude-opus-5-5" reads Claude Opus 5.5; an id it does not know stays as it is. */
export function modelName(id) {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(String(id ?? ''))
  if (!m) return id ? String(id) : ''
  const family = m[1][0].toUpperCase() + m[1].slice(1)
  return `Claude ${family} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ''}`
}

/** A look picked by the session, so a person keeps their face across reloads. */
export const seedOf = id => hash(String(id))
