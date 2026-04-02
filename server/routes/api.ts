import { Hono } from "hono";
import type { Agent, Session } from "../types";
import { sessions, createSession, deleteSession, createShellSession, injectPluginDir, broadcastToSession, attachOutputHandler, getGitBranch, DEFAULT_CLAUDE_COMMAND, createWorktreeForBranch, findGitCwd, getRemoteHost, sshExecAsync, REMOTE_HOSTS } from "../services/sessionManager";
import { loadState, saveState, savePositions, getDataDir, loadCanvases, saveCanvases, migrateCategoriesToCanvases, atomicWriteJson, loadBuffer, getRecentDirectories } from "../services/persistence";
import { signalSessionReady, getQueueProgress } from "../services/sessionStartQueue";
import { getTokensForSession, getContextTokens, invalidateContextCache, getTotalTokensForNode } from "../services/costCache";
import { spawnSync } from "bun";
import { join, dirname } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
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

// UI broadcast function — set by index.ts after server starts
let uiBroadcast: ((msg: any) => void) | null = null;
export function setUiBroadcast(fn: (msg: any) => void) {
  uiBroadcast = fn;
}

export const apiRoutes = new Hono();

const IS_REMOTE = !!process.env.SSH_CONNECTION;

apiRoutes.get("/config", (c) => {
  return c.json({ launchCwd: LAUNCH_CWD, dataDir: getDataDir(), homeDir: homedir(), isRemote: IS_REMOTE });
});

// Get auto-resume configuration and status
apiRoutes.get("/auto-resume/config", (c) => {
  const { getAutoResumeConfig, getSessionsToResume } = require("../services/autoResume");
  const config = getAutoResumeConfig();
  const sessionsToResume = getSessionsToResume();

  return c.json({
    config,
    sessionsToResumeCount: sessionsToResume.length,
    sessions: sessionsToResume.map((s: any) => ({
      sessionId: s.sessionId,
      nodeId: s.nodeId,
      agentName: s.agentName,
      canvasId: s.canvasId,
    })),
  });
});

// Get auto-resume queue progress
apiRoutes.get("/auto-resume/progress", (c) => {
  return c.json(getQueueProgress());
});

// Browse directories for file picker (supports local and remote via SSH)
apiRoutes.get("/browse", async (c) => {
  const remote = c.req.query("remote");
  let path = c.req.query("path") || (remote ? "~" : LAUNCH_CWD);
  const query = c.req.query("query"); // optional: filter children by partial name

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
  const { readdirSync, statSync } = await import("fs");
  const { join, resolve } = await import("path");
  const { homedir } = await import("os");

  // Handle ~ for home directory
  if (path.startsWith("~")) {
    path = path.replace("~", homedir());
  }

  // Resolve to absolute path
  path = resolve(path);

  try {
    const entries = readdirSync(path, { withFileTypes: true });
    const showHidden = query?.startsWith(".");

    let directories = entries
      .filter((entry) => {
        if (!entry.isDirectory()) return false;
        if (!showHidden && entry.name.startsWith(".")) return false;
        return true;
      })
      .map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
      }));

    // Apply query filtering when present
    if (query) {
      const q = query.toLowerCase();
      const prefixMatches: typeof directories = [];
      const substringMatches: typeof directories = [];

      for (const dir of directories) {
        const nameLower = dir.name.toLowerCase();
        if (nameLower.startsWith(q)) {
          prefixMatches.push(dir);
        } else if (nameLower.includes(q)) {
          substringMatches.push(dir);
        }
      }

      // Prefix matches first, then substring matches, each sorted alphabetically
      directories = [
        ...prefixMatches.sort((a, b) => a.name.localeCompare(b.name)),
        ...substringMatches.sort((a, b) => a.name.localeCompare(b.name)),
      ].slice(0, 50);
    } else {
      directories.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Get parent directory
    const parentPath = resolve(path, "..");

    return c.json({
      current: path,
      parent: parentPath !== path ? parentPath : null,
      directories,
    });
  } catch (e: any) {
    // When query is present (autocomplete mode), return empty results instead of 400
    // so the existing inline picker and ForkDialog are unaffected
    if (query) {
      return c.json({
        current: path,
        parent: null,
        directories: [],
      });
    }
    return c.json({ error: e.message, current: path }, 400);
  }
});

// Recent directories from session history (for autocomplete)
apiRoutes.get("/recent-dirs", (c) => {
  const directories = getRecentDirectories();
  return c.json({ directories });
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
      command: DEFAULT_CLAUDE_COMMAND,
      description: "Anthropic's official CLI for Claude",
      color: "#F97316",
      icon: "sparkles",
    },
    {
      id: "opencode",
      name: "OpenCode",
      command: "opencode",
      description: "Open source AI coding assistant",
      color: "#22C55E",
      icon: "code",
    },
    {
      id: "ralph",
      name: "Ralph",
      command: "",
      description: "Autonomous dev loop (ralph, ralph-setup, ralph-import)",
      color: "#8B5CF6",
      icon: "brain",
    },
  ];
  return c.json(agents);
});

apiRoutes.get("/cli-info", (c) => {
  return c.json({ hasIsaac: DEFAULT_CLAUDE_COMMAND.startsWith("isaac") });
});

apiRoutes.get("/remotes", (c) => {
  return c.json(Object.keys(REMOTE_HOSTS));
});

