import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import type { ServerWebSocket } from "bun";
import { apiRoutes } from "./routes/api";
import { sessions, restoreSessions } from "./services/sessionManager";
import { saveState } from "./services/persistence";
import type { WebSocketData } from "./types";
import {
  initializeTmux,
  ensureWindow,
  switchWindow,
  addClient,
  removeClient,
  writeInput,
  resize,
  restartCurrentWindow,
  cleanupTmux,
  tmuxManager,
} from "./services/tmuxShell";

const app = new Hono();
const PORT = Number(process.env.PORT) || 6968;
const QUIET = !!process.env.OPENUI_QUIET;

// Conditionally log only in dev mode
const log = QUIET ? () => {} : console.log.bind(console);

// Middleware
app.use("*", cors());

// API Routes
app.route("/api", apiRoutes);

// Serve static files
app.use("/*", serveStatic({ root: "./client/dist" }));

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

      const upgraded = server.upgrade(req, { data: { sessionId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Shell terminal WebSocket - tmux-based shell
    if (url.pathname === "/ws/shell") {
      const sessionId = url.searchParams.get("sessionId");
      const cwd = url.searchParams.get("cwd") || process.cwd();
      if (!sessionId) return new Response("Session ID required", { status: 400 });

      // Initialize tmux if needed
      if (!tmuxManager.initialized) {
        initializeTmux(cwd);
      }

      // Ensure window exists for this session
      ensureWindow(sessionId, cwd);

      const upgraded = server.upgrade(req, { data: { sessionId, isShell: true, cwd } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      const { sessionId, isShell, cwd } = ws.data;

      // Handle shell terminal connections (tmux-based)
      if (isShell) {
        log(`\x1b[38;5;245m[ws]\x1b[0m Shell connected: ${sessionId}`);

        // Add client to tmux manager
        addClient(ws);

        // Switch to this session's window
        switchWindow(sessionId);

        return;
      }

      // Handle agent session connections
      const session = sessions.get(sessionId);

      if (!session) {
        ws.close(1008, "Session not found");
        return;
      }

      log(`\x1b[38;5;245m[ws]\x1b[0m Connected to ${sessionId}`);
      session.clients.add(ws);

      if (session.outputBuffer.length > 0 && !session.isRestored && session.pty) {
        const history = session.outputBuffer.join("");
        ws.send(JSON.stringify({ type: "output", data: history }));
      } else if (session.isRestored || !session.pty) {
        ws.send(JSON.stringify({
          type: "output",
          data: "\x1b[38;5;245mSession was disconnected.\r\nClick \"Resume\" to continue or \"New Session\" to start fresh.\x1b[0m\r\n"
        }));
      }

      ws.send(JSON.stringify({
        type: "status",
        status: session.status,
        isRestored: session.isRestored
      }));
    },
    message(ws, message) {
      const { sessionId, isShell } = ws.data;

      // Handle shell terminal messages (tmux-based)
      if (isShell) {
        try {
          const msg = JSON.parse(message.toString());
          switch (msg.type) {
            case "input":
              writeInput(msg.data);
              break;
            case "resize":
              resize(msg.cols, msg.rows);
              break;
            case "restart":
              log(`\x1b[38;5;245m[ws]\x1b[0m Restarting shell window: ${sessionId}`);
              restartCurrentWindow();
              break;
            case "switch":
              // Switch to a different session's window
              if (msg.sessionId) {
                ensureWindow(msg.sessionId, msg.cwd || process.cwd());
                switchWindow(msg.sessionId);
              }
              break;
          }
        } catch (e) {
          if (!QUIET) console.error("Error processing shell message:", e);
        }
        return;
      }

      // Handle agent session messages
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
            if (session.pty) {
              session.pty.resize(msg.cols, msg.rows);
            }
            break;
        }
      } catch (e) {
        if (!QUIET) console.error("Error processing message:", e);
      }
    },
    close(ws) {
      const { sessionId, isShell } = ws.data;

      // Handle shell terminal disconnection (tmux-based)
      if (isShell) {
        removeClient(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Shell client disconnected: ${sessionId}`);
        // Don't clean up tmux windows on disconnect - they persist
        return;
      }

      // Handle agent session disconnection
      const session = sessions.get(sessionId);
      if (session) {
        session.clients.delete(ws);
        log(`\x1b[38;5;245m[ws]\x1b[0m Disconnected from ${sessionId}`);
      }
    },
  },
});

// Restore sessions on startup
restoreSessions();

log(`\x1b[38;5;141m[server]\x1b[0m Running on http://localhost:${PORT}`);
log(`\x1b[38;5;245m[server]\x1b[0m Launch directory: ${process.env.LAUNCH_CWD || process.cwd()}`);

// Periodic state save
setInterval(() => {
  saveState(sessions);
}, 30000);

// Cleanup on exit
process.on("SIGINT", () => {
  log("\n\x1b[38;5;245m[server]\x1b[0m Saving state before exit...");
  saveState(sessions);
  for (const [, session] of sessions) {
    if (session.pty) session.pty.kill();
    if (session.stateTrackerPty) session.stateTrackerPty.kill();
  }
  cleanupTmux();
  process.exit(0);
});
