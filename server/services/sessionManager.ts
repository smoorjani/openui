import { spawnSync, spawn as bunSpawn } from "bun";
import { spawn as spawnPty } from "bun-pty";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import type { Session } from "../types";
import { loadBuffer } from "./persistence";
import { loadSettings } from "./worktreeConfig";
import { enqueueSessionStart, signalSessionReady } from "./sessionStartQueue";

const DEFAULT_PERMISSIONS = [
  // Shell basics
  "Bash(bash:*)",
  "Bash(source:*)",
  "Bash(echo:*)",
  "Bash(pwd:*)",
  "Bash(cd:*)",
  "Bash(pushd:*)",
  "Bash(popd)",

  // File operations
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(head:*)",
  "Bash(tail:*)",
  "Bash(find:*)",
  "Bash(grep:*)",
  "Bash(rg:*)",
  "Bash(tree:*)",
  "Bash(sort:*)",
  "Bash(uniq:*)",
  "Bash(cut:*)",
  "Bash(wc:*)",
  "Bash(jq:*)",
  "Bash(sed:*)",
  "Bash(mkdir:*)",
  "Bash(rm:*)",
  "Bash(mv:*)",
  "Bash(chmod:*)",

  // System info
  "Bash(ps:*)",
  "Bash(top:*)",
  "Bash(df:*)",
  "Bash(du:*)",
  "Bash(which:*)",
  "Bash(whereis:*)",
  "Bash(whoami:*)",
  "Bash(lsof:*)",
  "Bash(pgrep:*)",
  "Bash(xargs kill:*)",

  // Network & SSH
  "Bash(curl:*)",
  "Bash(ssh:*)",

  // Python
  "Bash(python:*)",
  "Bash(python3:*)",
  "Bash(.venv/bin/python:*)",
  "Bash(conda activate:*)",
  "Bash(uv:*)",
  "Bash(pip install:*)",
  "Bash(pip index:*)",
  "Bash(pip show:*)",
  "Bash(ruff check:*)",
  "Bash(ruff format:*)",

  // JavaScript / TypeScript
  "Bash(npm run build:*)",
  "Bash(npm create:*)",
  "Bash(npm install)",
  "Bash(npx tsc:*)",
  "Bash(npx playwright test:*)",
  "Bash(npx jest:*)",
  "Bash(bunx tsc:*)",
  "Bash(bun run:*)",
  "Bash(bun -e:*)",
  "Bash(yarn install:*)",
  "Bash(yarn lint:*)",
  "Bash(yarn test:*)",
  "Bash(yarn tsc:*)",
  "Bash(yarn type-check)",
  "Bash(yarn prettier:check:*)",
  "Bash(yarn prettier:fix:*)",
  "Bash(yarn i18n:*)",
  "Bash(yarn build:*)",

  // Git
  "Bash(git add:*)",
  "Bash(git branch:*)",
  "Bash(git checkout:*)",
  "Bash(git cherry-pick:*)",
  "Bash(git clone:*)",
  "Bash(git commit:*)",
  "Bash(git diff:*)",
  "Bash(git fetch:*)",
  "Bash(git grep:*)",
  "Bash(git log:*)",
  "Bash(git ls-remote:*)",
  "Bash(git merge-base:*)",
  "Bash(git mv:*)",
  "Bash(git pull:*)",
  "Bash(git push:*)",
  "Bash(git rebase:*)",
  "Bash(git reset:*)",
  "Bash(git restore:*)",
  "Bash(git revert:*)",
  "Bash(git rev-parse:*)",
  "Bash(git rm:*)",
  "Bash(git show:*)",
  "Bash(git stack:*)",
  "Bash(git stash:*)",
  "Bash(git status:*)",
  "Bash(git tag:*)",

  // GitHub CLI
  "Bash(gh api:*)",
  "Bash(gh issue list:*)",
  "Bash(gh issue view:*)",
  "Bash(gh pr create:*)",
  "Bash(gh pr diff:*)",
  "Bash(gh pr list:*)",
  "Bash(gh pr view:*)",
  "Bash(gh repo view:*)",
  "Bash(gh search:*)",
  "Bash(gstk:*)",

  // Kubernetes
  "Bash(kubectl describe:*)",
  "Bash(kubectl get:*)",
  "Bash(kubectl logs:*)",
  "Bash(kubectl version)",

  // Bazel
  "Bash(bazel query:*)",
  "Bash(bazel build:*)",
  "Bash(bazel test:*)",

  // Other tools
  "Bash(docker info:*)",
  "Bash(protoc:*)",
  "Bash(sqlite3:*)",
  "Bash(claude -p:*)",
  "Bash(brew install:*)",
  "Bash(brew upgrade:*)",
  "Bash(brew unlink:*)",
  "Bash(brew list:*)",
  "Bash(xcode-select:*)",

  // Read permissions
  "Read(//tmp/**)",
  "Read(~/.runtests/**)",
  "Read(~/.cache/bazel/**)",
  "Read(~/.cache/debug-copilot/prometheus/**)",

  // WebSearch
  "WebSearch",

  // WebFetch
  "WebFetch(domain:*.anthropic.com)",
  "WebFetch(domain:code.claude.com)",
  "WebFetch(domain:docs.claude.com)",
  "WebFetch(domain:*.mozilla.org)",
  "WebFetch(domain:mlflow.org)",
  "WebFetch(domain:docs.databricks.com)",
  "WebFetch(domain:www.databricks.com)",
  "WebFetch(domain:databricks-sdk-py.readthedocs.io)",
  "WebFetch(domain:github.com)",
  "WebFetch(domain:raw.githubusercontent.com)",
  "WebFetch(domain:docs.deepeval.com)",
  "WebFetch(domain:deepeval.com)",
  "WebFetch(domain:docs.ragas.io)",
  "WebFetch(domain:docs.google.com)",
  "WebFetch(domain:pypi.org)",
  "WebFetch(domain:scholar.google.com)",
  "WebFetch(domain:www.youtube.com)",
  "WebFetch(domain:www.reddit.com)",

  // MCP - GitHub
  "mcp__github__github_get_service_info",
  "mcp__github__github_get_api_info",
  "mcp__github__github_read_api_call",
  "mcp__proxy__github__github_read_api_call",

  // MCP - Databricks
  "mcp__databricks__execute_parameterized_sql",
  "mcp__databricks__check_statement_status",
  "mcp__databricks__cancel_statement",
  "mcp__databricks__list_dbfs_files",
  "mcp__databricks__read_dbfs_file_contents",
  "mcp__databricks__get_dbfs_destination",
  "mcp__databricks__databricks_jobs",

  // MCP - Glean
  "mcp__glean__glean_get_service_info",
  "mcp__glean__glean_get_api_info",
  "mcp__glean__glean_read_api_call",
  "mcp__glean__list_entities",
  "mcp__glean__get_person",

  // MCP - Jira
  "mcp__jira__jira_get_service_info",
  "mcp__jira__jira_get_api_info",
  "mcp__jira__jira_read_api_call",

  // MCP - Confluence
  "mcp__confluence__get_confluence_page_content",
  "mcp__confluence__search_confluence_pages",
  "mcp__confluence__get_confluence_spaces",
  "mcp__confluence__get_page_children",

  // MCP - DevPortal
  "mcp__devportal__devportal_get_service_info",
  "mcp__devportal__devportal_get_api_info",
  "mcp__devportal__devportal_read_api_call",

  // MCP - PagerDuty
  "mcp__pagerduty__pagerduty_query",

  // MCP - Debug Copilot
  "mcp__debug-copilot__get_investigation_details",
  "mcp__debug-copilot__query_prometheus_metrics",
  "mcp__debug-copilot__get_grafana_dashboard",
  "mcp__debug-copilot__get_dashboard_filter_values",

  // MCP - Slack
  "mcp__slack__slack_get_service_info",
  "mcp__slack__slack_get_api_info",
  "mcp__slack__slack_read_api_call",
  "mcp__slack__slack_batch_read_api_call",

  // MCP - Google
  "mcp__google__google_get_service_info",
  "mcp__google__google_get_api_info",
  "mcp__google__google_read_api_call",

  // MCP - Testman
  "mcp__testman__list_investigations",
  "mcp__testman__get_investigation",
  "mcp__testman__get_investigation_tags",
  "mcp__testman__list_smartreverts",
  "mcp__testman__get_smartrevert",
  "mcp__testman__get_smartrevert_tags",
  "mcp__testman__get_relevant_investigations",
  "mcp__testman__list_issues",
  "mcp__testman__get_issue",

  // MCP - Chrome DevTools
  "mcp__chrome-devtools__click",
  "mcp__chrome-devtools__evaluate_script",
  "mcp__chrome-devtools__get_network_request",
  "mcp__chrome-devtools__hover",
  "mcp__chrome-devtools__list_network_requests",
  "mcp__chrome-devtools__list_pages",
  "mcp__chrome-devtools__navigate_page",
  "mcp__chrome-devtools__new_page",
  "mcp__chrome-devtools__press_key",
  "mcp__chrome-devtools__take_screenshot",
  "mcp__chrome-devtools__take_snapshot",
  "mcp__chrome-devtools__wait_for",

  // MCP - Playwright
  "mcp__playwright__browser_click",
  "mcp__playwright__browser_close",
  "mcp__playwright__browser_console_messages",
  "mcp__playwright__browser_evaluate",
  "mcp__playwright__browser_hover",
  "mcp__playwright__browser_navigate",
  "mcp__playwright__browser_press_key",
  "mcp__playwright__browser_snapshot",
  "mcp__playwright__browser_take_screenshot",
  "mcp__playwright__browser_wait_for",
  "mcp__plugin_playwright_playwright__browser_click",
  "mcp__plugin_playwright_playwright__browser_close",
  "mcp__plugin_playwright_playwright__browser_navigate",
  "mcp__plugin_playwright_playwright__browser_run_code",
  "mcp__plugin_playwright_playwright__browser_snapshot",
  "mcp__plugin_playwright_playwright__browser_take_screenshot",
];

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);
const logError = QUIET ? () => {} : console.error.bind(console);

