export type DeskState = 'working' | 'waiting' | 'idle' | 'done' | 'failed' | 'away'

export type Helper = {
  id: string
  label: string
  type: string
  isDone: boolean
  isFailed?: boolean
  verb?: string
  detail?: string
  since?: number
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

/** One limit of the plan as the app's usage card shows it: "Weekly · all models", "Weekly · Fable". */
export type PlanWindow = { label: string; percentUsed: number; resetsAt?: string }

/** The account's plan limits, per model too, as the desktop app reads them; one session publishes them for all. */
export type Plan = { at: number; windows: PlanWindow[]; extra?: { percentUsed: number } }

/** One tool call of the session or of one of its subagents (`who`), for the activity log. */
export type LogEntry = { at: number; tool: string; verb: string; detail: string; who?: string }

/** The API error a turn of the session last died on, in Claude Code's word for it: `overloaded`, `server_error`, `rate_limit`... */
export type Trouble = { at: number; error: string; detail: string }

/** One session as its own mod instance publishes it to the shared store. */
export type Live = {
  id: string
  ccdId: string
  title: string
  cwd: string
  groupId: string | null
  isPinned: boolean
  link?: string
  at: number
  since: number
  state: DeskState
  verb: string
  detail: string
  tool?: string
  helpers: Helper[]
  context?: number
  limits?: Limit[]
  trouble?: Trouble
  turns: number
  log: LogEntry[]
}

export type RosterGroup = { id: string; name: string; order: number }

export type RosterSession = {
  id: string
  ccdId: string
  title: string
  cwd: string
  groupId: string | null
  isPinned: boolean
  isRunning: boolean
  lastActivityAt: number
  link?: string
  pr?: { number: number; state: string }
}

export type Roster = { at: number; groups: RosterGroup[]; sessions: RosterSession[] }

export type Office = {
  me: Live
  lives: Record<string, Live>
  roster?: Roster
  plan?: Plan
  note?: string
  picked?: string
  isAsking?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-hq': { office: Shaped<Office>; isDismissed: boolean }
  }
}
