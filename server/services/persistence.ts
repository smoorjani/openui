import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { PersistedState, Session } from "../types";

const DATA_DIR = join(homedir(), ".openui");
const STATE_FILE = join(DATA_DIR, "state.json");
const BUFFERS_DIR = join(DATA_DIR, "buffers");

// Ensure directories exist
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(BUFFERS_DIR)) mkdirSync(BUFFERS_DIR, { recursive: true });

export function loadState(): PersistedState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  return { nodes: [] };
}

export function saveState(sessions: Map<string, Session>) {
  const savedState = loadState();
  const state: PersistedState = { nodes: [] };

  for (const [sessionId, session] of sessions) {
    const existingNode = savedState.nodes.find(n => n.sessionId === sessionId);

    state.nodes.push({
      nodeId: session.nodeId,
      sessionId,
      agentId: session.agentId,
      agentName: session.agentName,
      command: session.command,
      cwd: session.cwd,
      createdAt: session.createdAt,
      customName: session.customName,
      customColor: session.customColor,
      notes: session.notes,
      position: existingNode?.position || { x: 0, y: 0 },
    });

    saveBuffer(sessionId, session.outputBuffer);
  }

  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

export function saveBuffer(sessionId: string, buffer: string[]) {
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    writeFileSync(bufferFile, buffer.join(""));
  } catch (e) {
    console.error("Failed to save buffer:", e);
  }
}

export function loadBuffer(sessionId: string): string[] {
  const bufferFile = join(BUFFERS_DIR, `${sessionId}.txt`);
  try {
    if (existsSync(bufferFile)) {
      return [readFileSync(bufferFile, "utf-8")];
    }
  } catch (e) {
    console.error("Failed to load buffer:", e);
  }
  return [];
}
