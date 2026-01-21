import { spawn } from "bun-pty";
import type { Session } from "../types";
import { loadBuffer, saveBuffer } from "./persistence";
import { createStateTracker } from "./stateTracker";
import { detectStatus } from "./statusDetector";

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
}) {
  const { sessionId, agentId, agentName, command, cwd, nodeId, customName, customColor } = params;

  const ptyProcess = spawn("/bin/bash", [], {
    name: "xterm-256color",
    cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    rows: 30,
    cols: 120,
  });

  const now = Date.now();
  const session: Session = {
    pty: ptyProcess,
    stateTrackerPty: null,
    agentId,
    agentName,
    command,
    cwd,
    createdAt: new Date().toISOString(),
    clients: new Set(),
    outputBuffer: [],
    status: "starting",
    lastOutputTime: now,
    lastInputTime: 0,
    recentOutputSize: 0,
    customName,
    customColor,
    nodeId,
    isRestored: false,
  };

  sessions.set(sessionId, session);

  // Create state tracker
  session.stateTrackerPty = createStateTracker(session, sessionId, command, cwd);

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

    const newStatus = detectStatus(session);
    const statusChanged = newStatus !== session.status;
    session.status = newStatus;

    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "output", data }));

        if (statusChanged) {
          client.send(JSON.stringify({
            type: "status",
            status: session.status,
            isRestored: session.isRestored
          }));
        }
      }
    }
  });

  // Run the command
  setTimeout(() => {
    ptyProcess.write(`${command}\r`);
  }, 300);

  console.log(`\x1b[38;5;141m[session]\x1b[0m Created ${sessionId} for ${agentName}`);
  return session;
}

export function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return false;

  if (session.pty) session.pty.kill();
  if (session.stateTrackerPty) session.stateTrackerPty.kill();

  sessions.delete(sessionId);
  console.log(`\x1b[38;5;141m[session]\x1b[0m Killed ${sessionId}`);
  return true;
}

export function restoreSessions() {
  const { loadState } = require("./persistence");
  const state = loadState();

  console.log(`\x1b[38;5;245m[restore]\x1b[0m Found ${state.nodes.length} saved sessions`);

  for (const node of state.nodes) {
    const buffer = loadBuffer(node.sessionId);

    const session: Session = {
      pty: null,
      stateTrackerPty: null,
      agentId: node.agentId,
      agentName: node.agentName,
      command: node.command,
      cwd: node.cwd,
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
    };

    sessions.set(node.sessionId, session);
    console.log(`\x1b[38;5;245m[restore]\x1b[0m Restored ${node.sessionId} (${node.agentName})`);
  }
}
