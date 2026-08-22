# Claude Code artifacts — content brief

## Audience and outcome

Developers who use Claude Code beyond one-off prompts. After the deck, they should be able to
predict when an artifact loads, what it changes, how scopes interact, what remains outside the
main context, and which inspection command proves the effective state.

## Central claim

Claude Code artifacts are extension points into different parts of the agent loop. The `.claude/`
directory is a filesystem map for project-scoped artifacts, with `~/.claude/` providing user scope;
these locations are not one universal precedence rule. The useful design questions are:

1. When does this artifact load?
2. Does it add context, tools, isolation, packaging, or deterministic control?
3. Who owns it and who receives it?
4. How can the effective result be inspected?

## Narrative spine

- Establish the extension layer around the core agent loop.
- Make context cost and compaction visible.
- Separate scope from precedence.
- Map the explicit `.claude/` tree: project instructions, settings, rules, skills, agents, workflows,
  and the root `.mcp.json`, alongside the user-level `~/.claude/` tree.
- Explain CLAUDE.md, auto memory, rules, and skills by loading behavior.
- Show additive, path-sensitive instruction discovery in a monorepo.
- Replace the settings flowchart with layered scalar resolution plus array and security exceptions.
- Explain skills, subagents, hooks, MCP, and plugins by the role each plays.
- Work one billing-file example across startup, file access, invocation, isolation, and events.
- End with a load-behavior × context-cost × trust decision model.

## Depth contract

Every conceptual frame includes:

- the mechanism;
- a concrete command- or repository-level example;
- evidence from current official documentation;
- the important boundary or exception;
- an inspection command or artifact.

## Visual treatment

- Four reviewed text-free raster scenes: extension-layer control room, monorepo city, layered
  settings still life, and guidance-versus-enforcement diorama.
- Non-sequential field, evidence, constellation, spotlight, and matrix compositions for the
  remaining concepts.
- One precise comparison frame for CLAUDE.md vs rules vs skills.
- One non-connector spotlight frame for the filesystem-oriented `.claude/` map and nested activation.
- No flow frame for settings precedence, scope, hierarchy, or priority.

## Sources

- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/claude-directory
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/mcp
