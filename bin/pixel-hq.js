#!/usr/bin/env node
import { startServer } from '../app/server.js'

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`pixel-hq: the office of your Claude Code sessions, in your browser.

  pixel-hq [--port 4747] [--no-open] [--push https://your-app.vercel.app --password secret]

  --port      the local port (default 4747)
  --no-open   do not open the browser
  --demo      show a made-up office instead of your sessions
  --push      also send the office's state to your own Vercel mirror, every two seconds
  --password  the mirror's password (PIXEL_HQ_PASSWORD on Vercel); also read from the environment
`)
  process.exit(0)
}

startServer({
  port: Number(flag('--port') ?? process.env.PORT ?? 4747),
  open: !args.includes('--no-open'),
  demo: args.includes('--demo'),
  push: flag('--push') ?? process.env.PIXEL_HQ_PUSH,
  password: flag('--password') ?? process.env.PIXEL_HQ_PASSWORD,
})
