# CLAUDE CODE COMMANDS — Slide Generation Spec

> Read BEFORE generating `claude-code-commands-excalidraw-slides.html`.

---

## Lesson Metadata

| Field | Value |
|-------|-------|
| **Code** | CLAUDE CODE COMMANDS |
| **Title** | Claude Code Commands |
| **Title (Split)** | Line 1: "Claude Code" / Line 2: "Commands" (accent on line 2) |
| **Subtitle** | Clawd / make it real |
| **Module** | 01 — Terminal fluency |
| **Duration** | 12 min |
| **Layer** | 1 — Everyday workflow |
| **Hook** | "109 commands ship with Claude Code. You will actually use 20." |
| **Closing** | The 20 essential commands cover the whole workflow — everything else is one `/help` away |

---

## Teaching Objective

Learner leaves knowing the 20 commands that cover the full Claude Code workflow (setup → task → parallel work → ship → recovery), understands the shape of the rest of the catalog (worth-knowing, useful-niche, aliases, removed, and the long tail), and can find any command they forget with `/help`. Tone: confident, practical, slightly playful — a tour of a well-organized toolbox. Pacing: ~35 seconds per content slide.

**Anchor phrase:** "Twenty commands cover the whole job — the other eighty-nine are one `/help` away." (repeated on slide 2 and slide 19)

---

## Content-First Brief

| Field | Answer |
|--------|--------|
| **Topic archetype** | tangible process — a command catalog organized as a workflow |
| **Hero moment** | Slide 7 (Parallel work): the four commands that turn one session into a fleet — `/tasks`, `/batch`, `/background`, `/subtask` — surfaced as a live flow plus a hand-drawn fleet illustration. This is the capability most people don't know exists. |
| **Audience's wrong assumption at entry** | "I need to memorize the whole command list to be productive." The deck corrects this: 20 commands cover the entire workflow; the rest are discoverable, niche, or skippable. |
| **Exclusion list** | BAR bar-chart (no metrics story), GL glass-code-window (no config/code to show), DP-LAY/DP-VIZ (no data story) |
| **Narrative arc type** | linear progression — the workflow order: setup → task → parallel → ship → recovery, then the full catalog |

**Novel component rule:** Signature visual is a set of four hand-drawn Excalidraw-rendered images (title fan-out, workflow map, fleet fan-out, catalog decomposition) rendered from `.excalidraw` JSON in the clawd palette and embedded as data URLs. The catalog patterns (FLOW+, PIPE, STG, P9, TERM, data-table, CHK, STAT) cover the remaining slides; the "useless list" slides use the data-table pattern with group rows — the honest way to show 65 commands without a wall of boxes.

---

## Narrative Arc

Derive acts from the topic's natural phases — not from a generic "intro → body → conclusion" template.

| Act | Title | Time range | What the audience experiences |
|-----|-------|------------|-------------------------------|
| 0 | Hook | 00:00–01:10 | The 109-vs-20 tension lands; the anchor phrase is set |
| 1 | The Essential 20 | 01:10–06:30 | Six workflow moments, each with its commands — the audience maps the list onto their own day |
| 2 | The Full Catalog | 06:30–10:00 | The rest of the 109: worth-knowing, useful-niche, aliases & removed, and the honest skip list |
| 3 | Close | 10:00–12:00 | Why 20 is enough, what to try next, anchor phrase repeated |

Divider slides mark act boundaries. Acts must reflect the topic's content phases, not template slots.

---

## Overlap Avoidance

| Already covered | Where | This lesson differs |
|-----------------|-------|---------------------|
| Claude Code docs "Commands" reference | code.claude.com/docs/en/commands | This deck is a curated workflow map, not a reference dump — it ranks and groups |
| `/help` output | In-session command menu | The deck explains *why* each command matters and when to reach for it |

**Key rule:** This is a trailer-to-deep-dive bridge: it names every command once with a one-line "what it does," and goes deep only on the 20 essentials. No command gets a full tutorial — that is what the docs and `/help` are for.

---

## Slide Map

