import type { IPty } from "bun-pty";
import type { ServerWebSocket } from "bun";

export type AgentStatus = "starting" | "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error";

export interface Session {
  pty: IPty | null;
  stateTrackerPty: IPty | null;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  createdAt: string;
  clients: Set<ServerWebSocket<WebSocketData>>;
  outputBuffer: string[];
  status: AgentStatus;
  lastOutputTime: number;
  lastInputTime: number;
  recentOutputSize: number;
  customName?: string;
  customColor?: string;
  notes?: string;
  nodeId: string;
  isRestored?: boolean;
  currentTool?: string;
  lastJsonEvent?: any;
}

export interface PersistedNode {
  nodeId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  createdAt: string;
  customName?: string;
  customColor?: string;
  notes?: string;
  position: { x: number; y: number };
}

export interface PersistedState {
  nodes: PersistedNode[];
}

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export interface WebSocketData {
  sessionId: string;
}
