import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DeskState, Helper, Live, LogEntry, Office, Plan } from '../types'
import { fetchPlan, fetchRoster, fetchSelf, forget, publish, readLives, readPlan, SESSIONS, sharePlan } from './hq'
import { ago, buildRooms, clip, detailFor, gist, shownState, verbFor } from './model'
import type { Desk, Room } from './model'
import { W, drawOffice, heightOf, summary } from './scene'
import type { Counts } from './scene'

const PANE = 'pixel-hq'
const TICK_MS = 2000
const HEARTBEAT_EVERY = 10
const ROSTER_SHOWN_MS = 10_000
const ROSTER_HIDDEN_MS = 60_000
const PLAN_MS = 60_000

const EMPTY_ME: Live = {
  id: '',
  ccdId: '',
  title: '',
  cwd: '',
  groupId: null,
  isPinned: false,
  at: 0,
  since: 0,
  state: 'idle',
  verb: 'idle',
  detail: '',
  helpers: [],
  turns: 0,
  log: [],
}
const INITIAL: Office = { me: EMPTY_ME, lives: {} }

const LOG_KEPT = 20

/** Keeps one tool call in this session's activity log, which the office viewer reads. */
const logCall = ($: EngineInterface, tool: string, verb: string, detail: string, who?: string) =>
  setMe($, (me, now) => {
    const entry: LogEntry = { at: now, tool, verb, detail, ...(who ? { who } : {}) }
    return { log: [...(me.log ?? []), entry].slice(-LOG_KEPT) }
  })

const office = atom({ plugin: 'pixel-hq', key: 'office' } as const, INITIAL, { shape: 'office-1' })
const isDismissed = atom({ plugin: 'pixel-hq', key: 'isDismissed' } as const, false)

const baseName = (path: string): string => path.split('/').filter(Boolean).pop() ?? path

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Pixel HQ' })

/** Changes this session's desk and publishes it; a change that changes nothing writes nothing. */
async function setMe($: EngineInterface, change: (me: Live, now: number) => Partial<Live>): Promise<void> {
  const now = await $.clock.now()
  const before = (await read($, office)).me
  const patch = change(before, now)
  const after: Live = { ...before, ...patch }
  if (JSON.stringify({ ...after, at: 0 }) === JSON.stringify({ ...before, at: 0 })) return
  const next = await update($, office, value => ({ ...value, me: { ...value.me, ...patch, at: now } }))
  await publish($, next.me)
}

const setState = ($: EngineInterface, state: DeskState, verb: string, detail?: string, tool?: string) =>
  setMe($, (me, now) => ({
    state,
    verb,
    detail: detail ?? (state === me.state ? me.detail : ''),
    tool,
    since: state === me.state ? me.since : now,
  }))

async function refreshUsage($: EngineInterface): Promise<void> {
  const { context, rateLimits } = await $.session.usage()
  const percent = context.percent ?? (context.tokens === undefined || context.window === 0 ? undefined : Math.round((context.tokens / context.window) * 100))
  await setMe($, () => ({
    context: percent,
    limits: rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
  }))
}

/** Changes one of this session's subagents; one not yet listed joins from the agent list. */
async function setHelper($: EngineInterface, id: string, patch: Partial<Helper>): Promise<void> {
  const { me } = await read($, office)
  if (!me.helpers.some(h => h.id === id)) {
    const info = (await $.agent.list().catch(() => [])).find(a => a.id === id)
    if (!info) return
    const since = await $.clock.now()
    const helper: Helper = { id, label: clip(info.description || info.type, 24), type: info.type, isDone: false, verb: 'thinking', detail: '', since }
    await setMe($, m => ({ helpers: [...m.helpers.filter(h => h.id !== id), helper].slice(-12) }))
  }
  await setMe($, m => ({ helpers: m.helpers.map(h => (h.id === id ? { ...h, ...patch } : h)) }))
}

async function learnSelf($: EngineInterface): Promise<void> {
  const self = await fetchSelf($).catch(() => undefined)
  if (!self) return
  await setMe($, () => ({
    ccdId: self.ccdId,
    title: self.title,
    groupId: self.groupId,
    isPinned: self.isPinned,
    link: self.link,
  }))
}

