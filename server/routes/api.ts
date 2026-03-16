import { Hono } from "hono";
import type { Agent } from "../types";
import { sessions, createSession, deleteSession, resumeSession, injectPluginDir, getRemoteHost, sshExecAsync, REMOTE_HOSTS } from "../services/sessionManager";
import { loadState, saveState, savePositions, getDataDir } from "../services/persistence";
import {
  loadWorktreeConfig,
  saveWorktreeConfig,
  loadSettings,
  saveSettings,
} from "../services/worktreeConfig";

const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();
const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);
const logError = QUIET ? () => {} : console.error.bind(console);

export const apiRoutes = new Hono();

apiRoutes.get("/config", (c) => {
  return c.json({ launchCwd: LAUNCH_CWD, dataDir: getDataDir() });
});

// Browse directories for file picker (supports local and remote via SSH)
apiRoutes.get("/browse", async (c) => {
  const remote = c.req.query("remote");
  let path = c.req.query("path") || (remote ? "~" : LAUNCH_CWD);

  if (remote) {
    // Remote browsing via SSH
    try {
      // Resolve ~ and get absolute path
      // Use eval to allow ~ expansion, then cd to the result
      const resolveResult = await sshExecAsync(remote, `cd ${path.includes(" ") ? `"${path}"` : path} 2>/dev/null && pwd`);
      if (resolveResult.exitCode !== 0) {
        return c.json({ error: `Cannot access ${path}`, current: path }, 400);
      }
      const resolvedPath = resolveResult.stdout.trim();

      // List directories (exclude hidden)
      const lsResult = await sshExecAsync(remote, `find "${resolvedPath}" -maxdepth 1 -mindepth 1 -type d ! -name '.*' | sort`);
      const directories = lsResult.stdout.trim()
        .split("\n")
        .filter(Boolean)
        .map((fullPath: string) => ({
          name: fullPath.split("/").pop() || fullPath,
          path: fullPath,
        }));

      // Get parent
      const parentResult = await sshExecAsync(remote, `dirname "${resolvedPath}"`);
      const parentPath = parentResult.stdout.trim();

      return c.json({
        current: resolvedPath,
        parent: parentPath !== resolvedPath ? parentPath : null,
        directories,
      });
    } catch (e: any) {
      return c.json({ error: e.message, current: path }, 400);
    }
  }

  // Local browsing
  const { readdirSync } = await import("fs");
  const { join, resolve } = await import("path");
  const { homedir } = await import("os");

  if (path.startsWith("~")) {
    path = path.replace("~", homedir());
  }
  path = resolve(path);

  try {
    const entries = readdirSync(path, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = resolve(path, "..");

    return c.json({
      current: path,
      parent: parentPath !== path ? parentPath : null,
      directories,
    });
  } catch (e: any) {
    return c.json({ error: e.message, current: path }, 400);
  }
});

// Create a directory (supports local and remote via SSH)
apiRoutes.post("/mkdir", async (c) => {
  const { path, remote } = await c.req.json();
  if (!path) return c.json({ error: "path is required" }, 400);

  try {
    if (remote) {
      const result = await sshExecAsync(remote, `mkdir -p "${path}"`);
      if (result.exitCode !== 0) {
        return c.json({ error: result.stderr || "Failed to create directory" }, 400);
      }
    } else {
      const { mkdirSync } = await import("fs");
      const { resolve } = await import("path");
      const { homedir } = await import("os");
      let resolved = path.startsWith("~") ? path.replace("~", homedir()) : path;
      resolved = resolve(resolved);
      mkdirSync(resolved, { recursive: true });
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

apiRoutes.get("/agents", (c) => {
  const agents: Agent[] = [
    {
      id: "claude",
      name: "Claude Code",
      command: "isaac",
      description: "Anthropic's official CLI for Claude",
      color: "#F97316",
      icon: "sparkles",
    },
  ];
  return c.json(agents);
});

apiRoutes.get("/remotes", (c) => {
  return c.json(Object.keys(REMOTE_HOSTS));
});

apiRoutes.get("/sessions", (c) => {
  const sessionList = Array.from(sessions.entries()).map(([id, session]) => {
    return {
      sessionId: id,
      nodeId: session.nodeId,
      agentId: session.agentId,
      agentName: session.agentName,
      command: session.command,
      createdAt: session.createdAt,
      cwd: session.cwd,
      originalCwd: session.originalCwd, // Mother repo path when using worktrees
      gitBranch: session.gitBranch,
      status: session.status,
      customName: session.customName,
      customColor: session.customColor,
      notes: session.notes,
      isRestored: session.isRestored,
      remote: session.remote,
      categoryId: session.categoryId,
      sortOrder: session.sortOrder,
      dueDate: session.dueDate,
    };
  });
  return c.json(sessionList);
});

apiRoutes.get("/sessions/:sessionId/status", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  return c.json({ status: session.status, isRestored: session.isRestored });
});

apiRoutes.get("/state", (c) => {
  const state = loadState();
  const nodes = state.nodes.map(node => {
    const session = sessions.get(node.sessionId);
    return {
      ...node,
      status: session?.status || "disconnected",
      isAlive: !!session,
      isRestored: session?.isRestored,
    };
  }).filter(n => n.isAlive);
  return c.json({ nodes });
});

apiRoutes.post("/state/positions", async (c) => {
  const { positions } = await c.req.json();

  // Also update session positions in memory
  for (const [nodeId, pos] of Object.entries(positions)) {
    for (const [, session] of sessions) {
      if (session.nodeId === nodeId) {
        session.position = pos as { x: number; y: number };
        break;
      }
    }
  }

  // Save to disk
  savePositions(positions);
  return c.json({ success: true });
});

apiRoutes.post("/sessions", async (c) => {
  const body = await c.req.json();
  const {
    agentId,
    agentName,
    command,
    cwd,
    nodeId,
    customName,
    customColor,
    branchName,
    baseBranch,
    createWorktree: createWorktreeFlag,
    sparseCheckout,
    sparseCheckoutPaths,
    remote,
    initialPrompt,
    categoryId,
  } = body;

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const workingDir = cwd || LAUNCH_CWD;

  const result = createSession({
    sessionId,
    agentId,
    agentName,
    command,
    cwd: workingDir,
    nodeId,
    customName,
    customColor,
    branchName,
    baseBranch,
    createWorktreeFlag,
    sparseCheckout,
    sparseCheckoutPaths,
    remote,
    initialPrompt,
    categoryId,
  });

  saveState(sessions);
  return c.json({
    sessionId,
    nodeId,
    cwd: result.cwd,
    gitBranch: result.gitBranch,
    remote,
  });
});

apiRoutes.post("/sessions/:sessionId/restart", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  // Kill existing PTY if present (e.g. from failed auto-resume)
  // Null first so onExit guard sees a different PTY and skips auto-reconnect
  if (session.pty) {
    const oldPty = session.pty;
    session.pty = null;
    try { oldPty.kill(); } catch {}
  }

  // Reset reconnect counter — manual retry should get fresh attempts
  session.reconnectAttempts = 0;

  const success = await resumeSession(sessionId);
  if (!success) return c.json({ error: "Failed to resume session" }, 500);

  log(`\x1b[38;5;141m[session]\x1b[0m Restarted ${sessionId}`);
  return c.json({ success: true });
});

apiRoutes.patch("/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  const updates = await c.req.json();
  if (updates.customName !== undefined) session.customName = updates.customName;
  if (updates.customColor !== undefined) session.customColor = updates.customColor;
  if (updates.notes !== undefined) session.notes = updates.notes;
  if (updates.categoryId !== undefined) session.categoryId = updates.categoryId;
  if (updates.sortOrder !== undefined) session.sortOrder = updates.sortOrder;
  if (updates.dueDate !== undefined) session.dueDate = updates.dueDate;

  saveState(sessions);
  return c.json({ success: true });
});

apiRoutes.delete("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const success = deleteSession(sessionId);

  if (success) {
    saveState(sessions);
    return c.json({ success: true });
  }
  return c.json({ error: "Session not found" }, 404);
});

// Status update endpoint for Claude Code plugin
apiRoutes.post("/status-update", async (c) => {
  const body = await c.req.json();
  const { status, openuiSessionId, claudeSessionId, cwd, hookEvent, toolName, stopReason } = body;

  // Log the full raw payload for debugging
  log(`\x1b[38;5;82m[plugin-hook]\x1b[0m ${hookEvent || 'unknown'}: status=${status} tool=${toolName || 'none'} openui=${openuiSessionId || 'none'}`);
  log(`\x1b[38;5;245m[plugin-raw]\x1b[0m ${JSON.stringify(body, null, 2)}`);

  if (!status) {
    return c.json({ error: "status is required" }, 400);
  }

  let session = null;

  // Primary: Use OpenUI session ID if provided (this is definitive)
  if (openuiSessionId) {
    session = sessions.get(openuiSessionId);
  }

  // Fallback: Try to match by Claude session ID (for older plugin versions)
  if (!session && claudeSessionId) {
    for (const [id, s] of sessions) {
      if (s.claudeSessionId === claudeSessionId) {
        session = s;
        break;
      }
    }
  }

  if (session) {
    // Store Claude session ID mapping if we have it
    if (claudeSessionId && !session.claudeSessionId) {
      session.claudeSessionId = claudeSessionId;
    }

    // Map hook statuses to UI statuses
    // Hook events → status mapping:
    //   PreToolUse(*)           → pre_tool  → tool_calling (or waiting_input for AskUserQuestion)
    //   PermissionRequest(*)    → waiting_input (permission dialog shown)
    //   PostToolUse(*)          → post_tool → running
    //   PostToolUseFailure(*)   → post_tool → running (tool failed, Claude still working)
    //   Notification(idle/perm) → waiting_input
    //   UserPromptSubmit        → running
    //   Stop                    → idle
    //   SubagentStart/Stop      → running
    //   SessionStart(startup)   → waiting_input
    //   SessionStart(resume)    → running
    //   SessionEnd              → disconnected
    let effectiveStatus = status;

    if (status === "pre_tool") {
      // PreToolUse fired — check tool name for special cases
      if (toolName === "AskUserQuestion" || toolName === "ExitPlanMode") {
        effectiveStatus = "waiting_input";
      } else {
        effectiveStatus = "tool_calling";
      }
      session.currentTool = toolName;
    } else if (status === "post_tool") {
      // PostToolUse or PostToolUseFailure — tool done, Claude is thinking
      effectiveStatus = "running";
      session.currentTool = undefined;
    } else {
      // For idle/waiting_input/disconnected, clear tool tracking
      if (status !== "tool_calling" && status !== "running") {
        session.currentTool = undefined;
      }
    }

    session.status = effectiveStatus;
    session.pluginReportedStatus = true;
    session.lastPluginStatusTime = Date.now();
    session.lastHookEvent = hookEvent;

    // Broadcast status change to connected clients
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: "status",
          status: session.status,
          isRestored: session.isRestored,
          currentTool: session.currentTool,
          hookEvent: hookEvent,
        }));
      }
    }

    return c.json({ success: true });
  }

  // No session found
  log(`\x1b[38;5;141m[plugin]\x1b[0m Status update (no session): ${status} for openui:${openuiSessionId} claude:${claudeSessionId}`);
  return c.json({ success: true, warning: "No matching session found" });
});

