import { create } from "zustand";
import { Node } from "@xyflow/react";

export interface Canvas {
  id: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
  isDefault?: boolean;
}

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export type AgentStatus = "running" | "waiting_input" | "waiting" | "compacting" | "tool_calling" | "idle" | "disconnected" | "error" | "creating";

export interface AgentSession {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  command: string;
  color: string;
  createdAt: string;
  cwd: string;
  originalCwd?: string; // Mother repo path when using worktrees
  gitBranch?: string;
  status: AgentStatus;
  customName?: string;
  customColor?: string;
  notes?: string;
  isRestored?: boolean;
  // Ticket/Issue info (for GitHub integration)
  ticketId?: string;
  ticketTitle?: string;
  // Current tool being used (from plugin)
  currentTool?: string;
  // Whether the current tool has been running for a long time (> 5 min)
  longRunningTool?: boolean;
  // Token usage from cost cache
  tokens?: number;
  // Cumulative tokens across all sessions (shown when history exists)
  totalTokens?: number;
  // Current context window size (from last assistant message usage)
  contextTokens?: number;
  // Model name (from plugin hook, e.g. "claude-sonnet-4-6")
  model?: string;
  // Sleep timer: epoch ms when sleep ends
  sleepEndTime?: number;
  // Archive status
  archived?: boolean;
  // Remote connection fields
  remote?: string;
  creationProgress?: string;
  sshError?: string;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
  // List view organization
  categoryId?: string;
  sortOrder?: number;
  dueDate?: string;
}

export interface ListSection {
  id: string;
  label: string;
  color: string;
  collapsed?: boolean;
  group?: "sprint" | "oncall";
}

interface AppState {
  // Config
  launchCwd: string;
  setLaunchCwd: (cwd: string) => void;
  isRemote: boolean;
  setIsRemote: (isRemote: boolean) => void;

  // UI Mode
  uiMode: "canvas" | "list" | "focus";
  setUiMode: (mode: "canvas" | "list" | "focus") => void;

  // Focus view
  focusSessions: string[];
  setFocusSessions: (nodeIds: string[]) => void;
  addFocusSession: (nodeId: string) => void;
  removeFocusSession: (nodeId: string) => void;

  // List sections
  listSections: ListSection[];
  setListSections: (sections: ListSection[]) => void;
  addListSection: (section: ListSection) => void;
  updateListSection: (id: string, updates: Partial<ListSection>) => void;
  removeListSection: (id: string) => void;

  // Agents
  agents: Agent[];
  setAgents: (agents: Agent[]) => void;

  // Sessions / Nodes
  sessions: Map<string, AgentSession>;
  addSession: (nodeId: string, session: AgentSession) => void;
  updateSession: (nodeId: string, updates: Partial<AgentSession>) => void;
  removeSession: (nodeId: string) => void;

  // Canvas
  nodes: Node[];
  setNodes: (nodes: Node[]) => void;
  addNode: (node: Node) => void;
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  removeNode: (nodeId: string) => void;

  // Canvas/Tab Management
  canvases: Canvas[];
  activeCanvasId: string | null;
  setCanvases: (canvases: Canvas[]) => void;
  setActiveCanvasId: (id: string) => void;
  addCanvas: (canvas: Canvas) => void;
  updateCanvas: (id: string, updates: Partial<Canvas>) => void;
  removeCanvas: (id: string) => void;
  reorderCanvases: (canvasIds: string[]) => void;
  getNodesForCanvas: (canvasId: string) => Node[];
  moveNodeToCanvas: (nodeId: string, canvasId: string) => void;

  // UI State
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  addAgentModalOpen: boolean;
  setAddAgentModalOpen: (open: boolean) => void;
  newSessionModalOpen: boolean;
  setNewSessionModalOpen: (open: boolean) => void;
  newSessionForNodeId: string | null;
  setNewSessionForNodeId: (nodeId: string | null) => void;
  worktreeModalOpen: boolean;
  setWorktreeModalOpen: (open: boolean) => void;

  // Website node creation
  addWebsiteModalOpen: boolean;
  setAddWebsiteModalOpen: (open: boolean) => void;
  pendingWebsitePosition: { x: number; y: number } | null;
  setPendingWebsitePosition: (pos: { x: number; y: number } | null) => void;

  // Canvas context menu
  canvasContextMenu: { x: number; y: number } | null;
  setCanvasContextMenu: (pos: { x: number; y: number } | null) => void;

  // Archive functionality
  showArchived: boolean;
  setShowArchived: (show: boolean) => void;
  archiveSession: (nodeId: string) => Promise<void>;
  unarchiveSession: (nodeId: string) => Promise<void>;
  loadState: () => Promise<void>;