/** What the drawing hangs on, so a tick that changes none of it redraws nothing. */
const fingerprint = (value: Office, now: number): string =>
  JSON.stringify({
    lives: Object.values(value.lives).map(live => [live.id, live.title, live.groupId, live.isPinned, shownState(live, now), live.verb, live.detail, live.helpers.map(h => [h.id, h.isDone, h.verb, h.detail])]),
    sessions: value.roster?.sessions.map(s => [s.id, s.title, s.groupId, s.isPinned, s.pr?.state]),
    groups: value.roster?.groups,
    note: value.note,
    plan: value.plan && [value.plan.windows.map(w => [w.label, w.percentUsed, w.resetsAt]), value.plan.extra?.percentUsed],
    mine: shownState(value.me, now),
  })

let ticks = 0
let rosterAskedAt = 0
const announced = new Set<string>()
let rosterAsks = 0
let planAskedAt = 0

/** The plan's limits: the freshest any session published, read again from the app once a minute. */
async function planOf($: EngineInterface, now: number, known: Plan | undefined): Promise<Plan | undefined> {
  const stored = await readPlan($).catch(() => undefined)
  let plan = stored !== undefined && (known === undefined || stored.at >= known.at) ? stored : known
  if ((plan === undefined || now - plan.at >= PLAN_MS) && now - planAskedAt >= PLAN_MS) {
    planAskedAt = now
    const fetched = await fetchPlan($, now).catch(() => undefined)
    if (fetched !== undefined) {
      plan = fetched
      await sharePlan($, fetched)
    }
  }
  return plan
}

async function tick($: EngineInterface): Promise<void> {
  ticks += 1
  const now = await $.clock.now()
  const current = await read($, office)
  if (current.me.id === '') return
  if (ticks % HEARTBEAT_EVERY === 0) await publish($, { ...current.me, at: now })

  const lives = await readLives($, now, current.me.id)
  // Another session that starts waiting for the person is announced here, once.
  for (const live of Object.values(lives)) {
    if (live.state !== 'waiting' || shownState(live, now) !== 'waiting') continue
    const key = `${live.id}:${live.since}`
    if (announced.has(key)) continue
    announced.add(key)
    if (announced.size > 200) announced.clear()
    const was = current.lives[live.id]
    if (was && was.state === 'waiting' && was.since === live.since) continue
    $.ui.toast(`${clip(live.title, 40)} needs you${live.detail ? `: ${clip(live.detail, 48)}` : ''}`, { timeoutMs: 8000 })
  }
  const pane = (await $.ui.panes()).find(one => one.id === PANE)
  const isShown = pane !== undefined && pane.isShown && pane.isPlaced
  const period = isShown ? ROSTER_SHOWN_MS : ROSTER_HIDDEN_MS
  let roster = current.roster
  let note = current.note
  if (roster === undefined || now - rosterAskedAt >= period) {
    rosterAskedAt = now
    rosterAsks += 1
    try {
      roster = await fetchRoster($, now)
      note = undefined
      await $.store.set('roster', roster)
      if (rosterAsks % 3 === 1 || current.me.ccdId === `local_${current.me.id}`) await learnSelf($)
    } catch (error) {
      note = `sidebar: ${String(error instanceof Error ? error.message : error).slice(0, 90)}`
    }
    // What /hq reports, and what a shell can read from the store while developing.
    await $.store.set('diag', {
      at: now,
      by: current.me.id,
      groups: roster?.groups.length ?? 0,
      sessions: roster?.sessions.length ?? 0,
      lives: Object.keys(lives).length,
      isShown,
      note: note ?? null,
    })
  }
  const plan = await planOf($, now, current.plan)
  const next: Office = { ...current, lives, roster, note, plan }
  if (fingerprint(next, now) === fingerprint(current, now)) return
  await update($, office, value => ({ ...value, lives, roster, note, plan }))
}

function countsOf(rooms: Room[]): Counts {
  const desks = rooms.flatMap(room => room.desks)
  return {
    desks: desks.length + rooms.reduce((sum, room) => sum + room.more, 0),
    present: desks.filter(d => d.isPresent).length,
    working: desks.filter(d => d.state === 'working').length,
    waiting: desks.filter(d => d.state === 'waiting').length,
  }
}

