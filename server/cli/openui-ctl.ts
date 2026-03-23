#!/usr/bin/env bun

const BASE_URL = `http://${process.env.OPENUI_HOST || "localhost"}:${process.env.OPENUI_PORT || "6968"}`;

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`Error ${res.status}:`, data.error || data);
    process.exit(1);
  }
  return data;
}

function parseArgs(args: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

const [command, ...rest] = process.argv.slice(2);
const { positional, flags } = parseArgs(rest);

switch (command) {
  case "list-sessions": {
    const sessions = await api("GET", "/sessions");
    if (flags.json) {
      console.log(JSON.stringify(sessions, null, 2));
    } else {
      if (sessions.length === 0) {
        console.log("No active sessions.");
      } else {
        for (const s of sessions) {
          const name = s.customName || s.agentName || "unnamed";
          const status = s.status || "unknown";
          console.log(`${s.sessionId}  ${s.nodeId}  ${name}  [${status}]  ${s.cwd}`);
        }
      }
    }
    break;
  }

  case "create-agent": {
    const cwd = flags.cwd as string;
    if (!cwd) {
      console.error("Usage: openui-ctl create-agent --cwd <dir> [--name <n>] [--prompt <p>] [--remote <host>] [--team] [--worktree --repo <r> --branch <b>]");
      process.exit(1);
    }
    const nodeId = `node-${Date.now()}-0`;
    const body: any = {
      agentId: "claude",
      agentName: "Claude Code",
      command: "isaac",
      cwd,
      nodeId,
    };
    if (flags.name) body.customName = flags.name;
    if (flags.prompt) body.initialPrompt = flags.prompt;
    if (flags.remote) body.remote = flags.remote;
    if (flags.team) body.useTeam = true;
    if (flags.worktree) {
      body.createWorktree = true;
      if (flags.repo) body.branchName = flags.branch || `worktree-${Date.now()}`;
      // The server handles worktree creation via the repo/branch params
    }
    if (flags.branch) body.branchName = flags.branch;
    if (flags.category) body.categoryId = flags.category;

    const result = await api("POST", "/sessions", body);
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Created agent: sessionId=${result.sessionId} nodeId=${nodeId} cwd=${result.cwd}`);
    }
    break;
  }

  case "delete-session": {
    const sessionId = positional[0];
    if (!sessionId) {
      console.error("Usage: openui-ctl delete-session <sessionId>");
      process.exit(1);
    }
    await api("DELETE", `/sessions/${sessionId}`);
    console.log(`Deleted session ${sessionId}`);
    break;
  }

  case "update-session": {
    const sessionId = positional[0];
    if (!sessionId) {
      console.error("Usage: openui-ctl update-session <sessionId> [--name <n>] [--notes <n>] [--category <id>]");
      process.exit(1);
    }
    const updates: any = {};
    if (flags.name) updates.customName = flags.name;
    if (flags.notes) updates.notes = flags.notes;
    if (flags.category) updates.categoryId = flags.category;
    if (flags.color) updates.customColor = flags.color;

    await api("PATCH", `/sessions/${sessionId}`, updates);
    console.log(`Updated session ${sessionId}`);
    break;
  }

  case "send-message": {
    const sessionId = positional[0];
    const message = positional.slice(1).join(" ") || (flags.message as string);
    if (!sessionId || !message) {
      console.error("Usage: openui-ctl send-message <sessionId> <message>");
      process.exit(1);
    }
    await api("POST", `/sessions/${sessionId}/write`, { message });
    console.log(`Sent message to ${sessionId}`);
    break;
  }

  case "select-node": {
    const nodeId = positional[0];
    if (!nodeId) {
      console.error("Usage: openui-ctl select-node <nodeId>");
      process.exit(1);
    }
    await api("POST", "/ui/select-node", { nodeId });
    console.log(`Selected node ${nodeId}`);
    break;
  }

  case "list-categories": {
    const categories = await api("GET", "/categories");
    if (flags.json) {
      console.log(JSON.stringify(categories, null, 2));
    } else {
      if (categories.length === 0) {
        console.log("No categories.");
      } else {
        for (const c of categories) {
          console.log(`${c.id}  ${c.label}  ${c.color}`);
        }
      }
    }
    break;
  }

  default:
    console.log(`openui-ctl — CLI for OpenUI

Commands:
  list-sessions                                    List all active sessions
  create-agent --cwd <dir> [options]               Create a new agent session
    --name <name>       Custom name
    --prompt <prompt>   Initial prompt
    --remote <host>     Run on remote host
    --team              Enable team mode
    --category <id>     Category ID
    --branch <branch>   Git branch name
    --json              Output JSON
  delete-session <sessionId>                       Delete a session
  update-session <sessionId> [options]             Update session metadata
    --name <name>       Custom name
    --notes <notes>     Session notes
    --category <id>     Category ID
    --color <color>     Custom color
  send-message <sessionId> <message>               Send text to session terminal
  select-node <nodeId>                             Select a node in the UI
  list-categories                                  List all categories

Environment:
  OPENUI_HOST    Server host (default: localhost)
  OPENUI_PORT    Server port (default: 6968)
`);
    if (command) process.exit(1);
}
