import type { EngineInterface } from 'claude-code'

import type { Live, Roster } from '../types'
import { readTasks, readTaskStatus, SESSIONS, writeTaskStatus } from './hq'

const TASK_TTL_MS = 10 * 60_000
const FRESH_MS = 30_000

let home: string | undefined
const settledTasks = new Set<string>()

/** Asks a small model which session of the roster a task suits; answers it, or nothing. */
export async function routeTask($: EngineInterface, text: string, roster: Roster | undefined): Promise<{ ccdId: string; title: string } | undefined> {
  const sessions = (roster?.sessions ?? []).filter(s => !/^spare-/.test(s.title)).slice(0, 40)
  if (sessions.length === 0) return undefined
  const groups = new Map((roster?.groups ?? []).map(g => [g.id, g.name]))
  const list = sessions.map((s, i) => `${i + 1}. ${s.title}${s.groupId && groups.has(s.groupId) ? ` (${groups.get(s.groupId)})` : ''}`).join('\n')
  const prompt = `A person gave their team of Claude Code sessions this task:\n\n${text.slice(0, 1500)}\n\nThe sessions, each named by what it has been working on:\n${list}\n\nWhich session should do the task? Answer with its number alone.`
  const reply = await $.model.complete({ model: 'haiku', prompt, maxTokens: 8, effort: 'low', timeoutMs: 20_000 })
  if (!reply.isAnswered) return undefined
  const chosen = sessions[Number.parseInt(reply.text.trim(), 10) - 1]
  return chosen ? { ccdId: chosen.ccdId, title: chosen.title } : undefined
}

/**
 * The office app's tasks: a session takes the ones meant for it into its own prompt; one session, the one with the
 * lowest id among those running this mod, picks a session for "let Claude decide" and hands a task on to a session
 * that does not run the mod.
 */
export async function handleTasks($: EngineInterface, now: number, me: Live, lives: Record<string, Live>, roster: Roster | undefined): Promise<void> {
  home ??= await $.env.get('HOME')
  if (!home || me.ccdId === '' || me.ccdId === `local_${me.id}`) return
  const tasks = (await readTasks($, home)).filter(t => !settledTasks.has(t.id))
  if (tasks.length === 0) return
  const capable = [me, ...Object.values(lives)].filter(l => l.features?.includes('tasks') && now - l.at < FRESH_MS)
  const dispatcher = capable.map(l => l.id).sort()[0]
  for (const task of tasks) {
    const status = await readTaskStatus($, task.id)
    if (status && (status.status === 'sent' || status.status === 'failed')) {
      settledTasks.add(task.id)
      continue
    }
    if (now - task.at > TASK_TTL_MS) {
      if (me.id === dispatcher) await writeTaskStatus($, task.id, { status: 'failed', at: now, by: me.id, error: 'nobody picked it up in time' })
      continue
    }
    if (status?.status === 'sending' || status?.status === 'routing') continue
    const to = status?.status === 'routed' && status.to ? status.to : task.to
    if (to === 'auto') {
      if (me.id !== dispatcher) continue
      await writeTaskStatus($, task.id, { status: 'routing', at: now, by: me.id })
      const chosen = await routeTask($, task.text, roster).catch(() => undefined)
      await writeTaskStatus($, task.id, chosen ? { status: 'routed', at: now, by: me.id, to: chosen.ccdId, toTitle: chosen.title } : { status: 'failed', at: now, by: me.id, error: 'Claude could not pick a session' })
      continue
    }
    const toTitle = status?.toTitle ?? roster?.sessions.find(s => s.ccdId === to)?.title
    if (to === me.ccdId) {
      await writeTaskStatus($, task.id, { status: 'sending', at: now, by: me.id, to, toTitle })
      const sent = await $.prompt.submit({ text: task.text }).then(() => undefined, (error: unknown) => String(error instanceof Error ? error.message : error))
      await writeTaskStatus($, task.id, sent === undefined ? { status: 'sent', at: now, by: me.id, to, toTitle: me.title } : { status: 'failed', at: now, by: me.id, to, error: sent.slice(0, 160) })
      settledTasks.add(task.id)
      continue
    }
    if (capable.some(l => l.ccdId === to) || me.id !== dispatcher) continue
    await writeTaskStatus($, task.id, { status: 'sending', at: now, by: me.id, to, toTitle })
    const out = await $.mcp.call(SESSIONS, 'send_message', { session_id: to, message: `From the Pixel HQ office: ${task.text}` }).catch((error: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: String(error instanceof Error ? error.message : error) }] }))
    const said = out.content.map(block => (typeof block.text === 'string' ? block.text : '')).join(' ').slice(0, 160)
    await writeTaskStatus($, task.id, out.isError ? { status: 'failed', at: now, by: me.id, to, toTitle, error: said || 'not delivered' } : { status: 'sent', at: now, by: me.id, to, toTitle })
    settledTasks.add(task.id)
  }
}

