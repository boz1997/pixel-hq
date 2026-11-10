import { exec } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { demoState } from './demo.js'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')
const STORE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'store')
const PUSH_MS = 2000

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
    }
  }
  return { at: Date.now(), roster, lives, sources: files.length }
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

function openBrowser(url) {
  const command = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`
  exec(command, () => undefined)
}

/** Sends the state to a Vercel mirror whenever it changed. */
function startPush(push, password, demo) {
  const target = `${push.replace(/\/$/, '')}/api/state`
  let last = ''
  let isFailing = false
  const tick = async () => {
    const state = demo ? demoState() : readState()
    const body = JSON.stringify(state)
    const signature = JSON.stringify({ roster: state.roster, lives: state.lives })
    if (signature === last) return
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-pixel-hq-password': password ?? '' },
        body,
      })
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`)
      last = signature
      if (isFailing) console.log(`push: back to normal`)
      isFailing = false
    } catch (error) {
      if (!isFailing) console.log(`push to ${target} failed: ${error.message}`)
      isFailing = true
    }
  }
  setInterval(tick, PUSH_MS)
  void tick()
}

export function startServer({ port = 4747, open = true, push, password, demo = false } = {}) {
  const state = () => (demo ? demoState() : readState())
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname === '/api/state') {
      send(res, 200, TYPES['.json'], JSON.stringify(state()))
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'text/plain', 'method not allowed')
      return
    }
    serveStatic(req, res)
  })
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`
    const files = storeFiles()
    console.log(`Pixel HQ at ${url}`)
    if (demo) console.log('showing the demo office; drop --demo to see your own sessions')
    else console.log(files.length > 0 ? `reading ${files.length} store file${files.length === 1 ? '' : 's'} under ${STORE_DIR}` : `no store file under ${STORE_DIR} yet: install the mod and open a session (or try --demo)`)
    if (push) {
      console.log(`mirroring to ${push}`)
      startPush(push, password, demo)
    }
    if (open) openBrowser(url)
  })
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `port ${port} is taken; try --port ${port + 1}` : error.message)
    process.exit(1)
  })
  return server
}
