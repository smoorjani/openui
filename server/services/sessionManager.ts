import { spawnSync } from "bun";
import { spawn as spawnPty } from "bun-pty";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import type { Session } from "../types";
import { loadBuffer } from "./persistence";
import { removeWindow } from "./tmuxShell";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);
const logError = QUIET ? () => {} : console.error.bind(console);

// Get the OpenUI plugin directory path
function getPluginDir(): string | null {
  // Check for plugin in ~/.openui/claude-code-plugin (installed via curl)
  const homePluginDir = join(homedir(), ".openui", "claude-code-plugin");
  const homePluginJson = join(homePluginDir, ".claude-plugin", "plugin.json");
  log(`\x1b[38;5;245m[plugin-check]\x1b[0m Checking home: ${homePluginJson} exists=${existsSync(homePluginJson)}`);
  if (existsSync(homePluginJson)) {
    return homePluginDir;
  }

  // Check for plugin in the openui repo (for development)
  // Use import.meta.dir for ESM compatibility
  const currentDir = import.meta.dir || __dirname;
  const repoPluginDir = join(currentDir, "..", "..", "claude-code-plugin");
  const repoPluginJson = join(repoPluginDir, ".claude-plugin", "plugin.json");
  log(`\x1b[38;5;245m[plugin-check]\x1b[0m Checking repo: ${repoPluginJson} exists=${existsSync(repoPluginJson)}`);
  if (existsSync(repoPluginJson)) {
    return repoPluginDir;
  }

  log(`\x1b[38;5;245m[plugin-check]\x1b[0m No plugin found`);
  return null;
}

// Inject --plugin-dir flag for Claude commands if plugin is available
export function injectPluginDir(command: string, agentId: string): string {
  if (agentId !== "claude") return command;

  const pluginDir = getPluginDir();
  if (!pluginDir) return command;

  // Check if command already has --plugin-dir
  if (command.includes("--plugin-dir")) return command;

  // Handle "llm agent claude" command format
  const parts = command.split(/\s+/);

  if (parts[0] === "llm" && parts[1] === "agent" && parts[2] === "claude") {
    // Insert --plugin-dir after 'claude' (index 2)
    parts.splice(3, 0, `--plugin-dir`, pluginDir);
    const finalCmd = parts.join(" ");
    log(`\x1b[38;5;141m[plugin]\x1b[0m Injecting plugin-dir: ${pluginDir}`);
    log(`\x1b[38;5;141m[plugin]\x1b[0m Final command: ${finalCmd}`);
    return finalCmd;
  }

  return command;
}

// Get git branch for a directory
function getGitBranch(cwd: string): string | null {
  try {
    const result = spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode === 0) {
      return result.stdout.toString().trim();
    }
  } catch {
    // Not a git repo or git not available
  }
  return null;
}

