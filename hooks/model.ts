import type { DeskState, Helper, Limit, Live, Plan, Roster, RosterSession } from '../types'

/** A live entry older than this is a session nobody is in: its desk is empty. */
export const STALE_MS = 75_000
/** A finished turn stays shown as done this long, then the desk is idle. */
export const DONE_MS = 90_000
export const MAX_DESKS = 8
export const LOBBY_DESKS = 6

export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

export const norm = (id: string): string => id.replace(/^local_/, '')

/** The key a desk is found by: the app's own id for the session once known, else the engine's. */
export const keyOf = (live: Live): string => norm(live.ccdId || live.id)

export type Desk = {
  id: string
  ccdId: string
  title: string
  cwd: string
  isMe: boolean
  isPresent: boolean
  state: DeskState
  verb: string
  detail: string
  tool?: string
  helpers: Helper[]
  lastActivityAt: number
  link?: string
  seed: number
  pr?: { number: number; state: string }
}

export type Room = {
  id: string
  name: string
  kind: 'group' | 'pinned' | 'lobby'
  desks: Desk[]
  more: number
}

export function shownState(live: Live | undefined, now: number): DeskState {
  if (!live || now - live.at > STALE_MS) return 'away'
  if (live.state === 'done' || live.state === 'failed') return now - live.since > DONE_MS ? 'idle' : live.state
  return live.state
}

function deskOf(session: RosterSession, live: Live | undefined, meId: string, now: number): Desk {
  const state = shownState(live, now)
  const isPresent = state !== 'away'
  return {
    id: session.id,
    ccdId: session.ccdId,
    title: session.title,
    cwd: session.cwd,
    isMe: session.id === meId,
    isPresent,
    state,
    verb: isPresent && live ? live.verb : '',
    detail: isPresent && live ? live.detail : '',
    tool: isPresent ? live?.tool : undefined,
    helpers: isPresent && live ? live.helpers : [],
    lastActivityAt: Math.max(session.lastActivityAt, live?.at ?? 0),
    link: session.link ?? live?.link,
    seed: hash(session.id),
    pr: session.pr,
  }
}

function sessionOfLive(live: Live): RosterSession {
  return {
    id: keyOf(live),
    ccdId: live.ccdId || live.id,
    title: live.title,
    cwd: live.cwd,
    groupId: live.groupId,
    isPinned: live.isPinned,
    isRunning: live.state === 'working',
    lastActivityAt: live.at,
    link: live.link,
  }
}

/** The rooms of the office: one per sidebar group, then the pinned, then the lobby. */
export function buildRooms(roster: Roster | undefined, lives: Record<string, Live>, me: Live, now: number): Room[] {
  // The app's own spare sessions (titled `spare-…`) are not the person's chats.
  const isSpare = (title: string): boolean => /^spare-/.test(title)
  const byId = new Map<string, RosterSession>()
  for (const s of roster?.sessions ?? []) if (!isSpare(s.title)) byId.set(s.id, s)
  const liveByKey = new Map<string, Live>()
  for (const live of Object.values(lives)) liveByKey.set(keyOf(live), live)
  const meKey = keyOf(me)
  // A session the roster does not list yet (this one, or one just started) is known by its live entry.
  for (const live of [me, ...Object.values(lives)]) {
    const key = keyOf(live)
    if (key !== '' && !byId.has(key) && !isSpare(live.title)) byId.set(key, sessionOfLive(live))
  }
  // This session is always in: its own entry is as fresh as this draw.
  const liveOf = (id: string): Live | undefined => (id === meKey ? { ...me, at: now } : liveByKey.get(id))
  const all = [...byId.values()]
    .map(s => ({ session: s, desk: deskOf(s, liveOf(s.id), meKey, now) }))
    .sort((a, b) => b.desk.lastActivityAt - a.desk.lastActivityAt)

  const room = (id: string, name: string, kind: Room['kind'], cap: number, pick: (s: RosterSession) => boolean): Room => {
    const members = all.filter(one => pick(one.session)).map(one => one.desk)
    const kept = members.slice(0, cap)
    const mine = members.find(d => d.isMe)
    if (mine && !kept.includes(mine)) kept[kept.length - 1] = mine
    return { id, name, kind, desks: kept, more: members.length - kept.length }
  }

  const groups = [...(roster?.groups ?? [])].sort((a, b) => a.order - b.order)
  // A group with no session in it (the sidebar hides those too) gets no room.
  const rooms = groups
    .map(g => room(g.id, g.name, 'group', MAX_DESKS, s => s.groupId === g.id && !s.isPinned))
    .filter(one => one.desks.length > 0)
  const pinned = room('pinned', 'PINNED', 'pinned', MAX_DESKS, s => s.isPinned)
  if (pinned.desks.length > 0) rooms.push(pinned)
  const known = new Set(groups.map(g => g.id))
  rooms.push(
    room('lobby', 'LOBBY', 'lobby', LOBBY_DESKS, s => !s.isPinned && (s.groupId === null || !known.has(s.groupId))),
  )
  return rooms
}

