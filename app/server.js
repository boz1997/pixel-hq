import { exec } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { demoState } from './demo.js'

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')
const STORE_DIR = path.join(os.homedir(), '.claude', 'plugins', 'store')

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

export function startServer({ port = 2323, host = '0.0.0.0', open = true, password, demo = false } = {}) {
  const state = () => (demo ? demoState() : readState())
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
  server.listen(port, host, () => {
    const local = `http://localhost:${port}`
    const files = storeFiles()
    console.log(`Pixel HQ at ${local}`)
    if (host !== '127.0.0.1') {
      const hostname = os.hostname().replace(/\.local$/, '')
      console.log(`on your phone, on the same Wi-Fi: http://${hostname}.local:${port}`)
      for (const { address } of networkAddresses()) console.log(`                               or http://${address}:${port}`)
      if (!password) console.log('anyone on this network can open it; add --password to ask for one')
    }
    if (demo) console.log('showing the demo office; drop --demo to see your own sessions')
    else console.log(files.length > 0 ? `reading ${files.length} store file${files.length === 1 ? '' : 's'} under ${STORE_DIR}` : `no store file under ${STORE_DIR} yet: install the mod and open a session (or try --demo)`)
    if (open) openBrowser(local)
  })
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `port ${port} is taken; try --port ${port + 1}` : error.message)
    process.exit(1)
  })
  return server
}