apiRoutes.get("/sessions", (c) => {
  const showArchived = c.req.query("archived") === "true";

  // For archived sessions, load from state.json since they're not in sessions Map
  if (showArchived) {
    const state = loadState();
    const archivedSessions = state.nodes
      .filter(node => node.archived)
      .map(node => ({
        sessionId: node.sessionId,
        nodeId: node.nodeId,
        agentId: node.agentId,
        agentName: node.agentName,
        command: node.command,
        createdAt: node.createdAt,
        cwd: node.cwd,
        gitBranch: node.gitBranch,
        status: "disconnected",
        customName: node.customName,
        customColor: node.customColor,
        notes: node.notes,
        isRestored: false,
        ticketId: node.ticketId,
        ticketTitle: node.ticketTitle,
        canvasId: node.canvasId,
        remote: node.remote,
        categoryId: node.categoryId,
        sortOrder: node.sortOrder,
        dueDate: node.dueDate,
      }));
    return c.json(archivedSessions);
  }

  // For active sessions, get from sessions Map
  const sessionList = Array.from(sessions.entries())
    .filter(([, session]) => !session.archived && session.agentId !== "shell")
    .map(([id, session]) => {
      // Compute effective status: if stuck in waiting_input but user already approved
      // a sleep command, flip to "waiting" (no hook events arrive during the sleep).
      // Recalculate sleepEndTime from approval time since the sleep doesn't start
      // until the user approves the permission prompt.
      let effectiveStatus = session.status;
      if (
        session.status === "waiting_input" &&
        session.sleepEndTime &&
        session.sleepDuration &&
        session.needsInputSince &&
        session.lastInputTime > session.needsInputSince
      ) {
        session.sleepEndTime = session.lastInputTime + session.sleepDuration * 1000;
        effectiveStatus = "waiting";
        session.status = "waiting";
        session.needsInputSince = undefined;
      }

      return {
        sessionId: id,
        nodeId: session.nodeId,
        agentId: session.agentId,
        agentName: session.agentName,
        command: session.command,
        createdAt: session.createdAt,
        cwd: session.cwd,
        gitBranch: session.gitBranch,
        status: effectiveStatus,
        customName: session.customName,
        customColor: session.customColor,
        notes: session.notes,
        isRestored: session.isRestored,
        ticketId: session.ticketId,
        ticketTitle: session.ticketTitle,
        canvasId: session.canvasId, // Canvas/tab this agent belongs to
        longRunningTool: session.longRunningTool || false,
        tokens: getTokensForSession(session.claudeSessionId) ?? session.tokens,
        totalTokens: getTotalTokensForNode(session.claudeSessionId, session.claudeSessionHistory),
        contextTokens: getContextTokens(session.claudeSessionId),
        model: session.model,
        sleepEndTime: session.sleepEndTime,
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
  const showArchived = c.req.query("archived") === "true";

  const nodes = state.nodes
    .filter(node => showArchived ? node.archived : !node.archived)
    .map(node => {
      const session = sessions.get(node.sessionId);
      return {
        ...node,
        status: session?.status || "disconnected",
        isAlive: !!session,
        isRestored: session?.isRestored,
      };
    })
    // For archived view, show all archived sessions even if not alive
    // For active view, only show sessions that are currently running
    .filter(n => showArchived || n.isAlive);

  return c.json({
    nodes,
    websiteNodes: state.websiteNodes || [],
  });
});

apiRoutes.post("/state/positions", async (c) => {
  const { positions } = await c.req.json();

  // Also update session positions and canvasId in memory
  for (const [nodeId, pos] of Object.entries(positions)) {
    for (const [, session] of sessions) {
      if (session.nodeId === nodeId) {
        const posData = pos as { x: number; y: number; canvasId?: string };
        session.position = { x: posData.x, y: posData.y };
        session.canvasId = posData.canvasId || session.canvasId;
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
    // Ticket and worktree options
    ticketId,
    ticketTitle,
    ticketUrl,
    branchName,
    baseBranch,
    prNumber,
    createWorktree: createWorktreeFlag,
    sparseCheckout,
    sparseCheckoutPaths,
    remote,
    initialPrompt,
    categoryId,
    useTeam,
  } = body;

  // Input validation to prevent shell injection
  const ALLOWED_COMMAND_PREFIXES = ["isaac", "claude", "llm agent claude", "opencode", "ralph"];
  if (command && !ALLOWED_COMMAND_PREFIXES.some((p: string) => command.startsWith(p))) {
    return c.json({ error: "Invalid command: must start with a known agent binary" }, 400);
  }
  if (branchName && !/^[\w.\-\/]+$/.test(branchName)) {
    return c.json({ error: "Invalid branch name" }, 400);
  }
  if (baseBranch && !/^[\w.\-\/]+$/.test(baseBranch)) {
    return c.json({ error: "Invalid base branch name" }, 400);
  }
  if (prNumber && !/^\d+$/.test(String(prNumber))) {
    return c.json({ error: "Invalid PR number" }, 400);
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  let workingDir = cwd || LAUNCH_CWD;

  // When resuming a session and the client didn't provide a specific cwd,
  // look up the original cwd from state.json as a fallback
  const resumeMatch = command?.match(/--resume\s+([\w-]+)/);
  if (resumeMatch && (!cwd || cwd === LAUNCH_CWD)) {
    const claudeSessionId = resumeMatch[1];
    const state = loadState();
    const matchingNode = state.nodes.find((n: any) =>
      n.claudeSessionId === claudeSessionId ||
      n.command?.includes(`--resume ${claudeSessionId}`)
    );
    if (matchingNode?.cwd) {
      log(`\x1b[38;5;141m[session]\x1b[0m Resume: using archived cwd ${matchingNode.cwd}`);
      workingDir = matchingNode.cwd;
    }
  }

  try {
    const result = await createSession({
      sessionId,
      agentId,
      agentName,
      command,
      useTeam: !!useTeam,
      cwd: workingDir,
      nodeId,
      customName,
      customColor,
      ticketId,
      ticketTitle,
      ticketUrl,
      branchName,
      baseBranch,
      prNumber,
      ticketPromptTemplate: undefined,
      createWorktreeFlag,
      sparseCheckout,
      sparseCheckoutPaths,
      remote,
      initialPrompt,
      categoryId,
    });

    saveState(sessions);

    // Broadcast to UI so other tabs / polling can pick up the new node
    if (uiBroadcast) {
      uiBroadcast({
        type: "session-created",
        sessionId,
        nodeId,
        agentId,
        agentName: customName || agentName,
        command,
        cwd: result.cwd,
        gitBranch: result.gitBranch,
        remote,
        color: body.color,
      });
    }

    return c.json({
      sessionId,
      nodeId,
      cwd: result.cwd,
      gitBranch: result.gitBranch,
      remote,
    });
  } catch (error) {
    console.error("[session creation error]", error);
    return c.json({ error: String(error) }, 500);
  }
});

apiRoutes.post("/sessions/:sessionId/restart", async (c) => {
  const sessionId = c.req.param("sessionId");
  let session = sessions.get(sessionId);

  // If not in active sessions, check archived sessions in state.json
  if (!session) {
    const state = loadState();
    const archivedNode = state.nodes.find(n => n.sessionId === sessionId && n.archived);
    if (!archivedNode) return c.json({ error: "Session not found" }, 404);

    // Restore archived session into the sessions Map
    const buffer = loadBuffer(sessionId);

    // Migrate command format when isaac is available
    let command = archivedNode.command;
    if (DEFAULT_CLAUDE_COMMAND === "isaac" && command.startsWith("llm agent claude")) {
      command = command.replace("llm agent claude", "isaac");
    }
    if (command.startsWith("isaac claude")) {
      command = command.replace("isaac claude", "isaac");
    }

    session = {
      pty: null,
      agentId: archivedNode.agentId,
      agentName: archivedNode.agentName,
      command,
      cwd: archivedNode.cwd,
      originalCwd: archivedNode.originalCwd || archivedNode.cwd,
      gitBranch: archivedNode.gitBranch || getGitBranch(archivedNode.cwd) || undefined,
      createdAt: archivedNode.createdAt,
      clients: new Set(),
      outputBuffer: buffer,
      outputSeq: 0,
      status: "disconnected",
      lastOutputTime: 0,
      lastInputTime: 0,
      recentOutputSize: 0,
      customName: archivedNode.customName,
      customColor: archivedNode.customColor,
      notes: archivedNode.notes,
      nodeId: archivedNode.nodeId,
      isRestored: true,
      claudeSessionId: archivedNode.claudeSessionId,
      claudeSessionHistory: archivedNode.claudeSessionHistory,
      archived: false,
      canvasId: archivedNode.canvasId,
      ticketId: archivedNode.ticketId,
      ticketTitle: archivedNode.ticketTitle,
      ticketUrl: archivedNode.ticketUrl,
      remote: archivedNode.remote,
      categoryId: archivedNode.categoryId,
      sortOrder: archivedNode.sortOrder,
      dueDate: archivedNode.dueDate,
    };
    sessions.set(sessionId, session);
    log(`\x1b[38;5;141m[restart]\x1b[0m Restored archived session ${sessionId} into sessions Map`);
  }

  if (session.pty) return c.json({ error: "Session already running" }, 400);

  const startFn = async () => {
    // Re-check after async yield — auto-resume queue may have started this session
    if (session.pty) return;
    const { spawn } = await import("bun-pty");
    if (session.pty) return;
    // Use originalCwd so Claude finds the session in the correct project directory.
    // session.cwd may have drifted to a worktree path during the previous run.
    const resumeCwd = session.originalCwd || session.cwd;
    const ptyProcess = spawn(process.env.SHELL || "/bin/bash", [], {
      name: "xterm-256color",
      cwd: resumeCwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        OPENUI_SESSION_ID: sessionId,
        OPENUI_PORT: String(process.env.PORT || 6968),
      },
      rows: 30,
      cols: 120,
    });

    session.pty = ptyProcess;
    session.isRestored = false;
    session.status = "running";
    session.lastOutputTime = Date.now();

    const resetInterval = setInterval(() => {
      if (!sessions.has(sessionId) || !session.pty) {
        clearInterval(resetInterval);
        return;
      }
      session.recentOutputSize = Math.max(0, session.recentOutputSize - 50);
    }, 500);

    attachOutputHandler(session, ptyProcess);

    // Build the command with resume flag if we have a Claude session ID
    let finalCommand = injectPluginDir(session.command, session.agentId);

    // For Claude sessions, use --resume to restore the specific session.
    // If the command already has --resume, that's the canonical ID — use it as-is.
    // Only inject from claudeSessionId when there's no --resume yet (first resume).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const existingResume = session.command.match(/--resume\s+([\w-]+)/);
    if (existingResume) {
      log(`\x1b[38;5;141m[session]\x1b[0m Using existing --resume ${existingResume[1]} from command`);
    } else if (session.agentId === "claude" && session.claudeSessionId && UUID_RE.test(session.claudeSessionId)) {
      const resumeArg = `--resume ${session.claudeSessionId}`;
      if (finalCommand === "isaac" || finalCommand.startsWith("isaac ")) {
        finalCommand = finalCommand.replace(/^isaac/, `isaac ${resumeArg}`);
      } else if (finalCommand.startsWith("llm agent claude")) {
        finalCommand = finalCommand.replace(/^llm agent claude/, `llm agent claude ${resumeArg}`);
      } else if (finalCommand.startsWith("claude")) {
        finalCommand = finalCommand.replace(/^claude(\s|$)/, `claude ${resumeArg}$1`);
      }
      // Persist --resume into the command so future restarts use the correct ID
      session.command = session.command.replace(/^(isaac|llm agent claude|claude)/, `$1 ${resumeArg}`);
      log(`\x1b[38;5;141m[session]\x1b[0m Resuming Claude session: ${session.claudeSessionId} (persisted to command)`);
    }

    setTimeout(() => {
      ptyProcess.write(`${finalCommand}\r`);
    }, 300);

    log(`\x1b[38;5;141m[session]\x1b[0m Restarted ${sessionId}`);
  };

  // Start immediately -- the queue is only for mass auto-resume at startup
  startFn();

  return c.json({ success: true });
});

// Fork a Claude session (creates new node with --fork-session)
apiRoutes.post("/sessions/:sessionId/fork", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  // Only Claude sessions with a known claudeSessionId can be forked
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (session.agentId !== "claude" || !session.claudeSessionId || !UUID_RE.test(session.claudeSessionId)) {
    return c.json({ error: "Session cannot be forked (not a Claude session or no session ID yet)" }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  if (body.branchName && !/^[\w.\-\/]+$/.test(body.branchName)) {
    return c.json({ error: "Invalid branch name" }, 400);
  }
  if (body.baseBranch && !/^[\w.\-\/]+$/.test(body.baseBranch)) {
    return c.json({ error: "Invalid base branch name" }, 400);
  }
  const position = body.position || { x: 0, y: 0 };
  const canvasId = body.canvasId || session.canvasId;

  // Generate new IDs
  const now = Date.now();
  const newSessionId = `session-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const newNodeId = `node-${now}-0`;

  const parentName = session.customName || session.agentName || "Agent";
  const customName = body.customName || `${parentName} (fork)`;
  const customColor = body.customColor || session.customColor;

  let effectiveCwd = body.cwd || session.cwd;
  let gitBranch = session.gitBranch;

  // Build CLI flags for worktree/branch/PR
  const isIsaac = session.command === "isaac" || session.command.startsWith("isaac ");
  let isaacFlags = "";
  if (body.branchName) {
    if (isIsaac) {
      // Isaac handles worktree creation via --worktree --branch flags
      if (body.baseBranch) {
        try {
          const branchExists = spawnSync(["git", "rev-parse", "--verify", body.branchName], {
            cwd: effectiveCwd, stdout: "pipe", stderr: "pipe",
          }).exitCode === 0;
          if (!branchExists) {
            log(`\x1b[38;5;141m[git]\x1b[0m Creating branch "${body.branchName}" from "${body.baseBranch}"`);
            spawnSync(["git", "branch", body.branchName, body.baseBranch], {
              cwd: effectiveCwd, stdout: "pipe", stderr: "pipe",
            });
          }
        } catch {
          log(`\x1b[38;5;208m[git]\x1b[0m git not available, skipping branch pre-creation`);
        }
      }
      isaacFlags += ` --worktree --branch "${body.branchName}"`;
    } else {
      // Claude CLI doesn't support --worktree; create worktree manually
      try {
        const worktreeCwd = await createWorktreeForBranch(effectiveCwd, body.branchName, body.baseBranch);
        if (worktreeCwd) {
          effectiveCwd = worktreeCwd;
          log(`\x1b[38;5;141m[git]\x1b[0m Using worktree at ${worktreeCwd} for branch "${body.branchName}"`);
        }
      } catch (e) {
        log(`\x1b[38;5;208m[git]\x1b[0m Failed to create worktree: ${e}`);
      }
    }
    gitBranch = body.branchName;
  }
  if (body.prNumber) {
    if (isIsaac) {
      isaacFlags += ` --pr ${body.prNumber}`;
    }
    if (!gitBranch) gitBranch = `PR #${body.prNumber}`;
  }

  if (body.cwd && !body.branchName) {
    // Custom directory without worktree — detect git branch
    gitBranch = getGitBranch(effectiveCwd) || undefined;
  }

  const { spawn } = await import("bun-pty");
  const ptyProcess = spawn(process.env.SHELL || "/bin/bash", [], {
    name: "xterm-256color",
    cwd: effectiveCwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      OPENUI_SESSION_ID: newSessionId,
      OPENUI_PORT: String(process.env.PORT || 6968),
    },
    rows: 30,
    cols: 120,
  });

  const newSession = {
    pty: ptyProcess,
    agentId: session.agentId,
    agentName: session.agentName,
    command: session.command,
    cwd: effectiveCwd,
    originalCwd: session.originalCwd || effectiveCwd,
    gitBranch,
    createdAt: new Date().toISOString(),
    clients: new Set() as any,
    outputBuffer: [] as string[],
    outputSeq: 0,
    status: "running" as const,
    lastOutputTime: Date.now(),
    lastInputTime: 0,
    recentOutputSize: 0,
    customName,
    customColor,
    nodeId: newNodeId,
    isRestored: false,
    autoResumed: false,
    claudeSessionId: undefined,
    archived: false,
    canvasId,
    position,
    ticketId: session.ticketId,
    ticketTitle: session.ticketTitle,
    ticketUrl: session.ticketUrl,
    remote: session.remote,
    categoryId: session.categoryId,
  };

  sessions.set(newSessionId, newSession);

  const resetInterval = setInterval(() => {
    if (!sessions.has(newSessionId) || !newSession.pty) {
      clearInterval(resetInterval);
      return;
    }
    newSession.recentOutputSize = Math.max(0, newSession.recentOutputSize - 50);
  }, 500);

  attachOutputHandler(newSession, ptyProcess);

  // Build the fork command: inject plugin-dir, then --resume <id> --fork-session + isaac flags
  let finalCommand = injectPluginDir(session.command, session.agentId);
  finalCommand = finalCommand.replace(/--resume\s+[\w-]+/g, '').replace(/--resume(?=\s|$)/g, '').trim();
  const forkArg = `--resume ${session.claudeSessionId} --fork-session`;
  if (finalCommand === "isaac" || finalCommand.startsWith("isaac ")) {
    finalCommand = finalCommand.replace(/^isaac/, `isaac ${forkArg}`);
  } else if (finalCommand.startsWith("llm agent claude")) {
    finalCommand = finalCommand.replace(/^llm agent claude/, `llm agent claude ${forkArg}`);
  } else if (finalCommand.startsWith("claude")) {
    finalCommand = finalCommand.replace(/^claude(\s|$)/, `claude ${forkArg}$1`);
  }
  finalCommand += isaacFlags;

  setTimeout(() => {
    ptyProcess.write(`${finalCommand}\r`);
  }, 300);

  saveState(sessions);

  log(`\x1b[38;5;141m[session]\x1b[0m Forked ${sessionId} -> ${newSessionId} (claude session: ${session.claudeSessionId})`);

  return c.json({
    sessionId: newSessionId,
    nodeId: newNodeId,
    cwd: effectiveCwd,
    gitBranch,
    canvasId,
    customName,
    agentId: session.agentId,
    agentName: session.agentName,
    customColor,
  });
});

apiRoutes.patch("/sessions/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  const updates = await c.req.json();
  if (updates.customName !== undefined) session.customName = updates.customName;
  if (updates.customColor !== undefined) session.customColor = updates.customColor;
  if (updates.icon !== undefined) session.icon = updates.icon;
  if (updates.notes !== undefined) session.notes = updates.notes;
  if (updates.categoryId !== undefined) session.categoryId = updates.categoryId;
  if (updates.sortOrder !== undefined) session.sortOrder = updates.sortOrder;
  if (updates.dueDate !== undefined) session.dueDate = updates.dueDate;

  saveState(sessions);
  return c.json({ success: true });
});

apiRoutes.delete("/sessions/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");

  // Remove from sessions Map if present (kills PTY)
  deleteSession(sessionId);

  // Clean up uploaded images for this session
  cleanupSessionUploads(sessionId);

  // Also remove directly from state.json (handles archived/disk-only sessions)
  const state = loadState();
  const before = state.nodes.length;
  state.nodes = state.nodes.filter(n => n.sessionId !== sessionId);

  if (state.nodes.length < before) {
    const stateFile = join(homedir(), ".openui", "state.json");
    atomicWriteJson(stateFile, state);
    return c.json({ success: true });
  }

  return c.json({ error: "Session not found" }, 404);
});

// ============ Shell (Raw Terminal) ============

apiRoutes.post("/shell", async (c) => {
  const { cwd, nodeId } = await c.req.json();
  if (!cwd) return c.json({ error: "cwd is required" }, 400);
  if (!nodeId) return c.json({ error: "nodeId is required" }, 400);

  const { shellId } = createShellSession(cwd, nodeId);
  saveState(sessions);
  return c.json({ shellId });
});

apiRoutes.delete("/shell/:shellId", (c) => {
  const shellId = c.req.param("shellId");
  const deleted = deleteSession(shellId);
  if (!deleted) return c.json({ error: "Shell not found" }, 404);
  saveState(sessions);
  return c.json({ success: true });
});

apiRoutes.get("/shells", (c) => {
  const shellList = Array.from(sessions.entries())
    .filter(([, session]) => session.agentId === "shell")
    .map(([id, session]) => ({
      shellId: id,
      nodeId: session.nodeId,
      cwd: session.cwd,
      createdAt: session.createdAt,
    }));
  return c.json(shellList);
});

// Archive/unarchive session
apiRoutes.patch("/sessions/:sessionId/archive", async (c) => {
  const sessionId = c.req.param("sessionId");
  const { archived } = await c.req.json();

  const session = sessions.get(sessionId);

  if (session) {
    // Session is active (in sessions Map) - update it directly
    console.log(`[archive] Updating active session ${sessionId} archived=${archived}`);
    session.archived = archived;
    if (archived) cleanupSessionUploads(sessionId);
    saveState(sessions);
  } else {
    // Session is not active (archived) - update state.json directly
    console.log(`[archive] Session ${sessionId} not in Map, updating state.json directly`);
    const state = loadState();
    const node = state.nodes?.find(n => n.sessionId === sessionId);
    if (!node) {
      console.log(`[archive] ERROR: Session ${sessionId} not found in state.json`);
      return c.json({ error: "Session not found" }, 404);
    }

    console.log(`[archive] Found node, updating archived from ${node.archived} to ${archived}`);
    node.archived = archived;
    if (archived) cleanupSessionUploads(sessionId);

    const stateFile = join(homedir(), ".openui", "state.json");
    atomicWriteJson(stateFile, state);
    console.log(`[archive] Wrote updated state to ${stateFile}`);

    // When unarchiving, restore the session into the sessions Map so it's
    // visible immediately after the client reloads (restoreSessions only runs
    // at server startup, so the Map won't have this session otherwise).
    if (!archived) {
      const buffer = loadBuffer(sessionId);
      let command = node.command;
      if (DEFAULT_CLAUDE_COMMAND === "isaac" && command.startsWith("llm agent claude")) {
        command = command.replace("llm agent claude", "isaac");
      }
      if (command.startsWith("isaac claude")) {
        command = command.replace("isaac claude", "isaac");
      }
      const restoredSession: import("../types").Session = {
        pty: null,
        agentId: node.agentId,
        agentName: node.agentName,
        command,
        cwd: node.cwd,
        gitBranch: getGitBranch(node.cwd) || node.gitBranch || undefined,
        createdAt: node.createdAt,
        clients: new Set(),
        outputBuffer: buffer,
        outputSeq: 0,
        status: "disconnected",
        lastOutputTime: 0,
        lastInputTime: 0,
        recentOutputSize: 0,
        customName: node.customName,
        customColor: node.customColor,
        notes: node.notes,
        nodeId: node.nodeId,
        isRestored: true,
        autoResumed: false,
        claudeSessionId: node.claudeSessionId,
        claudeSessionHistory: node.claudeSessionHistory,
        archived: false,
        canvasId: node.canvasId,
        ticketId: node.ticketId,
        ticketTitle: node.ticketTitle,
        ticketUrl: node.ticketUrl,
        model: node.model,
        remote: node.remote,
        categoryId: node.categoryId,
      };
      sessions.set(sessionId, restoredSession);
      console.log(`[archive] Restored session ${sessionId} into sessions Map`);
      // Persist immediately so the periodic saveState sees the session in
      // the Map and writes it with archived=false.  Without this, a race
      // with the 30-second periodic saveState could drop the node.
      saveState(sessions);
    }
  }

  return c.json({ success: true });
});

// Get git info for archive cleanup dialog
apiRoutes.get("/sessions/:sessionId/git-info", (c) => {
  const sessionId = c.req.param("sessionId");

  // Find session in memory or state.json
  let cwd: string | null = null;
  let gitBranch: string | null = null;

  const session = sessions.get(sessionId);
  if (session) {
    cwd = session.cwd;
    gitBranch = session.gitBranch || null;
  } else {
    const state = loadState();
    const node = state.nodes?.find(n => n.sessionId === sessionId);
    if (node) {
      cwd = node.cwd;
      gitBranch = node.gitBranch || null;
    }
  }

  if (!cwd) {
    return c.json({ error: "Session not found" }, 404);
  }

  // Detect worktree: check if cwd is inside a git worktree
  let hasWorktree = false;
  try {
    const gitDir = spawnSync(["git", "rev-parse", "--git-dir"], {
      cwd, stdout: "pipe", stderr: "pipe",
    });
    const commonDir = spawnSync(["git", "rev-parse", "--git-common-dir"], {
      cwd, stdout: "pipe", stderr: "pipe",
    });
    // In a worktree, git-dir is like /path/.git/worktrees/name, common-dir is /path/.git
    if (gitDir.exitCode === 0 && commonDir.exitCode === 0) {
      const gitDirStr = new TextDecoder().decode(gitDir.stdout).trim();
      const commonDirStr = new TextDecoder().decode(commonDir.stdout).trim();
      hasWorktree = gitDirStr !== commonDirStr && gitDirStr !== ".git";
    }
  } catch {}

  // Detect local branch
  let localBranch: string | null = null;
  if (gitBranch) {
    try {
      const result = spawnSync(["git", "rev-parse", "--verify", gitBranch], {
        cwd, stdout: "pipe", stderr: "pipe",
      });
      if (result.exitCode === 0) {
        localBranch = gitBranch;
      }
    } catch {}
  }

  // Detect remote branch
  let remoteBranch: string | null = null;
  if (gitBranch) {
    try {
      const result = spawnSync(["git", "rev-parse", "--verify", `origin/${gitBranch}`], {
        cwd, stdout: "pipe", stderr: "pipe",
      });
      if (result.exitCode === 0) {
        remoteBranch = gitBranch;
      }
    } catch {}
  }

  return c.json({ hasWorktree, localBranch, remoteBranch, cwd });
});

// Cleanup branches before archiving (worktrees are NOT destroyed — Isaac reuses them)
apiRoutes.post("/sessions/:sessionId/cleanup", async (c) => {
  const sessionId = c.req.param("sessionId");
  const { deleteLocalBranch, deleteRemoteBranch } = await c.req.json();

  // Find session cwd and branch
  let cwd: string | null = null;
  let gitBranch: string | null = null;

  const session = sessions.get(sessionId);
  if (session) {
    cwd = session.cwd;
    gitBranch = session.gitBranch || null;
  } else {
    const state = loadState();
    const node = state.nodes?.find(n => n.sessionId === sessionId);
    if (node) {
      cwd = node.cwd;
      gitBranch = node.gitBranch || null;
    }
  }

  if (!cwd) {
    return c.json({ error: "Session not found" }, 404);
  }

  const errors: string[] = [];

  // Need to find the main repo dir for branch operations after worktree removal
  let mainRepoDir = cwd;
  try {
    const commonDir = spawnSync(["git", "rev-parse", "--git-common-dir"], {
      cwd, stdout: "pipe", stderr: "pipe",
    });
    const commonDirStr = new TextDecoder().decode(commonDir.stdout).trim();
    // common-dir is like /path/to/repo/.git — parent is the repo root
    if (commonDirStr && commonDirStr !== ".git") {
      mainRepoDir = dirname(commonDirStr);
    }
  } catch {}

  // 1. Delete local branch
  if (deleteLocalBranch && gitBranch) {
    try {
      log(`[cleanup] Deleting local branch ${gitBranch}`);
      const result = spawnSync(["git", "branch", "-D", "--", gitBranch], {
        cwd: mainRepoDir, stdout: "pipe", stderr: "pipe",
      });
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr).trim();
        errors.push(`branch delete: ${stderr}`);
        log(`[cleanup] branch delete failed: ${stderr}`);
      }
    } catch (e: any) {
      errors.push(`branch delete: ${e.message}`);
    }
  }

  // 2. Delete remote branch
  if (deleteRemoteBranch && gitBranch) {
    try {
      log(`[cleanup] Deleting remote branch origin/${gitBranch}`);
      const result = spawnSync(["git", "push", "origin", "--delete", "--", gitBranch], {
        cwd: mainRepoDir, stdout: "pipe", stderr: "pipe",
      });
      if (result.exitCode !== 0) {
        const stderr = new TextDecoder().decode(result.stderr).trim();
        errors.push(`remote branch delete: ${stderr}`);
        log(`[cleanup] remote branch delete failed: ${stderr}`);
      }
    } catch (e: any) {
      errors.push(`remote branch delete: ${e.message}`);
    }
  }

  return c.json({ success: errors.length === 0, errors });
});

// Session context endpoint for plugin hook systemMessage injection
apiRoutes.get("/sessions/:sessionId/context", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  return c.json({
    customName: session.customName || null,
    notes: session.notes || null,
    ticketId: session.ticketId || null,
    ticketTitle: session.ticketTitle || null,
    ticketUrl: session.ticketUrl || null,
  });
});

// Status update endpoint for Claude Code plugin
apiRoutes.post("/status-update", async (c) => {
  const body = await c.req.json();
  const { status, openuiSessionId, claudeSessionId, cwd, hookEvent, toolName, stopReason, model, toolInput } = body;

  // Log the full raw payload for debugging
  log(`\x1b[38;5;82m[plugin-hook]\x1b[0m ${hookEvent || 'unknown'}: status=${status} tool=${toolName || 'none'} openui=${openuiSessionId || 'none'}`);
  log(`\x1b[38;5;245m[plugin-raw]\x1b[0m ${JSON.stringify(body, null, 2)}`);

  if (!status) {
    return c.json({ error: "status is required" }, 400);
  }

  let session: Session | undefined = undefined;

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
    // Track Claude session ID changes — Claude issues a new ID on /clear
    if (claudeSessionId && claudeSessionId !== session.claudeSessionId) {
      if (session.claudeSessionId) {
        if (!session.claudeSessionHistory) session.claudeSessionHistory = [];
        if (!session.claudeSessionHistory.includes(session.claudeSessionId)) {
          session.claudeSessionHistory.push(session.claudeSessionId);
        }
      }
      session.claudeSessionId = claudeSessionId;
      // Strip --fork-session from command (fork already happened, future resumes should just --resume)
      if (session.command.includes("--fork-session")) {
        session.command = session.command.replace(/\s*--fork-session/g, "");
      }
      saveState(sessions);
    }

    // Update cwd from hook input (isaac may move to a worktree directory)
    if (cwd && cwd !== session.cwd) {
      session.cwd = cwd;
    }

    // Refresh token count from cost cache
    const tokens = getTokensForSession(session.claudeSessionId);
    if (tokens != null) session.tokens = tokens;

    // Store model name when reported
    if (model) session.model = model;

    // Signal the start queue that this session has completed OAuth/initialization
    if (hookEvent === "SessionStart" && openuiSessionId) {
      signalSessionReady(openuiSessionId);
    }

    // Handle pre_tool/post_tool/permission_request for status detection
    let effectiveStatus = status;

    if (status === "permission_request") {
      // PermissionRequest hook — definitive signal that the agent needs user approval.
      // Works for all tools including Bash/Task where timeout-based detection can't.
      effectiveStatus = "waiting_input";
      session.needsInputSince = Date.now();
      session.preToolTime = undefined;
      if (session.permissionTimeout) {
        clearTimeout(session.permissionTimeout);
        session.permissionTimeout = undefined;
      }
    } else if (status === "pre_tool") {
      // AskUserQuestion means the agent needs user input, not "working"
      // (Both the specific AskUserQuestion matcher and wildcard * fire in parallel,
      // so this server-side check ensures the correct status regardless of arrival order)
      if (toolName === "AskUserQuestion") {
        effectiveStatus = "waiting_input";
        session.needsInputSince = Date.now();
        session.currentTool = toolName;
        if (session.permissionTimeout) {
          clearTimeout(session.permissionTimeout);
          session.permissionTimeout = undefined;
        }
      } else {
        // PreToolUse fired - tool is about to run (or waiting for permission)
        effectiveStatus = "running";
        session.currentTool = toolName;
        session.preToolTime = Date.now();

        // Sleep detection: if Bash command starts with "sleep N", set waiting status + timer.
        // Only clear sleepEndTime for new Bash commands — parallel non-Bash tools (Read, Grep, etc.)
        // should not disrupt an active sleep timer since they're separate tool invocations.
        if (toolName === "Bash") {
          if (toolInput?.command) {
            const sleepMatch = toolInput.command.match(/^sleep\s+(\d+)/);
            if (sleepMatch) {
              const secs = parseInt(sleepMatch[1], 10);
              session.sleepDuration = secs;
              session.sleepEndTime = Date.now() + secs * 1000;
              effectiveStatus = "waiting";
            } else {
              session.sleepEndTime = undefined;
              session.sleepDuration = undefined;
            }
          } else {
            session.sleepEndTime = undefined;
            session.sleepDuration = undefined;
          }
        }

        // Clear any existing permission timeout
        if (session.permissionTimeout) {
          clearTimeout(session.permissionTimeout);
        }

        // Timeout-based permission detection as fallback for non-Bash/Task tools.
        // Bash/Task are excluded since they can run for a long time — the PermissionRequest
        // hook handles permission detection for those definitively.
        const longRunningTools = ["Bash", "Task", "TaskOutput"];
        if (!longRunningTools.includes(toolName)) {
          session.permissionTimeout = setTimeout(() => {
            if (session.preToolTime) {
              session.status = "waiting_input";
              session.needsInputSince = Date.now();
              broadcastToSession(session, {
                type: "status",
                status: "waiting_input",
                isRestored: session.isRestored,
                currentTool: session.currentTool,
                hookEvent: "permission_timeout",
              });
            }
          }, 2500);
        } else {
          session.permissionTimeout = undefined;
        }

        // Long-running tool detection: if a single tool runs > 5 min, flag it
        if (session.longRunningTimeout) {
          clearTimeout(session.longRunningTimeout);
        }
        session.longRunningTool = false;
        session.longRunningTimeout = setTimeout(() => {
          if (session.preToolTime) {
            session.longRunningTool = true;
            broadcastToSession(session, {
              type: "status",
              status: session.status,
              isRestored: session.isRestored,
              currentTool: session.currentTool,
              hookEvent: "long_running_tool",
              gitBranch: session.gitBranch,
              longRunningTool: true,
            });
          }
        }, 5 * 60 * 1000);
      }
    } else if (status === "post_tool") {
      // PostToolUse fired - tool completed, clear the permission timeout
      // If session is already idle (Stop fired), don't flip back to running
      effectiveStatus = session.status === "idle" ? "idle" : "running";
      // AskUserQuestion PostToolUse means the user answered — clear input protection
      if (toolName === "AskUserQuestion") {
        session.needsInputSince = undefined;
      }
      session.preToolTime = undefined;
      session.sleepEndTime = undefined;
      session.sleepDuration = undefined;
      if (session.permissionTimeout) {
        clearTimeout(session.permissionTimeout);
        session.permissionTimeout = undefined;
      }
      session.longRunningTool = false;
      if (session.longRunningTimeout) {
        clearTimeout(session.longRunningTimeout);
        session.longRunningTimeout = undefined;
      }
      // Keep currentTool to show what just ran
    } else if (status === "compacting") {
      // PreCompact hook — agent is compacting its conversation context.
      // Show a calm "Compacting" status. Don't clear tool tracking.
      effectiveStatus = "compacting";
      session.preToolTime = undefined;
      if (session.permissionTimeout) {
        clearTimeout(session.permissionTimeout);
        session.permissionTimeout = undefined;
      }
      // Compaction timeout: if no new events arrive within 60s, revert to idle.
      // This handles the case where compaction was triggered while idle (e.g. /compact).
      // If the agent continues working, the next PreToolUse/UserPromptSubmit clears this.
      if (session.compactingTimeout) clearTimeout(session.compactingTimeout);
      session.compactingTimeout = setTimeout(() => {
        if (session.status === "compacting") {
          session.status = "idle";
          broadcastToSession(session, {
            type: "status",
            status: "idle",
            isRestored: session.isRestored,
            currentTool: session.currentTool,
            hookEvent: "compacting_timeout",
            gitBranch: session.gitBranch,
            longRunningTool: false,
            model: session.model,
            sleepEndTime: undefined,
          });
        }
      }, 60_000);
    } else {
      // For other statuses, clear tool tracking if not actively using tools
      if (status !== "tool_calling" && status !== "running") {
        session.currentTool = undefined;
      }
      // UserPromptSubmit / Stop / idle — user is actively engaged, clear input protection
      if (hookEvent === "UserPromptSubmit" || hookEvent === "Stop") {
        session.needsInputSince = undefined;
      }
      session.preToolTime = undefined;
      session.sleepEndTime = undefined;
      session.sleepDuration = undefined;
      if (session.permissionTimeout) {
        clearTimeout(session.permissionTimeout);
        session.permissionTimeout = undefined;
      }
      session.longRunningTool = false;
      if (session.longRunningTimeout) {
        clearTimeout(session.longRunningTimeout);
        session.longRunningTimeout = undefined;
      }
    }

    // Invalidate context token cache on Stop (new usage data available) and compacting
    if ((hookEvent === "Stop" || status === "compacting") && session.claudeSessionId) {
      invalidateContextCache(session.claudeSessionId);
    }

    // Clear compacting timeout when any non-compacting event arrives
    if (status !== "compacting" && session.compactingTimeout) {
      clearTimeout(session.compactingTimeout);
      session.compactingTimeout = undefined;
    }

    // Once Stop fires (idle), only a new user message (UserPromptSubmit) should
    // flip status back to running. Late events like SubagentStop or missing
    // PostToolUse for parallel calls should not override idle.
    if (session.status === "idle" && effectiveStatus === "running" && hookEvent !== "UserPromptSubmit") {
      effectiveStatus = "idle";
    }

    // Protect "waiting" (sleep) from being overridden by running events from subagents.
    // Only post_tool (which clears sleepEndTime) or Stop should break out of waiting.
    if (session.status === "waiting" && session.sleepEndTime && effectiveStatus === "running") {
      effectiveStatus = "waiting";
    }

    // Protect waiting_input from being overwritten by running events from other subagents.
    // Clear when user provides terminal input (e.g., approving a permission prompt).
    if (session.needsInputSince && effectiveStatus === "running") {
      if (session.lastInputTime > session.needsInputSince) {
        session.needsInputSince = undefined;  // User responded via terminal
        // If a sleep is active, the user just approved the permission — go to "waiting" not "running".
        // Recalculate sleepEndTime from approval time since sleep doesn't start until approved.
        if (session.sleepEndTime && session.sleepDuration) {
          session.sleepEndTime = session.lastInputTime + session.sleepDuration * 1000;
          effectiveStatus = "waiting";
        }
      } else {
        effectiveStatus = "waiting_input";  // Still waiting, protect from override
      }
    }

    session.status = effectiveStatus;
    session.pluginReportedStatus = true;
    session.lastPluginStatusTime = Date.now();
    session.lastHookEvent = hookEvent;

    // Dynamic branch detection: check if branch changed (throttled to every 5s)
    const now = Date.now();
    if (!session._lastBranchCheck || (now - session._lastBranchCheck) > 5000) {
      session._lastBranchCheck = now;
      const currentBranch = getGitBranch(session.cwd);
      if (currentBranch && currentBranch !== session.gitBranch) {
        session.gitBranch = currentBranch;
      }
    }

    // Broadcast status change to connected clients
    broadcastToSession(session, {
      type: "status",
      status: session.status,
      isRestored: session.isRestored,
      currentTool: session.currentTool,
      hookEvent: hookEvent,
      gitBranch: session.gitBranch,
      longRunningTool: session.longRunningTool || false,
      model: session.model,
      sleepEndTime: session.sleepEndTime,
    });

    return c.json({ success: true });
  }

  // No session found
  log(`\x1b[38;5;141m[plugin]\x1b[0m Status update (no session): ${status} for openui:${openuiSessionId} claude:${claudeSessionId}`);
  return c.json({ success: true, warning: "No matching session found" });
});

// ============ Canvas (Tab) Management ============

// Get all canvases
apiRoutes.get("/canvases", (c) => {
  const state = loadState();
  return c.json(state.canvases || []);
});

// Create new canvas
apiRoutes.post("/canvases", async (c) => {
  const canvas = await c.req.json();
  const state = loadState();

  if (!state.canvases) state.canvases = [];
  state.canvases.push(canvas);

  saveCanvases(state.canvases);
  return c.json({ success: true, canvas });
});

// Update canvas
apiRoutes.patch("/canvases/:canvasId", async (c) => {
  const canvasId = c.req.param("canvasId");
  const updates = await c.req.json();
  const state = loadState();

  const canvas = state.canvases?.find(c => c.id === canvasId);
  if (!canvas) return c.json({ error: "Canvas not found" }, 404);

  Object.assign(canvas, updates);
  saveCanvases(state.canvases!);

  return c.json({ success: true });
});

// Delete canvas (only if empty)
apiRoutes.delete("/canvases/:canvasId", async (c) => {
  const canvasId = c.req.param("canvasId");
  const state = loadState();

  // Check if canvas has nodes
  const hasNodes = state.nodes.some(n => n.canvasId === canvasId);
  if (hasNodes) {
    return c.json({
      error: "Cannot delete canvas with agents. Move agents first."
    }, 400);
  }

  const index = state.canvases?.findIndex(c => c.id === canvasId);
  if (index === undefined || index === -1) {
    return c.json({ error: "Canvas not found" }, 404);
  }

  state.canvases!.splice(index, 1);
  saveCanvases(state.canvases!);

  return c.json({ success: true });
});

// Reorder canvases
apiRoutes.post("/canvases/reorder", async (c) => {
  const { canvasIds } = await c.req.json();
  const state = loadState();

  if (!state.canvases) return c.json({ error: "No canvases" }, 400);

  // Only update order for canvases in the list — don't drop missing ones
  const orderMap = new Map(canvasIds.map((id: string, i: number) => [id, i]));
  for (const canvas of state.canvases!) {
    if (orderMap.has(canvas.id)) {
      canvas.order = orderMap.get(canvas.id)!;
    }
  }
  state.canvases!.sort((a, b) => a.order - b.order);
  saveCanvases(state.canvases!);

  return c.json({ success: true });
});

// Migration trigger endpoint
apiRoutes.post("/migrate/canvases", (c) => {
  const result = migrateCategoriesToCanvases();
  return c.json(result);
});

// ============ Website Nodes ============

apiRoutes.post("/website-nodes", async (c) => {
  const body = await c.req.json();
  const { nodeId, url, title, favicon, description, position, canvasId } = body;

  if (!nodeId || typeof nodeId !== "string") return c.json({ error: "nodeId is required" }, 400);
  if (!url || typeof url !== "string") return c.json({ error: "url is required" }, 400);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return c.json({ error: "Only http and https URLs are allowed" }, 400);
    }
  } catch { return c.json({ error: "Invalid URL" }, 400); }

  const state = loadState();
  if (!state.websiteNodes) state.websiteNodes = [];
  state.websiteNodes.push({
    nodeId,
    url,
    title,
    favicon,
    description,
    position: position || { x: 0, y: 0 },
    canvasId: canvasId || "canvas-default",
    createdAt: new Date().toISOString(),
  });
  atomicWriteJson(join(homedir(), ".openui", "state.json"), state);
  return c.json({ success: true });
});

apiRoutes.delete("/website-nodes/:nodeId", (c) => {
  const { nodeId } = c.req.param();
  const state = loadState();
  state.websiteNodes = (state.websiteNodes || []).filter(n => n.nodeId !== nodeId);
  atomicWriteJson(join(homedir(), ".openui", "state.json"), state);
  return c.json({ success: true });
});

apiRoutes.patch("/website-nodes/:nodeId", async (c) => {
  const { nodeId } = c.req.param();
  const updates = await c.req.json();
  const state = loadState();
  const node = state.websiteNodes?.find(n => n.nodeId === nodeId);
  if (!node) return c.json({ error: "Not found" }, 404);
  if (updates.url !== undefined) {
    try {
      const parsed = new URL(updates.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return c.json({ error: "Only http and https URLs are allowed" }, 400);
      }
    } catch { return c.json({ error: "Invalid URL" }, 400); }
    node.url = updates.url;
  }
  if (updates.title !== undefined) node.title = updates.title;
  if (updates.description !== undefined) node.description = updates.description;
  if (updates.favicon !== undefined) node.favicon = updates.favicon;
  atomicWriteJson(join(homedir(), ".openui", "state.json"), state);
  return c.json({ success: true });
});

// Fetch page title from a URL (server-side to avoid CORS)
apiRoutes.get("/url-title", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ title: null });

  // Validate URL scheme — only allow http/https to prevent file:// and other schemes
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ title: null });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return c.json({ title: null });
  }

  // Block requests to private/internal IP ranges (SSRF protection)
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("169.254.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.endsWith(".local")
  ) {
    return c.json({ title: null });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OpenUI/1.0)" },
      redirect: "error",
    });
    clearTimeout(timeout);

    // Only parse HTML responses, and limit body size to 64KB
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return c.json({ title: null });
    }

    const reader = res.body?.getReader();
    if (!reader) return c.json({ title: null });

    const MAX_BYTES = 65536;
    const decoder = new TextDecoder();
    let accumulated = "";
    let bytesRead = 0;

    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.length;
      accumulated += decoder.decode(value, { stream: true });
      // Check for title tag early to avoid reading more than needed
      const match = accumulated.match(/<title[^>]*>([\s\S]+?)<\/title>/i);
      if (match) {
        reader.cancel();
        return c.json({ title: match[1].replace(/\s+/g, " ").trim() });
      }
    }
    reader.cancel();

    // Final check on accumulated content
    const match = accumulated.match(/<title[^>]*>([\s\S]+?)<\/title>/i);
    return c.json({ title: match?.[1]?.replace(/\s+/g, " ").trim() || null });
  } catch {
    return c.json({ title: null });
  }
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