| # | ID | Act | Type | Title | Key Content | Visual Pattern | Why Panel | Voiceover Beat | Speaker Notes | Budget (mm:ss) | Budget (ms) |
|---|----|-----|------|-------|-------------|----------------|-----------|----------------|---------------|----------------|-------------|
| 1 | title | 0 | Title | Claude Code Commands | 109 commands ship with Claude Code — this deck shows you the 20 that matter | slide--title + IMG title-hero | — | "Claude Code ships with 109 commands. This deck is the map." | Claude Code is a terminal coding agent with a large built-in command catalog. Most people use a handful of commands on repeat; this deck identifies those, then tours the rest of the catalog so nothing is a mystery. |  |  |
| 2 | hook | 0 | Hook Quote | Twenty commands cover the whole job | "Twenty commands cover the whole job — the other eighty-nine are one `/help` away." | slide--quote | — | "Let that sit: twenty commands, the whole job." | The quote overturns the assumption that productivity requires memorizing the catalog. The 20 essentials map onto the workflow every session follows: set up, work, parallelize, ship, recover. Everything else is discoverable on demand — which is exactly what `/help` is for. |  |  |
| 3 | act1-divider | 1 | Divider | Act 1 — The Essential 20 | Six workflow moments, each with its commands | DIV+ divider-act | — | "Act one: the twenty commands, in workflow order." | The essential commands are organized by when they appear in a session, not alphabetically. Each of the next six slides covers one workflow moment: setup, task control, context, parallel work, shipping, and recovery. |  |  |
| 4 | setup | 1 | Content | First session in a repo | `/init` generates a starter CLAUDE.md; `/memory` refines it; `/permissions` sets allow/ask/deny rules | FLOW setup-flow | — | "Three commands turn a blank repo into a guided workspace." | `/init` creates a starter CLAUDE.md so Claude knows the project's conventions from the first prompt. `/memory` edits those files and manages auto memory, so durable facts survive across sessions. `/permissions` controls which tools Claude may use without asking — the trust boundary of the session. Together they make the first session productive instead of exploratory. |  |  |
| 5 | task-control | 1 | Content | Steering the work | `/plan` enters plan mode before big changes; `/model` and `/effort` tune the engine | STG stage-card | — | "Plan first, then pick the engine and how hard it thinks." | `/plan` switches into plan mode so Claude researches and proposes before editing — the right move for large changes. `/model` switches the model mid-session and saves the choice as default. `/effort` sets reasoning effort from low to xhigh, trading latency for depth. The three form a control panel: what to do, who does it, how hard to think. |  |  |
| 6 | context | 1 | Content | Managing the context window | `/context` shows what fills the window; `/compact` summarizes to free space; `/btw` asks side questions without polluting history; `/goal` keeps Claude working across turns | PIPE pipeline-vertical | — | "The context window is the session's memory — four commands keep it honest." | `/context` visualizes context usage as a grid so you can see what is consuming the window. `/compact` summarizes the conversation so far, freeing space while keeping the thread. `/btw` asks a side question that does not enter the conversation history. `/goal` sets a condition Claude keeps working toward across turns. Together they manage the session's most precious resource: the window. |  |  |
| 7 | parallel | 1 | Content | Run work in parallel | `/tasks` lists background work; `/batch` decomposes a change into parallel worktree units; `/background` detaches the session; `/subtask` hands a side task to a forked subagent | FLOW+ live-flow + IMG fleet | "This is the capability most people discover last — and it changes everything." | "Four commands turn one session into a fleet." | Claude delegates side tasks to subagents, and `/tasks` lists that background work including finished runs. `/batch` decomposes a large change into 5–30 independent units, each running in its own git worktree with its own PR. `/background` detaches the whole session so it keeps running while the terminal is freed. `/subtask` spawns a forked subagent that inherits the conversation and reports back. The flow: one session fans out, monitors, and collects. |  |  |
| 8 | ship | 1 | Content | Before you ship | `/diff` shows changes; `/code-review` finds bugs and can fix them; `/security-review` scans for vulnerabilities; `/simplify` applies cleanup | P9 compare-paradigm | — | "Four commands between you and a merge — each one a different lens." | `/diff` opens an interactive viewer of uncommitted changes and per-turn diffs. `/code-review` reviews the current diff for correctness bugs and can apply findings with `--fix`. `/security-review` analyzes the branch diff for injection, auth, and data-exposure risks. `/simplify` runs four parallel review agents looking for cleanup opportunities and applies them. The comparison: review for correctness, review for security, review for cleanliness — three different questions, three different commands. |  |  |
| 9 | recovery | 1 | Content | Between sessions | `/resume` returns to an earlier conversation; `/rewind` rolls code and conversation back to a checkpoint | TERM terminal-window | — | "Sessions end — these two make sure nothing ends with them." | `/resume` reopens a conversation by ID or name from the session picker, so interrupted work continues with full context. `/rewind` rolls the conversation and code back to a checkpoint, or summarizes from a selected message — the undo for both the chat and the files. Together they make sessions cheap to start and safe to abandon. |  |  |
| 10 | act2-divider | 2 | Divider | Act 2 — The Full Catalog | The other 89 commands, honestly sorted | DIV+ divider-act | — | "Act two: the rest of the catalog, sorted so you can ignore it safely." | The remaining 89 commands fall into four buckets: worth-knowing (8), useful-niche (9), aliases and removed (7), and the honest skip list (65). The next four slides cover each bucket. |  |  |
| 11 | worth-knowing | 2 | Content | Worth knowing | `/config`, `/debug`, `/help`, `/hooks`, `/mcp`, `/plugin`, `/skills`, `/verify` — eight commands that earn their place in your muscle memory | data-table | — | "Eight commands that are genuinely useful — just not daily." | `/config` opens settings and accepts `key=value` pairs. `/debug` enables session debug logging and reads the log. `/help` shows all available commands — the catalog's own index. `/hooks` views hook configurations for tool events. `/mcp` manages MCP server connections and OAuth. `/plugin` manages plugins with subcommands like `list` and `install`. `/skills` lists available skills with token counts. `/verify` confirms a change works by building and running the app rather than trusting tests. Each solves a real problem; none is needed every day. |  |  |
| 12 | useful-niche | 2 | Content | Useful, but niche | `/clear`, `/doctor`, `/usage`, `/fork`, `/branch`, `/run`, `/deep-research`, `/export`, `/fewer-permission-prompts` — great tools for specific moments | data-table | — | "Nine commands that are excellent — when the moment calls for them." | `/clear` starts a fresh conversation while keeping project memory. `/doctor` runs a setup checkup that diagnoses and can fix installation issues. `/usage` shows session cost and plan limits. `/fork` copies the conversation into a new background session. `/branch` creates a branch of the conversation to try a different direction. `/run` launches and drives the project's app to see a change working. `/deep-research` fans out web searches and synthesizes a cited report. `/export` writes the conversation to a text file. `/fewer-permission-prompts` scans transcripts and builds an allowlist to reduce prompts. Each is a power tool for a specific situation. |  |  |
| 13 | aliases-removed | 2 | Content | Aliases & the removed | `/cost`→`/usage`, `/stats`→`/usage`, `/review`→`/code-review`, `/ultrareview`→`/code-review`; removed: `/pr-comments`, `/ultraplan`, `/vim` | data-table | — | "Four aliases, three ghosts — know them so they never confuse you." | Four commands are aliases: `/cost` and `/stats` both point to `/usage`, and `/review` and `/ultrareview` both point to `/code-review`. Three commands were removed from the CLI: `/pr-comments` (ask Claude directly), `/ultraplan` (use plan mode), and `/vim` (use `/config` → Editor mode). Knowing the aliases prevents double-learning; knowing the removals prevents typing dead commands. |  |  |
| 14 | skip-list-1 | 2 | Content | The skip list — session & setup | 33 commands you can safely ignore: session-context (15) + setup-config (18) | data-table | — | "Thirty-three commands that sound useful and mostly aren't — here's the honest list." | The first half of the skip list covers session and setup commands. Session-context: `/add-dir`, `/autocompact`, `/cd`, `/copy`, `/exit`, `/fast`, `/focus`, `/recap`, `/remote-control`, `/rename`, `/status`, `/stop`, `/teleport`, `/tui`, `/voice`. Setup-config: `/agents`, `/artifacts`, `/auto-mode-setup`, `/autofix-pr`, `/color`, `/ide`, `/import`, `/keybindings`, `/list-agents`, `/login`, `/logout`, `/reload-plugins`, `/reload-skills`, `/sandbox`, `/scroll-speed`, `/statusline`, `/terminal-setup`, `/theme`. None are wrong — they are just rarely the difference between a good session and a great one. |  |  |
| 15 | skip-list-2 | 2 | Content | The skip list — platform & extras | 32 commands for platforms, marketing, and one-off chores: platform (23) + review-ship (6) + parallel-auto (3) | data-table | — | "The second half: platform integrations, feedback loops, and scheduled extras." | The second half of the skip list. Platform: `/advisor`, `/chrome`, `/claude-api`, `/dataviz`, `/design-login`, `/design-sync`, `/desktop`, `/heapdump`, `/install-github-app`, `/install-slack-app`, `/mobile`, `/passes`, `/powerup`, `/privacy-settings`, `/radio`, `/rate-limit-options`, `/remote-env`, `/setup-bedrock`, `/setup-vertex`, `/stickers`, `/upgrade`, `/usage-credits`, `/web-setup`. Review-ship: `/bug`, `/feedback`, `/insights`, `/release-notes`, `/run-skill-generator`, `/team-onboarding`. Parallel-auto: `/loop`, `/schedule`, `/workflows`. These exist for specific platforms, plans, or moments — knowing they exist is enough. |  |  |
| 16 | act3-divider | 3 | Divider | Act 3 — Make it yours | From catalog to habit | DIV+ divider-act | — | "Act three: what to actually do with this map." | The catalog is a map, not a syllabus. The closing act turns the map into three concrete next steps and one repeated anchor. |  |  |
| 17 | why-20 | 3 | Content | Why 20 is enough | 6 workflow moments × 3–4 commands each; 89 more are one `/help` away | STAT stats-row + IMG catalog + WHY | "The catalog is discoverable — the workflow is not." | "Six moments, twenty commands, one complete workflow." | The 20 essentials cover setup (3), task control (3), context (4), parallel work (4), shipping (4), and recovery (2). The remaining 89 commands are either worth-knowing (8), useful-niche (9), aliases (4), removed (3), or skippable (65) — and every single one is listed by `/help`. The workflow is the hard-won part; the catalog is just an index. |  |  |
| 18 | next-steps | 3 | Content | Try this week | Run `/init` in a real repo; use `/plan` before your next big change; try `/batch` on a multi-file task; run `/code-review` before your next merge | CHK checklist | — | "Four experiments, one week — that is the whole course." | Each item is a testable condition: `/init` passes when a CLAUDE.md appears in a repo you actually work in. `/plan` passes when you enter plan mode before a large change and approve a proposal. `/batch` passes when a multi-file task decomposes into parallel worktree units. `/code-review` passes when a diff gets reviewed before a merge. An unchecked item costs nothing but a missed habit — so the week is low-stakes and high-yield. |  |  |
| 19 | closing | 3 | Closing Quote | Twenty commands cover the whole job | "Twenty commands cover the whole job — the other eighty-nine are one `/help` away." | slide--quote | — | "Same words as the opening — now they mean something different." | The anchor phrase returns with new weight: at the start it was a promise, now it is a verified map. The 20 essentials cover the workflow; the catalog is indexed by `/help`; the skip list is permission to ignore the rest. The immediate next action is the four-item checklist from the previous slide. |  |  |

