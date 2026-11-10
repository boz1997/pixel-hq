// A made-up office, for `pixel-hq --demo`: what the app shows without the mod installed.
// It changes a little every half minute, so the people move.

const GROUPS = [
  { id: 'cg-web', name: 'WEBSITES', order: 0 },
  { id: 'cg-api', name: 'BACKEND', order: 1 },
  { id: 'cg-app', name: 'MOBILE APP', order: 2 },
]

const SESSIONS = [
  ['s1', 'Landing page redesign', 'cg-web', false, 2],
  ['s2', 'Checkout bug on Safari', 'cg-web', false, 40],
  ['s3', 'Blog image optimisation', 'cg-web', false, 300],
  ['s4', 'Weather datasource integration', 'cg-api', false, 1],
  ['s5', 'PR review and merge', 'cg-api', false, 6],
  ['s6', 'Nightly import job', 'cg-api', false, 90],
  ['s7', 'Lab report trends', 'cg-api', false, 400],
  ['s8', 'Rate limit on uploads', 'cg-api', false, 800],
  ['s9', 'Onboarding screens', 'cg-app', false, 12],
  ['s10', 'Push notification copy', 'cg-app', false, 1500],
  ['s11', 'Store listing translations', null, true, 30],
  ['s12', 'Support inbox', null, true, 200],
  ['s13', 'Instagram content plan', null, false, 70],
  ['s14', 'Invoice template', null, false, 600],
  ['s15', 'Conference talk outline', null, false, 2000],
]

// Three acts; the office moves from one to the next every thirty seconds.
const ACTS = [
  { s1: ['working', 'running', 'npm test'], s2: ['waiting', 'waiting', 'has a question for you'], s4: ['working', 'editing', 'parser.ts'], s5: ['done', 'done', 'Merged, all checks green.'], s9: ['idle', 'idle', ''], s11: ['working', 'browsing', 'appstoreconnect.apple.com'], s13: ['working', 'designing', 'poster.png'] },
  { s1: ['working', 'editing', 'hero.tsx'], s2: ['working', 'reading', 'checkout.ts'], s4: ['working', 'browsing', 'docs.weather.gov'], s5: ['idle', 'idle', ''], s9: ['working', 'running', 'xcodebuild'], s11: ['idle', 'idle', ''], s13: ['idle', 'idle', ''] },
  { s1: ['idle', 'idle', ''], s2: ['working', 'editing', 'checkout.ts'], s4: ['working', 'delegating', 'Write the tests'], s5: ['working', 'reading', 'review.md'], s9: ['waiting', 'waiting', 'OK to run xcodebuild'], s11: ['working', 'designing', 'screenshots'], s13: ['working', 'browsing', 'instagram.com'] },
]

const LOG_TOOLS = [
  ['Read', 'reading', 'parser.ts'], ['Edit', 'editing', 'parser.ts'], ['Bash', 'running', 'npm test'], ['Grep', 'searching', 'parseRow'],
  ['WebSearch', 'browsing', 'NOAA api docs'], ['Edit', 'editing', 'parser.test.ts'], ['Bash', 'running', 'git diff'], ['Read', 'reading', 'README.md'],
]

export function demoState() {
  const now = Date.now()
  const act = ACTS[Math.floor(now / 30_000) % ACTS.length]
  const started = now - (now % 30_000)
  const sessions = SESSIONS.map(([id, title, groupId, isPinned, minutes]) => ({
    id, ccdId: `local_${id}`, title, cwd: '/Users/me/code', groupId, isPinned, isRunning: false,
    lastActivityAt: now - minutes * 60_000, link: `claude://claude.ai/epitaxy/local_${id}`,
    ...(id === 's5' ? { pr: { number: 128, state: 'OPEN' } } : {}),
  }))
  const lives = {}
  for (const [id, [state, verb, detail]] of Object.entries(act)) {
    const s = sessions.find(one => one.id === id)
    lives[id] = {
      id, ccdId: s.ccdId, title: s.title, cwd: s.cwd, groupId: s.groupId, isPinned: s.isPinned, link: s.link,
      at: now, since: state === 'idle' ? started - 30_000 : started, state, verb, detail, tool: undefined, turns: 3,
      helpers: id === 's4' ? [
        { id: 'a', label: 'Map the schema', type: 'Explore', isDone: false, verb: 'reading', detail: 'schema.ts', since: started },
        { id: 'b', label: 'Write the tests', type: 'general-purpose', isDone: false, verb: 'editing', detail: 'parser.test.ts', since: started },
        { id: 'c', label: 'Review', type: 'general-purpose', isDone: true, verb: 'done', detail: 'Looks fine.', since: started },
      ] : [],
      context: id === 's4' ? 48 : 20 + (id.charCodeAt(1) * 7) % 60,
      limits: [
        { kind: 'five_hour', percentUsed: 37, resetsAt: new Date(now + 2.5 * 3600_000).toISOString() },
        { kind: 'seven_day', percentUsed: 62, resetsAt: new Date(now + 3 * 86400_000).toISOString() },
      ],
      log: LOG_TOOLS.map(([tool, v, d], i) => ({ at: now - (LOG_TOOLS.length - i) * 45_000, tool, verb: v, detail: d })),
    }
  }
  return { at: now, roster: { at: now, groups: GROUPS, sessions }, lives, sources: 0, isDemo: true }
}