// Get git root directory (returns worktree path if in a worktree)
function getGitRoot(cwd: string): string | null {
  try {
    const result = spawnSync(["git", "rev-parse", "--show-toplevel"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode === 0) {
      return result.stdout.toString().trim();
    }
  } catch {
    // Not a git repo
  }
  return null;
}

// Get the main worktree (mother repo) path - works from any worktree
function getMainWorktree(cwd: string): string | null {
  try {
    // git worktree list shows all worktrees, first one is always the main
    const result = spawnSync(["git", "worktree", "list", "--porcelain"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode === 0) {
      const output = result.stdout.toString();
      // First "worktree" line is the main repo
      const match = output.match(/^worktree (.+)$/m);
      if (match) {
        return match[1];
      }
    }
  } catch {
    // Not a git repo or worktree command failed
  }
  return null;
}

// Create a git worktree for a branch
export function createWorktree(params: {
  cwd: string;
  branchName: string;
  baseBranch: string;
}): { success: boolean; worktreePath?: string; error?: string } {
  const { cwd, branchName, baseBranch } = params;
  const gitRoot = getGitRoot(cwd);

  if (!gitRoot) {
    return { success: false, error: "Not a git repository" };
  }

  // Create worktrees directory beside the main repo
  const repoName = basename(gitRoot);
  const worktreesDir = join(gitRoot, "..", `${repoName}-worktrees`);

  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }

  // Sanitize branch name for directory
  const dirName = branchName.replace(/\//g, "-");
  const worktreePath = join(worktreesDir, dirName);

  // Check if worktree already exists
  if (existsSync(worktreePath)) {
    log(`\x1b[38;5;141m[worktree]\x1b[0m Worktree already exists: ${worktreePath}`);
    return { success: true, worktreePath };
  }

  // Check if upstream remote exists (common in fork workflows)
  const hasUpstream = spawnSync(["git", "remote", "get-url", "upstream"], {
    cwd: gitRoot,
    stdout: "pipe",
    stderr: "pipe",
  }).exitCode === 0;

  // Fetch from upstream (preferred) and origin
  log(`\x1b[38;5;141m[worktree]\x1b[0m Fetching from remote...`);
  if (hasUpstream) {
    log(`\x1b[38;5;141m[worktree]\x1b[0m Fetching from upstream...`);
    spawnSync(["git", "fetch", "upstream"], { cwd: gitRoot, stdout: "pipe", stderr: "pipe" });
  }
  spawnSync(["git", "fetch", "origin"], { cwd: gitRoot, stdout: "pipe", stderr: "pipe" });

  // Determine the best remote for the base branch (prefer upstream if available)
  const baseRemote = hasUpstream ? "upstream" : "origin";

  // Check if branch exists locally or remotely
  const localBranch = spawnSync(["git", "rev-parse", "--verify", branchName], {
    cwd: gitRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const remoteBranchOrigin = spawnSync(["git", "rev-parse", "--verify", `origin/${branchName}`], {
    cwd: gitRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  const remoteBranchUpstream = hasUpstream ? spawnSync(["git", "rev-parse", "--verify", `upstream/${branchName}`], {
    cwd: gitRoot,
    stdout: "pipe",
    stderr: "pipe",
  }) : null;

  let result;
  if (localBranch.exitCode === 0) {
    // Branch exists locally, just add worktree
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating worktree for existing branch: ${branchName}`);
    result = spawnSync(["git", "worktree", "add", worktreePath, branchName], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
  } else if (remoteBranchUpstream?.exitCode === 0) {
    // Branch exists on upstream, track it
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating worktree tracking upstream branch: ${branchName}`);
    result = spawnSync(["git", "worktree", "add", "--track", "-b", branchName, worktreePath, `upstream/${branchName}`], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
  } else if (remoteBranchOrigin.exitCode === 0) {
    // Branch exists on origin, track it
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating worktree tracking origin branch: ${branchName}`);
    result = spawnSync(["git", "worktree", "add", "--track", "-b", branchName, worktreePath, `origin/${branchName}`], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
  } else {
    // Create new branch from base (prefer upstream if available)
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating new worktree with branch: ${branchName} from ${baseRemote}/${baseBranch}`);
    result = spawnSync(["git", "worktree", "add", "-b", branchName, worktreePath, `${baseRemote}/${baseBranch}`], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
  }

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString();
    logError(`\x1b[38;5;141m[worktree]\x1b[0m Failed to create worktree:`, stderr);
    return { success: false, error: stderr };
  }

  log(`\x1b[38;5;141m[worktree]\x1b[0m Created worktree at: ${worktreePath}`);

  // Copy .claude/settings.local.json from parent repo to worktree if it exists
  const parentSettingsPath = join(gitRoot, ".claude", "settings.local.json");
  if (existsSync(parentSettingsPath)) {
    const worktreeClaudeDir = join(worktreePath, ".claude");
    const worktreeSettingsPath = join(worktreeClaudeDir, "settings.local.json");
    try {
      if (!existsSync(worktreeClaudeDir)) {
        mkdirSync(worktreeClaudeDir, { recursive: true });
      }
      copyFileSync(parentSettingsPath, worktreeSettingsPath);
      log(`\x1b[38;5;141m[worktree]\x1b[0m Copied .claude/settings.local.json to worktree`);
    } catch (e) {
      logError(`\x1b[38;5;141m[worktree]\x1b[0m Failed to copy settings.local.json:`, e);
    }
  }

  return { success: true, worktreePath };
}


const MAX_BUFFER_SIZE = 1000;

export const sessions = new Map<string, Session>();

export function createSession(params: {
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  nodeId: string;
  customName?: string;
  customColor?: string;
  // Ticket and worktree options
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  branchName?: string;
  baseBranch?: string;
  createWorktreeFlag?: boolean;
  ticketPromptTemplate?: string;
}): { session: Session; cwd: string; gitBranch?: string } {
  const {
    sessionId,
    agentId,
    agentName,
    command,
    cwd: originalCwd,
    nodeId,
    customName,
    customColor,
    ticketId,
    ticketTitle,
    ticketUrl,
    branchName,
    baseBranch,
    createWorktreeFlag,
    ticketPromptTemplate,
  } = params;

  let workingDir = originalCwd;
  let worktreePath: string | undefined;
  let mainRepoPath: string | undefined;
  let gitBranch: string | null = null;

  // If worktree requested, create it and use that path
  if (createWorktreeFlag && branchName && baseBranch) {
    const result = createWorktree({
      cwd: originalCwd,
      branchName,
      baseBranch,
    });
    if (result.success && result.worktreePath) {
      workingDir = result.worktreePath;
      worktreePath = result.worktreePath;
      mainRepoPath = originalCwd; // The original cwd is the main repo
      gitBranch = branchName;
      log(`\x1b[38;5;141m[session]\x1b[0m Using worktree: ${workingDir}, main repo: ${mainRepoPath}`);
    } else {
      logError(`\x1b[38;5;141m[session]\x1b[0m Failed to create worktree:`, result.error);
    }
  }

  // If no explicit worktree but we're in a worktree, detect the main repo
  if (!mainRepoPath) {
    const detectedMainRepo = getMainWorktree(workingDir);
    if (detectedMainRepo && detectedMainRepo !== workingDir) {
      mainRepoPath = detectedMainRepo;
      log(`\x1b[38;5;141m[session]\x1b[0m Detected main repo from worktree: ${mainRepoPath}`);
    }
  }

  // Get git branch if not already set from worktree
  if (!gitBranch) {
    gitBranch = getGitBranch(workingDir);
  }

  const ptyProcess = spawnPty("/bin/zsh", [], {
    name: "xterm-256color",
    cwd: workingDir,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      // Pass our session ID so the plugin can include it in status updates
      OPENUI_SESSION_ID: sessionId,
    },
    rows: 30,
    cols: 120,
  });

  const now = Date.now();
  const session: Session = {
    pty: ptyProcess,
    agentId,
    agentName,
    command,
    cwd: workingDir,
    originalCwd: mainRepoPath, // Store mother repo when using worktree
    gitBranch: gitBranch || undefined,
    worktreePath,
    createdAt: new Date().toISOString(),
    clients: new Set(),
    outputBuffer: [],
    status: "idle",
    lastOutputTime: now,
    lastInputTime: 0,
    recentOutputSize: 0,
    customName,
    customColor,
    nodeId,
    isRestored: false,
    ticketId,
    ticketTitle,
    ticketUrl,
  };

  sessions.set(sessionId, session);

  // Output decay
  const resetInterval = setInterval(() => {
    if (!sessions.has(sessionId) || !session.pty) {
      clearInterval(resetInterval);
      return;
    }
    session.recentOutputSize = Math.max(0, session.recentOutputSize - 50);
  }, 500);

  // PTY output handler
  ptyProcess.onData((data: string) => {
    session.outputBuffer.push(data);
    if (session.outputBuffer.length > MAX_BUFFER_SIZE) {
      session.outputBuffer.shift();
    }

    session.lastOutputTime = Date.now();
    session.recentOutputSize += data.length;

    // Just broadcast output - status comes from plugin hooks
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "output", data }));
      }
    }
  });

  // Run the command (inject plugin-dir for Claude if available)
  const finalCommand = injectPluginDir(command, agentId);
  log(`\x1b[38;5;82m[pty-write]\x1b[0m Writing command: ${finalCommand}`);
  setTimeout(() => {
    ptyProcess.write(`${finalCommand}\r`);

    // If there's a ticket URL, send it to the agent after a delay
    if (ticketUrl) {
      setTimeout(() => {
        // Use custom template or default
        const defaultTemplate = "Here is the ticket for this session: {{url}}\n\nPlease use the Linear MCP tool or fetch the URL to read the full ticket details before starting work.";
        const template = ticketPromptTemplate || defaultTemplate;
        const ticketPrompt = template
          .replace(/\{\{url\}\}/g, ticketUrl)
          .replace(/\{\{id\}\}/g, ticketId || "")
          .replace(/\{\{title\}\}/g, ticketTitle || "");
        ptyProcess.write(ticketPrompt + "\r");
      }, 2000);
    }
  }, 300);

  log(`\x1b[38;5;141m[session]\x1b[0m Created ${sessionId} for ${agentName}${ticketId ? ` (ticket: ${ticketId})` : ""}`);
  return { session, cwd: workingDir, gitBranch: gitBranch || undefined };
}

