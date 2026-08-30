/* --- Command detail modal (deck-local) --- */
(function () {
  var CMD_DETAILS = {
  "add-dir": { what: "Add a working directory for file access during the current session. Type a partial path to see matching directory suggestions; press `Tab` to accept one.", when: null, example: null, tier: "Skip list" },
  "advisor": { what: "Enable or disable the advisor tool, which consults a second model for guidance at key moments during a task. Accepts `fable`, `opus`, `sonnet`, or a full model ID.", when: null, example: null, tier: "Skip list" },
  "agents": { what: "As of v2.1.198, running `/agents` prints a reminder to ask Claude to create or manage subagents, or to edit `.claude/agents/` or `~/.claude/agents/` directly.", when: null, example: null, tier: "Skip list" },
  "artifacts": { what: "List the artifacts you own or that are shared with you, then attach one to the session, open it in your browser, or copy its link. Available where artifacts are.", when: null, example: null, tier: "Skip list" },
  "auto-mode-setup": { what: "Draft `autoMode.environment` entries from your project and recent sessions, then review the draft and save it to your user settings.", when: null, example: null, tier: "Skip list" },
  "autocompact": { what: "Set the auto-compact window: how full the context window gets before Claude Code compacts automatically.", when: null, example: null, tier: "Skip list" },
  "autofix-pr": { what: "Spawn a Claude Code on the web session that watches the current branch's PR and pushes fixes when CI fails or reviewers leave comments.", when: null, example: null, tier: "Skip list" },
  "background": { what: "Detaches the session to run as a background agent, freeing your terminal.", when: "Use for long runs you don't need to watch.", example: "/background “finish the migration” — monitor with claude agents.", tier: "Essential 20" },
  "batch": { what: "Decomposes a large change into 5–30 independent units, each in its own git worktree with its own PR.", when: "Use for big refactors that would otherwise be one giant, risky change.", example: "/batch migrate src/ from JavaScript to TypeScript.", tier: "Essential 20" },
  "branch": { what: "Creates a branch of the conversation at this point and switches into it.", when: "Use to try a different direction without losing the original.", example: "/branch “try the simpler approach” — return with /resume.", tier: "Useful, but niche" },
  "btw": { what: "Asks a side question that does not enter the conversation history.", when: "Use for quick clarifications that shouldn't pollute the task context.", example: "/btw what's the difference between X and Y?", tier: "Essential 20" },
  "bug": { what: "Report a bug or share your conversation. You choose how much session history to include and confirm on a consent screen before anything is sent.", when: null, example: null, tier: "Skip list" },
  "cd": { what: "Move this session to a new working directory, keeping the conversation and its prompt cache. Type a partial path to see matching directory suggestions; press `Tab` to accept one.", when: null, example: null, tier: "Skip list" },
  "chrome": { what: "Configure Claude in Chrome settings", when: null, example: null, tier: "Skip list" },
  "claude-api": { what: "**Skill.** Load Claude API and Managed Agents reference material for your project's language.", when: null, example: null, tier: "Skip list" },
  "clear": { what: "Starts a new conversation with empty context, keeping project memory.", when: "Use between tasks; label the old one for /resume.", example: "/clear “next task” names the previous session in the picker.", tier: "Useful, but niche" },
  "code-review": { what: "Reviews the current diff (or a PR number, branch, or path) for correctness bugs; --fix applies findings.", when: "Use before merge — the correctness gate.", example: "/code-review high 1234 reviews PR #1234; /code-review --fix applies findings.", tier: "Essential 20" },
  "color": { what: "Set the prompt bar color for the current session. Available colors: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`.", when: null, example: null, tier: "Skip list" },
  "compact": { what: "Summarizes the conversation so far to free context while keeping the thread.", when: "Use when the window is full but the task isn't done.", example: "/compact “keep the auth requirements” focuses the summary.", tier: "Essential 20" },
  "config": { what: "Opens the Settings interface, or sets settings directly with key=value pairs.", when: "Use for theme, model, output style, and other preferences.", example: "/config theme=dark or /config thinking=false.", tier: "Worth knowing" },
  "context": { what: "Visualizes context usage as a colored grid with optimization suggestions.", when: "Run it when responses start degrading or you're unsure what's eating the window.", example: "/context shows the grid; /context all expands the per-item breakdown.", tier: "Essential 20" },
  "copy": { what: "Copy the last assistant response to clipboard. Pass a number `N` to copy the Nth-latest response: `/copy 2` copies the second-to-last.", when: null, example: null, tier: "Skip list" },
  "cost": { what: "Alias for /usage — session cost and plan limits.", when: "Use interchangeably with /usage.", example: "/cost ≡ /usage.", tier: "Alias of /usage" },
  "dataviz": { what: "**Skill.** Design guidance for charts, graphs, and dashboards.", when: null, example: null, tier: "Skip list" },
  "debug": { what: "Enables session debug logging and troubleshoots by reading the session debug log.", when: "Use when something is failing and you need the log.", example: "/debug “why is the tool failing” starts capturing from that point.", tier: "Worth knowing" },
  "deep-research": { what: "Fans out web searches on a question, cross-checks sources, and synthesizes a cited report.", when: "Use for questions that need current, sourced answers.", example: "/deep-research “RAG vs graph databases 2026”.", tier: "Useful, but niche" },
  "design-login": { what: "Authorize design-system access for `/design-sync` with your claude.ai account", when: null, example: null, tier: "Skip list" },
  "design-sync": { what: "**Skill.** Convert your repo's React design system and upload it to Claude Design, so designs it produces use your real components.", when: null, example: null, tier: "Skip list" },
  "desktop": { what: "Continue the current session in the Claude Code Desktop app. Requires macOS or x64 Windows and a Claude subscription. Alias: `/app`", when: null, example: null, tier: "Skip list" },
  "diff": { what: "Opens an interactive diff viewer of uncommitted changes and per-turn diffs.", when: "Use before committing to see exactly what changed.", example: "/diff → arrow through files, Enter to inspect, Esc to return.", tier: "Essential 20" },
  "doctor": { what: "Runs a setup checkup that diagnoses installation and configuration issues and can fix them.", when: "Use when things feel broken: PATH, duplicates, stale settings.", example: "/doctor reports findings first, then asks before changing anything.", tier: "Useful, but niche" },
  "effort": { what: "Sets reasoning effort from low to xhigh (or auto/status).", when: "Low = fast and cheap; xhigh = deep. Dial it per task.", example: "/effort high before a concurrency review; /effort low for mechanical edits.", tier: "Essential 20" },
  "exit": { what: "Exit the CLI. In an attached background session, this detaches and the session keeps running. Alias: `/quit`", when: null, example: null, tier: "Skip list" },
  "export": { what: "Exports the current conversation as plain text.", when: "Use to save a session for later or share it.", example: "/export notes.md writes the file directly.", tier: "Useful, but niche" },
  "fast": { what: "Toggle fast mode on or off. Availability in non-interactive mode with `-p` is limited; see Toggle fast mode. Requires Claude Code v2.1.205 or later", when: null, example: null, tier: "Skip list" },
  "feedback": { what: "Send product feedback about Claude Code. Opens the same dialog as `/bug`, with the same consent step, sending rules, and mid-turn behavior.", when: null, example: null, tier: "Skip list" },
  "fewer-permission-prompts": { what: "Scans transcripts for common read-only tool calls and builds a prioritized allowlist.", when: "Use when permission prompts are slowing you down.", example: "/fewer-permission-prompts → review the draft, save to settings.", tier: "Useful, but niche" },
  "focus": { what: "Toggle the focus view, which shows only your last prompt, a one-line tool-call summary with edit diffstats, and the final response.", when: null, example: null, tier: "Skip list" },
  "fork": { what: "Copies the conversation into a new background session while you keep working here.", when: "Use to spin off research or a parallel track.", example: "/fork “continue this research” starts the copy immediately.", tier: "Useful, but niche" },
  "goal": { what: "Sets a condition Claude keeps working toward across turns.", when: "Use for long-running objectives that span many prompts.", example: "/goal “all tests pass” — Claude keeps going until green.", tier: "Essential 20" },
  "heapdump": { what: "Write a JavaScript heap snapshot and a memory breakdown to `~/Desktop`, or your home directory on Linux without a Desktop folder, for diagnosing high memory usage.", when: null, example: null, tier: "Skip list" },
  "help": { what: "Shows help and every available command — the catalog's own index.", when: "Use whenever you forget a command; it's the deck's promise.", example: "/help lists everything, filterable as you type.", tier: "Worth knowing" },
  "hooks": { what: "Views hook configurations for tool events.", when: "Use to see what runs automatically around tool calls.", example: "/hooks shows PreToolUse/PostToolUse and more.", tier: "Worth knowing" },
  "ide": { what: "Manage IDE integrations and show status", when: null, example: null, tier: "Skip list" },
  "import": { what: "Bring configuration from other coding agents on your machine, currently OpenAI Codex and Google Gemini CLI, into Claude Code, including instruction files, MCP servers, commands, su…", when: null, example: null, tier: "Skip list" },
  "init": { what: "Generates a starter CLAUDE.md so Claude knows your project's conventions from the first prompt.", when: "Run it once per repo — it turns a generic assistant into one that knows your build, test, and style commands.", example: "/init in a fresh checkout writes CLAUDE.md with your project's structure and commands.", tier: "Essential 20" },
  "insights": { what: "Generate an HTML report analyzing your recent sessions on this machine: which projects you work in, how you use Claude Code, where things go wrong, and features to try.", when: null, example: null, tier: "Skip list" },
  "install-github-app": { what: "Install the Claude GitHub App for a repository, with an optional step to set up GitHub Actions workflows and secrets.", when: null, example: null, tier: "Skip list" },
  "install-slack-app": { what: "Install the Claude Slack app. Opens a browser to complete the OAuth flow", when: null, example: null, tier: "Skip list" },
  "keybindings": { what: "Open your keyboard shortcuts file", when: null, example: null, tier: "Skip list" },
  "list-agents": { what: "List the subagents, agent team teammates, and other Claude Code sessions Claude can message, with the name to use for each. See cross-session messaging.", when: null, example: null, tier: "Skip list" },
  "login": { what: "Sign in to your Anthropic account", when: null, example: null, tier: "Skip list" },
  "logout": { what: "Sign out from your Anthropic account", when: null, example: null, tier: "Skip list" },
  "loop": { what: "**Skill.** Run a prompt repeatedly while the session stays open. Omit the interval and, where available, Claude self-paces between iterations.", when: null, example: null, tier: "Skip list" },
  "mcp": { what: "Manages MCP server connections and OAuth authentication.", when: "Use to connect external tools and data servers.", example: "/mcp reconnect my-server, or /mcp enable all.", tier: "Worth knowing" },
  "memory": { what: "Edits CLAUDE.md files, toggles auto memory, and shows auto-memory entries.", when: "Use it to refine what Claude remembers about you and the project across sessions.", example: "/memory to add “always run pnpm test before pushing” to project memory.", tier: "Essential 20" },
  "mobile": { what: "Show QR code to download the Claude mobile app. Aliases: `/ios`, `/android`", when: null, example: null, tier: "Skip list" },
  "model": { what: "Switches the AI model mid-session and saves it as your default.", when: "Use when a task needs a stronger model or a cheaper, faster one.", example: "/model sonnet, or /model to open the picker.", tier: "Essential 20" },
  "passes": { what: "Share a free week of Claude Code with friends. Only visible if your account is eligible", when: null, example: null, tier: "Skip list" },
  "permissions": { what: "Manages allow, ask, and deny rules for tool permissions.", when: "Set it once per project so read-only commands run without prompts while destructive ones still ask.", example: "/permissions → allow git status, ask for rm -rf.", tier: "Essential 20" },
  "plan": { what: "Enters plan mode: Claude researches and proposes before editing anything.", when: "Use before large changes so the approach is agreed before code moves.", example: "/plan fix the auth bug → Claude investigates, proposes, you approve.", tier: "Essential 20" },
  "plugin": { what: "Manages Claude Code plugins: list, install, enable, disable.", when: "Use to extend the CLI with marketplace plugins.", example: "/plugin install, /plugin list.", tier: "Worth knowing" },
  "powerup": { what: "Discover Claude Code features through quick interactive lessons with animated demos", when: null, example: null, tier: "Skip list" },
  "pr-comments": { what: "Removed in v2.1.91 — ask Claude directly to view PR comments instead.", when: "Don't type it; it's gone.", example: "Ask: “what comments are on this PR?”", tier: "Removed" },
  "privacy-settings": { what: "View and update your privacy settings. Only available for Pro and Max plan subscribers", when: null, example: null, tier: "Skip list" },
  "radio": { what: "Open Claude FM lo-fi radio in your browser. Prints the stream URL when no browser is available.", when: null, example: null, tier: "Skip list" },
  "rate-limit-options": { what: "Show ways to keep working when a claude.ai usage limit blocks a request: wait and continue automatically when the limit resets, add usage credits, or upgrade your plan.", when: null, example: null, tier: "Skip list" },
  "recap": { what: "Generate a one-line summary of the current session on demand. See Session recap for the automatic recap that appears after you've been away", when: null, example: null, tier: "Skip list" },
  "release-notes": { what: "View the changelog in an interactive version picker. Select a specific version to see its release notes, or choose to show all versions.", when: null, example: null, tier: "Skip list" },
  "reload-plugins": { what: "Reload all active plugins to apply pending changes without restarting. Reports counts for each reloaded component and flags any load errors.", when: null, example: null, tier: "Skip list" },
  "reload-skills": { what: "Re-scan skill and command directories so skills added or changed on disk during the session become available without restarting.", when: null, example: null, tier: "Skip list" },
  "remote-control": { what: "Make this session available for Remote Control from claude.ai.", when: null, example: null, tier: "Skip list" },
  "remote-env": { what: "Choose the default environment for cloud agents", when: null, example: null, tier: "Skip list" },
  "rename": { what: "Rename the current session and show the name on the prompt bar. Without a name, auto-generates one from conversation history. Also available in non-interactive mode (`-p`);", when: null, example: null, tier: "Skip list" },
  "resume": { what: "Reopens a conversation by ID or name from the session picker.", when: "Use to continue interrupted work with full context.", example: "/resume → pick “fix auth bug” from the list.", tier: "Essential 20" },
  "review": { what: "Alias for /code-review — same effort levels and flags.", when: "Use whichever you remember.", example: "/review 1234 ≡ /code-review 1234.", tier: "Alias of /code-review" },
  "rewind": { what: "Rolls the conversation and/or code back to a checkpoint, or summarizes from a selected message.", when: "The undo for both the chat and the files.", example: "/rewind → pick checkpoint 3, files and conversation restore.", tier: "Essential 20" },
  "run": { what: "Launches and drives your project's app to see a change working.", when: "Use to smoke-test real behavior, not just tests.", example: "/run starts the app and exercises the changed flow.", tier: "Useful, but niche" },
  "run-skill-generator": { what: "**Skill.** Teach `/run` and `/verify` how to build, launch, and drive your project's app from a clean environment by writing a per-project skill", when: null, example: null, tier: "Skip list" },
  "sandbox": { what: "Toggle sandbox mode. Available on supported platforms only", when: null, example: null, tier: "Skip list" },
  "schedule": { what: "Create, update, list, or run routines, which execute in the cloud. Claude walks you through the setup conversationally. You can also ask about a routine's recent runs.", when: null, example: null, tier: "Skip list" },
  "scroll-speed": { what: "Adjust mouse wheel scroll speed interactively, with a ruler you can scroll while the dialog is open to preview the change.", when: null, example: null, tier: "Skip list" },
  "security-review": { what: "Analyzes the branch diff for injection, auth, and data-exposure risks.", when: "Use before merge on anything touching user input or secrets.", example: "/security-review on a branch that adds an API endpoint.", tier: "Essential 20" },
  "setup-bedrock": { what: "Configure Amazon Bedrock authentication, region, and model pins through an interactive wizard. Hidden from the command menu until `CLAUDE_CODE_USE_BEDROCK=1` is set;", when: null, example: null, tier: "Skip list" },
  "setup-vertex": { what: "Configure Google Cloud's Agent Platform authentication, project, region, and model pins through an interactive wizard.", when: null, example: null, tier: "Skip list" },
  "simplify": { what: "Runs four parallel review agents for cleanup: reuse, simplification, efficiency, abstraction level.", when: "Use after a feature lands to pay down cruft.", example: "/simplify after merging a feature branch.", tier: "Essential 20" },
  "skills": { what: "Lists available skills, filterable and sortable by token count.", when: "Use to see what skills are loaded and how much context they cost.", example: "/skills → press t to sort by tokens.", tier: "Worth knowing" },
  "stats": { what: "Alias for /usage, opening on the Stats tab.", when: "Use interchangeably with /usage.", example: "/stats ≡ /usage.", tier: "Alias of /usage" },
  "status": { what: "Open the Settings interface on the Status tab, showing version, model, account, and connectivity.", when: null, example: null, tier: "Skip list" },
  "statusline": { what: "Configure Claude Code's status line. Describe what you want, or run without arguments to auto-configure from your shell prompt", when: null, example: null, tier: "Skip list" },
  "stickers": { what: "Order Claude Code stickers", when: null, example: null, tier: "Skip list" },
  "stop": { what: "Stop the current background session. Only available while attached to a background session; the transcript and any worktree are kept.", when: null, example: null, tier: "Skip list" },
  "subtask": { what: "Spawns a forked subagent that inherits the full conversation and reports back.", when: "Use to hand off a side task without losing context.", example: "/subtask write tests for the new parser.", tier: "Essential 20" },
  "tasks": { what: "Lists background work in the session, including finished subagents.", when: "Use to check on parallel work without losing your place.", example: "/tasks shows each subagent's status and results.", tier: "Essential 20" },
  "team-onboarding": { what: "Generate a team onboarding guide from your Claude Code usage history.", when: null, example: null, tier: "Skip list" },
  "teleport": { what: "Pull a Claude Code on the web session into this terminal. Opens a picker, then fetches the branch and conversation. Also available as `/tp`. Requires a claude.ai subscription", when: null, example: null, tier: "Skip list" },
  "terminal-setup": { what: "Configure terminal keybindings for Shift+Enter and other shortcuts. Only visible in terminals that need it, like VS Code, Cursor, Devin Desktop, Alacritty, or Zed", when: null, example: null, tier: "Skip list" },
  "theme": { what: "Change the color theme. Includes an `auto` option that matches your terminal's light or dark background, light and dark variants, colorblind-accessible (daltonized) themes, ANSI th…", when: null, example: null, tier: "Skip list" },
  "tui": { what: "Set the terminal UI renderer and relaunch into it with your conversation intact. `fullscreen` enables the flicker-free alt-screen renderer.", when: null, example: null, tier: "Skip list" },
  "ultraplan": { what: "Removed — use plan mode instead.", when: "Plan mode does the research-then-propose loop now.", example: "/plan “design the migration”.", tier: "Removed" },
  "ultrareview": { what: "Alias for /code-review ultra — deep multi-agent cloud review.", when: "Use for the heaviest review; 3 free runs on Pro/Max.", example: "/ultrareview ≡ /code-review ultra.", tier: "Alias of /code-review" },
  "upgrade": { what: "Open the upgrade page in your browser to switch to a higher plan tier. When the browser fails to open, the command shows a sign-in prompt without printing the URL", when: null, example: null, tier: "Skip list" },
  "usage": { what: "Shows session cost, plan usage limits, and activity stats.", when: "Use to keep an eye on spend.", example: "/usage — /cost and /stats are aliases.", tier: "Useful, but niche" },
  "usage-credits": { what: "Configure usage credits, or request them from your admin, when you hit a limit.", when: null, example: null, tier: "Skip list" },
  "verify": { what: "Confirms a change works by building the app, running it, and observing the result.", when: "Use instead of trusting tests alone — proof, not type checks.", example: "/verify launches the app and drives the changed path.", tier: "Worth knowing" },
  "vim": { what: "Removed in v2.1.92 — toggle Vim mode via /config → Editor mode.", when: "Don't type it; it's gone.", example: "/config → Editor mode.", tier: "Removed" },
  "voice": { what: "Toggle voice dictation, or enable it in a specific mode. Requires a Claude.ai account", when: null, example: null, tier: "Skip list" },
  "web-setup": { what: "Connect your GitHub account to Claude Code on the web using your local `gh` CLI credentials. `/schedule` prompts for this automatically if GitHub isn't connected", when: null, example: null, tier: "Skip list" },
  "workflows": { what: "Open the workflow progress view to watch, pause, resume, or save running and completed workflows", when: null, example: null, tier: "Skip list" }
};

  var backdrop = document.createElement('div');
  backdrop.className = 'cmd-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML =
    '<div class="cmd-modal">' +
      '<button type="button" class="cmd-modal__close" aria-label="Close">&times;</button>' +
      '<p class="cmd-modal__cmd"></p>' +
      '<p class="cmd-modal__tier"></p>' +
      '<div class="cmd-modal__body"></div>' +
    '</div>';
  document.body.appendChild(backdrop);

  var modal = backdrop.querySelector('.cmd-modal');
  var closeBtn = backdrop.querySelector('.cmd-modal__close');
  var lastFocused = null;

  function open(cmd) {
    var d = CMD_DETAILS[cmd];
    if (!d) return;
    modal.querySelector('.cmd-modal__cmd').textContent = '/' + cmd;
    modal.querySelector('.cmd-modal__tier').textContent = d.tier;
    var body = modal.querySelector('.cmd-modal__body');
    var html = '';
    html += '<div class="cmd-modal__section"><h4>What it does</h4><p>' + d.what + '</p></div>';
    if (d.when) html += '<div class="cmd-modal__section"><h4>When to use it</h4><p>' + d.when + '</p></div>';
    if (d.example) html += '<div class="cmd-modal__section"><h4>Example</h4><div class="cmd-modal__example">' + d.example + '</div></div>';
    body.innerHTML = html;
    lastFocused = document.activeElement;
    backdrop.classList.add('is-open');
    closeBtn.focus();
  }

  function close() {
    backdrop.classList.remove('is-open');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest('.cmd-chip[data-cmd]');
    if (chip) {
      e.stopPropagation();
      open(chip.getAttribute('data-cmd'));
      return;
    }
    if (backdrop.classList.contains('is-open') && !modal.contains(e.target)) close();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && backdrop.classList.contains('is-open')) close();
  });

  closeBtn.addEventListener('click', close);
})();