// Detect available CLI at startup
const HAS_ISAAC = spawnSync(["which", "isaac"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;
export const DEFAULT_CLAUDE_COMMAND = HAS_ISAAC ? "isaac" : "llm agent claude";
log(`\x1b[38;5;141m[cli]\x1b[0m Detected CLI: ${DEFAULT_CLAUDE_COMMAND} (isaac ${HAS_ISAAC ? "found" : "not found"})`);

// Remote host mappings for SSH-based sessions
// Default hosts; overridden by remoteHosts in .openui/config.json
const DEFAULT_REMOTE_HOSTS: Record<string, string> = {
  "arca": "arca.ssh",
};

export function getRemoteHosts(): Record<string, string> {
  const settings = loadSettings();
  return settings.remoteHosts ?? DEFAULT_REMOTE_HOSTS;
}

// Kept for backwards compat with api.ts import
export const REMOTE_HOSTS = new Proxy({} as Record<string, string>, {
  get(_target, prop) { return getRemoteHosts()[prop as string]; },
  ownKeys() { return Object.keys(getRemoteHosts()); },
  getOwnPropertyDescriptor(_target, prop) {
    const hosts = getRemoteHosts();
    if (prop in hosts) return { configurable: true, enumerable: true, value: hosts[prop as string] };
    return undefined;
  },
});

export function getRemoteHost(remote: string): string {
  return getRemoteHosts()[remote] || remote;
}

// Port for the SSH reverse tunnel (remote → local). Use a high port to avoid
// conflicts with other services on shared remote machines like Arca.
const TUNNEL_PORT = 46968;
const SERVER_PORT = parseInt(process.env.PORT || "6968", 10);
const MAX_BUFFER_SIZE = 5000;

// Find the git-capable directory for a given path.
export function findGitCwd(cwd: string): string | null {
  const hasGitEntry = (dir: string) => existsSync(join(dir, ".git"));
  if (hasGitEntry(cwd)) return cwd;
  const check = spawnSync(["git", "rev-parse", "--show-toplevel"], {
    cwd, stdout: "pipe", stderr: "pipe",
  });
  if (check.exitCode === 0) return cwd;
  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const sub = join(cwd, entry.name);
      if (!hasGitEntry(sub)) continue;
      const result = spawnSync(["git", "rev-parse", "--show-toplevel"], {
        cwd: sub, stdout: "pipe", stderr: "pipe",
      });
      if (result.exitCode === 0) return sub;
    }
  } catch { /* ignore */ }
  return null;
}

// Async git spawn helper
function gitSpawnAsync(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = bunSpawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout?.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr?.on("data", (d: Buffer) => errChunks.push(d));
    proc.on("exit", (code: number) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(chunks).toString(),
        stderr: Buffer.concat(errChunks).toString(),
      });
    });
  });
}