// Categories (groups)
apiRoutes.get("/categories", (c) => {
  const state = loadState();
  return c.json(state.categories || []);
});

apiRoutes.post("/categories", async (c) => {
  const state = loadState();
  const category = await c.req.json();

  if (!state.categories) state.categories = [];
  state.categories.push(category);

  const { writeFileSync } = require("fs");
  const { join } = require("path");
  const DATA_DIR = join(process.env.LAUNCH_CWD || process.cwd(), ".openui");
  writeFileSync(join(DATA_DIR, "state.json"), JSON.stringify(state, null, 2));

  return c.json({ success: true });
});

apiRoutes.patch("/categories/:categoryId", async (c) => {
  const categoryId = c.req.param("categoryId");
  const updates = await c.req.json();
  const state = loadState();

  if (!state.categories) return c.json({ error: "Category not found" }, 404);

  const category = state.categories.find(cat => cat.id === categoryId);
  if (!category) return c.json({ error: "Category not found" }, 404);

  Object.assign(category, updates);

  const { writeFileSync } = require("fs");
  const { join } = require("path");
  const DATA_DIR = join(process.env.LAUNCH_CWD || process.cwd(), ".openui");
  writeFileSync(join(DATA_DIR, "state.json"), JSON.stringify(state, null, 2));

  return c.json({ success: true });
});