// ============ Write to session terminal ============

apiRoutes.post("/sessions/:sessionId/write", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (!session.pty) return c.json({ error: "Session has no active PTY" }, 400);

  const { message } = await c.req.json();
  if (!message) return c.json({ error: "message is required" }, 400);

  session.pty.write(message + "\n");
  return c.json({ success: true });
});

// ============ UI Actions ============

apiRoutes.post("/ui/select-node", async (c) => {
  const { nodeId } = await c.req.json();
  if (!nodeId) return c.json({ error: "nodeId is required" }, 400);

  if (uiBroadcast) {
    uiBroadcast({ type: "ui-action", action: "select-node", nodeId });
  }
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
import {
  searchConversations,
  getClaudeProjects,
} from "../services/conversationIndex";

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

// ============ Claude Conversation Search ============

// Search/list Claude Code conversations (FTS5 full-text search)
apiRoutes.get("/claude/conversations", (c) => {
  const query = c.req.query("q");
  const projectPath = c.req.query("projectPath");
  const limit = parseInt(c.req.query("limit") || "30", 10);

  try {
    const conversations = searchConversations({
      query: query || undefined,
      projectPath: projectPath || undefined,
      limit,
    });
    return c.json({ conversations });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// List available Claude Code projects
apiRoutes.get("/claude/projects", (c) => {
  try {
    const projects = getClaudeProjects();
    return c.json(projects);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ============ Config (Settings) ============

const configPath = join(getDataDir(), "config.json");

export function loadConfig(): Record<string, any> {
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, "utf8"));
    }
  } catch {}
  return {};
}

function saveConfig(config: Record<string, any>) {
  atomicWriteJson(configPath, config);
}

// ============ Isaac Usage ============

let usageCache: { data: any; timestamp: number } | null = null;
const USAGE_CACHE_TTL = 60_000; // 60 seconds

apiRoutes.get("/usage", async (c) => {
  // Return cached result if fresh
  if (usageCache && Date.now() - usageCache.timestamp < USAGE_CACHE_TTL) {
    return c.json(usageCache.data);
  }

  try {
    const proc = Bun.spawn(["isaac", "usage", "--days", "1"], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Parse summary lines: "Daily: $X.XX", "Weekly: $X.XX", "Monthly: $X.XX"
    const daily = output.match(/Daily:\s*\$([\d,.]+)/)?.[1] || null;
    const weekly = output.match(/Weekly:\s*\$([\d,.]+)/)?.[1] || null;
    const monthly = output.match(/Monthly:\s*\$([\d,.]+)/)?.[1] || null;

    // Parse daily tokens from the table row (e.g. "17.4M" or "387.1M" or "1.2B")
    // The table has columns: Date | Day | Cost | Tokens | Sessions | Duration | Models
    // Match the tokens column value like "17.4M" or "662.9M"
    const tokensMatch = output.match(/│[^│]+│[^│]+│[^│]+│\s*([\d,.]+[KMB]?)\s*│/);
    const dailyTokens = tokensMatch?.[1]?.trim() || null;

    const data = { daily, weekly, monthly, dailyTokens };
    usageCache = { data, timestamp: Date.now() };
    return c.json(data);
  } catch (e) {
    return c.json({ daily: null, weekly: null, monthly: null, dailyTokens: null });
  }
});

// Clean up uploaded images for a session
function cleanupSessionUploads(sessionId: string) {
  const uploadsDir = join(homedir(), ".openui", "uploads", sessionId);
  try {
    rmSync(uploadsDir, { recursive: true, force: true });
    log(`[cleanup] Removed uploads for session ${sessionId}`);
  } catch {}
}

// POST /api/sessions/:sessionId/upload — upload an image and inject its path into the PTY
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/bmp",
]);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB

apiRoutes.post("/sessions/:sessionId/upload", async (c) => {
  const { sessionId } = c.req.param();
  const session = sessions.get(sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const formData = await c.req.formData();
  const file = formData.get("image");
  if (!file || !(file instanceof File)) {
    return c.json({ error: "No image file provided" }, 400);
  }

  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return c.json({ error: `Unsupported image type: ${file.type}` }, 400);
  }

  if (file.size > MAX_IMAGE_SIZE) {
    return c.json({ error: "Image exceeds 20 MB limit" }, 400);
  }

  // Sanitize filename — strip path separators and null bytes
  const safeName = file.name.replace(/[/\\:\0]/g, "_") || `upload-${Date.now()}.png`;
  const uploadDir = join(homedir(), ".openui", "uploads", sessionId);
  mkdirSync(uploadDir, { recursive: true });

  // Deduplicate: prepend timestamp if file already exists
  let finalName = safeName;
  if (existsSync(join(uploadDir, finalName))) {
    finalName = `${Date.now()}-${safeName}`;
  }
  const filePath = join(uploadDir, finalName);
  await Bun.write(filePath, file);

  log(`[upload] Saved image for session ${sessionId}: ${filePath}`);
  return c.json({ filePath });
});

// GET /api/settings — read all user settings (updated version with auto-set firstSeenAt)
apiRoutes.get("/settings-v2", (c) => {
  const config = loadConfig();
  // Auto-set firstSeenAt for new users so they don't see a backlog of "What's New" entries
  if (!config.firstSeenAt) {
    config.firstSeenAt = new Date().toISOString().slice(0, 10); // "2026-02-25"
    saveConfig(config);
  }
  return c.json(config);
});

// PUT /api/settings-v2 — merge user settings
apiRoutes.put("/settings-v2", async (c) => {
  const updates = await c.req.json();
  const config = loadConfig();
  Object.assign(config, updates);
  saveConfig(config);
  return c.json(config);
});

// GET /api/worktrees?cwd=... — list existing git worktrees for a directory
apiRoutes.get("/worktrees", (c) => {
  const cwd = c.req.query("cwd");
  if (!cwd) return c.json({ worktrees: [] });

  const gitCwd = findGitCwd(cwd);
  if (!gitCwd) return c.json({ worktrees: [] });

  try {
    const result = spawnSync(["git", "worktree", "list", "--porcelain"], {
      cwd: gitCwd, stdout: "pipe", stderr: "pipe",
    });
    if (result.exitCode !== 0) return c.json({ worktrees: [] });

    const output = result.stdout.toString();
    const worktrees: { path: string; branch: string }[] = [];
    let currentPath = "";

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        const branch = line.slice("branch refs/heads/".length);
        worktrees.push({ path: currentPath, branch });
      }
    }

    return c.json({ worktrees });
  } catch {
    return c.json({ worktrees: [] });
  }
});
