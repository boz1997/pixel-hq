# Changelog

## 0.3.0 — the 3D office

- **The 3D office**, now the main view: an isometric office with glass rooms per sidebar group, wooden floors, windows, a corner office for Claude, a meeting room, a library, a studio, a café and a WC, people who sit, type, walk and wave, subagents, a black labrador, day and night. Drag to turn it, scroll to zoom, click anyone for their card. The pixel office stays at `/pixel.html`.
- **Cards and a guided tour**: a card per session with what it does, its model, its pull request, its last result, its subagents and its latest calls, with Open in Claude and Message; ▶ Tour flies the camera from desk to desk.
- **Results on the desk**: the mod publishes the files a turn wrote and the gist of its answer; the office shows them on the desk and in a "Done ✓" bubble.
- **Tasks from the office**: a task bar sends a task to a session, or lets Claude Haiku pick one by the sessions' titles. Tasks go out only from this computer or with `--password`, are checked for their origin, and reach a session through its own mod, or as a message from another session.
- **Idle people stay at their desks** and take a break now and then, so a quiet office still looks like one at work.
- **When Claude is down, the office panics**: the app reads Anthropic's public status page once a minute (`--no-status` turns it off) and the mod reports the turns the API killed. On an outage or a major incident on Claude Code or the API, or sessions dying on overloaded and server errors, the office flashes red under sirens, a banner names the incident, and everyone runs around shouting while the manager asks for calm; calm mode keeps them at their desks, shaking. A lesser incident, or one whose fix Anthropic is monitoring, shows a yellow banner alone. `?outage` in the address runs a drill.
- **Plan limits on the USAGE board**: the mod reads the desktop app's usage card once a minute, one session for all, and the board shows every limit on it, the per-model weekly one such as Fable included, with when a spent one resets. The red lamp blinks near a limit; once one is spent it flashes and washes the manager's office in red, held still for reduced motion. Without a reading the board falls back to the session's own windows.

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