apiRoutes.delete("/categories/:categoryId", (c) => {
  const categoryId = c.req.param("categoryId");
  const state = loadState();

  if (!state.categories) return c.json({ error: "Category not found" }, 404);

  const index = state.categories.findIndex(cat => cat.id === categoryId);
  if (index === -1) return c.json({ error: "Category not found" }, 404);

  state.categories.splice(index, 1);

  const { writeFileSync } = require("fs");
  const { join } = require("path");
  const DATA_DIR = join(process.env.LAUNCH_CWD || process.cwd(), ".openui");
  writeFileSync(join(DATA_DIR, "state.json"), JSON.stringify(state, null, 2));

  return c.json({ success: true });
});

// ============ Worktree Configuration ============

// Get worktree repos config
apiRoutes.get("/worktree/config", (c) => {
  const config = loadWorktreeConfig();
  return c.json(config);
});

// Save worktree repos config
apiRoutes.post("/worktree/config", async (c) => {
  const body = await c.req.json();
  const { worktreeRepos } = body;

  if (!Array.isArray(worktreeRepos)) {
    return c.json({ error: "worktreeRepos must be an array" }, 400);
  }

  saveWorktreeConfig(worktreeRepos);
  return c.json({ success: true });
});

// ============ Settings ============

apiRoutes.get("/settings", (c) => {
  return c.json(loadSettings());
});

