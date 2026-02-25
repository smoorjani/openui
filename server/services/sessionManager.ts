import { spawnSync, spawn as bunSpawn } from "bun";
import { spawn as spawnPty } from "bun-pty";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import type { Session } from "../types";
import { loadBuffer } from "./persistence";

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

// Remote host mappings for SSH-based sessions
const REMOTE_HOSTS: Record<string, string> = {
  "arca": "arca.ssh",
};

export function getRemoteHost(remote: string): string {
  return REMOTE_HOSTS[remote] || remote;
}

function sshArgs(host: string, remoteCommand: string): string[] {
  return ["-t", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", host, remoteCommand];
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
async function sshExecAsync(remote: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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

// Broadcast a message to all connected WebSocket clients of a session
function broadcastToSession(session: Session, message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  for (const client of session.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
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

  ptyProcess.onData((data: string) => {
    session.outputBuffer.push(data);
    if (session.outputBuffer.length > MAX_BUFFER_SIZE) {
      session.outputBuffer.shift();
    }
    session.lastOutputTime = Date.now();
    session.recentOutputSize += data.length;

    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "output", data }));
      }
    }
  });

  ptyProcess.onExit(() => {
    if (!sessions.has(sessionId)) return;

    session.pty = null;

    if (session.remote) {
      // Remote SSH died (likely network drop) — auto-reconnect
      log(`\x1b[38;5;208m[pty-exit]\x1b[0m Remote SSH exited for ${sessionId}, attempting auto-reconnect in 3s...`);
      session.status = "disconnected";
      broadcastToSession(session, {
        type: "status",
        status: "disconnected",
      });

      setTimeout(async () => {
        if (!sessions.has(sessionId) || session.pty) return;

        log(`\x1b[38;5;82m[auto-reconnect]\x1b[0m Reconnecting ${sessionId}...`);
        broadcastToSession(session, {
          type: "output",
          data: "\r\n\x1b[38;5;208m[openui] SSH disconnected. Reconnecting...\x1b[0m\r\n",
        });

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

  sendProgress("Starting agent...");

  // Spawn PTY
  let ptyProcess;
  if (remote) {
    const host = getRemoteHost(remote);
    ptyProcess = spawnPty("ssh", sshArgs(host, `cd ${session.cwd} && exec zsh -l`), {
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
  const finalCommand = remote ? command : injectPluginDir(command, agentId);
  log(`\x1b[38;5;82m[pty-write]\x1b[0m Writing command: ${finalCommand}`);
  setTimeout(() => {
    ptyProcess.write(`${finalCommand}\r`);
  }, remote ? 1500 : 300);

  broadcastToSession(session, {
    type: "status",
    status: "waiting_input",
  });

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
  branchName?: string;
  baseBranch?: string;
  createWorktreeFlag?: boolean;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  remote?: string;
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
  } = params;

  let workingDir = originalCwd;
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

  // For local sessions, detect the main repo from worktree
  if (!remote && !mainRepoPath) {
    const detectedMainRepo = getMainWorktree(workingDir);
    if (detectedMainRepo && detectedMainRepo !== workingDir) {
      mainRepoPath = detectedMainRepo;
      log(`\x1b[38;5;141m[session]\x1b[0m Detected main repo from worktree: ${mainRepoPath}`);
    }
  }

  // Get git branch if not already set from worktree (local only)
  if (!gitBranch && !remote) {
    gitBranch = getGitBranch(workingDir);
  }

  // Spawn PTY: SSH for remote sessions, local zsh otherwise
  let ptyProcess;
  if (remote) {
    const host = getRemoteHost(remote);
    ptyProcess = spawnPty("ssh", sshArgs(host, `cd ${workingDir} && exec zsh -l`), {
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
    status: "waiting_input",
    lastOutputTime: now,
    lastInputTime: 0,
    recentOutputSize: 0,
    customName,
    customColor,
    nodeId,
    isRestored: false,
    remote,
  };

  sessions.set(sessionId, session);
  setupPtyHandlers(session, sessionId, ptyProcess);

  // Run the command (skip plugin injection for remote - plugin is local only)
  const finalCommand = remote ? command : injectPluginDir(command, agentId);
  log(`\x1b[38;5;82m[pty-write]\x1b[0m Writing command: ${finalCommand}`);
  setTimeout(() => {
    ptyProcess.write(`${finalCommand}\r`);
  }, remote ? 1500 : 300); // Longer delay for SSH connection to establish

  log(`\x1b[38;5;141m[session]\x1b[0m Created ${sessionId} for ${agentName}${remote ? ` on ${remote}` : ""}`);
  return { session, cwd: workingDir, gitBranch: gitBranch || undefined };
}

export function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  if (session.pty) session.pty.kill();

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

  sessions.delete(sessionId);
  log(`\x1b[38;5;141m[session]\x1b[0m Killed ${sessionId}`);
  return true;
}

export function restoreSessions() {
  const { loadState } = require("./persistence");
  const state = loadState();

  log(`\x1b[38;5;245m[restore]\x1b[0m Found ${state.nodes.length} saved sessions`);

  const sessionIds: string[] = [];

  for (const node of state.nodes) {
    const buffer = loadBuffer(node.sessionId);
    // Only detect git branch locally; skip for remote sessions
    const gitBranch = node.remote ? null : getGitBranch(node.cwd);

    const session: Session = {
      pty: null,
      agentId: node.agentId,
      agentName: node.agentName,
      command: node.command,
      cwd: node.cwd,
      originalCwd: node.originalCwd,
      worktreePath: node.worktreePath,
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
      claudeSessionId: node.claudeSessionId,
      remote: node.remote,
    };

    sessions.set(node.sessionId, session);
    sessionIds.push(node.sessionId);
    log(`\x1b[38;5;245m[restore]\x1b[0m Restored ${node.sessionId} (${node.agentName}) branch: ${gitBranch || 'none'}${node.remote ? ` remote: ${node.remote}` : ''}`);
  }

  // Auto-resume all sessions with staggered delays to avoid resource contention
  if (sessionIds.length > 0) {
    log(`\x1b[38;5;82m[auto-resume]\x1b[0m Starting auto-resume for ${sessionIds.length} sessions...`);
    sessionIds.forEach((sid, index) => {
      setTimeout(() => {
        resumeSession(sid).catch((err) => {
          log(`\x1b[38;5;196m[auto-resume]\x1b[0m Failed to resume ${sid}: ${err}`);
        });
      }, index * 2000); // 2s stagger between each session
    });
  }
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

  // Spawn PTY: SSH for remote sessions, local zsh otherwise
  let ptyProcess;
  if (session.remote) {
    const host = getRemoteHost(session.remote);
    ptyProcess = spawnPty("ssh", sshArgs(host, `cd ${session.cwd} && exec zsh -l`), {
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

  // Rate-limit output size tracking reset
  const resetInterval = setInterval(() => {
    if (!sessions.has(sessionId) || !session.pty) {
      clearInterval(resetInterval);
      return;
    }
    session.recentOutputSize = Math.max(0, session.recentOutputSize - 50);
  }, 500);

  // Build the resume command
  let command = "isaac";
  let finalCommand = session.remote ? command : injectPluginDir(command, session.agentId);

  const hasSessionId = session.agentId === "claude" && session.claudeSessionId;
  if (hasSessionId) {
    finalCommand = finalCommand.replace("isaac", `isaac --resume ${session.claudeSessionId}`);
    log(`\x1b[38;5;141m[resume]\x1b[0m Attempting resume with session: ${session.claudeSessionId}`);
  }

  // Retry logic for "No conversation found"
  let retryAttempt = 0;

  const spawnFreshPty = () => {
    if (session.remote) {
      const host = getRemoteHost(session.remote);
      return spawnPty("ssh", sshArgs(host, `cd ${session.cwd} && exec zsh -l`), {
        name: "xterm-256color",
        cwd: process.cwd(),
        env: { ...process.env, TERM: "xterm-256color" },
        rows: 30,
        cols: 120,
      });
    }
    return spawnPty("/bin/zsh", [], {
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
  };

  const restartWithCommand = (cmd: string) => {
    setTimeout(async () => {
      if (session.pty) {
        session.pty.kill();
      }

      const newPty = spawnFreshPty();
      session.pty = newPty;
      session.outputBuffer = [];

      newPty.onData((newData: string) => {
        session.outputBuffer.push(newData);
        if (session.outputBuffer.length > 1000) {
          session.outputBuffer.shift();
        }
        session.lastOutputTime = Date.now();
        for (const client of session.clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify({ type: "output", data: newData }));
          }
        }

        if (newData.includes("No conversation found") && retryAttempt < 2) {
          retryAttempt++;
          if (retryAttempt === 2) {
            log(`\x1b[38;5;141m[resume]\x1b[0m --resume failed, starting fresh for ${sessionId}`);
            const freshCmd = session.remote ? "isaac" : injectPluginDir("isaac", session.agentId);
            restartWithCommand(freshCmd);
          }
        }
      });

      setTimeout(() => {
        newPty.write(`${cmd}\r`);
      }, session.remote ? 1500 : 300);
    }, 500);
  };

  // Set up data handler with retry logic
  ptyProcess.onData((data: string) => {
    session.outputBuffer.push(data);
    if (session.outputBuffer.length > 1000) {
      session.outputBuffer.shift();
    }

    session.lastOutputTime = Date.now();
    session.recentOutputSize += data.length;

    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "output", data }));
      }
    }

    if (data.includes("No conversation found") && retryAttempt === 0) {
      retryAttempt = 1;
      session.claudeSessionId = undefined;

      log(`\x1b[38;5;141m[resume]\x1b[0m Session ID invalid for ${sessionId}, trying --resume without ID`);
      const resumeCmd = session.remote ? "isaac --resume" : injectPluginDir("isaac --resume", session.agentId);
      restartWithCommand(resumeCmd);
    }
  });

  // Write the command after shell is ready
  setTimeout(() => {
    ptyProcess.write(`${finalCommand}\r`);
  }, session.remote ? 1500 : 300);

  log(`\x1b[38;5;82m[resume]\x1b[0m Resumed ${sessionId} (${session.agentName})`);
  return true;
}
