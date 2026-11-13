import { exec } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { demoState } from './demo.js'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')
const STORE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'store')
const STATUS_URL = 'https://status.claude.com/api/v2/summary.json'
const STATUS_MS = 60_000
const WATCHED = /^(Claude Code|Claude API)\b/

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/** Every store file the mod writes: one per way it was loaded (from a folder, from a marketplace). */
function storeFiles() {
  try {
    return fs
      .readdirSync(STORE_DIR)
      .filter(name => name.startsWith('pixel-hq_') && name.endsWith('.json'))
      .map(name => path.join(STORE_DIR, name))
  } catch {
    return []
  }
}

/** The office as the sessions last published it: their desks, and the sidebar's rooms. */
export function readState() {
  const lives = {}
  let roster = null
  let plan = null
  const files = storeFiles()
  for (const file of files) {
    let store
    try {
      store = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const [key, value] of Object.entries(store)) {
      if (key.startsWith('live:') && value && typeof value === 'object' && typeof value.id === 'string') {
        const known = lives[value.id]
        if (!known || (value.at ?? 0) >= (known.at ?? 0)) lives[value.id] = value
      }
      if (key === 'roster' && value && typeof value === 'object' && Array.isArray(value.sessions)) {
        if (!roster || (value.at ?? 0) > (roster.at ?? 0)) roster = value
      }
      if (key === 'plan' && value && typeof value === 'object' && Array.isArray(value.windows)) {
        if (!plan || (value.at ?? 0) > (plan.at ?? 0)) plan = value
      }
    }
  }
  return { at: Date.now(), roster, lives, plan, sources: files.length }
}

/** What Anthropic's public status page says of Claude Code and the API: their components, and their incidents not yet resolved. */
export function statusFrom(summary, now = Date.now()) {
  const components = (summary.components ?? [])
    .filter(c => !c.group && WATCHED.test(c.name ?? ''))
    .map(c => ({ name: c.name, status: c.status }))
  const incidents = (summary.incidents ?? [])
    .filter(i => !['resolved', 'postmortem', 'completed'].includes(i.status) && (i.components ?? []).some(c => WATCHED.test(c.name ?? '')))
    .map(i => ({
      name: i.name,
      impact: i.impact,
      status: i.status,
      startedAt: i.started_at ?? i.created_at,
      update: String(i.incident_updates?.[0]?.body ?? '').replace(/\s+/g, ' ').slice(0, 280),
    }))
  return { at: now, indicator: summary.status?.indicator ?? 'none', description: summary.status?.description ?? '', components, incidents }
}

/** Asks the status page once a minute; while it cannot be reached, the last answer stands until the office calls it stale. */
function watchStatus() {
  const watch = { value: null }
  const ask = () =>
    fetch(STATUS_URL, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json', 'user-agent': 'pixel-hq' } })
      .then(res => (res.ok ? res.json() : undefined))
      .then(summary => {
        if (summary) watch.value = statusFrom(summary)
      })
      .catch(() => undefined)
  void ask()
  setInterval(ask, STATUS_MS).unref()
  return watch
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost')
  let file = url.pathname === '/' ? '/index.html' : url.pathname
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '')
  const full = path.join(PUBLIC, file)
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    send(res, 404, 'text/plain', 'not found')
    return
  }
  send(res, 200, TYPES[path.extname(full)] ?? 'application/octet-stream', fs.readFileSync(full))
}

const APP_BROWSERS = ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium', 'Arc']

/** Opens the office in a window of its own (a Chromium browser's app mode) where one is installed, else in the browser. */
function openBrowser(url, asApp) {
  if (asApp && process.platform === 'darwin') {
    const name = APP_BROWSERS.find(one => fs.existsSync(`/Applications/${one}.app`))
    if (name) {
      exec(`open -na "${name}" --args --app="${url}" --window-size=1180,940`, () => undefined)
      return name
    }
  }
  if (asApp && process.platform === 'win32') {
    exec(`start "" chrome --app="${url}" --window-size=1180,940 || start "" msedge --app="${url}" || start "" "${url}"`, () => undefined)
    return 'a browser window'
  }
  if (asApp && process.platform === 'linux') {
    exec(`(google-chrome --app="${url}" || chromium --app="${url}" || xdg-open "${url}") >/dev/null 2>&1`, () => undefined)
    return 'a browser window'
  }
  const command = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`
  exec(command, () => undefined)
  return 'the browser'
}

/** The addresses another device on the same network reaches this computer by. */
function networkAddresses() {
  const out = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const one of list ?? []) {
      if (one.family === 'IPv4' && !one.internal) out.push({ name, address: one.address })
    }
  }
  return out
}

export function startServer({ port = 2323, host = '0.0.0.0', open = true, asApp = true, password, demo = false, status = true } = {}) {
  const watch = !demo && status ? watchStatus() : null
  const state = () => (demo ? demoState() : { ...readState(), status: watch?.value ?? null })
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/api/state') {
      if (password && req.headers['x-pixel-hq-password'] !== password) {
        send(res, 401, TYPES['.json'], JSON.stringify({ error: 'wrong password' }))
        return
      }
      send(res, 200, TYPES['.json'], JSON.stringify(state()))
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'text/plain', 'method not allowed')
      return
    }
    serveStatic(req, res)
  })
  server.on('listening', () => {
    const local = `http://localhost:${port}`
    const files = storeFiles()
    console.log(`Pixel HQ at ${local}`)
    if (host !== '127.0.0.1') {
      const hostname = os.hostname().replace(/\.local$/, '')
      console.log(`on your phone, on the same Wi-Fi: http://${hostname}.local:${port}`)
      for (const { address } of networkAddresses()) console.log(`                               or http://${address}:${port}`)
      if (!password) console.log('anyone on this network can open it; add --password to ask for one')
    }
    if (watch) console.log('asking status.claude.com once a minute whether Claude is down (--no-status to stop)')
    if (demo) console.log('showing the demo office; drop --demo to see your own sessions')
    else console.log(files.length > 0 ? `reading ${files.length} store file${files.length === 1 ? '' : 's'} under ${STORE_DIR}` : `no store file under ${STORE_DIR} yet: install the mod and open a session (or try --demo)`)
    if (open) console.log(`opening it in ${openBrowser(local, asApp)}`)
  })
  server.listen(port, host)
  // A taken port is skipped, up to ten times, so a second copy just lands on the next one.
  let tries = 0
  server.on('error', error => {
    if (error.code === 'EADDRINUSE' && tries < 10) {
      tries += 1
      console.log(`port ${port} is taken, trying ${port + 1}`)
      port += 1
      server.listen(port, host)
      return
    }
    console.error(error.code === 'EADDRINUSE' ? `port ${port} is taken; try --port ${port + 1}` : error.message)
    process.exit(1)
  })
  return server
}