async function openSession($: EngineInterface, desk: Desk): Promise<void> {
  if (!desk.link) {
    $.ui.toast(`${desk.title}: no link to open it by`)
    return
  }
  try {
    const { exitCode, stderr } = await $.process.run(['open', desk.link], { timeoutMs: 8000 })
    if (exitCode !== 0) $.ui.toast(`open failed: ${stderr.slice(0, 80)}`)
  } catch (error) {
    $.ui.toast(`Cannot open from here: ${String(error instanceof Error ? error.message : error).slice(0, 80)}`)
  }
}

async function sendTo($: EngineInterface, desk: Desk, message: string): Promise<void> {
  const text = message.trim()
  if (text === '') return
  try {
    const out = await $.mcp.call(SESSIONS, 'send_message', { session_id: desk.ccdId, message: text })
    const said = out.content.map(block => (typeof block.text === 'string' ? block.text : '')).join(' ')
    $.ui.toast(out.isError ? `Not sent: ${said.slice(0, 100)}` : `Sent to ${clip(desk.title, 30)}`)
  } catch (error) {
    const sent = await $.session.send({ to: { sessionId: desk.id }, text }).catch(() => undefined)
    if (sent?.isDelivered) $.ui.toast(`Sent to ${clip(desk.title, 30)}`)
    else $.ui.toast(`Not sent: ${sent?.reason ?? String(error instanceof Error ? error.message : error).slice(0, 80)}`)
  }
  await update($, office, value => ({ ...value, isAsking: false }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hq', description: 'Open Pixel HQ: every session at its desk, live' })
    void $.store.delete('isClosed').catch(() => undefined)
    const id = (await $.session.id()).replace(/^local_/, '')
    const cwd = e.cwd || (await $.session.cwd())
    const now = await $.clock.now()
    await update($, office, value => ({
      ...value,
      // A start, or a reload, finds no turn running: the desk is idle until the next event.
      me: { ...EMPTY_ME, ...value.me, id, ccdId: value.me.ccdId || `local_${id}`, cwd, title: value.me.title || baseName(cwd), at: now, since: now, state: 'idle' as DeskState, verb: 'idle', detail: '', tool: undefined },
    }))
    await publish($, (await read($, office)).me)
    $.clock.every(TICK_MS, () => void tick($).catch(error => $.ui.log(`pixel-hq tick: ${String(error)}`, { to: 'debug' })))
    const started = await next(e)
    void learnSelf($)
    void refreshUsage($)
    void tick($).catch(() => undefined)

    return started
  })

  on('command.run', { command: 'hq' }, async $ => {
    await update($, isDismissed, () => false)
    const opened = await openPane($)
    const value = await read($, office)
    const now = await $.clock.now()
    const rooms = buildRooms(value.roster, value.lives, value.me, now)
    const counts = countsOf(rooms)
    const status = `${counts.desks} sessions in ${rooms.length} rooms, ${counts.present} in, ${counts.working} working, ${counts.waiting} waiting for you${value.note ? ` (${value.note})` : ''}.`

    return { text: opened.isPlaced ? `Pixel HQ opened. ${status}` : `Pixel HQ could not be placed: ${opened.reason}. ${status}` }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      await update($, isDismissed, () => true)
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await setMe($, (me, now) => ({ state: 'working', verb: 'reading', detail: gist(e.text, 24), tool: undefined, since: now, turns: me.turns + 1, helpers: me.helpers.filter(h => !h.isDone) }))

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await setState($, 'working', 'thinking', '')
    else await setHelper($, e.agentId, { verb: 'thinking', detail: '', isDone: false })

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.index > 0) await setState($, 'working', 'thinking', '')
    const response = yield* next(e)
    if (e.agentId === undefined) void refreshUsage($)

    return response
  })

  // A check marks a tool's start without holding a frame open around it; an
  // ask a person answers is the wait.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    // A call of this mod's own (its MCP reads of the sidebar) is not the session at work.
    if (next.origin.plugin !== 'engine') return verdict
    if (e.tool_use_id !== undefined && verdict.decision !== 'deny') {
      const tool = String(e.tool)
      const input = (typeof e.input === 'object' && e.input !== null ? e.input : {}) as Record<string, unknown>
      if (e.agentId !== undefined) {
        await setHelper($, e.agentId, { verb: verbFor(tool), detail: detailFor(tool, input), isDone: false })
        const who = (await read($, office)).me.helpers.find(h => h.id === e.agentId)?.label
        await logCall($, tool, verbFor(tool), detailFor(tool, input), who ?? e.agentId.slice(0, 8))
      } else {
        await logCall($, tool, verbFor(tool), detailFor(tool, input))
        await setState($, 'working', verbFor(tool), detailFor(tool, input), tool)
      }
    }

    return verdict
  })

  // The dialog that asks the person is the wait; the call that follows their answer ends it.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (!e.agent_id) {
      const tool = String(e.tool_name)
      const input = (typeof e.tool_input === 'object' && e.tool_input !== null ? e.tool_input : {}) as Record<string, unknown>
      await setState($, 'waiting', 'waiting', `OK to ${verbFor(tool) === 'working' ? 'use' : verbFor(tool).replace(/ing$/, '')} ${detailFor(tool, input) || tool}`.slice(0, 40), tool)
    }

    return next(e)
  })

  on('tool.call', { tool: /^(?!AskUserQuestion$)/ }, async ($, e, next) => {
    if (next.origin.plugin === 'engine' && e.agentId === undefined && (await read($, office)).me.state === 'waiting') {
      const tool = String(e.tool)
      await setState($, 'working', verbFor(tool), detailFor(tool, e as unknown as Record<string, unknown>), tool)
    }

    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (next.origin.plugin !== 'engine') return next(e)
    if (e.agentId === undefined) await setState($, 'waiting', 'asking', 'has a question for you', 'AskUserQuestion')
    const answered = await next(e)
    if (e.agentId === undefined) await setState($, 'working', 'thinking', '')

    return answered
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId !== undefined) {
      const helper: Helper = { id: started.agentId, label: clip(e.description || e.subagentType, 24), type: e.subagentType, isDone: false, verb: 'thinking', detail: '', since: await $.clock.now() }
      await setMe($, me => ({ helpers: [...me.helpers.filter(h => h.id !== helper.id), helper].slice(-12) }))
    }

    return started
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const isOk = e.reason === 'answer'
      await setHelper($, e.agentId, { isDone: true, isFailed: !isOk, verb: isOk ? 'done' : e.reason, detail: isOk ? gist(e.answer, 30) : '' })
    } else {
      const isOk = e.reason === 'answer'
      await setState($, isOk ? 'done' : 'failed', isOk ? 'done' : e.reason, isOk ? gist(e.answer, 40) : e.reason, undefined)
    }
    const completed = await next(e)
    if (e.agentId === undefined) void refreshUsage($)

    return completed
  })

  on('session.measure', async ($, e, next) => {
    const percent = e.context.percent
    await setMe($, () => ({
      context: percent,
      limits: e.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    }))

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const { me } = await read($, office)
    await forget($, me.id).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const value = await read($, office)
    const now = await $.clock.now()
    const rooms = buildRooms(value.roster, value.lives, value.me, now)
    const counts = countsOf(rooms)
    const picked = rooms.flatMap(room => room.desks).find(desk => desk.id === value.picked)
    const pick = (id: string) => update($, office, v => ({ ...v, picked: v.picked === id ? undefined : id, isAsking: false }))

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>Pixel HQ</Text>
          <Text dimColor>
            {counts.desks} sessions · {counts.present} in · {counts.working} working · {counts.waiting} waiting for you
          </Text>
          {rooms.map(room => (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="subtle">
                {room.name}
                {room.more > 0 ? ` (+${room.more} more)` : ''}
              </Text>
              {room.desks.length === 0 && <Text dimColor>nobody here yet</Text>}
              {room.desks.map(desk => (
                <Box flexDirection="column">
                  <Text dimColor={!desk.isPresent} wrap="truncate-end">
                    {desk.state === 'working' ? '● ' : desk.state === 'waiting' ? '! ' : desk.state === 'done' ? '✓ ' : desk.state === 'failed' ? '✗ ' : '○ '}
                    <Text bold={desk.isMe}>{clip(desk.title, 28)}</Text>
                    {desk.isPresent ? ` ${desk.state}${desk.verb && desk.state === 'working' ? `: ${desk.verb} ${desk.detail}` : ''}` : ` away · ${ago(now - desk.lastActivityAt)}`}
                  </Text>
                  {desk.helpers
                    .filter(h => !h.isDone)
                    .map(h => (
                      <Text dimColor wrap="truncate-end">
                        {'   ↳ '}
                        {clip(h.label, 24)}
                        {h.verb ? `: ${h.verb} ${h.detail ?? ''}` : ''}
                      </Text>
                    ))}
                </Box>
              ))}
            </Box>
          ))}
          {value.note && <Text dimColor>{value.note}</Text>}
        </Box>
      )
    }

    const table = $.ui.resolve(e)
    const { Box, Text, Button, Svg } = table
    const width = Math.max(300, Math.round((e.props.bodyColumns || 80) * 7.5))
    const view = { rooms, me: value.me, picked: value.picked, counts, plan: value.plan }
    const height = Math.round((width * heightOf(rooms)) / W)

    return (
      <Box flexDirection="column" rowGap={1}>
        <Svg source={drawOffice(view, now)} alt={summary(view)} width={width} height={height} isInteractive />
        <Box flexDirection="column">
          {rooms.map(room => (
            <Box flexDirection="column">
              <Text bold color="subtle">
                {room.name}
                {room.more > 0 ? ` · +${room.more} more` : ''}
              </Text>
              <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
                {room.desks.map(desk => (
                  <Button key={`s:${desk.id}`} plain dimColor={!desk.isPresent} onPress={() => void pick(desk.id)}>
                    <Text color={desk.state === 'working' ? 'success' : desk.state === 'waiting' ? 'warning' : desk.state === 'failed' ? 'error' : desk.isPresent ? 'suggestion' : 'inactive'}>
                      {desk.state === 'working' ? '●' : desk.state === 'waiting' ? '!' : desk.state === 'done' ? '✓' : desk.state === 'failed' ? '✗' : '○'}
                    </Text>{' '}
                    {clip(desk.title, 24)}
                    {desk.isMe ? ' (you)' : ''}
                  </Button>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
        {picked && (
          <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
            <Text bold>{picked.title}</Text>
            <Text dimColor>
              {picked.isPresent ? `${picked.state}${picked.verb && picked.state === 'working' ? ` · ${picked.verb} ${picked.detail}` : ''}` : `away · last active ${ago(now - picked.lastActivityAt)} ago`}
              {picked.cwd ? ` · ${baseName(picked.cwd)}` : ''}
              {picked.pr ? ` · PR #${picked.pr.number} ${picked.pr.state.toLowerCase()}` : ''}
            </Text>
            {picked.helpers.length > 0 && (
              <Text dimColor wrap="truncate-end">
                {picked.helpers.map(h => `${h.isFailed ? '✗' : h.isDone ? '✓' : '●'} ${clip(h.label, 22)}${h.verb && !h.isDone ? ` (${h.verb}${h.detail ? ` ${h.detail}` : ''})` : ''}`).join('   ')}
              </Text>
            )}
            {!picked.isMe && (
              <Box columnGap={2}>
                <Button key="go" onPress={() => void openSession($, picked)}>
                  Open
                </Button>
                <Button key="ask" variant={value.isAsking ? 'secondary' : 'primary'} onPress={() => void update($, office, v => ({ ...v, isAsking: !v.isAsking }))}>
                  Message
                </Button>
                <Button key="unpick" plain dimColor onPress={() => void pick(picked.id)}>
                  Close
                </Button>
              </Box>
            )}
            {!picked.isMe && value.isAsking && 'Input' in table && (
              <table.Input key="ask-text" placeholder={`Message to ${clip(picked.title, 30)}`} submitLabel="send" autoFocus onSubmit={text => void sendTo($, picked, text)} />
            )}
          </Box>
        )}
        {value.note && <Text dimColor>{value.note}</Text>}
      </Box>
    )
  })
}
