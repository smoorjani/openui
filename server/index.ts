import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { spawn } from "bun-pty";
import { apiRoutes, setUiBroadcast, loadConfig } from "./routes/api";
import { sessions, restoreSessions, autoResumeSessions, getRemoteHost } from "./services/sessionManager";
import { saveState, migrateStateToHome } from "./services/persistence";
import { setAuthBroadcast } from "./services/sessionStartQueue";
import type { WebSocketData } from "./types";

// Global set of all connected WebSocket clients for UI broadcasts
const allClients = new Set<ServerWebSocket<WebSocketData>>();

const SHELL_BUFFER_MAX = 100;
// Close WS clients whose buffered-to-send amount exceeds this. A slow client
// that can't keep up with PTY output must not back up the server's memory.
const WS_BACKPRESSURE_CLOSE_BYTES = 4 * 1024 * 1024; // 4 MB

type ShellTerminal = {
  pty: ReturnType<typeof spawn>;
  clients: Set<ServerWebSocket<WebSocketData>>;
  outputBuffer: string[];
};

const shellTerminals = new Map<string, ShellTerminal>();

function sendToWs(client: ServerWebSocket<WebSocketData>, payload: string): boolean {
  if (client.readyState !== 1) return false;
  if (typeof (client as any).getBufferedAmount === "function"
      && (client as any).getBufferedAmount() > WS_BACKPRESSURE_CLOSE_BYTES) {
    try { client.close(1013, "backpressure"); } catch {}
    return false;
  }
  client.send(payload);
  return true;
}

function attachShellPtyHandlers(shell: ShellTerminal, pty: ReturnType<typeof spawn>, sessionId: string) {
  pty.onData((data: string) => {
    // Guard against stale handlers firing after restart — only the current PTY broadcasts.
    if (shell.pty !== pty) return;
    shell.outputBuffer.push(data);
    if (shell.outputBuffer.length > SHELL_BUFFER_MAX) {
      shell.outputBuffer.shift();
    }
    const payload = JSON.stringify({ type: "output", data });
    for (const client of shell.clients) {
      sendToWs(client, payload);
    }
  });

  pty.onExit(() => {
    if (shell.pty !== pty) return;
    log(`\x1b[38;5;245m[ws]\x1b[0m Shell process exited: ${sessionId}`);
    const payload = JSON.stringify({ type: "exited" });
    for (const client of shell.clients) {
      sendToWs(client, payload);
    }
  });
}

const app = new Hono();
const PORT = Number(process.env.PORT) || 6968;
const QUIET = !!process.env.OPENUI_QUIET;

// Conditionally log only in dev mode
const log = QUIET ? () => {} : console.log.bind(console);

const DEFAULT_MAX_HISTORY_KB = 128;

function getMaxHistoryBytes(): number {
  const config = loadConfig();
  const kb = config.maxHistoryKB ?? DEFAULT_MAX_HISTORY_KB;
  return kb * 1024;
}

function buildReplayHistory(outputBuffer: string[]): string {
  const maxBytes = getMaxHistoryBytes();
  let history = "";
  let totalBytes = 0;

  for (let i = outputBuffer.length - 1; i >= 0; i--) {
    const chunk = outputBuffer[i];
    if (totalBytes + chunk.length > maxBytes) {
      break;
    }
    history = chunk + history;
    totalBytes += chunk.length;
  }

  if (history.length > 0) {
    history = "\x1b[0m" + history;
  }

  return history;
}

// Middleware
app.use("*", cors({ origin: ["http://localhost:6968", "http://localhost:6969"] }));

// API Routes
app.route("/api", apiRoutes);

// Serve static files (no-cache on index.html so browser always gets fresh asset references)
app.use("/*", serveStatic({
  root: "./client/dist",
  onFound: (path, c) => {
    if (path.endsWith("index.html")) {
      c.header("Cache-Control", "no-cache");
    }
  },
}));

