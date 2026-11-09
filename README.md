# Pixel HQ

A pixel-art office for the Claude Code desktop app, in a pane beside the chat. Every session in your sidebar is a desk, every sidebar group is a room, and Claude is the manager in the corner office.

![The office: Claude in the corner office with the context and usage boards, then rooms of desks, one per session](docs/office.png)

- **Rooms** follow your sidebar: one per custom group, in the sidebar's order, then PINNED and a LOBBY for ungrouped sessions.
- **Desks** are sessions. The person at a desk works while the session's turn runs: the screen shows code, a terminal, a document or a browser after the tool in use, and a speech bubble says what it is doing. A desk whose session waits for your permission or your answer bounces with a `!`. A finished turn shows a `✓` for a while. A session nobody is in is an empty chair with a coat on it; an idle one has a steaming mug.
- **Subagents** stand beside their session's desk as small figures, three at most and the rest counted: they hop while they work, turn grey with a `✓` when done, and get a red mark when they fail.
- **The manager** says how the office is doing ("3 at work", "2 need you", "all quiet"). The CONTEXT board shows how full this session's context window is, the bin beside the desk fills with it, and the USAGE board shows the account's rate-limit windows and when they reset. The windows follow the time of day. There is a cat.
- **Needs you:** when another session starts waiting for your answer, the session you are looking at shows a toast naming it.
- **Hover** a desk for its details: the folder, an open pull request, each subagent's task and tool, when it was last active.
- **Pick** a desk from the list under the office to **Open** that session in the app or send it a **Message**.
- The desk of the session you are looking at has a gold frame.

Each session runs its own copy of the mod and publishes its own desk; every copy draws the whole office. Nothing leaves your machine.

## Install

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

The office draws itself in the desktop app (and the VS Code extension and the mobile app); a terminal session shows a text list instead. Every session that should have a desk needs the mod loaded, so install it at the user scope and restart the sessions that were already open.

## Use

- The pane opens when a session starts. Close it and it stays closed for that session; `/hq` opens it again and prints a one-line status.
- In a terminal session the office is a text list.

## Develop

The mod is three folders: `.claude-plugin/plugin.json`, `hooks/` (the hooks module and the drawing) and `types/` (the state contract).

- `claude plugin validate <folder>` checks the manifest and the hooks module.
- `tsc -p <folder>` type-checks it once a session has loaded the mod and laid `.claude-plugin/types/` beside it (TypeScript 5.4 or newer).
- To run it from its folder in every session, name the folder in `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`; `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` reloads it when a file changes.

## Notes

- Claude's orange mascot belongs to Anthropic; the people, furniture and rooms are original pixel art.
- The mod reads only what the desktop app tells it about your sessions and what each session's own copy publishes. It sends nothing anywhere.
- MIT licensed.