---

## Glossary (optional)

| Key | Title | Body |
|-----|-------|------|
| CLAUDE.md | Project memory file | A markdown file in the repo root that tells Claude the project's conventions, commands, and constraints. `/init` generates a starter; `/memory` edits it. |
| subagent | Background worker | A separate Claude instance that works on a delegated task and reports back. `/tasks` lists them; `/subtask` spawns one. |
| worktree | Isolated working copy | A separate checkout of the repo where a `/batch` unit can edit and test without touching your working tree. |
| context window | Session memory | The token budget Claude can see in a session. `/context` visualizes it; `/compact` frees space in it. |
| MCP | Model Context Protocol | A standard for connecting Claude to external tools and data servers. `/mcp` manages those connections. |

---

## Evidence Data

| Fact | Source |
|-------|--------|
| 109 commands in the built-in catalog | code.claude.com/docs/en/commands (fetched 2026-08-27) |
| 20 essential commands cover setup → task → parallel → ship → recovery | This deck's curation |
| 8 worth-knowing: config, debug, help, hooks, mcp, plugin, skills, verify | Official commands table |
| 9 useful-niche: clear, doctor, usage, fork, branch, run, deep-research, export, fewer-permission-prompts | Official commands table |
| 4 aliases: cost→usage, stats→usage, review→code-review, ultrareview→code-review | Official commands table |
| 3 removed: pr-comments (v2.1.91), ultraplan, vim (v2.1.92) | Official commands table |
| 65 skippable commands across session-context, setup-config, platform, review-ship, parallel-auto | Official commands table |
| `/help` lists every available command | Official commands table |