export function verbFor(tool: string): string {
  if (/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(tool)) return 'editing'
  if (tool === 'Read') return 'reading'
  if (/^(Grep|Glob|ToolSearch|LSP)$/.test(tool)) return 'searching'
  if (tool === 'Bash' || tool === 'Monitor') return 'running'
  if (/^Web/.test(tool)) return 'browsing'
  if (/artifact|visualize|show_widget|image|video|design|canvas|sketch|3d/i.test(tool)) return 'designing'
  if (/^(Agent|Workflow)$/.test(tool)) return 'delegating'
  if (tool === 'SendMessage') return 'messaging'
  if (/^(TodoWrite|Task)/.test(tool)) return 'planning'
  if (tool === 'AskUserQuestion') return 'asking'
  if (tool === 'Skill') return 'skilling'
  if (tool.startsWith('mcp__')) return 'using'
  return 'working'
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
const baseName = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

/** A few words on what a tool works on, from its arguments; never a secret-shaped value. */
export function detailFor(tool: string, input: Record<string, unknown>): string {
  const arg = (key: string): string => {
    const value = input[key]
    return typeof value === 'string' ? oneLine(value) : ''
  }
  switch (tool) {
    case 'Read':
      return baseName(arg('file_path'))
    case 'Edit':
    case 'Write':
    case 'MultiEdit':
      return baseName(arg('file_path'))
    case 'NotebookEdit':
      return baseName(arg('notebook_path'))
    case 'Bash': {
      const command = arg('command')
      const word = command.split(/\s+/)[0] ?? ''
      return (/^(sudo|npx|bunx|pnpm|npm|yarn|git|docker|make)$/.test(word) ? command.split(/\s+/).slice(0, 2).join(' ') : word).slice(0, 24)
    }
    case 'Grep':
      return arg('pattern').slice(0, 24)
    case 'Glob':
      return arg('pattern').slice(0, 24)
    case 'WebSearch':
      return arg('query').slice(0, 24)
    case 'WebFetch': {
      const host = /^https?:\/\/([^/]+)/.exec(arg('url'))?.[1]
      return host ?? 'the web'
    }
    case 'Agent':
      return arg('description').slice(0, 24)
    case 'Skill':
      return arg('skill')
    case 'AskUserQuestion':
      return 'has a question for you'
    default: {
      const mcp = /^mcp__(.+?)__(.+)$/.exec(tool)
      return mcp ? mcp[2]!.replace(/_/g, ' ').slice(0, 24) : ''
    }
  }
}

/** The first sentence of a text, cleaned of markdown and cut short. */
export function gist(text: string, max = 60): string {
  const plain = oneLine(text.replace(/```[\s\S]*?```/g, ' ').replace(/[#*_`>|[\]]/g, ''))
  if (plain === '') return ''
  const sentence = /^(.{8,}?[.!?:])(\s|$)/.exec(plain)?.[1] ?? plain
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence
}

export const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export const LIMIT_NAMES: Record<string, string> = { five_hour: 'Session', seven_day: 'Weekly', spend_limit: 'Spend' }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** When a window resets: "4h 50m" within a day, else "Wed 07:00". */
export function resets(at: string | undefined, now: number): string {
  const when = at === undefined ? NaN : Date.parse(at)
  if (Number.isNaN(when)) return ''
  const minutes = Math.max(0, Math.round((when - now) / 60000))
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  const date = new Date(Math.round(when / 60000) * 60000)
  return `${DAYS[date.getDay()]} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const PLAN_STALE_MS = 30 * 60_000

export type UsageRow = { name: string; percentUsed: number; resetsAt?: string }

/** A window's name on the board: "Weekly · all models" is Weekly, "Weekly · Fable" is Fable. */
export function windowName(label: string): string {
  const [head = '', tail] = label.split('·').map(part => part.trim())
  return clip(tail === undefined || /^all\b/i.test(tail) ? head || label : tail, 10)
}

/** The USAGE board's rows: the plan's limits, per model too, while fresh; else the session's own windows. */
export function usageRows(plan: Plan | undefined, limits: Limit[] | undefined, now: number): UsageRow[] {
  if (plan !== undefined && plan.windows.length > 0 && now - plan.at < PLAN_STALE_MS) {
    const rows: UsageRow[] = plan.windows.map(w => ({ name: windowName(w.label), percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    return plan.extra ? [...rows, { name: 'Extra', percentUsed: plan.extra.percentUsed }] : rows
  }
  return (limits ?? []).map(l => ({ name: LIMIT_NAMES[l.kind] ?? l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
