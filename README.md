# Pixel HQ

A pixel-art office of every Claude Code session. Two ways to look at it:

- **The office app**, in your browser: a living scene. People walk between their desk, the library, the studio and the café; subagents work at the meeting table and bring their results over; the manager does the rounds; there is a cat. One command runs it. It can also mirror itself to your own password-protected Vercel page.
- **The pane**, inside the Claude Code desktop app: a still picture of the same office beside the chat, redrawn as things happen.

Both are fed by **the mod**, a Claude Code plugin that runs in every session and publishes what that session is doing to a file on your machine. Nothing leaves your computer unless you set up the mirror.

![The office app: the manager's office, the meeting room, the library, the studio and the café on the left; rooms of desks, one per session, on the right](docs/office.png)

## 1. Install the mod

At the prompt of a terminal session:

```
/plugin install pixel-hq --marketplace boz1997/pixel-hq
```

Answer `y` to add the marketplace, then pick a scope (user is first).

From a shell:

```
claude plugin install pixel-hq --marketplace boz1997/pixel-hq
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `boz1997/pixel-hq`, then Add plugin.

Every session that should have a desk needs the mod loaded, so install it at the user scope and restart the sessions that were already open. The pane opens in each session; close it and it stays closed for that session, `/hq` opens it again.

## 2. Run the office app

```
npx github:boz1997/pixel-hq
```

(or `node bin/pixel-hq.js` in a clone). It starts at http://localhost:4747 and opens your browser. `--port 5000` picks another port, `--no-open` keeps the browser closed.

What you see:

- **Rooms** follow your sidebar: one per custom group, in the sidebar's order, then PINNED and a LOBBY for ungrouped sessions. Every session has a desk; the gold frame is the one you picked.
- **People** are sessions. At the desk while the session works (the screen shows code, a terminal, a document after the tool in use, and a speech bubble says what it is doing); in the **library** while it browses the web; in the **studio** while it makes images, pages or designs; at the **café** when it has been idle for a while, chatting; off to the **WC** now and then. A session that waits for your permission or your answer bounces with a `!`; a finished turn shows a `✓`. A session nobody is in has an empty chair with a coat on it. New sessions walk in through the entrance; closed ones walk out.
- **Subagents** sit at the meeting table while they work, then carry their paper to their session's desk and leave.
- **The manager** says how the office is doing, keeps the CONTEXT and USAGE boards and a bin that fills with the picked session's context. The windows follow the time of day.
- **Click** a person or a desk for the session: its state, its subagents, its last twenty tool calls, and a button that opens it in Claude.

## 3. Mirror it on Vercel (optional)

To see the office from another computer or your phone, run your own mirror. It is one page and one function; the state is pushed to it by the app running on your machine, so the mirror only shows what your machine sends.

1. Fork or clone this repository and deploy it: `vercel` in the folder, or the Vercel dashboard with the repository. The project needs no build.
2. In the Vercel dashboard, open the project's **Storage** tab and create a **Redis (Upstash)** store, connected to the project. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project.
3. Add the environment variable `PIXEL_HQ_PASSWORD` (any password you like) and redeploy.
4. On your machine, run the app with the mirror and its password:

```
npx github:boz1997/pixel-hq --push https://your-project.vercel.app --password your-password
```

The page at `https://your-project.vercel.app` asks for the password once per browser. The app sends the state only when it changed, at most every two seconds; the mirror holds the last state it got.

## Develop

- `hooks/`, `types/` and `.claude-plugin/` are the mod. `claude plugin validate <folder>` checks it; `tsc -p <folder>` type-checks it once a session has loaded it and laid `.claude-plugin/types/` beside it (TypeScript 5.4 or newer). To run the mod from its folder in every session, name the folder in `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`; `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` reloads it when a file changes.
- `app/` is the office app: `server.js` reads the mod's store files under `~/.claude/plugins/store/` and serves `public/`, where `office.js` is the whole scene (layout, walking, behaviour, drawing) and `sprites.js` the pixel art. No build step, no dependencies.
- `api/state.js` and `vercel.json` are the mirror.

## Notes

- Claude's orange mascot belongs to Anthropic; the people, furniture and rooms are original pixel art.
- The mod reads only what the desktop app tells it about your sessions and what each session's own copy publishes. The app reads that from your disk. Only the mirror, if you set one up, sends anything anywhere, and only to your own Vercel project.
- MIT licensed.