export function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  if (session.pty) session.pty.kill();

  // Remove tmux window for this session
  removeWindow(sessionId);

  // If this was a worktree session, remove the worktree
  if (session.worktreePath && session.originalCwd) {
    try {
      log(`\x1b[38;5;141m[session]\x1b[0m Removing worktree: ${session.worktreePath} from ${session.originalCwd}`);
      // Use absolute path for worktree removal
      const result = spawnSync(["git", "worktree", "remove", "-f", session.worktreePath], {
        cwd: session.originalCwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      if (result.exitCode !== 0) {
        const stderr = result.stderr?.toString() || "";
        logError(`\x1b[38;5;196m[session]\x1b[0m Failed to remove worktree: ${stderr}`);
        // If it failed, try with prune first
        log(`\x1b[38;5;141m[session]\x1b[0m Trying git worktree prune first...`);
        spawnSync(["git", "worktree", "prune"], { cwd: session.originalCwd, stdout: "pipe", stderr: "pipe" });
        // Retry removal
        const retryResult = spawnSync(["git", "worktree", "remove", "-f", session.worktreePath], {
          cwd: session.originalCwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        if (retryResult.exitCode !== 0) {
          logError(`\x1b[38;5;196m[session]\x1b[0m Retry also failed: ${retryResult.stderr?.toString()}`);
        } else {
          log(`\x1b[38;5;141m[session]\x1b[0m Worktree removed after prune`);
        }
      } else {
        log(`\x1b[38;5;141m[session]\x1b[0m Worktree removed successfully`);
      }
    } catch (e) {
      logError(`\x1b[38;5;196m[session]\x1b[0m Error removing worktree:`, e);
    }
  } else if (session.cwd && session.cwd.includes("-worktrees/")) {
    // Fallback: Try to detect worktree from cwd path
    log(`\x1b[38;5;141m[session]\x1b[0m Attempting worktree cleanup from cwd: ${session.cwd}`);
    try {
      // Extract main repo path from worktree path (e.g., /path/repo-worktrees/branch -> /path/repo)
      const worktreesMatch = session.cwd.match(/^(.+)-worktrees\//);
      if (worktreesMatch) {
        const mainRepo = worktreesMatch[1];
        log(`\x1b[38;5;141m[session]\x1b[0m Detected main repo: ${mainRepo}`);
        spawnSync(["git", "worktree", "prune"], { cwd: mainRepo, stdout: "pipe", stderr: "pipe" });
        const result = spawnSync(["git", "worktree", "remove", "-f", session.cwd], {
          cwd: mainRepo,
          stdout: "pipe",
          stderr: "pipe",
        });
        if (result.exitCode === 0) {
          log(`\x1b[38;5;141m[session]\x1b[0m Worktree removed via fallback`);
        } else {
          logError(`\x1b[38;5;196m[session]\x1b[0m Fallback removal failed: ${result.stderr?.toString()}`);
        }
      }
    } catch (e) {
      logError(`\x1b[38;5;196m[session]\x1b[0m Fallback worktree removal error:`, e);
    }
  }

  sessions.delete(sessionId);
  log(`\x1b[38;5;141m[session]\x1b[0m Killed ${sessionId}`);
  return true;
}

export function restoreSessions() {
  const { loadState } = require("./persistence");
  const state = loadState();

  log(`\x1b[38;5;245m[restore]\x1b[0m Found ${state.nodes.length} saved sessions`);

  for (const node of state.nodes) {
    const buffer = loadBuffer(node.sessionId);
    const gitBranch = getGitBranch(node.cwd);

    const session: Session = {
      pty: null,
      agentId: node.agentId,
      agentName: node.agentName,
      command: node.command,
      cwd: node.cwd,
      originalCwd: node.originalCwd,      // Restore for worktree cleanup
      worktreePath: node.worktreePath,    // Restore for worktree cleanup
      gitBranch: gitBranch || undefined,
      createdAt: node.createdAt,
      clients: new Set(),
      outputBuffer: buffer,
      status: "disconnected",
      lastOutputTime: 0,
      lastInputTime: 0,
      recentOutputSize: 0,
      customName: node.customName,
      customColor: node.customColor,
      notes: node.notes,
      nodeId: node.nodeId,
      isRestored: true,
      claudeSessionId: node.claudeSessionId,  // Restore Claude session ID for --resume
    };

    sessions.set(node.sessionId, session);
    log(`\x1b[38;5;245m[restore]\x1b[0m Restored ${node.sessionId} (${node.agentName}) branch: ${gitBranch || 'none'}`);
  }
}
