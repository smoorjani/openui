import { spawn } from "bun-pty";
import type { ServerWebSocket } from "bun";
import type { WebSocketData } from "../types";

const QUIET = !!process.env.OPENUI_QUIET;
const log = QUIET ? () => {} : console.log.bind(console);

const TMUX_SESSION = "openui-shell";

interface TmuxShellManager {
  pty: ReturnType<typeof spawn> | null;
  clients: Set<ServerWebSocket<WebSocketData>>;
  windows: Map<string, { cwd: string; created: boolean }>;
  currentWindow: string | null;
  initialized: boolean;
}

export const tmuxManager: TmuxShellManager = {
  pty: null,
  clients: new Set(),
  windows: new Map(),
  currentWindow: null,
  initialized: false,
};

function execSync(cmd: string): string {
  try {
    const result = Bun.spawnSync(["bash", "-c", cmd]);
    return result.stdout.toString().trim();
  } catch {
    return "";
  }
}

function tmuxSessionExists(): boolean {
  const result = execSync(`tmux has-session -t ${TMUX_SESSION} 2>/dev/null && echo "yes" || echo "no"`);
  return result === "yes";
}

function createTmuxSession(cwd: string): void {
  execSync(`tmux kill-session -t ${TMUX_SESSION} 2>/dev/null || true`);
  execSync(`tmux new-session -d -s ${TMUX_SESSION} -c "${cwd}"`);
  log(`\x1b[38;5;245m[tmux]\x1b[0m Created tmux session: ${TMUX_SESSION}`);
}

export function initializeTmux(defaultCwd: string): void {
  if (tmuxManager.initialized) return;

  if (!tmuxSessionExists()) {
    createTmuxSession(defaultCwd);
  }

  // Attach to tmux session via PTY
  const pty = spawn("tmux", ["attach-session", "-t", TMUX_SESSION], {
    name: "xterm-256color",
    cwd: defaultCwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
    },
    rows: 30,
    cols: 120,
  });

  tmuxManager.pty = pty;
  tmuxManager.initialized = true;

  pty.onData((data: string) => {
    for (const client of tmuxManager.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "output", data }));
      }
    }
  });

  pty.onExit(() => {
    log(`\x1b[38;5;245m[tmux]\x1b[0m PTY exited, reinitializing...`);
    tmuxManager.initialized = false;
    tmuxManager.pty = null;
    // Reinitialize after a short delay
    setTimeout(() => initializeTmux(defaultCwd), 500);
  });

  log(`\x1b[38;5;245m[tmux]\x1b[0m Attached to tmux session`);
}

export function ensureWindow(sessionId: string, cwd: string): void {
  const windowName = sanitizeWindowName(sessionId);

  if (!tmuxManager.windows.has(sessionId)) {
    // Create new tmux window
    execSync(`tmux new-window -t ${TMUX_SESSION} -n "${windowName}" -c "${cwd}" 2>/dev/null || true`);
    tmuxManager.windows.set(sessionId, { cwd, created: true });
    log(`\x1b[38;5;245m[tmux]\x1b[0m Created window: ${windowName}`);
  }
}

export function switchWindow(sessionId: string): void {
  const windowName = sanitizeWindowName(sessionId);

  if (tmuxManager.currentWindow === sessionId) return;

  // Switch to the window
  execSync(`tmux select-window -t "${TMUX_SESSION}:${windowName}" 2>/dev/null || true`);
  tmuxManager.currentWindow = sessionId;
  log(`\x1b[38;5;245m[tmux]\x1b[0m Switched to window: ${windowName}`);
}

export function removeWindow(sessionId: string): void {
  const windowName = sanitizeWindowName(sessionId);

  execSync(`tmux kill-window -t "${TMUX_SESSION}:${windowName}" 2>/dev/null || true`);
  tmuxManager.windows.delete(sessionId);

  if (tmuxManager.currentWindow === sessionId) {
    tmuxManager.currentWindow = null;
  }

  log(`\x1b[38;5;245m[tmux]\x1b[0m Removed window: ${windowName}`);
}

export function addClient(ws: ServerWebSocket<WebSocketData>): void {
  tmuxManager.clients.add(ws);
}

export function removeClient(ws: ServerWebSocket<WebSocketData>): void {
  tmuxManager.clients.delete(ws);
}

export function writeInput(data: string): void {
  if (tmuxManager.pty) {
    tmuxManager.pty.write(data);
  }
}

export function resize(cols: number, rows: number): void {
  if (tmuxManager.pty) {
    tmuxManager.pty.resize(cols, rows);
  }
}

export function restartCurrentWindow(): void {
  if (!tmuxManager.currentWindow) return;

  const windowName = sanitizeWindowName(tmuxManager.currentWindow);
  const windowInfo = tmuxManager.windows.get(tmuxManager.currentWindow);
  const cwd = windowInfo?.cwd || process.cwd();

  // Kill current pane and respawn
  execSync(`tmux respawn-window -t "${TMUX_SESSION}:${windowName}" -k -c "${cwd}" 2>/dev/null || true`);
  log(`\x1b[38;5;245m[tmux]\x1b[0m Restarted window: ${windowName}`);

  // Notify clients
  for (const client of tmuxManager.clients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: "restarted" }));
    }
  }
}

export function cleanupTmux(): void {
  if (tmuxManager.pty) {
    tmuxManager.pty.kill();
  }
  execSync(`tmux kill-session -t ${TMUX_SESSION} 2>/dev/null || true`);
  log(`\x1b[38;5;245m[tmux]\x1b[0m Cleaned up tmux session`);
}

function sanitizeWindowName(sessionId: string): string {
  // tmux window names can't have certain characters
  return sessionId.replace(/[:.]/g, "-");
}
