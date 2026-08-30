## Slide 1 — Claude Code Commands

Claude Code is a terminal coding agent with a large built-in command catalog. Most people use a handful of commands on repeat; this deck identifies those, then tours the rest of the catalog so nothing is a mystery.

## Slide 2 — Hook

The quote overturns the assumption that productivity requires memorizing the catalog. The 20 essentials map onto the workflow every session follows: set up, work, parallelize, ship, recover. Everything else is discoverable on demand — which is exactly what /help is for.

## Slide 3 — Act 1 — The Essential 20

The essential commands are organized by when they appear in a session, not alphabetically. Each of the next six slides covers one workflow moment: setup, task control, context, parallel work, shipping, and recovery.

## Slide 4 — First session in a repo

/init creates a starter CLAUDE.md so Claude knows the project's conventions from the first prompt. /memory edits those files and manages auto memory, so durable facts survive across sessions. /permissions controls which tools Claude may use without asking — the trust boundary of the session. Together they make the first session productive instead of exploratory.

## Slide 5 — Steering the work

/plan switches into plan mode so Claude researches and proposes before editing — the right move for large changes. /model switches the model mid-session and saves the choice as default. /effort sets reasoning effort from low to xhigh, trading latency for depth. The three form a control panel: what to do, who does it, how hard to think.

## Slide 6 — Managing the context window

/context visualizes context usage as a grid so you can see what is consuming the window. /compact summarizes the conversation so far, freeing space while keeping the thread. /btw asks a side question that does not enter the conversation history. /goal sets a condition Claude keeps working toward across turns. Together they manage the session's most precious resource: the window.

## Slide 7 — Run work in parallel

Claude delegates side tasks to subagents, and /tasks lists that background work including finished runs. /batch decomposes a large change into 5–30 independent units, each running in its own git worktree with its own PR. /background detaches the whole session so it keeps running while the terminal is freed. /subtask spawns a forked subagent that inherits the conversation and reports back. The flow: one session fans out, monitors, and collects.

## Slide 8 — Before you ship

/diff opens an interactive viewer of uncommitted changes and per-turn diffs. /code-review reviews the current diff for correctness bugs and can apply findings with --fix. /security-review analyzes the branch diff for injection, auth, and data-exposure risks. /simplify runs four parallel review agents looking for cleanup opportunities and applies them. The comparison: review for correctness, review for security, review for cleanliness — three different questions, three different commands.

## Slide 9 — Between sessions

/resume reopens a conversation by ID or name from the session picker, so interrupted work continues with full context. /rewind rolls the conversation and code back to a checkpoint, or summarizes from a selected message — the undo for both the chat and the files. Together they make sessions cheap to start and safe to abandon.

## Slide 10 — Act 2 — The Full Catalog

The remaining 89 commands fall into four buckets: worth-knowing (8), useful-niche (9), aliases and removed (7), and the honest skip list (65). The next four slides cover each bucket.

## Slide 11 — Worth knowing

/config opens settings and accepts key=value pairs. /debug enables session debug logging and reads the log. /help shows all available commands — the catalog's own index. /hooks views hook configurations for tool events. /mcp manages MCP server connections and OAuth. /plugin manages plugins with subcommands like list and install. /skills lists available skills with token counts. /verify confirms a change works by building and running the app rather than trusting tests. Each solves a real problem; none is needed every day.

## Slide 12 — Useful, but niche

/clear starts a fresh conversation while keeping project memory. /doctor runs a setup checkup that diagnoses and can fix installation issues. /usage shows session cost and plan limits. /fork copies the conversation into a new background session. /branch creates a branch of the conversation to try a different direction. /run launches and drives the project's app to see a change working. /deep-research fans out web searches and synthesizes a cited report. /export writes the conversation to a text file. /fewer-permission-prompts scans transcripts and builds an allowlist to reduce prompts. Each is a power tool for a specific situation.

## Slide 13 — Aliases & the removed

Four commands are aliases: /cost and /stats both point to /usage, and /review and /ultrareview both point to /code-review. Three commands were removed from the CLI: /pr-comments (ask Claude directly), /ultraplan (use plan mode), and /vim (use /config → Editor mode). Knowing the aliases prevents double-learning; knowing the removals prevents typing dead commands.

## Slide 14 — The skip list — session & setup

The first half of the skip list covers session and setup commands. Session-context: /add-dir, /autocompact, /cd, /copy, /exit, /fast, /focus, /recap, /remote-control, /rename, /status, /stop, /teleport, /tui, /voice. Setup-config: /agents, /artifacts, /auto-mode-setup, /autofix-pr, /color, /ide, /import, /keybindings, /list-agents, /login, /logout, /reload-plugins, /reload-skills, /sandbox, /scroll-speed, /statusline, /terminal-setup, /theme. None are wrong — they are just rarely the difference between a good session and a great one.

## Slide 15 — The skip list — platform & extras

The second half of the skip list. Platform: /advisor, /chrome, /claude-api, /dataviz, /design-login, /design-sync, /desktop, /heapdump, /install-github-app, /install-slack-app, /mobile, /passes, /powerup, /privacy-settings, /radio, /rate-limit-options, /remote-env, /setup-bedrock, /setup-vertex, /stickers, /upgrade, /usage-credits, /web-setup. Review-ship: /bug, /feedback, /insights, /release-notes, /run-skill-generator, /team-onboarding. Parallel-auto: /loop, /schedule, /workflows. These exist for specific platforms, plans, or moments — knowing they exist is enough.

## Slide 16 — Act 3 — Make it yours

The catalog is a map, not a syllabus. The closing act turns the map into three concrete next steps and one repeated anchor.

## Slide 17 — Why 20 is enough

The 20 essentials cover setup (3), task control (3), context (4), parallel work (4), shipping (4), and recovery (2). The remaining 89 commands are either worth-knowing (8), useful-niche (9), aliases (4), removed (3), or skippable (65) — and every single one is listed by /help. The workflow is the hard-won part; the catalog is just an index.

## Slide 18 — Try this week

Each item is a testable condition: /init passes when a CLAUDE.md appears in a repo you actually work in. /plan passes when you enter plan mode before a large change and approve a proposal. /batch passes when a multi-file task decomposes into parallel worktree units. /code-review passes when a diff gets reviewed before a merge. An unchecked item costs nothing but a missed habit — so the week is low-stakes and high-yield.

## Slide 19 — Closing

The anchor phrase returns with new weight: at the start it was a promise, now it is a verified map. The 20 essentials cover the workflow; the catalog is indexed by /help; the skip list is permission to ignore the rest. The immediate next action is the four-item checklist from the previous slide.