// Create a git worktree for a branch
export async function createWorktreeForBranch(cwd: string, branchName: string, baseBranch?: string): Promise<string | null> {
  try {
    const sanitizedBranch = branchName.replace(/\//g, "-");
    const topResult = spawnSync(["git", "rev-parse", "--show-toplevel"], {
      cwd, stdout: "pipe", stderr: "pipe",
    });
    let gitCwd: string;
    let worktreePath: string;
    if (topResult.exitCode === 0) {
      const repoRoot = topResult.stdout.toString().trim();
      const repoName = repoRoot.split("/").pop() || "repo";
      worktreePath = join(repoRoot, "..", `${repoName}-worktrees`, sanitizedBranch);
      gitCwd = cwd;
    } else {
      worktreePath = join(cwd, sanitizedBranch);
      const found = findGitCwd(cwd);
      if (!found) { log(`[git] No git repo found in ${cwd}`); return null; }
      gitCwd = found;
    }
    if (existsSync(worktreePath)) { log(`[git] Worktree already exists at ${worktreePath}`); return worktreePath; }
    const branchExists = spawnSync(["git", "rev-parse", "--verify", branchName], {
      cwd: gitCwd, stdout: "pipe", stderr: "pipe",
    }).exitCode === 0;
    if (branchExists) {
      const result = await gitSpawnAsync(["worktree", "add", worktreePath, branchName], gitCwd);
      if (result.exitCode !== 0) { log(`[git] Worktree add failed: ${result.stderr}`); return null; }
    } else {
      let base = baseBranch || "HEAD";
      if (baseBranch) {
        const fetchResult = await gitSpawnAsync(["fetch", "origin", baseBranch], gitCwd);
        if (fetchResult.exitCode === 0) base = `origin/${baseBranch}`;
      }
      const result = await gitSpawnAsync(["worktree", "add", "-b", branchName, worktreePath, base], gitCwd);
      if (result.exitCode !== 0) { log(`[git] Worktree add -b failed: ${result.stderr}`); return null; }
    }
    return worktreePath;
  } catch (e) { log(`[git] Worktree creation error: ${e}`); return null; }
}

// Create a shell session (raw terminal, no agent)
export function createShellSession(cwd: string, nodeId: string): { shellId: string; session: Session } {
  const shellId = `shell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userShell = process.env.SHELL || "/bin/bash";
  const session: Session = {
    pty: null as any,
    agentId: "shell",
    agentName: "Shell",
    command: "",
    cwd,
    createdAt: new Date().toISOString(),
    clients: new Set(),
    outputBuffer: [],
    outputSeq: 0,
    status: "idle",
    lastOutputTime: Date.now(),
    lastInputTime: 0,
    recentOutputSize: 0,
    nodeId,
    isRestored: false,
  };
  const ptyProcess = spawnPty(userShell, [], {
    name: "xterm-256color",
    cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    rows: 30,
    cols: 120,
  });
  session.pty = ptyProcess;
  attachOutputHandler(session, ptyProcess);
  sessions.set(shellId, session);
  log(`[shell] Created shell ${shellId} at ${cwd}`);
  return { shellId, session };
}

function sshArgs(host: string, remoteCommand: string): string[] {
  return ["-t", "-R", `${TUNNEL_PORT}:localhost:${SERVER_PORT}`, "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", host, remoteCommand];
}

function sshExec(remote: string, command: string): { exitCode: number; stdout: string; stderr: string } {
  const host = getRemoteHost(remote);
  const result = spawnSync(["ssh", host, command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

// Async SSH execution (non-blocking)
export async function sshExecAsync(remote: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const host = getRemoteHost(remote);
  const proc = bunSpawn(["ssh", host, command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// Async local command execution (non-blocking)
async function execAsync(cmd: string[], cwd?: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = bunSpawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd,
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

/** Broadcast a message to all WebSocket clients of a session, with try-catch per client */
export function broadcastToSession(session: Session, message: object) {
  // Auto-attach outputSeq to output messages so clients can track position
  const msg = (message as any).type === "output" ? { ...message, seq: session.outputSeq } : message;
  const json = JSON.stringify(msg);
  for (const client of session.clients) {
    try {
      if (client.readyState === 1) {
        client.send(json);
      }
    } catch {
      session.clients.delete(client);
    }
  }
}

/** Attach the standard PTY output handler to a session */
export function attachOutputHandler(session: Session, ptyProcess: any): void {
  // Small tail buffer for detecting patterns that span chunk boundaries.
  // We keep the last 128 chars and prepend them to each new chunk for matching.
  let tailBuf = "";

  // Output batching: buffer PTY chunks for up to 16ms before broadcasting.
  // Claude Code's TUI sends clear-screen + redraw as consecutive chunks within
  // a few ms of each other. Batching combines them into one WebSocket message
  // so xterm processes the full redraw in a single pass, eliminating the
  // intermediate render flashes caused by multi-chunk TUI redraws.
  let batchBuf = "";
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const flushBatch = () => {
    if (batchBuf) {
      broadcastToSession(session, { type: "output", data: batchBuf });
      batchBuf = "";
    }
    batchTimer = null;
  };

  ptyProcess.onData((data: string) => {
    session.outputBuffer.push(data);
    session.outputSeq++;
    if (session.outputBuffer.length > MAX_BUFFER_SIZE) session.outputBuffer.shift();
    session.lastOutputTime = Date.now();
    session.recentOutputSize += data.length;

    batchBuf += data;
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(flushBatch, 16);

    // Combine tail of previous chunk(s) with current chunk for cross-boundary matching
    const combined = tailBuf + data;
    // Keep last 128 chars for next iteration
    tailBuf = combined.length > 128 ? combined.slice(-128) : combined;

    // Inline model detection on the combined window
    const hasSetModel = combined.includes("Set model") || combined.includes("Set\x1b");
    const hasBanner = !session.model && combined.includes("█");

    if (hasSetModel || hasBanner) {
      const clean = combined.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
                            .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, "")
                            .replace(/\x1b\][^\x07]*\x07/g, "");

      if (hasSetModel) {
        // /model change: always authoritative
        const m = clean.match(/Set model to\s*(Opus|Sonnet|Haiku)\s*(\d+)\.(\d+)\s*(?:\((\d+[MKmk])\s*context\))?/i);
        if (m) {
          const family = m[1].toLowerCase();
          const base = `claude-${family}-${m[2]}-${m[3]}`;
          session.model = m[4] ? `${base}[${m[4].toLowerCase()}]` : base;
          log(`\x1b[38;5;141m[model]\x1b[0m ${session.nodeId}: model changed to ${session.model}`);
        }
      } else if (hasBanner) {
        // Startup banner: only for initial detection
        const m = clean.match(/█+▛▘\s*(Opus|Sonnet|Haiku)\s*(\d+)\.(\d+)\s*(?:\((\d+[MKmk])\s*context\))?/i);
        if (m) {
          const family = m[1].toLowerCase();
          const base = `claude-${family}-${m[2]}-${m[3]}`;
          session.model = m[4] ? `${base}[${m[4].toLowerCase()}]` : base;
          log(`\x1b[38;5;141m[model]\x1b[0m ${session.nodeId}: detected ${session.model} from banner`);
        }
      }
    }
  });
}

// Set up PTY output handlers for a session
function setupPtyHandlers(session: Session, sessionId: string, ptyProcess: ReturnType<typeof spawnPty>) {
  const resetInterval = setInterval(() => {
    if (!sessions.has(sessionId) || !session.pty) {
      clearInterval(resetInterval);
      return;
    }
    session.recentOutputSize = Math.max(0, session.recentOutputSize - 50);
  }, 500);

  attachOutputHandler(session, ptyProcess);

  ptyProcess.onExit(() => {
    if (!sessions.has(sessionId)) return;
    // Guard: only act if this PTY is still the active one (prevents race when /restart kills old PTY)
    if (session.pty !== null && session.pty !== ptyProcess) return;

    session.pty = null;

    if (session.remote) {
      const MAX_RECONNECT = 3;
      session.reconnectAttempts = (session.reconnectAttempts || 0) + 1;

      // Extract SSH error from recent output buffer
      const recentOutput = session.outputBuffer.slice(-10).join("");
      const sshErrorMatch = recentOutput.match(/(Connection to .+|Connection refused.+|Connection timed out.+|ssh: .+|Permission denied.+|Host key verification failed.+|No route to host.+|Could not resolve.+|client_loop: send disconnect.+)/im);
      const sshError = sshErrorMatch ? sshErrorMatch[1].trim() : "SSH connection lost";

      log(`\x1b[38;5;208m[pty-exit]\x1b[0m Remote SSH exited for ${sessionId} (attempt ${session.reconnectAttempts}/${MAX_RECONNECT}): ${sshError}`);
      session.status = "disconnected";

      broadcastToSession(session, {
        type: "status",
        status: "disconnected",
        sshError,
        reconnectAttempt: session.reconnectAttempts,
        maxReconnectAttempts: MAX_RECONNECT,
      });

      if (session.reconnectAttempts >= MAX_RECONNECT) {
        broadcastToSession(session, {
          type: "output",
          data: `\r\n\x1b[38;5;196m[openui] SSH reconnect failed after ${MAX_RECONNECT} attempts: ${sshError}\x1b[0m\r\n\x1b[38;5;245m[openui] Use the refresh button to retry manually.\x1b[0m\r\n`,
        });
        return;
      }

      broadcastToSession(session, {
        type: "output",
        data: `\r\n\x1b[38;5;208m[openui] SSH disconnected: ${sshError}. Reconnecting (${session.reconnectAttempts}/${MAX_RECONNECT})...\x1b[0m\r\n`,
      });

      setTimeout(async () => {
        if (!sessions.has(sessionId) || session.pty) return;

        try {
          const success = await resumeSession(sessionId);
          if (success) {
            log(`\x1b[38;5;82m[auto-reconnect]\x1b[0m Reconnected ${sessionId}`);
          } else {
            log(`\x1b[38;5;196m[auto-reconnect]\x1b[0m Failed to reconnect ${sessionId}`);
          }
        } catch (e) {
          log(`\x1b[38;5;196m[auto-reconnect]\x1b[0m Error reconnecting ${sessionId}: ${e}`);
        }
      }, 3000);
    } else {
      // Local PTY exited — mark disconnected, user can manually resume
      log(`\x1b[38;5;245m[pty-exit]\x1b[0m PTY exited for ${sessionId}`);
      session.status = "disconnected";
      broadcastToSession(session, {
        type: "status",
        status: "disconnected",
      });
    }
  });
}

// Schedule an initial prompt to be written to PTY once isaac is ready.
// Waits for the plugin hook to report "waiting_input" (meaning isaac is at its prompt).
// Polls for up to 60s, then gives up.
function scheduleInitialPrompt(session: Session, sessionId: string, ptyProcess: ReturnType<typeof spawnPty>) {
  if (!session.initialPrompt) return;

  const prompt = session.initialPrompt;
  let sent = false;
  let elapsed = 0;

  const pollInterval = setInterval(() => {
    elapsed += 500;

    if (sent || !sessions.has(sessionId) || session.pty !== ptyProcess) {
      clearInterval(pollInterval);
      return;
    }

    if (elapsed > 60000) {
      clearInterval(pollInterval);
      log(`\x1b[38;5;196m[initial-prompt]\x1b[0m Gave up waiting for waiting_input on ${sessionId} after 60s`);
      return;
    }

    if (session.pluginReportedStatus && session.status === "waiting_input") {
      sent = true;
      clearInterval(pollInterval);
      session.initialPrompt = undefined;
      log(`\x1b[38;5;82m[initial-prompt]\x1b[0m Plugin reported waiting_input — sending to ${sessionId}`);
      setTimeout(() => {
        if (session.pty === ptyProcess) {
          ptyProcess.write(`${prompt}\r`);
        }
      }, 300);
    }
  }, 500);
}

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

// Inject --plugin-dir flag for Claude commands if plugin is available.
// Supports multiple --plugin-dir flags (won't duplicate if already present).
export function injectPluginDir(command: string, agentId: string): string {
  if (agentId !== "claude") return command;

  const pluginDir = getPluginDir();
  if (!pluginDir) return command;

  // Skip if this specific plugin dir is already in the command
  if (command.includes(pluginDir)) return command;

  const parts = command.split(/\s+/);

  if (parts[0] === "isaac") {
    parts.splice(1, 0, `--plugin-dir`, pluginDir);
    const finalCmd = parts.join(" ");
    log(`\x1b[38;5;141m[plugin]\x1b[0m Injecting plugin-dir: ${pluginDir}`);
    log(`\x1b[38;5;141m[plugin]\x1b[0m Final command: ${finalCmd}`);
    return finalCmd;
  }

  return command;
}

// Remote plugin path on SSH hosts (synced via rsync)
const REMOTE_PLUGIN_PATH = "~/.openui/claude-code-plugin";

// Sync the local plugin directory to a remote host via rsync
async function syncPluginToRemote(remote: string): Promise<boolean> {
  const localPluginDir = getPluginDir();
  if (!localPluginDir) {
    log(`\x1b[38;5;245m[plugin-sync]\x1b[0m No local plugin found, skipping sync`);
    return false;
  }
  const host = getRemoteHost(remote);
  log(`\x1b[38;5;141m[plugin-sync]\x1b[0m Syncing plugin to ${host}:${REMOTE_PLUGIN_PATH}`);
  const result = await execAsync([
    "rsync", "-az", "--delete", `${localPluginDir}/`, `${host}:${REMOTE_PLUGIN_PATH}/`,
  ]);
  if (result.exitCode !== 0) {
    logError(`\x1b[38;5;196m[plugin-sync]\x1b[0m Failed: ${result.stderr}`);
    return false;
  }
  log(`\x1b[38;5;82m[plugin-sync]\x1b[0m Plugin synced to ${host}`);
  return true;
}

// Inject --plugin-dir with the remote path for SSH sessions.
// Supports multiple --plugin-dir flags (won't duplicate if already present).
function injectRemotePluginDir(command: string, agentId: string): string {
  if (agentId !== "claude") return command;
  // Skip if this specific remote plugin path is already in the command
  if (command.includes(REMOTE_PLUGIN_PATH)) return command;
  const parts = command.split(/\s+/);
  if (parts[0] === "isaac") {
    parts.splice(1, 0, "--plugin-dir", REMOTE_PLUGIN_PATH);
    const finalCmd = parts.join(" ");
    log(`\x1b[38;5;141m[plugin]\x1b[0m Injecting remote plugin-dir: ${REMOTE_PLUGIN_PATH}`);
    log(`\x1b[38;5;141m[plugin]\x1b[0m Final command: ${finalCmd}`);
    return finalCmd;
  }
  return command;
}

// Inject --dangerously-skip-permissions if enabled in settings
function injectSkipPermissions(command: string, agentId: string): string {
  if (agentId !== "claude") return command;
  if (command.includes("--dangerously-skip-permissions")) return command;
  const settings = loadSettings();
  if (!settings.skipPermissions) return command;
  const parts = command.split(/\s+/);
  if (parts[0] === "isaac") {
    parts.splice(1, 0, "--dangerously-skip-permissions");
    return parts.join(" ");
  }
  return command;
}

// Single source of truth for building the final command with all injections.
// Order matters: plugin dirs first, then skip-permissions, then env var prefix (teams).
function buildFinalCommand(command: string, session: { agentId: string; remote?: string; useTeam?: boolean }): string {
  let cmd = session.remote
    ? injectRemotePluginDir(command, session.agentId)
    : injectPluginDir(command, session.agentId);
  cmd = injectSkipPermissions(cmd, session.agentId);
  if (session.useTeam && session.agentId === "claude") {
    cmd = `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 ${cmd}`;
  }
  return cmd;
}

// Get git branch for a directory
export function getGitBranch(cwd: string): string | null {
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
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
}): { success: boolean; worktreePath?: string; error?: string } {
  const { cwd, branchName, baseBranch, sparseCheckout, sparseCheckoutPaths } = params;
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

  const noCheckoutArgs = sparseCheckout ? ["--no-checkout"] : [];

  let result;
  if (localBranch.exitCode === 0) {
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating worktree for existing branch: ${branchName}`);
    result = spawnSync(["git", "worktree", "add", ...noCheckoutArgs, worktreePath, branchName], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
  } else if (remoteBranchUpstream?.exitCode === 0) {
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating worktree tracking upstream branch: ${branchName}`);
    result = spawnSync(["git", "worktree", "add", ...noCheckoutArgs, "--track", "-b", branchName, worktreePath, `upstream/${branchName}`], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
  } else if (remoteBranchOrigin.exitCode === 0) {
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating worktree tracking origin branch: ${branchName}`);
    result = spawnSync(["git", "worktree", "add", ...noCheckoutArgs, "--track", "-b", branchName, worktreePath, `origin/${branchName}`], {
      cwd: gitRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
  } else {
    log(`\x1b[38;5;141m[worktree]\x1b[0m Creating new worktree with branch: ${branchName} from ${baseRemote}/${baseBranch}`);
    result = spawnSync(["git", "worktree", "add", ...noCheckoutArgs, "-b", branchName, worktreePath, `${baseRemote}/${baseBranch}`], {
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

  // Apply sparse checkout if requested
  if (sparseCheckout) {
    log(`\x1b[38;5;141m[worktree]\x1b[0m Setting up sparse checkout...`);
    const initResult = spawnSync(["git", "sparse-checkout", "init", "--cone"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (initResult.exitCode !== 0) {
      logError(`\x1b[38;5;141m[worktree]\x1b[0m Failed to init sparse checkout:`, initResult.stderr.toString());
    }

    if (sparseCheckoutPaths && sparseCheckoutPaths.length > 0) {
      const setResult = spawnSync(["git", "sparse-checkout", "set", ...sparseCheckoutPaths], {
        cwd: worktreePath,
        stdout: "pipe",
        stderr: "pipe",
      });
      if (setResult.exitCode !== 0) {
        logError(`\x1b[38;5;141m[worktree]\x1b[0m Failed to set sparse checkout paths:`, setResult.stderr.toString());
      }
      log(`\x1b[38;5;141m[worktree]\x1b[0m Sparse checkout paths: ${sparseCheckoutPaths.join(", ")}`);
    }

    const checkoutResult = spawnSync(["git", "checkout"], {
      cwd: worktreePath,
      stdout: "pipe",
      stderr: "pipe",
    });
    if (checkoutResult.exitCode !== 0) {
      logError(`\x1b[38;5;141m[worktree]\x1b[0m Failed to checkout after sparse-checkout:`, checkoutResult.stderr.toString());
    }
  }

  // Create .claude/settings.local.json with default permissions merged with parent settings
  const parentSettingsPath = join(gitRoot, ".claude", "settings.local.json");
  const worktreeClaudeDir = join(worktreePath, ".claude");
  const worktreeSettingsPath = join(worktreeClaudeDir, "settings.local.json");

  try {
    if (!existsSync(worktreeClaudeDir)) {
      mkdirSync(worktreeClaudeDir, { recursive: true });
    }

    let settings: { permissions?: { allow?: string[]; deny?: string[] }; [key: string]: unknown } = {};

    // Load parent settings if they exist
    if (existsSync(parentSettingsPath)) {
      try {
        const parentContent = readFileSync(parentSettingsPath, "utf-8");
        settings = JSON.parse(parentContent);
        log(`\x1b[38;5;141m[worktree]\x1b[0m Loaded parent settings.local.json`);
      } catch (e) {
        logError(`\x1b[38;5;141m[worktree]\x1b[0m Failed to parse parent settings.local.json:`, e);
      }
    }

    // Merge default permissions with existing ones
    if (!settings.permissions) {
      settings.permissions = {};
    }
    const existingAllow = settings.permissions.allow || [];
    const mergedAllow = [...new Set([...existingAllow, ...DEFAULT_PERMISSIONS])];
    settings.permissions.allow = mergedAllow;

    // Write merged settings
    writeFileSync(worktreeSettingsPath, JSON.stringify(settings, null, 2));
    log(`\x1b[38;5;141m[worktree]\x1b[0m Created settings.local.json with ${mergedAllow.length} permissions`);
  } catch (e) {
    logError(`\x1b[38;5;141m[worktree]\x1b[0m Failed to create settings.local.json:`, e);
  }

  return { success: true, worktreePath };
}

// Create a git worktree on a remote machine via SSH
export function createRemoteWorktree(params: {
  remote: string;
  repoPath: string;
  branchName: string;
  baseBranch: string;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
}): { success: boolean; worktreePath?: string; error?: string } {
  const { remote, repoPath, branchName, baseBranch, sparseCheckout, sparseCheckoutPaths } = params;

  // Derive worktree directory from repo path (e.g. ~/universe -> ~/universe-worktrees/branch-name)
  const repoName = repoPath.replace(/\/$/, "").split("/").pop() || "repo";
  const parentDir = repoPath.replace(/\/$/, "").replace(/\/[^/]+$/, "");
  const worktreesDir = `${parentDir}/${repoName}-worktrees`;
  const dirName = branchName.replace(/\//g, "-");
  const worktreePath = `${worktreesDir}/${dirName}`;

  // Check if worktree already exists
  const checkExist = sshExec(remote, `test -d ${worktreePath} && echo exists`);
  if (checkExist.stdout.trim() === "exists") {
    log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Worktree already exists: ${worktreePath}`);
    return { success: true, worktreePath };
  }

  // Ensure worktrees directory exists
  sshExec(remote, `mkdir -p ${worktreesDir}`);

  // Fetch from origin
  log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Fetching from origin on ${remote}...`);
  sshExec(remote, `cd ${repoPath} && git fetch origin`);

  // Check if branch exists
  const localBranch = sshExec(remote, `cd ${repoPath} && git rev-parse --verify ${branchName} 2>/dev/null`);
  const remoteBranch = sshExec(remote, `cd ${repoPath} && git rev-parse --verify origin/${branchName} 2>/dev/null`);

  const noCheckoutFlag = sparseCheckout ? " --no-checkout" : "";

  let result;
  if (localBranch.exitCode === 0) {
    log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Creating worktree for existing branch: ${branchName}`);
    result = sshExec(remote, `cd ${repoPath} && git worktree add${noCheckoutFlag} ${worktreePath} ${branchName}`);
  } else if (remoteBranch.exitCode === 0) {
    log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Creating worktree tracking origin branch: ${branchName}`);
    result = sshExec(remote, `cd ${repoPath} && git worktree add${noCheckoutFlag} --track -b ${branchName} ${worktreePath} origin/${branchName}`);
  } else {
    log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Creating new worktree: ${branchName} from origin/${baseBranch}`);
    result = sshExec(remote, `cd ${repoPath} && git worktree add${noCheckoutFlag} -b ${branchName} ${worktreePath} origin/${baseBranch}`);
  }

  if (result.exitCode !== 0) {
    logError(`\x1b[38;5;141m[worktree-remote]\x1b[0m Failed to create worktree:`, result.stderr);
    return { success: false, error: result.stderr };
  }

  log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Created worktree at: ${worktreePath}`);

  // Apply sparse checkout if requested
  if (sparseCheckout) {
    log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Setting up sparse checkout...`);
    sshExec(remote, `cd ${worktreePath} && git sparse-checkout init --cone`);
    if (sparseCheckoutPaths && sparseCheckoutPaths.length > 0) {
      sshExec(remote, `cd ${worktreePath} && git sparse-checkout set ${sparseCheckoutPaths.join(" ")}`);
      log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Sparse checkout paths: ${sparseCheckoutPaths.join(", ")}`);
    }
    sshExec(remote, `cd ${worktreePath} && git checkout`);
  }

  // Create .claude/settings.local.json with default permissions
  const settingsJson = JSON.stringify({ permissions: { allow: DEFAULT_PERMISSIONS } }, null, 2);
  const settingsBase64 = Buffer.from(settingsJson).toString("base64");
  sshExec(remote, `mkdir -p ${worktreePath}/.claude && echo '${settingsBase64}' | base64 -d > ${worktreePath}/.claude/settings.local.json`);
  log(`\x1b[38;5;141m[worktree-remote]\x1b[0m Created remote settings.local.json`);

  return { success: true, worktreePath };
}


// Async worktree creation with progress updates, then PTY spawn
async function createWorktreeAndStartAgent(params: {
  session: Session;
  sessionId: string;
  remote?: string;
  originalCwd: string;
  branchName: string;
  baseBranch: string;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  agentId: string;
  command: string;
}): Promise<void> {
  const { session, sessionId, remote, originalCwd, branchName, baseBranch,
          sparseCheckout, sparseCheckoutPaths, agentId, command } = params;

  const sendProgress = (step: string) => {
    session.creationProgress = step;
    broadcastToSession(session, {
      type: "status",
      status: "creating",
      creationProgress: step,
    });
    log(`\x1b[38;5;141m[worktree-async]\x1b[0m ${sessionId}: ${step}`);
  };

  let success: boolean;

  if (remote) {
    success = await createRemoteWorktreeSteps({
      remote, repoPath: originalCwd, branchName, baseBranch,
      sparseCheckout, sparseCheckoutPaths, worktreePath: session.cwd,
      onProgress: sendProgress,
    });
  } else {
    success = await createLocalWorktreeSteps({
      cwd: originalCwd, branchName, baseBranch,
      sparseCheckout, sparseCheckoutPaths, worktreePath: session.cwd,
      onProgress: sendProgress,
    });
  }

  if (!success) {
    session.status = "error";
    session.creationProgress = "Worktree creation failed";
    broadcastToSession(session, {
      type: "status",
      status: "error",
      creationProgress: "Worktree creation failed",
    });
    return;
  }

  // Check session still exists (user may have deleted it)
  if (!sessions.has(sessionId)) {
    log(`\x1b[38;5;141m[worktree-async]\x1b[0m Session ${sessionId} was deleted during creation`);
    return;
  }

  // Sync plugin to remote before starting agent
  if (remote) {
    sendProgress("Syncing plugin...");
    await syncPluginToRemote(remote);
  }

  sendProgress("Starting agent...");

  // Spawn PTY
  let ptyProcess;
  if (remote) {
    const host = getRemoteHost(remote);
    ptyProcess = spawnPty("ssh", sshArgs(host, `cd ${session.cwd} && export OPENUI_SESSION_ID=${sessionId} OPENUI_PORT=${TUNNEL_PORT} && exec zsh -l`), {
      name: "xterm-256color",
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" },
      rows: 30,
      cols: 120,
    });
  } else {
    ptyProcess = spawnPty("/bin/zsh", [], {
      name: "xterm-256color",
      cwd: session.cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        OPENUI_SESSION_ID: sessionId,
      },
      rows: 30,
      cols: 120,
    });
  }

  session.pty = ptyProcess;
  session.status = "waiting_input";
  session.creationProgress = undefined;

  setupPtyHandlers(session, sessionId, ptyProcess);

  // Run the agent command
  const finalCommand = buildFinalCommand(command, session);
  log(`\x1b[38;5;82m[pty-write]\x1b[0m Writing command: ${finalCommand}`);

  if (remote) {
    // Wait for shell prompt before writing command
    let commandWritten = false;
    const SSH_ERROR_PATTERNS = ["Connection refused", "Connection timed out", "Could not resolve",
      "Permission denied", "Host key verification failed", "No route to host",
      "Connection closed", "client_loop: send disconnect"];
    const fallback = setTimeout(() => {
      if (!commandWritten && session.pty === ptyProcess) {
        commandWritten = true;
        ptyProcess.write(`${finalCommand}\r`);
      }
    }, 10000);
    ptyProcess.onData((data: string) => {
      if (commandWritten) return;
      for (const pat of SSH_ERROR_PATTERNS) { if (data.includes(pat)) return; }
      if (data.trim().length > 0) {
        commandWritten = true;
        clearTimeout(fallback);
        session.reconnectAttempts = 0;
        setTimeout(() => { if (session.pty === ptyProcess) ptyProcess.write(`${finalCommand}\r`); }, 200);
      }
    });
  } else {
    setTimeout(() => {
      ptyProcess.write(`${finalCommand}\r`);
    }, 300);
  }

  broadcastToSession(session, {
    type: "status",
    status: "waiting_input",
  });

  // Send initial prompt after isaac is ready
  scheduleInitialPrompt(session, sessionId, ptyProcess);

  log(`\x1b[38;5;141m[worktree-async]\x1b[0m Completed ${sessionId}`);
}

// Async remote worktree creation with step-by-step progress
async function createRemoteWorktreeSteps(params: {
  remote: string;
  repoPath: string;
  branchName: string;
  baseBranch: string;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  worktreePath: string;
  onProgress: (step: string) => void;
}): Promise<boolean> {
  const { remote, repoPath, branchName, baseBranch, sparseCheckout, sparseCheckoutPaths, worktreePath, onProgress } = params;

  onProgress("Checking if worktree exists...");
  const checkExist = await sshExecAsync(remote, `test -d ${worktreePath} && echo exists`);
  if (checkExist.stdout.trim() === "exists") {
    log(`\x1b[38;5;141m[worktree-remote-async]\x1b[0m Already exists: ${worktreePath}`);
    return true;
  }

  const worktreesDir = worktreePath.replace(/\/[^/]+$/, "");
  onProgress("Creating worktree directory...");
  await sshExecAsync(remote, `mkdir -p ${worktreesDir}`);

  onProgress("Fetching from origin...");
  const fetchResult = await sshExecAsync(remote, `cd ${repoPath} && git fetch origin`);
  if (fetchResult.exitCode !== 0) {
    logError(`\x1b[38;5;196m[worktree-remote-async]\x1b[0m Fetch failed: ${fetchResult.stderr}`);
  }

  onProgress("Checking branch...");
  const localBranch = await sshExecAsync(remote, `cd ${repoPath} && git rev-parse --verify ${branchName} 2>/dev/null`);
  const remoteBranch = await sshExecAsync(remote, `cd ${repoPath} && git rev-parse --verify origin/${branchName} 2>/dev/null`);

  const noCheckoutFlag = sparseCheckout ? " --no-checkout" : "";

  onProgress("Creating worktree...");
  let result;
  if (localBranch.exitCode === 0) {
    result = await sshExecAsync(remote, `cd ${repoPath} && git worktree add${noCheckoutFlag} ${worktreePath} ${branchName}`);
  } else if (remoteBranch.exitCode === 0) {
    result = await sshExecAsync(remote, `cd ${repoPath} && git worktree add${noCheckoutFlag} --track -b ${branchName} ${worktreePath} origin/${branchName}`);
  } else {
    result = await sshExecAsync(remote, `cd ${repoPath} && git worktree add${noCheckoutFlag} -b ${branchName} ${worktreePath} origin/${baseBranch}`);
  }

  if (result.exitCode !== 0) {
    logError(`\x1b[38;5;196m[worktree-remote-async]\x1b[0m Failed to create worktree: ${result.stderr}`);
    return false;
  }

  if (sparseCheckout) {
    onProgress("Initializing sparse checkout...");
    await sshExecAsync(remote, `cd ${worktreePath} && git sparse-checkout init --cone`);
    if (sparseCheckoutPaths && sparseCheckoutPaths.length > 0) {
      onProgress(`Setting sparse paths (${sparseCheckoutPaths.length} dirs)...`);
      await sshExecAsync(remote, `cd ${worktreePath} && git sparse-checkout set ${sparseCheckoutPaths.join(" ")}`);
    }
    onProgress("Running checkout...");
    await sshExecAsync(remote, `cd ${worktreePath} && git checkout`);
  }

  onProgress("Configuring permissions...");
  const settingsJson = JSON.stringify({ permissions: { allow: DEFAULT_PERMISSIONS } }, null, 2);
  const settingsBase64 = Buffer.from(settingsJson).toString("base64");
  await sshExecAsync(remote, `mkdir -p ${worktreePath}/.claude && echo '${settingsBase64}' | base64 -d > ${worktreePath}/.claude/settings.local.json`);

  return true;
}

// Async local worktree creation with step-by-step progress
async function createLocalWorktreeSteps(params: {
  cwd: string;
  branchName: string;
  baseBranch: string;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  worktreePath: string;
  onProgress: (step: string) => void;
}): Promise<boolean> {
  const { cwd, branchName, baseBranch, sparseCheckout, sparseCheckoutPaths, worktreePath, onProgress } = params;
  const gitRoot = getGitRoot(cwd);
  if (!gitRoot) return false;

  if (existsSync(worktreePath)) {
    log(`\x1b[38;5;141m[worktree-async]\x1b[0m Already exists: ${worktreePath}`);
    return true;
  }

  onProgress("Creating worktree directory...");
  const worktreesDir = join(gitRoot, "..", `${basename(gitRoot)}-worktrees`);
  if (!existsSync(worktreesDir)) {
    mkdirSync(worktreesDir, { recursive: true });
  }

  onProgress("Fetching from remote...");
  const hasUpstream = (await execAsync(["git", "remote", "get-url", "upstream"], gitRoot)).exitCode === 0;
  if (hasUpstream) {
    await execAsync(["git", "fetch", "upstream"], gitRoot);
  }
  await execAsync(["git", "fetch", "origin"], gitRoot);

  const baseRemote = hasUpstream ? "upstream" : "origin";

  onProgress("Checking branch...");
  const localBranch = await execAsync(["git", "rev-parse", "--verify", branchName], gitRoot);
  const remoteBranchOrigin = await execAsync(["git", "rev-parse", "--verify", `origin/${branchName}`], gitRoot);
  const remoteBranchUpstream = hasUpstream
    ? await execAsync(["git", "rev-parse", "--verify", `upstream/${branchName}`], gitRoot)
    : null;

  const noCheckoutArgs = sparseCheckout ? ["--no-checkout"] : [];

  onProgress("Creating worktree...");
  let result;
  if (localBranch.exitCode === 0) {
    result = await execAsync(["git", "worktree", "add", ...noCheckoutArgs, worktreePath, branchName], gitRoot);
  } else if (remoteBranchUpstream?.exitCode === 0) {
    result = await execAsync(["git", "worktree", "add", ...noCheckoutArgs, "--track", "-b", branchName, worktreePath, `upstream/${branchName}`], gitRoot);
  } else if (remoteBranchOrigin.exitCode === 0) {
    result = await execAsync(["git", "worktree", "add", ...noCheckoutArgs, "--track", "-b", branchName, worktreePath, `origin/${branchName}`], gitRoot);
  } else {
    result = await execAsync(["git", "worktree", "add", ...noCheckoutArgs, "-b", branchName, worktreePath, `${baseRemote}/${baseBranch}`], gitRoot);
  }

  if (result.exitCode !== 0) {
    logError(`\x1b[38;5;196m[worktree-async]\x1b[0m Failed to create worktree: ${result.stderr}`);
    return false;
  }

  if (sparseCheckout) {
    onProgress("Initializing sparse checkout...");
    await execAsync(["git", "sparse-checkout", "init", "--cone"], worktreePath);
    if (sparseCheckoutPaths && sparseCheckoutPaths.length > 0) {
      onProgress(`Setting sparse paths (${sparseCheckoutPaths.length} dirs)...`);
      await execAsync(["git", "sparse-checkout", "set", ...sparseCheckoutPaths], worktreePath);
    }
    onProgress("Running checkout...");
    await execAsync(["git", "checkout"], worktreePath);
  }

  // Create .claude/settings.local.json with merged permissions
  onProgress("Configuring permissions...");
  const parentSettingsPath = join(gitRoot, ".claude", "settings.local.json");
  const worktreeClaudeDir = join(worktreePath, ".claude");
  const worktreeSettingsPath = join(worktreeClaudeDir, "settings.local.json");

  try {
    if (!existsSync(worktreeClaudeDir)) {
      mkdirSync(worktreeClaudeDir, { recursive: true });
    }
    let settings: { permissions?: { allow?: string[]; deny?: string[] }; [key: string]: unknown } = {};
    if (existsSync(parentSettingsPath)) {
      try {
        settings = JSON.parse(readFileSync(parentSettingsPath, "utf-8"));
      } catch {}
    }
    if (!settings.permissions) settings.permissions = {};
    const existingAllow = settings.permissions.allow || [];
    settings.permissions.allow = [...new Set([...existingAllow, ...DEFAULT_PERMISSIONS])];
    writeFileSync(worktreeSettingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    logError(`\x1b[38;5;141m[worktree-async]\x1b[0m Failed to create settings:`, e);
  }

  return true;
}

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
  branchName?: string;
  baseBranch?: string;
  createWorktreeFlag?: boolean;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  remote?: string;
  initialPrompt?: string;
  categoryId?: string;
  useTeam?: boolean;
  teamName?: string;
  // Ticket support
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  prNumber?: string;
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
    branchName,
    baseBranch,
    createWorktreeFlag,
    sparseCheckout,
    sparseCheckoutPaths,
    remote,
    initialPrompt,
    categoryId,
    useTeam,
    teamName,
    ticketId,
    ticketTitle,
    ticketUrl,
    prNumber,
    ticketPromptTemplate,
  } = params;

  let workingDir = originalCwd.startsWith("~/") ? join(homedir(), originalCwd.slice(2)) : originalCwd === "~" ? homedir() : originalCwd;
  let worktreePath: string | undefined;
  let mainRepoPath: string | undefined;
  let gitBranch: string | null = null;

  if (createWorktreeFlag && branchName && baseBranch) {
    // Compute expected worktree path immediately (deterministic)
    if (remote) {
      const repoName = originalCwd.replace(/\/$/, "").split("/").pop() || "repo";
      const parentDir = originalCwd.replace(/\/$/, "").replace(/\/[^/]+$/, "");
      const dirName = branchName.replace(/\//g, "-");
      workingDir = `${parentDir}/${repoName}-worktrees/${dirName}`;
    } else {
      const gitRoot = getGitRoot(originalCwd);
      if (gitRoot) {
        const repoName = basename(gitRoot);
        const dirName = branchName.replace(/\//g, "-");
        workingDir = join(gitRoot, "..", `${repoName}-worktrees`, dirName);
      }
    }

    worktreePath = workingDir;
    mainRepoPath = originalCwd;
    gitBranch = branchName;

    // Create session with "creating" status and NO PTY - worktree creation is async
    const now = Date.now();
    const session: Session = {
      pty: null,
      agentId,
      agentName,
      command,
      cwd: workingDir,
      originalCwd: mainRepoPath,
      gitBranch: branchName,
      worktreePath,
      createdAt: new Date().toISOString(),
      clients: new Set(),
      outputBuffer: [],
      outputSeq: 0,
      status: "creating",
      creationProgress: "Initializing...",
      lastOutputTime: now,
      lastInputTime: 0,
      recentOutputSize: 0,
      customName,
      customColor,
      nodeId,
      isRestored: false,
      remote,
      initialPrompt,
      categoryId,
      useTeam,
      ticketId,
      ticketTitle,
      ticketUrl,
    };

    sessions.set(sessionId, session);

    // Kick off async worktree creation + agent start
    createWorktreeAndStartAgent({
      session, sessionId, remote, originalCwd,
      branchName, baseBranch, sparseCheckout, sparseCheckoutPaths,
      agentId, command,
    }).catch(err => {
      logError(`\x1b[38;5;196m[worktree-async]\x1b[0m Failed for ${sessionId}:`, err);
      session.status = "error";
      session.creationProgress = `Failed: ${err.message || err}`;
      broadcastToSession(session, {
        type: "status",
        status: "error",
        creationProgress: session.creationProgress,
      });
    });

    log(`\x1b[38;5;141m[session]\x1b[0m Created ${sessionId} (async worktree) for ${agentName}${remote ? ` on ${remote}` : ""}`);
    return { session, cwd: workingDir, gitBranch: branchName };
  }

  // --- Non-worktree path: spawn PTY immediately ---

  // Create team directory if team mode is enabled
  if (useTeam && customName) {
    const teamSlug = customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const settings = loadSettings();
    const homeDir = remote ? (settings.defaultRemoteCwd || `/home/${process.env.USER || "user"}`) : (settings.defaultCwd || homedir());
    const teamDir = join(homeDir, "teams", teamSlug);
    if (remote) {
      sshExecAsync(remote, `mkdir -p "${teamDir}"`).catch(() => {});
    } else {
      try { mkdirSync(teamDir, { recursive: true }); } catch {}
    }
    workingDir = teamDir;
    log(`\x1b[38;5;141m[session]\x1b[0m Created team directory: ${teamDir}`);
  }

  // For local sessions, detect the main repo from worktree
  if (!remote && !mainRepoPath) {
    const detectedMainRepo = getMainWorktree(workingDir);
    if (detectedMainRepo && detectedMainRepo !== workingDir) {
      mainRepoPath = detectedMainRepo;
      log(`\x1b[38;5;141m[session]\x1b[0m Detected main repo from worktree: ${mainRepoPath}`);
    }
  }

  if (!mainRepoPath) {
    mainRepoPath = workingDir;
  }

  // Get git branch if not already set from worktree (local only)
  if (!gitBranch && !remote) {
    gitBranch = getGitBranch(workingDir);
  }

  // Sync plugin to remote (fire-and-forget — SSH prompt detection delay provides buffer)
  if (remote) {
    syncPluginToRemote(remote).catch(() => {});
  }

  // Spawn PTY: SSH for remote sessions, local zsh otherwise
  let ptyProcess;
  if (remote) {
    const host = getRemoteHost(remote);
    ptyProcess = spawnPty("ssh", sshArgs(host, `cd ${workingDir} && export OPENUI_SESSION_ID=${sessionId} OPENUI_PORT=${TUNNEL_PORT} && exec zsh -l`), {
      name: "xterm-256color",
      cwd: process.cwd(),
      env: {
        ...process.env,
        TERM: "xterm-256color",
      },
      rows: 30,
      cols: 120,
    });
    log(`\x1b[38;5;141m[session]\x1b[0m Spawned SSH PTY to ${host}, cwd: ${workingDir}`);
  } else {
    ptyProcess = spawnPty("/bin/zsh", [], {
      name: "xterm-256color",
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        OPENUI_SESSION_ID: sessionId,
      },
      rows: 30,
      cols: 120,
    });
  }

  const now = Date.now();
  const session: Session = {
    pty: ptyProcess,
    agentId,
    agentName,
    command,
    cwd: workingDir,
    originalCwd: mainRepoPath,
    gitBranch: gitBranch || undefined,
    worktreePath,
    createdAt: new Date().toISOString(),
    clients: new Set(),
    outputBuffer: [],
    outputSeq: 0,
    status: "waiting_input",
    lastOutputTime: now,
    lastInputTime: 0,
    recentOutputSize: 0,
    customName,
    customColor,
    nodeId,
    isRestored: false,
    remote,
    initialPrompt,
    categoryId,
    useTeam,
    ticketId,
    ticketTitle,
    ticketUrl,
  };

  sessions.set(sessionId, session);
  setupPtyHandlers(session, sessionId, ptyProcess);

  // Run the command
  const finalCommand = buildFinalCommand(command, session);
  log(`\x1b[38;5;82m[pty-write]\x1b[0m Writing command: ${finalCommand}`);

  if (remote) {
    // Wait for shell prompt before writing command
    let commandWritten = false;
    const SSH_ERROR_PATTERNS = ["Connection refused", "Connection timed out", "Could not resolve",
      "Permission denied", "Host key verification failed", "No route to host",
      "Connection closed", "client_loop: send disconnect"];
    const fallback = setTimeout(() => {
      if (!commandWritten && session.pty === ptyProcess) {
        commandWritten = true;
        ptyProcess.write(`${finalCommand}\r`);
      }
    }, 10000);
    ptyProcess.onData((data: string) => {
      if (commandWritten) return;
      for (const pat of SSH_ERROR_PATTERNS) { if (data.includes(pat)) return; }
      if (data.trim().length > 0) {
        commandWritten = true;
        clearTimeout(fallback);
        session.reconnectAttempts = 0;
        setTimeout(() => { if (session.pty === ptyProcess) ptyProcess.write(`${finalCommand}\r`); }, 200);
      }
    });
  } else {
    setTimeout(() => {
      ptyProcess.write(`${finalCommand}\r`);

      // If there's a ticket URL, send it to the agent after a delay
      if (ticketUrl) {
        setTimeout(() => {
          const defaultTemplate = "Here is the ticket for this session: {{url}}\n\nPlease use the appropriate MCP tool or fetch the URL to read the full ticket details before starting work.";
          const template = ticketPromptTemplate || defaultTemplate;
          const ticketPrompt = template
            .replace(/\{\{url\}\}/g, ticketUrl)
            .replace(/\{\{id\}\}/g, ticketId || "")
            .replace(/\{\{title\}\}/g, ticketTitle || "");
          ptyProcess.write(ticketPrompt + "\r");
        }, 2000);
      }
    }, 300);
  }

  // Send initial prompt after isaac is ready
  scheduleInitialPrompt(session, sessionId, ptyProcess);

  log(`\x1b[38;5;141m[session]\x1b[0m Created ${sessionId} for ${agentName}${ticketId ? ` (ticket: ${ticketId})` : ""}${remote ? ` on ${remote}` : ""}`);
  return { session, cwd: workingDir, gitBranch: gitBranch || undefined };
}

export function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  // Remove from map first so onExit handler sees !sessions.has() and bails
  sessions.delete(sessionId);

  if (session.pty) {
    try { session.pty.kill(); } catch {}
  }

  // If this was a worktree session, remove the worktree
  if (session.worktreePath && session.originalCwd) {
    if (session.remote) {
      // Remote worktree cleanup via SSH
      try {
        log(`\x1b[38;5;141m[session]\x1b[0m Removing remote worktree: ${session.worktreePath} on ${session.remote}`);
        const result = sshExec(session.remote, `cd ${session.originalCwd} && git worktree remove -f ${session.worktreePath}`);
        if (result.exitCode !== 0) {
          logError(`\x1b[38;5;196m[session]\x1b[0m Failed to remove remote worktree: ${result.stderr}`);
          sshExec(session.remote, `cd ${session.originalCwd} && git worktree prune`);
          const retry = sshExec(session.remote, `cd ${session.originalCwd} && git worktree remove -f ${session.worktreePath}`);
          if (retry.exitCode === 0) {
            log(`\x1b[38;5;141m[session]\x1b[0m Remote worktree removed after prune`);
          }
        } else {
          log(`\x1b[38;5;141m[session]\x1b[0m Remote worktree removed successfully`);
        }
      } catch (e) {
        logError(`\x1b[38;5;196m[session]\x1b[0m Error removing remote worktree:`, e);
      }
    } else {
      try {
        log(`\x1b[38;5;141m[session]\x1b[0m Removing worktree: ${session.worktreePath} from ${session.originalCwd}`);
        const result = spawnSync(["git", "worktree", "remove", "-f", session.worktreePath], {
          cwd: session.originalCwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        if (result.exitCode !== 0) {
          const stderr = result.stderr?.toString() || "";
          logError(`\x1b[38;5;196m[session]\x1b[0m Failed to remove worktree: ${stderr}`);
          log(`\x1b[38;5;141m[session]\x1b[0m Trying git worktree prune first...`);
          spawnSync(["git", "worktree", "prune"], { cwd: session.originalCwd, stdout: "pipe", stderr: "pipe" });
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

  log(`\x1b[38;5;141m[session]\x1b[0m Killed ${sessionId}`);
  return true;
}

export function restoreSessions() {
  const { loadState } = require("./persistence");
  const state = loadState();

  log(`\x1b[38;5;245m[restore]\x1b[0m Found ${state.nodes.length} saved sessions`);

  const sessionIds: string[] = [];

  for (const node of state.nodes) {
    // Skip archived sessions - they should not be in the active sessions Map
    if (node.archived) {
      log(`[restore] Skipping archived session: ${node.sessionId} (${node.customName})`);
      continue;
    }

    // Skip shell sessions — they're ephemeral and should not be persisted/restored
    if (node.agentId === "shell") {
      log(`[restore] Skipping shell session: ${node.sessionId}`);
      continue;
    }

    // Migrate command format when isaac is available
    if (HAS_ISAAC && node.command.startsWith("llm agent claude")) {
      const oldCommand = node.command;
      node.command = node.command.replace("llm agent claude", "isaac");
      log(`\x1b[38;5;141m[restore]\x1b[0m Migrated command for ${node.sessionId}: ${oldCommand} -> ${node.command}`);
    }

    console.log(`[restore] Loading session: ${node.sessionId} (${node.customName}) archived=${node.archived}`);

    const buffer = loadBuffer(node.sessionId);
    // Only detect git branch locally; skip for remote sessions
    const gitBranch = node.remote ? null : getGitBranch(node.cwd);

    const session: Session = {
      pty: null,
      agentId: node.agentId,
      agentName: node.agentName,
      command: node.command,
      cwd: node.cwd,
      originalCwd: node.originalCwd || node.cwd, // Backward compat: fall back to cwd
      worktreePath: node.worktreePath,
      gitBranch: gitBranch || node.gitBranch || undefined,
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
      autoResumed: node.autoResumed || false,
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
      sortOrder: node.sortOrder,
      dueDate: node.dueDate,
    };

    // If model wasn't persisted, scan the saved output buffer for the banner
    if (!session.model && buffer.length > 0) {
      const { parseModelFromOutput } = require("../services/costCache");
      const parsed = parseModelFromOutput(buffer);
      if (parsed) session.model = parsed;
    }

    sessions.set(node.sessionId, session);
    sessionIds.push(node.sessionId);
    log(`\x1b[38;5;245m[restore]\x1b[0m Restored ${node.sessionId} (${node.agentName}) model: ${session.model || 'unknown'} branch: ${gitBranch || 'none'}${node.remote ? ` remote: ${node.remote}` : ''}`);
  }

  // Auto-resume sessions (skip those in TODO or On Hold)
  const SKIP_CATEGORIES = new Set(["todo", "on-hold"]);
  const resumeIds = sessionIds.filter((sid) => {
    const s = sessions.get(sid);
    if (s && s.categoryId && SKIP_CATEGORIES.has(s.categoryId)) {
      log(`\x1b[38;5;245m[auto-resume]\x1b[0m Skipping ${sid} (category: ${s.categoryId})`);
      return false;
    }
    return true;
  });

  if (resumeIds.length > 0) {
    log(`\x1b[38;5;82m[auto-resume]\x1b[0m Starting auto-resume for ${resumeIds.length}/${sessionIds.length} sessions...`);
    resumeIds.forEach((sid, index) => {
      setTimeout(() => {
        resumeSession(sid).catch((err) => {
          log(`\x1b[38;5;196m[auto-resume]\x1b[0m Failed to resume ${sid}: ${err}`);
        });
      }, index * 2000); // 2s stagger between each session
    });
  }
}

/**
 * Auto-resume sessions on startup (resumes all non-archived sessions)
 * Uses session start queue to prevent OAuth port contention for Claude sessions
 */
export function autoResumeSessions() {
  const { getSessionsToResume, getAutoResumeConfig } = require("./autoResume");
  const { saveState } = require("./persistence");

  const config = getAutoResumeConfig();
  if (!config.enabled) {
    log(`\x1b[38;5;141m[auto-resume]\x1b[0m Auto-resume is disabled`);
    return;
  }

  const sessionsToResume = getSessionsToResume();

  if (sessionsToResume.length === 0) {
    log(`\x1b[38;5;141m[auto-resume]\x1b[0m No sessions to auto-resume`);
    return;
  }

  log(`\x1b[38;5;141m[auto-resume]\x1b[0m Auto-resuming ${sessionsToResume.length} sessions...`);

  for (const node of sessionsToResume) {
    const session = sessions.get(node.sessionId);
    if (!session) {
      log(`\x1b[38;5;245m[auto-resume]\x1b[0m Session not found: ${node.sessionId}`);
      continue;
    }

    // Skip if already has a PTY (already running)
    if (session.pty) {
      log(`\x1b[38;5;245m[auto-resume]\x1b[0m Skipping ${node.sessionId} (already running)`);
      continue;
    }

    const startFn = () => {
      try {
        // Re-check — user may have clicked Resume while this was queued
        if (session.pty) {
          log(`\x1b[38;5;245m[auto-resume]\x1b[0m Skipping ${node.sessionId} (already started)`);
          signalSessionReady(node.sessionId);
          return;
        }
        // Spawn PTY in originalCwd so Claude finds the session in the correct project directory.
        // The session's cwd may have drifted to a worktree path, which maps to a different
        // Claude project dir than where the conversation was originally stored.
        const resumeCwd = session.originalCwd || session.cwd;
        if (resumeCwd !== session.cwd) {
          log(`\x1b[38;5;141m[auto-resume]\x1b[0m Using originalCwd ${resumeCwd} (cwd drifted to ${session.cwd})`);
        }

        let ptyProcess;
        if (session.remote) {
          const host = getRemoteHost(session.remote);
          ptyProcess = spawnPty("ssh", sshArgs(host, `cd ${resumeCwd} && export OPENUI_SESSION_ID=${node.sessionId} OPENUI_PORT=${TUNNEL_PORT} && exec zsh -l`), {
            name: "xterm-256color",
            cwd: process.cwd(),
            env: {
              ...process.env,
              TERM: "xterm-256color",
            },
            rows: 30,
            cols: 120,
          });
        } else {
          ptyProcess = spawnPty(process.env.SHELL || "/bin/bash", [], {
            name: "xterm-256color",
            cwd: resumeCwd,
            env: {
              ...process.env,
              TERM: "xterm-256color",
              OPENUI_SESSION_ID: node.sessionId,
              OPENUI_PORT: String(process.env.PORT || 6968),
            },
            rows: 30,
            cols: 120,
          });
        }

        session.pty = ptyProcess;
        session.status = "idle";
        session.isRestored = false;
        session.autoResumed = true;

        setupPtyHandlers(session, node.sessionId, ptyProcess);

        // Build the command with resume flag if we have a Claude session ID
        let finalCommand = buildFinalCommand(session.command, session);

        // For Claude sessions, use --resume to restore the specific session.
        // If the command already has --resume but claudeSessionId is newer (e.g. after /clear),
        // update the resume ID to the latest one.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const existingResume = session.command.match(/--resume\s+([\w-]+)/);
        if (existingResume && session.claudeSessionId && UUID_RE.test(session.claudeSessionId)
            && existingResume[1] !== session.claudeSessionId) {
          // claudeSessionId is newer than what's in the command — update both
          const oldId = existingResume[1];
          const resumeArg = `--resume ${session.claudeSessionId}`;
          session.command = session.command.replace(/--resume\s+[\w-]+/, resumeArg);
          finalCommand = finalCommand.replace(/--resume\s+[\w-]+/, resumeArg);
          log(`\x1b[38;5;141m[auto-resume]\x1b[0m Updated stale --resume ${oldId} → ${session.claudeSessionId}`);
        } else if (existingResume) {
          log(`\x1b[38;5;141m[auto-resume]\x1b[0m Using existing --resume ${existingResume[1]} from command`);
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
          log(`\x1b[38;5;141m[auto-resume]\x1b[0m Resuming Claude session: ${session.claudeSessionId} (persisted to command)`);
        }

        // Send the command to the PTY after a short delay
        if (session.remote) {
          // Wait for shell prompt for remote sessions
          let commandWritten = false;
          const SSH_ERROR_PATTERNS = ["Connection refused", "Connection timed out", "Could not resolve",
            "Permission denied", "Host key verification failed", "No route to host",
            "Connection closed", "client_loop: send disconnect"];
          const fallback = setTimeout(() => {
            if (!commandWritten && session.pty === ptyProcess) {
              commandWritten = true;
              ptyProcess.write(`${finalCommand}\r`);
            }
          }, 10000);
          ptyProcess.onData((data: string) => {
            if (commandWritten) return;
            for (const pat of SSH_ERROR_PATTERNS) { if (data.includes(pat)) return; }
            if (data.trim().length > 0) {
              commandWritten = true;
              clearTimeout(fallback);
              session.reconnectAttempts = 0;
              setTimeout(() => { if (session.pty === ptyProcess) ptyProcess.write(`${finalCommand}\r`); }, 200);
            }
          });
        } else {
          setTimeout(() => {
            ptyProcess.write(`${finalCommand}\r`);
          }, 300);
        }

        log(`\x1b[38;5;141m[auto-resume]\x1b[0m Resumed ${node.sessionId} (${node.agentName})`);
      } catch (error) {
        logError(`\x1b[38;5;141m[auto-resume]\x1b[0m Failed to resume ${node.sessionId}:`, error);
        // Signal ready on failure so the queue isn't blocked
        signalSessionReady(node.sessionId);
      }
    };

    // Claude agents go through the queue to prevent OAuth port contention
    if (session.agentId === "claude") {
      enqueueSessionStart(node.sessionId, startFn, () => session.outputBuffer);
    } else {
      // Non-Claude agents start immediately (no OAuth)
      startFn();
    }
  }

  // Save state to persist autoResumed flag
  saveState(sessions);
  log(`\x1b[38;5;141m[auto-resume]\x1b[0m Auto-resume complete`);
}

export async function resumeSession(sessionId: string): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) {
    log(`\x1b[38;5;196m[resume]\x1b[0m Session ${sessionId} not found`);
    return false;
  }
  if (session.pty) {
    log(`\x1b[38;5;245m[resume]\x1b[0m Session ${sessionId} already has active PTY`);
    return false;
  }

  log(`\x1b[38;5;82m[resume]\x1b[0m Resuming ${sessionId} (${session.agentName})...`);

  // For remote sessions: sync plugin and recover claude session ID if missing
  if (session.remote) {
    await syncPluginToRemote(session.remote);

    // Try to recover claude session ID from the remote filesystem
    // (saved by status-reporter.sh to ~/.openui/sessions/<id>.id)
    if (!session.claudeSessionId) {
      const result = await sshExecAsync(session.remote, `cat ~/.openui/sessions/${sessionId}.id 2>/dev/null`);
      if (result.exitCode === 0 && result.stdout.trim()) {
        session.claudeSessionId = result.stdout.trim();
        log(`\x1b[38;5;82m[resume]\x1b[0m Recovered claude session ID from remote: ${session.claudeSessionId}`);
      }
    }
  } else if (!session.claudeSessionId) {
    // Also check locally for the session ID file
    const localIdFile = join(homedir(), ".openui", "sessions", `${sessionId}.id`);
    if (existsSync(localIdFile)) {
      const id = readFileSync(localIdFile, "utf-8").trim();
      if (id) {
        session.claudeSessionId = id;
        log(`\x1b[38;5;82m[resume]\x1b[0m Recovered claude session ID from local file: ${session.claudeSessionId}`);
      }
    }
  }

  // Spawn PTY: SSH for remote sessions, local zsh otherwise
  let ptyProcess;
  if (session.remote) {
    const host = getRemoteHost(session.remote);
    ptyProcess = spawnPty("ssh", sshArgs(host, `cd ${session.cwd} && export OPENUI_SESSION_ID=${sessionId} OPENUI_PORT=${TUNNEL_PORT} && exec zsh -l`), {
      name: "xterm-256color",
      cwd: process.cwd(),
      env: { ...process.env, TERM: "xterm-256color" },
      rows: 30,
      cols: 120,
    });
  } else {
    ptyProcess = spawnPty("/bin/zsh", [], {
      name: "xterm-256color",
      cwd: session.cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        OPENUI_SESSION_ID: sessionId,
      },
      rows: 30,
      cols: 120,
    });
  }

  session.pty = ptyProcess;
  session.isRestored = false;
  session.status = "running";
  session.lastOutputTime = Date.now();
  session.outputBuffer = [];

  // Use shared handler — gives us onExit auto-reconnect for free
  setupPtyHandlers(session, sessionId, ptyProcess);

  // Build the resume command, preserving ALL original --plugin-dir flags
  // and injecting our openui status plugin alongside them.
  const originalPluginDirs: string[] = [];
  const pluginDirRegex = /--plugin-dir\s+(\S+)/g;
  let pluginMatch;
  while ((pluginMatch = pluginDirRegex.exec(session.command)) !== null) {
    originalPluginDirs.push(pluginMatch[1]);
  }

  // Reconstruct base command: isaac + all original plugin-dirs + our injected one
  const buildCommand = (base: string): string => {
    let cmd = base;
    for (const dir of originalPluginDirs) {
      if (!cmd.includes(dir)) {
        cmd = cmd.replace("isaac", `isaac --plugin-dir ${dir}`);
      }
    }
    // Apply all command injections
    cmd = buildFinalCommand(cmd, session);
    return cmd;
  };

  let finalCommand: string;
  const hasSessionId = session.agentId === "claude" && session.claudeSessionId;
  if (hasSessionId) {
    finalCommand = buildCommand(`isaac --resume ${session.claudeSessionId}`);
    log(`\x1b[38;5;141m[resume]\x1b[0m Attempting resume with session: ${session.claudeSessionId}`);
  } else {
    finalCommand = buildCommand("isaac --resume");
    log(`\x1b[38;5;141m[resume]\x1b[0m Resume (no session ID) for ${sessionId}`);
  }

  // Retry logic for "No conversation found" — layer on top of setupPtyHandlers' onData
  let retryAttempt = 0;
  ptyProcess.onData((data: string) => {
    if (data.includes("No conversation found") && retryAttempt < 2) {
      retryAttempt++;
      if (retryAttempt === 1) {
        session.claudeSessionId = undefined;
        log(`\x1b[38;5;141m[resume]\x1b[0m Session ID invalid for ${sessionId}, trying --resume without ID`);
        retryWithNewPty(session, sessionId, buildCommand("isaac --resume"), () => retryAttempt);
      } else {
        log(`\x1b[38;5;141m[resume]\x1b[0m --resume failed, starting fresh for ${sessionId}`);
        retryWithNewPty(session, sessionId, buildCommand("isaac"), () => retryAttempt);
      }
    }
  });

  // Write the command after shell is ready
  if (session.remote) {
    // For remote sessions: wait for actual shell prompt instead of blind timer.
    // SSH errors cause immediate exit; a shell prompt means SSH connected.
    let commandWritten = false;
    const SSH_ERROR_PATTERNS = [
      "Connection refused", "Connection timed out", "Could not resolve",
      "Permission denied", "Host key verification failed", "No route to host",
      "Connection closed", "client_loop: send disconnect",
    ];

    const promptFallback = setTimeout(() => {
      if (!commandWritten && session.pty === ptyProcess) {
        log(`\x1b[38;5;208m[resume]\x1b[0m Prompt detection timed out for ${sessionId}, writing command as fallback`);
        commandWritten = true;
        ptyProcess.write(`${finalCommand}\r`);
      }
    }, 10000);

    ptyProcess.onData((data: string) => {
      if (commandWritten) return;
      // Don't write command if we see SSH error output
      for (const pattern of SSH_ERROR_PATTERNS) {
        if (data.includes(pattern)) return;
      }
      // Any non-empty, non-error output means shell prompt is ready
      if (data.trim().length > 0) {
        commandWritten = true;
        clearTimeout(promptFallback);
        session.reconnectAttempts = 0; // SSH connected successfully
        log(`\x1b[38;5;82m[resume]\x1b[0m Shell prompt detected for ${sessionId}, writing command`);
        setTimeout(() => {
          if (session.pty === ptyProcess) {
            ptyProcess.write(`${finalCommand}\r`);
          }
        }, 200);
      }
    });
  } else {
    setTimeout(() => {
      ptyProcess.write(`${finalCommand}\r`);
    }, 300);
  }

  // Broadcast running status to clients
  broadcastToSession(session, { type: "status", status: "running" });

  log(`\x1b[38;5;82m[resume]\x1b[0m Resumed ${sessionId} (${session.agentName})`);
  return true;
}

// Helper: kill current PTY, spawn a fresh one with setupPtyHandlers, and run a command
function retryWithNewPty(
  session: Session,
  sessionId: string,
  cmd: string,
  getRetryAttempt: () => number,
) {
  setTimeout(async () => {
    if (session.pty) {
      try { session.pty.kill(); } catch {}
      session.pty = null;
    }

    // Sync plugin to remote before retrying
    if (session.remote) {
      await syncPluginToRemote(session.remote).catch(() => {});
    }

    let newPty;
    if (session.remote) {
      const host = getRemoteHost(session.remote);
      newPty = spawnPty("ssh", sshArgs(host, `cd ${session.cwd} && export OPENUI_SESSION_ID=${sessionId} OPENUI_PORT=${TUNNEL_PORT} && exec zsh -l`), {
        name: "xterm-256color",
        cwd: process.cwd(),
        env: { ...process.env, TERM: "xterm-256color" },
        rows: 30,
        cols: 120,
      });
    } else {
      newPty = spawnPty("/bin/zsh", [], {
        name: "xterm-256color",
        cwd: session.cwd,
        env: { ...process.env, TERM: "xterm-256color", OPENUI_SESSION_ID: sessionId },
        rows: 30,
        cols: 120,
      });
    }

    session.pty = newPty;
    session.outputBuffer = [];
    setupPtyHandlers(session, sessionId, newPty);

    // Additional retry detection on the new PTY — rebuild with ALL plugin-dirs
    newPty.onData((data: string) => {
      if (data.includes("No conversation found") && getRetryAttempt() < 2) {
        log(`\x1b[38;5;141m[resume]\x1b[0m --resume failed on retry, starting fresh for ${sessionId}`);
        let freshCmd = "isaac";
        // Restore all original plugin-dirs from the session command
        const dirRegex = /--plugin-dir\s+(\S+)/g;
        let m;
        while ((m = dirRegex.exec(session.command)) !== null) {
          if (!freshCmd.includes(m[1])) {
            freshCmd += ` --plugin-dir ${m[1]}`;
          }
        }
        // Apply all command injections
        freshCmd = buildFinalCommand(freshCmd, session);
        retryWithNewPty(session, sessionId, freshCmd, () => 2); // No more retries
      }
    });

    if (session.remote) {
      // Wait for shell prompt before writing command
      let cmdWritten = false;
      const SSH_ERRORS = ["Connection refused", "Connection timed out", "Could not resolve",
        "Permission denied", "Host key verification failed", "No route to host",
        "Connection closed", "client_loop: send disconnect"];
      const fallback = setTimeout(() => {
        if (!cmdWritten && session.pty === newPty) {
          cmdWritten = true;
          newPty.write(`${cmd}\r`);
        }
      }, 10000);
      newPty.onData((data: string) => {
        if (cmdWritten) return;
        for (const pat of SSH_ERRORS) { if (data.includes(pat)) return; }
        if (data.trim().length > 0) {
          cmdWritten = true;
          clearTimeout(fallback);
          session.reconnectAttempts = 0;
          setTimeout(() => { if (session.pty === newPty) newPty.write(`${cmd}\r`); }, 200);
        }
      });
    } else {
      setTimeout(() => {
        newPty.write(`${cmd}\r`);
      }, 300);
    }
  }, 500);
}
