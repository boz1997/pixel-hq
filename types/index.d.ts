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
  turns: number
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
  note?: string
  picked?: string
  isAsking?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-hq': { office: Shaped<Office>; isDismissed: boolean }
  }
}
