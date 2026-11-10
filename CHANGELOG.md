# Changelog

## 0.2.0 — the office app

- **The office app**: `npx github:boz1997/pixel-hq` runs a local viewer at port 2323, opens it in a window of its own (a Chromium app-mode window where one is installed, `--browser` for a plain tab) and prints the address your phone can open on the same Wi-Fi. `--password` locks it, `--local-only` keeps it to this computer, `--demo` shows a made-up office, a taken port is skipped for the next one.
- **A living scene** on a canvas: rooms per sidebar group with a desk per session, a corner office for the manager, a meeting room, a library, a studio, a café and a WC, a hall with an entrance. People walk between them by what their session does: the library while it browses the web, the studio while it makes images or pages, the café after a while idle (with chats, sips and phones), the WC now and then. New sessions walk in, closed ones walk out. Subagents sit at the meeting table, then carry their paper to their session's desk and leave.
- **Calm or lively** switch, rooms that fold from their header, both remembered by the browser.
- **The place**: plank, checker, tile and carpet floors; walls with skirting; a wall clock on real time; posters; a projector screen that names the subagent at work; an espresso machine with steam; reading lamps; two things on every desk, picked by the session; papers that pile up with the context; lamps and screens that glow at night; shadows; a black labrador.
- **Events**: confetti when a turn finishes, smoke when it fails, a party at the café when a pull request merges, a red lamp when a rate limit is nearly spent, and a ticker of every session's latest tool calls under the office.
- **Click** a person or a desk for the session's state, its subagents, its last twenty tool calls and a button that opens it in Claude.
- **The mod** now publishes an activity log and the sidebar's roster, marks a session as waiting only on a real permission dialog, ignores its own tool calls and the app's spare sessions, and no longer opens the pane by itself (`/hq` does).

## 0.1.0 — the pane

- A pixel-art office in a pane beside the chat: rooms per sidebar group, a desk per session, Claude as the manager with the context and usage boards, live states from each session's own copy of the mod, subagents beside their desk, a needs-you toast, open and message actions.
