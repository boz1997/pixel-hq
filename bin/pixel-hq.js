#!/usr/bin/env node
import { startServer } from '../app/server.js'

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`pixel-hq: the office of your Claude Code sessions, in your browser and on your phone.

  pixel-hq [--port 2323] [--browser] [--no-open] [--demo] [--password secret] [--local-only]

  --port        the port (default 2323)
  --browser     open an ordinary browser tab instead of a window of its own
  --no-open     open nothing
  --demo        show a made-up office instead of your sessions
  --password    ask for this password before showing the office (also read from PIXEL_HQ_PASSWORD)
  --local-only  listen on this computer only, not on the Wi-Fi
`)
  process.exit(0)
}

startServer({
  port: Number(flag('--port') ?? process.env.PORT ?? 2323),
  open: !args.includes('--no-open'),
  asApp: !args.includes('--browser'),
  demo: args.includes('--demo'),
  password: flag('--password') ?? process.env.PIXEL_HQ_PASSWORD,
  host: args.includes('--local-only') ? '127.0.0.1' : '0.0.0.0',
})
