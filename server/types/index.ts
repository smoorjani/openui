import type { IPty } from "bun-pty";
import type { ServerWebSocket } from "bun";
import type { Canvas } from "./canvas";

export type AgentStatus = "running" | "waiting_input" | "waiting" | "compacting" | "tool_calling" | "idle" | "disconnected" | "error" | "creating";

export interface Session {
  pty: IPty | null;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  originalCwd?: string; // CWD when session was first created — used for --resume (never changes); also mother repo path when using worktrees
  gitBranch?: string;
  worktreePath?: string;
  createdAt: string;
  clients: Set<ServerWebSocket<WebSocketData>>;
  outputBuffer: string[];
  outputSeq: number; // monotonically increasing sequence number for output chunks
  status: AgentStatus;
  lastOutputTime: number;
  lastInputTime: number;
  recentOutputSize: number;
  customName?: string;
  customColor?: string;
  icon?: string;
  notes?: string;
  nodeId: string;
  isRestored?: boolean;
  autoResumed?: boolean; // True if session was auto-resumed on startup
  position?: { x: number; y: number };
  // Ticket/Issue info (for GitHub integration)
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  // Plugin-reported status
  pluginReportedStatus?: boolean;
  lastPluginStatusTime?: number;
  // Claude Code's internal session ID (different from our sessionId)
  claudeSessionId?: string;
  // History of previous Claude session IDs (accumulated across /clear operations)
  claudeSessionHistory?: string[];
  // Current tool being used (from plugin)
  currentTool?: string;
  // Last hook event received
  lastHookEvent?: string;
  // Permission detection
  preToolTime?: number;
  permissionTimeout?: ReturnType<typeof setTimeout>;
  needsInputSince?: number; // Timestamp when waiting_input was set (for subagent override protection)
  // Token usage from cost cache
  tokens?: number;
  // Model name (from plugin hook)
  model?: string;
  // Sleep timer: epoch ms when sleep ends (for countdown display)
  sleepEndTime?: number;
  sleepDuration?: number; // seconds, for recalculating sleepEndTime after permission approval
  // Compaction timeout: reverts to idle if no events arrive after compaction
  compactingTimeout?: ReturnType<typeof setTimeout>;
  // Long-running tool detection (server-side)
  longRunningTool?: boolean;
  longRunningTimeout?: ReturnType<typeof setTimeout>;
  // Archive status
  archived?: boolean;
  // Canvas/tab organization
  canvasId?: string;
  // Runtime-only: throttle git branch checks
  _lastBranchCheck?: number;
  // Worktree creation progress message
  creationProgress?: string;
  // Initial prompt to send after agent starts
  initialPrompt?: string;
  // Remote execution (e.g. "arca" for SSH-based sessions)
  remote?: string;
  // Auto-reconnect tracking for remote sessions
  reconnectAttempts?: number;
  // Agent teams mode
  useTeam?: boolean;
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
  originalCwd?: string; // CWD when session was first created — used for --resume (never changes); also mother repo path when using worktrees
  worktreePath?: string; // Full path to worktree for cleanup
  createdAt: string;
  customName?: string;
  customColor?: string;
  notes?: string;
  icon?: string;
  position: { x: number; y: number };
  claudeSessionId?: string;  // Claude Code's internal session ID for --resume
  claudeSessionHistory?: string[];  // Previous Claude session IDs (across /clear operations)
  archived?: boolean;
  autoResumed?: boolean;  // True if session was auto-resumed on startup
  canvasId?: string;  // Canvas/tab this agent belongs to
  gitBranch?: string;
  // Ticket/Issue info
  ticketId?: string;
  ticketTitle?: string;
  ticketUrl?: string;
  model?: string;
  // Local-only fields
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

export interface PersistedWebsiteNode {
  nodeId: string;
  url: string;
  title?: string;
  favicon?: string;
  description?: string;
  position: { x: number; y: number };
  canvasId: string;
  createdAt: string;
}

export interface PersistedState {
  nodes: PersistedNode[];
  websiteNodes?: PersistedWebsiteNode[];
  canvases?: Canvas[];  // Tab-based workspaces
  categories?: PersistedCategory[];  // Deprecated: kept for migration from folder system
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
  lastSeq: number;
  isShell?: boolean;
  isUi?: boolean;
  cwd?: string;
  remote?: string; // Remote host for SSH-based shell terminals
}
