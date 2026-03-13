import { create } from "zustand";
import { Node } from "@xyflow/react";

export interface Agent {
  id: string;
  name: string;
  command: string;
  description: string;
  color: string;
  icon: string;
}

export type AgentStatus = "running" | "waiting_input" | "tool_calling" | "idle" | "disconnected" | "error" | "creating";

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
  currentTool?: string;
  remote?: string;
  creationProgress?: string;
  sshError?: string;
  reconnectAttempt?: number;
  maxReconnectAttempts?: number;
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

  // UI Mode
  uiMode: "canvas" | "list";
  setUiMode: (mode: "canvas" | "list") => void;

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

  // UI Mode
  uiMode: (localStorage.getItem("openui-ui-mode") as "canvas" | "list") || "list",
  setUiMode: (mode) => {
    localStorage.setItem("openui-ui-mode", mode);
    set({ uiMode: mode });
  },

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
}));