  // Auto-resume progress
  autoResumeProgress: { total: number; completed: number; current: string | null; isActive: boolean } | null;
  setAutoResumeProgress: (progress: { total: number; completed: number; current: string | null; isActive: boolean } | null) => void;

  // Auth state (OAuth detection from session start queue)
  authRequired: boolean;
  authUrl: string | null;
  setAuthRequired: (url: string) => void;
  clearAuthRequired: () => void;

  // Pending resume conversation (from search modal → new session modal bridge)
  pendingResumeConversation: any | null;
  setPendingResumeConversation: (conv: any | null) => void;

  // Server connection status
  connected: boolean;
  setConnected: (connected: boolean) => void;

  // Sidebar width (shared between Sidebar and App for canvas margin)
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;

  // Theme
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;

  // Notifications (default off)
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;

  // Show token counts on agent cards (default off to keep cards compact)
  showTokensOnCard: boolean;
  setShowTokensOnCard: (enabled: boolean) => void;

  // Show context progress bar (default on). When off, shows raw token count instead.
  showContextBar: boolean;
  setShowContextBar: (enabled: boolean) => void;

  // Colorblind-friendly status colors (default off)
  colorblindMode: boolean;
  setColorblindMode: (enabled: boolean) => void;

  // Shell tabs per node (keyed by nodeId)
  shellTabs: Map<string, { id: string; shellId: string }[]>;
  setShellTabs: (nodeId: string, tabs: { id: string; shellId: string }[]) => void;
  deleteShellTabs: (nodeId: string) => void;

  // Toast notifications (React-managed)
  toasts: Array<{ id: string; message: string; nodeId: string }>;
  addToast: (toast: { id: string; message: string; nodeId: string }) => void;
  removeToast: (id: string) => void;

  // Image upload toasts
  imageToasts: Array<{ id: string; filePath: string; sessionId: string }>;
  addImageToast: (toast: { id: string; filePath: string; sessionId: string }) => void;
  removeImageToast: (id: string) => void;

  // Orchestrator
  orchestratorSessionId: string | null;
  orchestratorOpen: boolean;
  setOrchestratorSessionId: (id: string | null) => void;
  setOrchestratorOpen: (open: boolean) => void;
}

const DEFAULT_LIST_SECTIONS: ListSection[] = [
  { id: "pinned", label: "Pinned", color: "#F97316", group: "sprint" },
  { id: "todo", label: "TODO", color: "#22C55E", group: "sprint" },
  { id: "in-progress", label: "In Progress", color: "#3B82F6", group: "sprint" },
  { id: "in-review", label: "In Review", color: "#8B5CF6", group: "sprint" },
  { id: "on-hold", label: "On Hold", color: "#FBBF24", group: "sprint" },
  { id: "oncall-todo", label: "TODO", color: "#06B6D4", group: "oncall" },
  { id: "oncall-in-progress", label: "In Progress", color: "#14B8A6", group: "oncall" },
  { id: "oncall-in-review", label: "In Review", color: "#22D3EE", group: "oncall" },
  { id: "oncall-waiting", label: "Waiting", color: "#67E8F9", group: "oncall" },
];

function loadListSections(): ListSection[] {
  try {
    const saved = localStorage.getItem("openui-list-sections");
    if (saved) {
      const sections: ListSection[] = JSON.parse(saved);
      // Merge in any new default sections that don't exist yet
      const existingIds = new Set(sections.map((s) => s.id));
      for (const def of DEFAULT_LIST_SECTIONS) {
        if (!existingIds.has(def.id)) {
          // Insert at the same position as in defaults
          const defIndex = DEFAULT_LIST_SECTIONS.indexOf(def);
          sections.splice(defIndex, 0, def);
        }
      }
      return sections;
    }
  } catch {}
  return DEFAULT_LIST_SECTIONS;
}

function saveListSections(sections: ListSection[]) {
  localStorage.setItem("openui-list-sections", JSON.stringify(sections));
}