apiRoutes.post("/settings", async (c) => {
  const body = await c.req.json();
  saveSettings(body);
  return c.json({ success: true });
});

// ============ GitHub Integration ============
import {
  fetchGitHubIssues,
  fetchGitHubIssue,
  searchGitHubIssues,
  parseGitHubUrl,
} from "../services/github";

// Get issues from a GitHub repo (no auth needed for public repos)
apiRoutes.get("/github/issues", async (c) => {
  const owner = c.req.query("owner");
  const repo = c.req.query("repo");
  const repoUrl = c.req.query("repoUrl");

  let resolvedOwner = owner;
  let resolvedRepo = repo;

  // If repoUrl provided, parse it
  if (repoUrl && !owner && !repo) {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      return c.json({ error: "Invalid GitHub URL" }, 400);
    }
    resolvedOwner = parsed.owner;
    resolvedRepo = parsed.repo;
  }

  if (!resolvedOwner || !resolvedRepo) {
    return c.json({ error: "owner and repo are required (or provide repoUrl)" }, 400);
  }

  try {
    const issues = await fetchGitHubIssues(resolvedOwner, resolvedRepo);
    return c.json(issues);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Search GitHub issues
apiRoutes.get("/github/search", async (c) => {
  const owner = c.req.query("owner");
  const repo = c.req.query("repo");
  const q = c.req.query("q");

  if (!owner || !repo) {
    return c.json({ error: "owner and repo are required" }, 400);
  }
  if (!q) {
    return c.json({ error: "Search query (q) is required" }, 400);
  }

  try {
    const issues = await searchGitHubIssues(owner, repo, q);
    return c.json(issues);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Get single GitHub issue
apiRoutes.get("/github/issue/:owner/:repo/:number", async (c) => {
  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  const number = parseInt(c.req.param("number"), 10);

  if (isNaN(number)) {
    return c.json({ error: "Invalid issue number" }, 400);
  }

  try {
    const issue = await fetchGitHubIssue(owner, repo, number);
    if (!issue) return c.json({ error: "Issue not found" }, 404);
    return c.json(issue);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
