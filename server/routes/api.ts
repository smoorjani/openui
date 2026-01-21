import { Hono } from "hono";
import type { Agent } from "../types";
import { sessions, createSession, deleteSession } from "../services/sessionManager";
import { loadState, saveState } from "../services/persistence";
import { detectStatus } from "../services/statusDetector";

const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();

export const apiRoutes = new Hono();

apiRoutes.get("/config", (c) => {
  return c.json({ launchCwd: LAUNCH_CWD });
});

apiRoutes.get("/agents", (c) => {
  const agents: Agent[] = [
    {
      id: "claude",
      name: "Claude Code",
      command: "claude",
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
  ];
  return c.json(agents);
});

apiRoutes.get("/sessions", (c) => {
  const sessionList = Array.from(sessions.entries()).map(([id, session]) => {
    session.status = detectStatus(session);
    return {
      sessionId: id,
      nodeId: session.nodeId,
      agentId: session.agentId,
      agentName: session.agentName,
      command: session.command,
      createdAt: session.createdAt,
      cwd: session.cwd,
      status: session.status,
      customName: session.customName,
      customColor: session.customColor,
      notes: session.notes,
      isRestored: session.isRestored,
    };
  });
  return c.json(sessionList);
});

apiRoutes.get("/sessions/:sessionId/status", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);

  session.status = detectStatus(session);
  return c.json({ status: session.status, isRestored: session.isRestored });
});

apiRoutes.get("/state", (c) => {
  const state = loadState();
  const nodes = state.nodes.map(node => {
    const session = sessions.get(node.sessionId);
    return {
      ...node,
      status: session ? detectStatus(session) : "disconnected",
      isAlive: !!session,
      isRestored: session?.isRestored,
    };
  }).filter(n => n.isAlive);
  return c.json({ nodes });
});

apiRoutes.post("/state/positions", async (c) => {
  const { positions } = await c.req.json();
  const state = loadState();

  for (const [nodeId, pos] of Object.entries(positions)) {
    const node = state.nodes.find(n => n.nodeId === nodeId);
    if (node) {
      node.position = pos as { x: number; y: number };
    }
  }

  const { writeFileSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  writeFileSync(join(homedir(), ".openui", "state.json"), JSON.stringify(state, null, 2));

  return c.json({ success: true });
});

apiRoutes.post("/sessions", async (c) => {
  const { agentId, agentName, command, cwd, nodeId, customName, customColor } = await c.req.json();
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const workingDir = cwd || LAUNCH_CWD;

  createSession({
    sessionId,
    agentId,
    agentName,
    command,
    cwd: workingDir,
    nodeId,
    customName,
    customColor,
  });

  saveState(sessions);
  return c.json({ sessionId, nodeId });
});

apiRoutes.post("/sessions/:sessionId/restart", async (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: "Session not found" }, 404);
  if (session.pty) return c.json({ error: "Session already running" }, 400);

  const { spawn } = await import("bun-pty");
  const ptyProcess = spawn("/bin/bash", [], {
    name: "xterm-256color",
    cwd: session.cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    rows: 30,
    cols: 120,
  });

  session.pty = ptyProcess;
  session.isRestored = false;
  session.status = "starting";
  session.lastOutputTime = Date.now();

  const resetInterval = setInterval(() => {
    if (!sessions.has(sessionId) || !session.pty) {
      clearInterval(resetInterval);
      return;
    }
    session.recentOutputSize = Math.max(0, session.recentOutputSize - 50);
  }, 500);

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
  });

  setTimeout(() => {
    ptyProcess.write(`${session.command}\r`);
  }, 300);

  console.log(`\x1b[38;5;141m[session]\x1b[0m Restarted ${sessionId}`);
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
