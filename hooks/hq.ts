import type { EngineInterface } from 'claude-code'

import type { Live, Roster, RosterGroup, RosterSession } from '../types'
import { norm } from './model'

export const SESSIONS = 'ccd_session_mgmt'
export const SIDEBAR = 'ccd_sidebar'

const LIVE = 'live:'
const DAY_MS = 24 * 60 * 60_000

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

/** Calls a tool on one of the desktop app's servers and reads its JSON answer. */
export async function mcpJson(
  $: EngineInterface,
  server: string,
  tool: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const out = await $.mcp.call(server, tool, args)
  const text = out.content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text as string)
    .join('\n')
  if (out.isError) throw new Error((text || `${server}.${tool} failed`).slice(0, 200))
  if (out.structuredContent !== undefined) return out.structuredContent
  const start = text.search(/[[{]/)
  if (start < 0) throw new Error(`${server}.${tool}: ${text.slice(0, 80) || 'empty answer'}`)
  return JSON.parse(text.slice(start))
}

function sessionFrom(raw: unknown): RosterSession | undefined {
  const r = asRecord(raw)
  const ccdId = typeof r.sessionId === 'string' ? r.sessionId : undefined
  if (ccdId === undefined) return undefined
  const group = asRecord(r.group)
  const pr = typeof r.prNumber === 'number' ? { number: r.prNumber, state: String(r.prState ?? '') } : undefined
  return {
    id: norm(ccdId),
    ccdId,
    title: typeof r.title === 'string' && r.title.trim() !== '' ? r.title.trim() : 'untitled',
    cwd: typeof r.cwd === 'string' ? r.cwd : '',
    groupId: typeof group.id === 'string' ? group.id : null,
    isPinned: r.pinned === true,
    isRunning: r.isRunning === true,
    lastActivityAt: typeof r.lastActivityAt === 'string' ? Date.parse(r.lastActivityAt) || 0 : 0,
    link: typeof r.link === 'string' ? r.link : undefined,
    pr,
  }
}

function groupFrom(raw: unknown): RosterGroup | undefined {
  const r = asRecord(raw)
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return undefined
  return { id: r.id, name: r.name, order: typeof r.order === 'number' ? r.order : 0 }
}

/** This session as the app's sidebar knows it: its title, group and pin. */
export async function fetchSelf($: EngineInterface): Promise<RosterSession | undefined> {
  return sessionFrom(await mcpJson($, SESSIONS, 'get_session', { session_id: 'self' }))
}

/** The sidebar's groups and every other open session. Either half may be missing. */
export async function fetchRoster($: EngineInterface, now: number): Promise<Roster> {
  const [groupsRaw, sessionsRaw] = await Promise.all([
    mcpJson($, SIDEBAR, 'list_groups').catch(() => []),
    mcpJson($, SESSIONS, 'list_sessions', { limit: 80 }),
  ])
  const groups = (Array.isArray(groupsRaw) ? groupsRaw : []).flatMap(raw => {
    const group = groupFrom(raw)
    return group ? [group] : []
  })
  const sessions = (Array.isArray(sessionsRaw) ? sessionsRaw : []).flatMap(raw => {
    const session = sessionFrom(raw)
    return session && asRecord(raw).isArchived !== true ? [session] : []
  })
  return { at: now, groups, sessions }
}

const isLive = (value: unknown): value is Live => {
  const r = asRecord(value)
  return typeof r.id === 'string' && typeof r.at === 'number' && typeof r.state === 'string' && Array.isArray(r.helpers)
}

/** Publishes this session's desk to the store every session's office reads. */
export async function publish($: EngineInterface, live: Live): Promise<void> {
  if (live.id === '') return
  await $.store.set(LIVE + live.id, live)
}

export async function forget($: EngineInterface, id: string): Promise<void> {
  if (id !== '') await $.store.delete(LIVE + id)
}

/** The other sessions' desks, as they last published them; a day-old entry is dropped. */
export async function readLives($: EngineInterface, now: number, meId: string): Promise<Record<string, Live>> {
  const lives: Record<string, Live> = {}
  const keys = (await $.store.keys()).filter(key => key.startsWith(LIVE))
  for (const key of keys) {
    const value = await $.store.get(key)
    if (!isLive(value)) continue
    if (value.id === meId) continue
    if (now - value.at > DAY_MS) {
      await $.store.delete(key)
      continue
    }
    lives[value.id] = value
  }
  return lives
}