export const useStore = create<AppState>((set) => ({
  // Config
  launchCwd: "",
  setLaunchCwd: (cwd) => set({ launchCwd: cwd }),
  isRemote: false,
  setIsRemote: (isRemote) => set({ isRemote }),

  // UI Mode
  uiMode: (localStorage.getItem("openui-ui-mode") as "canvas" | "list" | "focus") || "list",
  setUiMode: (mode) => {
    localStorage.setItem("openui-ui-mode", mode);
    set({ uiMode: mode });
  },

  // Focus view
  focusSessions: JSON.parse(localStorage.getItem("openui-focus-sessions") || "[]"),
  setFocusSessions: (nodeIds) => {
    localStorage.setItem("openui-focus-sessions", JSON.stringify(nodeIds));
    set({ focusSessions: nodeIds });
  },
  addFocusSession: (nodeId) =>
    set((state) => {
      if (state.focusSessions.includes(nodeId)) return state;
      const next = [...state.focusSessions, nodeId];
      localStorage.setItem("openui-focus-sessions", JSON.stringify(next));
      return { focusSessions: next };
    }),
  removeFocusSession: (nodeId) =>
    set((state) => {
      const next = state.focusSessions.filter((id) => id !== nodeId);
      localStorage.setItem("openui-focus-sessions", JSON.stringify(next));
      return { focusSessions: next };
    }),

  // List sections
  listSections: loadListSections(),
  setListSections: (sections) => {
    saveListSections(sections);
    set({ listSections: sections });
  },
  addListSection: (section) =>
    set((state) => {
      const sections = [...state.listSections, section];
      saveListSections(sections);
      return { listSections: sections };
    }),
  updateListSection: (id, updates) =>
    set((state) => {
      const sections = state.listSections.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      );
      saveListSections(sections);
      return { listSections: sections };
    }),
  removeListSection: (id) =>
    set((state) => {
      const sections = state.listSections.filter((s) => s.id !== id);
      saveListSections(sections);
      return { listSections: sections };
    }),

  // Agents
  agents: [],
  setAgents: (agents) => set({ agents }),

  // Sessions
  sessions: new Map(),
  addSession: (nodeId, session) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.set(nodeId, session);
      return { sessions: newSessions };
    }),
  updateSession: (nodeId, updates) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      const session = newSessions.get(nodeId);
      if (session) {
        newSessions.set(nodeId, { ...session, ...updates });
      }
      return { sessions: newSessions };
    }),
  removeSession: (nodeId) =>
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(nodeId);
      return { sessions: newSessions };
    }),

  // Canvas
  nodes: [],
  setNodes: (nodes) => set({ nodes }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNode: (nodeId, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      ),
    })),
  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
    })),

  // Canvas/Tab Management
  canvases: [],
  activeCanvasId: null,

  setCanvases: (canvases) => set({ canvases }),

  setActiveCanvasId: (id) => {
    set({ activeCanvasId: id });
    localStorage.setItem("openui-active-canvas", id);
  },

  addCanvas: (canvas) => {
    set((state) => ({ canvases: [...state.canvases, canvas] }));
  },

  updateCanvas: (id, updates) => {
    set((state) => ({
      canvases: state.canvases.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },

  removeCanvas: (id) => {
    set((state) => {
      const remaining = state.canvases.filter((c) => c.id !== id);
      return {
        canvases: remaining,
        activeCanvasId:
          state.activeCanvasId === id
            ? remaining[0]?.id
            : state.activeCanvasId,
      };
    });
  },

  reorderCanvases: (canvasIds) => {
    set((state) => ({
      canvases: canvasIds
        .map((id) => state.canvases.find((c) => c.id === id))
        .filter(Boolean) as Canvas[],
    }));
  },

  getNodesForCanvas: (canvasId: string): Node[] => {
    const state = useStore.getState();
    return state.nodes.filter((n: any) => n.data?.canvasId === canvasId);
  },

  moveNodeToCanvas: (nodeId, canvasId) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, canvasId } } : n
      ),
    }));
  },

  // UI State
  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  addAgentModalOpen: false,
  setAddAgentModalOpen: (open) => set({ addAgentModalOpen: open }),
  newSessionModalOpen: false,
  setNewSessionModalOpen: (open) => set({ newSessionModalOpen: open }),
  newSessionForNodeId: null,
  setNewSessionForNodeId: (nodeId) => set({ newSessionForNodeId: nodeId }),
  worktreeModalOpen: false,
  setWorktreeModalOpen: (open) => set({ worktreeModalOpen: open }),

  // Website node creation
  addWebsiteModalOpen: false,
  setAddWebsiteModalOpen: (open) => set({ addWebsiteModalOpen: open }),
  pendingWebsitePosition: null,
  setPendingWebsitePosition: (pos) => set({ pendingWebsitePosition: pos }),

  // Canvas context menu
  canvasContextMenu: null,
  setCanvasContextMenu: (pos) => set({ canvasContextMenu: pos }),

  // Archive functionality
  showArchived: false,
  setShowArchived: (show) => set({ showArchived: show }),

  archiveSession: async (nodeId) => {
    const state = useStore.getState();
    const session = state.sessions.get(nodeId);
    if (!session) return;

    const res = await fetch(`/api/sessions/${session.sessionId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });

    if (!res.ok) {
      console.error("Failed to archive session: server returned", res.status);
      return;
    }

    // Remove from canvas
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      sessions: new Map(
        Array.from(state.sessions.entries()).map(([id, s]) =>
          id === nodeId ? [id, { ...s, archived: true }] : [id, s]
        )
      ),
    }));
  },

  unarchiveSession: async (nodeId) => {
    const state = useStore.getState();
    // Archived sessions are not in the sessions Map — look up sessionId from nodes
    const session = state.sessions.get(nodeId);
    const node = state.nodes.find(n => n.id === nodeId);
    const sessionId = session?.sessionId ?? (node?.data as any)?.sessionId;
    if (!sessionId) {
      console.error("Failed to unarchive: no sessionId found for node", nodeId);
      return;
    }

    const res = await fetch(`/api/sessions/${sessionId}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });

    if (!res.ok) {
      console.error("Failed to unarchive session: server returned", res.status);
      return;
    }

    window.location.reload();
  },

  // Auto-resume progress
  autoResumeProgress: null,
  setAutoResumeProgress: (progress) => set({ autoResumeProgress: progress }),

  // Auth state
  authRequired: false,
  authUrl: null,
  setAuthRequired: (url) => set({ authRequired: true, authUrl: url }),
  clearAuthRequired: () => set({ authRequired: false, authUrl: null }),

  pendingResumeConversation: null,
  setPendingResumeConversation: (conv) => set({ pendingResumeConversation: conv }),

  connected: true,
  setConnected: (connected) => set({ connected }),

  sidebarWidth: parseFloat(localStorage.getItem("openui-sidebar-pct") || "30"),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  theme: (localStorage.getItem("openui-theme") as "dark" | "light") || "dark",
  setTheme: (theme) => {
    localStorage.setItem("openui-theme", theme);
    document.documentElement.setAttribute("data-theme", theme);
    set({ theme });
  },
  toggleTheme: () => {
    const current = useStore.getState().theme;
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("openui-theme", next);
    document.documentElement.setAttribute("data-theme", next);
    set({ theme: next });
  },
  notificationsEnabled: localStorage.getItem("openui-notifications") === "true",
  setNotificationsEnabled: (enabled) => {
    localStorage.setItem("openui-notifications", String(enabled));
    set({ notificationsEnabled: enabled });
  },

  showTokensOnCard: localStorage.getItem("openui-show-tokens-on-card") === "true",
  setShowTokensOnCard: (enabled) => {
    localStorage.setItem("openui-show-tokens-on-card", String(enabled));
    set({ showTokensOnCard: enabled });
  },

  showContextBar: localStorage.getItem("openui-show-context-bar") !== "false",
  setShowContextBar: (enabled) => {
    localStorage.setItem("openui-show-context-bar", String(enabled));
    set({ showContextBar: enabled });
  },

  colorblindMode: localStorage.getItem("openui-colorblind-mode") === "true",
  setColorblindMode: (enabled) => {
    localStorage.setItem("openui-colorblind-mode", String(enabled));
    set({ colorblindMode: enabled });
  },

  // Shell tabs per node
  shellTabs: new Map(),
  setShellTabs: (nodeId, tabs) =>
    set((state) => {
      const next = new Map(state.shellTabs);
      next.set(nodeId, tabs);
      return { shellTabs: next };
    }),
  deleteShellTabs: (nodeId) =>
    set((state) => {
      const next = new Map(state.shellTabs);
      next.delete(nodeId);
      return { shellTabs: next };
    }),

  // Toast notifications
  toasts: [],
  addToast: (toast) => set((state) => ({ toasts: [...state.toasts, toast] })),
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  // Image upload toasts
  imageToasts: [],
  addImageToast: (toast) => set((state) => ({ imageToasts: [...state.imageToasts, toast] })),
  removeImageToast: (id) => set((state) => ({ imageToasts: state.imageToasts.filter((t) => t.id !== id) })),

  loadState: async () => {
    const showArchived = useStore.getState().showArchived;
    const response = await fetch(`/api/state?archived=${showArchived}`);
    await response.json();
    // This would need to update nodes based on the loaded state
    // Implementation depends on how the app currently loads state
    // For now, a page reload might be needed to see unarchived sessions
  },

  // Orchestrator
  orchestratorSessionId: localStorage.getItem("openui-orchestrator-session"),
  orchestratorOpen: false,
  setOrchestratorSessionId: (id) => {
    if (id) {
      localStorage.setItem("openui-orchestrator-session", id);
    } else {
      localStorage.removeItem("openui-orchestrator-session");
    }
    set({ orchestratorSessionId: id });
  },
  setOrchestratorOpen: (open) => set({ orchestratorOpen: open }),
}));
