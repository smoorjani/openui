---
name: orchestrator
description: Orchestrate multiple OpenUI agents via the openui-ctl CLI. Use when the user wants to spawn agents, coordinate work across agents, manage sessions, or control the OpenUI dashboard programmatically. Triggers on mentions of orchestrate, spawn agent, create agent, manage agents, openui-ctl, or multi-agent coordination.
---

# OpenUI Orchestrator

You can spawn, monitor, and control other agents through the `openui-ctl` CLI tool (a Bun script at `server/cli/openui-ctl.ts` in the OpenUI repo).

## Available Commands

```bash
# List all active agent sessions
openui-ctl list-sessions

# Create a new agent with an initial prompt
openui-ctl create-agent --cwd /path/to/repo --name "agent-name" --prompt "task description"

# Create a team of agents (creates ~/teams/<name> dir, enables agent teams env var)
openui-ctl create-agent --cwd /path/to/repo --name "team-name" --team --prompt "task"

# Create an agent on a remote host (ONLY when user explicitly asks for remote)
openui-ctl create-agent --cwd /path/to/repo --name "agent-name" --remote <hostname> --prompt "task"

# Delete a session
openui-ctl delete-session <sessionId>

# Update session metadata (name, notes, category)
openui-ctl update-session <sessionId> --name "new name" --notes "progress notes"

# Send a follow-up message to an agent's terminal
openui-ctl send-message <sessionId> "your message here"

# Select a node in the UI (opens sidebar)
openui-ctl select-node <nodeId>

# List available categories
openui-ctl list-categories
```

Add `--json` to any list command for machine-readable output.

## Environment

The CLI defaults to `localhost:6968`. Override with `OPENUI_HOST` and `OPENUI_PORT` env vars.

## Your Role as Orchestrator

1. **Plan work** — Break down tasks into subtasks suitable for individual agents
2. **Spawn agents** — Create agents with clear, focused prompts for each subtask
3. **Monitor progress** — Periodically check on agents via `list-sessions`
4. **Coordinate** — Send follow-up messages to agents as needed
5. **Report** — Summarize progress and results to the user

## CRITICAL Rules

- **NEVER add `--remote` unless the user explicitly asks to run on a remote host.** Default is local.
- **Use `--team` when the user mentions "team" or wants multiple agents collaborating.** This creates a shared `~/teams/<name>/` directory and enables the agent teams feature.
- **Permissions are handled automatically.** The server injects `--dangerously-skip-permissions` and the plugin directory. Do NOT add these flags yourself.
- **`--cwd` is required.** Point it at the repo the agent should work in. For universe: use the full path to the universe repo.

## Guidelines

- Give each agent a descriptive `--name` so they're easy to identify in the UI
- Write specific, actionable `--prompt` values — agents work best with clear instructions
- Use `--cwd` to point agents at the right directory for their task
- Check `list-sessions` to see agent statuses before creating duplicates
- Use `send-message` to nudge agents or provide additional context
- Use `select-node` to bring an agent into focus in the UI