---

## Design Directives

### Palette

No token overrides — the clawd theme (warm paper, graphite text, burnt-orange accent) is the deck's identity. Terminal-window and data-table components use the theme's built-in `--term-bg`/`--code-bg` tokens. Excalidraw images are rendered with `viewBackgroundColor: #f4ede2` matching the theme background so they sit flush on slides.

### Color semantics budget

| Color token | Semantic role in this deck |
|-------------|---------------------------|
| `--accent` (burnt orange) | The 20 essential commands — every command name in the essential slides renders in accent |
| `--gold` | Worth-knowing and useful-niche commands — the "learn these next" tier |
| `--green` | Aliases and removed commands — the "resolved" tier (aliases point to a target; removed commands are settled) |
| `--red` | The skip list — commands you can safely ignore |
| `--text-dim` | Explanatory copy and table body text |

Omit rows that this deck does not use. Adding colors not in this budget requires a justification comment in the HTML.

### Signature visual (HERO slide)

Slide 7 (Parallel work) pairs the **FLOW+ live-flow** (four nodes `/tasks` → `/batch` → `/background` → `/subtask`, animated phase spotlighting) with the hand-drawn **fleet** Excalidraw image showing one session fanning out into a fleet. Slide 1 carries the **title-hero** image, slide 3-or-4 the **workflow** map, and slide 17 the **catalog** decomposition. All four images are rendered from `.excalidraw` JSON in the clawd palette.

### Tone

Tutorial with a light touch — confident, practical, slightly playful. The deck is a tour of a well-organized toolbox, not a lecture.

---

*Spec format: premium-presentations compatible*