// Wire up UI broadcast so API routes can send messages to all clients
setUiBroadcast((msg: any) => {
  const payload = JSON.stringify(msg);
  for (const client of allClients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
});

// Restore sessions BEFORE starting server so API requests find populated sessions Map
const migrationResult = migrateStateToHome();
if (migrationResult.migrated) {
  log(`\x1b[38;5;82m[migration]\x1b[0m Migrated state from ${migrationResult.source}`);
}
restoreSessions();

// WebSocket server
Bun.serve<WebSocketData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) return new Response("Session ID required", { status: 400 });

      const session = sessions.get(sessionId);
      if (!session) return new Response("Session not found", { status: 404 });

      const lastSeq = Number(url.searchParams.get("lastSeq")) || 0;
      const upgraded = server.upgrade(req, { data: { sessionId, lastSeq } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/ws/ui") {
      const upgraded = server.upgrade(req, { data: { sessionId: "ui-global", isUi: true } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/ws/shell") {
      const sessionId = url.searchParams.get("sessionId");
      const cwd = url.searchParams.get("cwd") || process.cwd();
      const remote = url.searchParams.get("remote") || undefined;
      if (!sessionId) return new Response("Session ID required", { status: 400 });

      const shellId = `shell-${sessionId}`;
      const upgraded = server.upgrade(req, { data: { sessionId: shellId, isShell: true, cwd, remote } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const { sessionId, lastSeq, isShell, cwd, remote } = ws.data;
      allClients.add(ws);

      if (ws.data.isUi) {
        log(`\x1b[38;5;245m[ws]\x1b[0m UI client connected`);
        return;
      }

      if (isShell) {
        log(`\x1b[38;5;245m[ws]\x1b[0m Shell connected: ${sessionId}${remote ? ` (remote: ${remote})` : ""}`);

        let shell = shellTerminals.get(sessionId);
        if (!shell) {
          let ptyProcess;
          if (remote) {
            const host = getRemoteHost(remote);
            ptyProcess = spawn("ssh", ["-t", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", host, `cd ${cwd} && exec zsh -l`], {
              name: "xterm-256color",
              cwd: process.cwd(),
              env: { ...process.env, TERM: "xterm-256color" },
              rows: 30,
              cols: 120,
            });
          } else {
            ptyProcess = spawn("/bin/zsh", [], {
              name: "xterm-256color",
              cwd: cwd || process.cwd(),
              env: {
                ...process.env,
                TERM: "xterm-256color",
              },
              rows: 30,
              cols: 120,
            });
          }

          shell = { pty: ptyProcess, clients: new Set(), outputBuffer: [] };
          shellTerminals.set(sessionId, shell);
          attachShellPtyHandlers(shell, ptyProcess, sessionId);
        }

        shell.clients.add(ws);

        // Replay buffered output so reconnecting clients see history
        if (shell.outputBuffer.length > 0) {
          const history = shell.outputBuffer.join("");
          ws.send(JSON.stringify({ type: "output", data: history }));
        }
        return;
      }

      const session = sessions.get(sessionId);

      if (!session) {
        ws.close(1008, "Session not found");
        return;
      }

      log(`\x1b[38;5;245m[ws]\x1b[0m Connected to ${sessionId} (lastSeq=${lastSeq}, serverSeq=${session.outputSeq})`);
      session.clients.add(ws);

      if (session.isRestored || !session.pty) {
        ws.send(JSON.stringify({
          type: "output",
          data: "\x1b[38;5;245mSession was disconnected.\r\nClick \"Spawn Fresh\" to start a new session.\x1b[0m\r\n",
          seq: session.outputSeq,
        }));
      } else if (lastSeq > 0 && lastSeq === session.outputSeq) {
        // Client cache is up to date — skip buffer replay
        log(`\x1b[38;5;245m[ws]\x1b[0m Cache hit for ${sessionId}, skipping buffer`);
        ws.send(JSON.stringify({ type: "output", data: "", seq: session.outputSeq }));
      } else {
        // Defer buffer replay until after client sends its first resize.
        // This prevents garbled text when the panel is narrower than 120 cols
        // (the PTY default). The client sends resize immediately on ws.onopen.
        const sendBufferReplay = () => {
          if (lastSeq > 0 && session.outputBuffer.length > 0) {
            const missedChunks = session.outputSeq - lastSeq;
            if (missedChunks > 0 && missedChunks <= session.outputBuffer.length) {
              const startIndex = session.outputBuffer.length - missedChunks;
              let delta = "";
              for (let i = startIndex; i < session.outputBuffer.length; i++) {
                delta += session.outputBuffer[i];
              }
              log(`\x1b[38;5;245m[ws]\x1b[0m Delta replay for ${sessionId}: ${missedChunks} chunks`);
              ws.send(JSON.stringify({ type: "output", data: delta, seq: session.outputSeq, isDelta: true }));
            } else {
              const history = buildReplayHistory(session.outputBuffer);
              log(`\x1b[38;5;245m[ws]\x1b[0m Stale cache fallback for ${sessionId}: replaying recent history`);
              ws.send(JSON.stringify({ type: "output", data: history, seq: session.outputSeq }));
            }
          } else if (session.outputBuffer.length > 0) {
            const history = buildReplayHistory(session.outputBuffer);
            ws.send(JSON.stringify({ type: "output", data: history, seq: session.outputSeq }));
          }
        };
        (ws.data as any).pendingBufferReplay = sendBufferReplay;
        // Safety timeout: send buffer anyway if client never sends resize.
        // Track the timer so close() can clear it and release the closure refs.
        const replayTimer = setTimeout(() => {
          (ws.data as any).pendingBufferReplayTimer = undefined;
          const pending = (ws.data as any).pendingBufferReplay;
          if (pending) {
            delete (ws.data as any).pendingBufferReplay;
            pending();
          }
        }, 500);
        (ws.data as any).pendingBufferReplayTimer = replayTimer;
      }

      ws.send(JSON.stringify({
        type: "status",
        status: session.status,
        isRestored: session.isRestored,
        creationProgress: session.creationProgress,
        currentTool: session.currentTool,
        gitBranch: session.gitBranch,
        longRunningTool: session.longRunningTool || false,
      }));

    },
    message(ws, message) {
      const { sessionId, isShell } = ws.data;

      if (ws.data.isUi) return; // UI clients don't send actionable messages

      if (isShell) {
        const shell = shellTerminals.get(sessionId);
        if (!shell) return;

        try {
          const msg = JSON.parse(message.toString());
          switch (msg.type) {
            case "input":
              shell.pty.write(msg.data);
              break;
            case "resize":
              shell.pty.resize(msg.cols, msg.rows);
              break;
            case "restart":
              log(`\x1b[38;5;245m[ws]\x1b[0m Restarting shell: ${sessionId}`);
              shell.pty.kill();
              shell.outputBuffer.length = 0;

              let newPty;
              if (ws.data.remote) {
                const restartHost = getRemoteHost(ws.data.remote);
                newPty = spawn("ssh", ["-t", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3", restartHost, `cd ${ws.data.cwd} && exec zsh -l`], {
                  name: "xterm-256color",
                  cwd: process.cwd(),
                  env: { ...process.env, TERM: "xterm-256color" },
                  rows: 30,
                  cols: 120,
                });
              } else {
                newPty = spawn("/bin/zsh", [], {
                  name: "xterm-256color",
                  cwd: ws.data.cwd || process.cwd(),
                  env: {
                    ...process.env,
                    TERM: "xterm-256color",
                  },
                  rows: 30,
                  cols: 120,
                });
              }

              shell.pty = newPty;
              attachShellPtyHandlers(shell, newPty, sessionId);

              const restartedPayload = JSON.stringify({ type: "restarted" });
              for (const client of shell.clients) {
                sendToWs(client, restartedPayload);
              }
              break;
          }
        } catch (e) {
          if (!QUIET) console.error("Error processing shell message:", e);
        }
        return;
      }

      const session = sessions.get(sessionId);
      if (!session) return;

      try {
        const msg = JSON.parse(message.toString());
        switch (msg.type) {
          case "input":
            if (session.pty) {
              session.pty.write(msg.data);
              session.lastInputTime = Date.now();
            }
            break;
          case "resize":
            if (session.pty && msg.cols > 20 && msg.rows > 5) {
              session.pty.resize(msg.cols, msg.rows);
            }
            // Flush deferred buffer replay now that PTY is at the correct size
            const pending = (ws.data as any).pendingBufferReplay;
            if (pending) {
              delete (ws.data as any).pendingBufferReplay;
              const pendingTimer = (ws.data as any).pendingBufferReplayTimer;
              if (pendingTimer) {
                clearTimeout(pendingTimer);
                (ws.data as any).pendingBufferReplayTimer = undefined;
              }
              pending();
            }
            break;
        }
      } catch (e) {
        if (!QUIET) console.error("Error processing message:", e);
      }
    },
    close(ws) {
      const { sessionId, isShell } = ws.data;
      allClients.delete(ws);

      // Release any deferred replay timer so its closure doesn't keep session refs alive.
      const pendingTimer = (ws.data as any).pendingBufferReplayTimer;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        (ws.data as any).pendingBufferReplayTimer = undefined;
      }
      if ((ws.data as any).pendingBufferReplay) {
        delete (ws.data as any).pendingBufferReplay;
      }

      if (ws.data.isUi) {
        log(`\x1b[38;5;245m[ws]\x1b[0m UI client disconnected`);
        return;
      }

      if (isShell) {
        const shell = shellTerminals.get(sessionId);
        if (shell) {
          shell.clients.delete(ws);
          log(`\x1b[38;5;245m[ws]\x1b[0m Shell disconnected: ${sessionId}`);
          // Last client gone → kill the PTY and drop the entry so zsh processes
          // don't accumulate on reconnects (exhausts FDs fast on macOS).
          if (shell.clients.size === 0) {
            try { shell.pty.kill(); } catch {}
            shellTerminals.delete(sessionId);
            log(`\x1b[38;5;245m[ws]\x1b[0m Shell PTY released: ${sessionId}`);
          }
        }
        return;
      }

      const session = sessions.get(sessionId);
      if (session) {
        session.clients.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Disconnected from ${sessionId}`);
      }
    },
  },
});

// Wire up auth broadcast — notify all connected clients when OAuth is needed/complete
function broadcastToAll(message: object) {
  const json = JSON.stringify(message);
  for (const session of sessions.values()) {
    for (const client of session.clients) {
      try {
        if (client.readyState === 1) client.send(json);
      } catch {}
    }
  }
}

setAuthBroadcast(
  (url) => broadcastToAll({ type: "auth_required", url }),
  () => broadcastToAll({ type: "auth_complete" }),
);

// Auto-resume non-archived sessions after a short delay
setTimeout(() => {
  autoResumeSessions();
}, 1000);

log(`\x1b[38;5;141m[server]\x1b[0m Running on http://localhost:${PORT}`);
log(`\x1b[38;5;245m[server]\x1b[0m Launch directory: ${process.env.LAUNCH_CWD || process.cwd()}`);

// Periodic state save
setInterval(() => {
  saveState(sessions);
}, 30000);

// Cleanup on exit
process.on("SIGINT", async () => {
  log("\n\x1b[38;5;245m[server]\x1b[0m Saving state before exit...");
  saveState(sessions);
  for (const [, session] of sessions) {
    if (session.pty) session.pty.kill();
  }
  for (const [, shell] of shellTerminals) {
    shell.pty.kill();
  }
  process.exit(0);
});
