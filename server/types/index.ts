import type { IPty } from "bun-pty";
import type { ServerWebSocket } from "bun";

export type AgentStatus = "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error" | "creating";

export interface Session {
  pty: IPty | null;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  originalCwd?: string; // The mother repo path when using worktrees
  gitBranch?: string;
  worktreePath?: string;
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
  position?: { x: number; y: number };
  // Plugin-reported status
  pluginReportedStatus?: boolean;
  lastPluginStatusTime?: number;
  // Claude Code's internal session ID (different from our sessionId)
  claudeSessionId?: string;
  // Current tool being used (from plugin)
  currentTool?: string;
  // Last hook event received
  lastHookEvent?: string;
  // Worktree creation progress message
  creationProgress?: string;
  // Initial prompt to send after agent starts
  initialPrompt?: string;
  // Remote execution (e.g. "arca" for SSH-based sessions)
  remote?: string;
  // Auto-reconnect tracking for remote sessions
  reconnectAttempts?: number;
  // List view fields
  categoryId?: string;
  sortOrder?: number;
  dueDate?: string;
}

export interface WorktreeRepo {
  name: string;
  path: string;
  baseBranch: string;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  remote?: string; // e.g. "arca" - creates worktree on remote machine via SSH
}

export interface WorktreeConfig {
  worktreeRepos: WorktreeRepo[];
}

export interface PersistedNode {
  nodeId: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  originalCwd?: string;  // Mother repo path when using worktrees
  worktreePath?: string; // Full path to worktree for cleanup
  createdAt: string;
  customName?: string;
  customColor?: string;
  notes?: string;
  position: { x: number; y: number };
  claudeSessionId?: string;  // Claude Code's internal session ID for --resume
  remote?: string; // Remote host for SSH-based sessions
  initialPrompt?: string; // Initial prompt to send after agent starts
  categoryId?: string;
  sortOrder?: number;
  dueDate?: string;
}

export interface PersistedCategory {
  id: string;
  label: string;
  color: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}

export interface PersistedState {
  nodes: PersistedNode[];
  categories?: PersistedCategory[];
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
  isShell?: boolean;
  cwd?: string;
  remote?: string; // Remote host for SSH-based shell terminals
}
