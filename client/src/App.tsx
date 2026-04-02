import { useEffect, useCallback, useRef, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  BackgroundVariant,
  ReactFlowProvider,
  NodeChange,
  applyNodeChanges,
  useReactFlow,
  Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";

import { useStore } from "./stores/useStore";
import { TerminalPoolProvider } from "./contexts/TerminalPoolContext";
import { AgentNode } from "./components/AgentNode/index";
import { CategoryNode } from "./components/CategoryNode";
import { Sidebar } from "./components/Sidebar";
import { NewSessionModal } from "./components/NewSessionModal";
import { Header } from "./components/Header";
import { CanvasControls } from "./components/CanvasControls";
import { CanvasTabs } from "./components/CanvasTabs";
import { AuthBanner } from "./components/AuthBanner";
import { WebsiteNode } from "./components/WebsiteNode/index";
import { CanvasContextMenu } from "./components/CanvasContextMenu";
import { AddWebsiteModal } from "./components/AddWebsiteModal";
import { useWebsiteNodes } from "./hooks/useWebsiteNodes";
import { ListView } from "./components/ListView/ListView";
import { OrchestratorPanel } from "./components/OrchestratorPanel";

const nodeTypes = {
  agent: AgentNode,
  category: CategoryNode,
  website: WebsiteNode,
};

const PRESET_CATEGORIES = [
  { label: "TODO", color: "#22C55E", position: { x: 50, y: 80 } },
  { label: "In Progress", color: "#3B82F6", position: { x: 370, y: 80 } },
  { label: "In Review", color: "#8B5CF6", position: { x: 690, y: 80 } },
  { label: "On Hold", color: "#FBBF24", position: { x: 1010, y: 80 } },
];
const PRESET_CAT_WIDTH = 280;
const PRESET_CAT_HEIGHT = 400;

function findFreePosition(
  targetX: number,
  targetY: number,
  existingNodes: { position?: { x: number; y: number } }[],
): { x: number; y: number } {
  const W = 200, H = 120, S = 24;
  const valid = existingNodes.filter(
    (n): n is { position: { x: number; y: number } } =>
      !!n.position && typeof n.position.x === "number",
  );
  for (let r = 0; r <= 20; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = targetX + dx * (W + S);
        const y = targetY + dy * (H + S);
        if (!valid.some((n) => Math.abs(x - n.position.x) < W + S && Math.abs(y - n.position.y) < H + S))
          return { x, y };
      }
    }
  }
  return { x: targetX, y: targetY };
}

function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Start fade-out 500ms before removal (at 4000ms, removal at 4500ms)
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const toast of toasts) {
      if (!fadingOut.has(toast.id)) {
        const timer = setTimeout(() => {
          setFadingOut((prev) => new Set(prev).add(toast.id));
        }, 4000);
        timers.push(timer);
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [toasts, fadingOut]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => {
            useStore.getState().setSelectedNodeId(toast.nodeId);
            useStore.getState().setSidebarOpen(true);
            useStore.getState().removeToast(toast.id);
          }}
          className={`px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium shadow-lg cursor-pointer transition-opacity duration-500 ${
            fadingOut.has(toast.id) ? "opacity-0" : "opacity-100"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>,
    document.body
  );
}

function ImageToastContainer() {
  const imageToasts = useStore((s) => s.imageToasts);
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const toast of imageToasts) {
      if (!fadingOut.has(toast.id)) {
        const timer = setTimeout(() => {
          setFadingOut((prev) => new Set(prev).add(toast.id));
        }, 14500);
        timers.push(timer);
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [imageToasts, fadingOut]);

  if (imageToasts.length === 0) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[99999] flex flex-col gap-2">
      {imageToasts.map((toast) => {
        const filename = toast.filePath.split("/").pop() || "image";
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white text-sm shadow-lg transition-opacity duration-500 ${
              fadingOut.has(toast.id) ? "opacity-0" : "opacity-100"
            }`}
          >
            <span className="text-zinc-300 truncate max-w-[200px]" title={toast.filePath}>
              {filename}
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(toast.filePath);
                setCopied((prev) => new Set(prev).add(toast.id));
                setTimeout(() => setCopied((prev) => { const next = new Set(prev); next.delete(toast.id); return next; }), 2000);
              }}
              className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-xs font-medium whitespace-nowrap"
            >
              {copied.has(toast.id) ? "Copied!" : "Copy path"}
            </button>
            <button
              onClick={() => useStore.getState().removeImageToast(toast.id)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

function AppContent() {
  const {
    nodes: storeNodes,
    setNodes: setStoreNodes,
    setAgents,
    setLaunchCwd,
    setIsRemote,
    setSelectedNodeId,
    setSidebarOpen,
    selectedNodeId,
    sidebarOpen,
    addSession,
    addNode,
    updateSession,
    agents,
    addAgentModalOpen,
    setAddAgentModalOpen,
    newSessionModalOpen,
    setNewSessionModalOpen,
    newSessionForNodeId,
    setNewSessionForNodeId,
    sessions,
    showArchived,
    activeCanvasId,
    setCanvases,
    setActiveCanvasId,
    sidebarWidth,
    addWebsiteModalOpen,
    setAddWebsiteModalOpen,
    pendingWebsitePosition,
    setPendingWebsitePosition,
    canvasContextMenu,
    setCanvasContextMenu,
    theme,
    uiMode,
  } = useStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const reactFlowInstance = useReactFlow();
  const positionUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredRef = useRef(false);
  const canvasSelectionRef = useRef<Map<string, string>>(new Map());
  const canvasViewportRef = useRef<Map<string, Viewport>>(new Map());
  const prevCanvasIdRef = useRef<string | null>(null);
  const activeCanvasIdRef = useRef(activeCanvasId);
  activeCanvasIdRef.current = activeCanvasId;

  // Filter nodes to show only those belonging to the active canvas
  const activeCanvasNodes = useMemo(() => {
    if (!activeCanvasId) return nodes;
    return nodes.filter(n => n.data?.canvasId === activeCanvasId);
  }, [nodes, activeCanvasId]);

  // Cache and restore sidebar selection + viewport per canvas
  useEffect(() => {
    if (!activeCanvasId) return;
    const prevCanvasId = prevCanvasIdRef.current;
    prevCanvasIdRef.current = activeCanvasId;

    // Save state for the canvas we're leaving
    if (prevCanvasId && prevCanvasId !== activeCanvasId) {
      if (selectedNodeId) {
        canvasSelectionRef.current.set(prevCanvasId, selectedNodeId);
      }
      // Save viewport (pan/zoom) for the canvas we're leaving
      canvasViewportRef.current.set(prevCanvasId, reactFlowInstance.getViewport());
    }

    // Check if selected node belongs to the new canvas
    const selectedNode = selectedNodeId
      ? nodes.find(n => n.id === selectedNodeId)
      : null;
    const nodeOnTarget = selectedNode && (selectedNode.data as any)?.canvasId === activeCanvasId;

    if (!nodeOnTarget) {
      // Restore previous selection for this canvas
      const cachedNodeId = canvasSelectionRef.current.get(activeCanvasId);
      if (cachedNodeId && nodes.some(n => n.id === cachedNodeId)) {
        setSelectedNodeId(cachedNodeId);
        setSidebarOpen(true);
      } else {
        setSelectedNodeId(null);
        setSidebarOpen(false);
      }
    }

    // Restore viewport for the target canvas (after a tick so nodes are rendered)
    const savedViewport = canvasViewportRef.current.get(activeCanvasId);
    if (savedViewport) {
      requestAnimationFrame(() => {
        reactFlowInstance.setViewport(savedViewport, { duration: 0 });
      });
    } else if (prevCanvasId && prevCanvasId !== activeCanvasId) {
      // First time visiting this canvas - fit view to its nodes
      requestAnimationFrame(() => {
        reactFlowInstance.fitView({ padding: 0.2, duration: 200 });
      });
    }
  }, [activeCanvasId]);

  // Sync nodes with store
  useEffect(() => {
    setStoreNodes(nodes);
  }, [nodes, setStoreNodes]);

  useEffect(() => {
    if (storeNodes.length > 0 || hasRestoredRef.current) {
      setNodes(storeNodes);
    }
  }, [storeNodes, setNodes]);

  // Fetch config, agents, and restore state on mount
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((config) => {
        setLaunchCwd(config.launchCwd);
        if (config.isRemote) setIsRemote(config.isRemote);
      })
      .catch(console.error);

    fetch("/api/agents")
      .then((res) => res.json())
      .then((agents) => setAgents(agents))
      .catch(console.error);
  }, [setAgents, setLaunchCwd, setIsRemote]);

  // Load canvases on mount (with migration if needed)
  useEffect(() => {
    fetch("/api/canvases")
      .then(res => res.json())
      .then(canvases => {
        if (canvases.length === 0) {
          // Trigger migration from categories to canvases
          fetch("/api/migrate/canvases", { method: "POST" })
            .then(() => fetch("/api/canvases"))
            .then(res => res.json())
            .then(migratedCanvases => {
              setCanvases(migratedCanvases);
              const savedActiveId = localStorage.getItem("openui-active-canvas");
              // Validate that saved canvas ID exists, otherwise use first canvas
              const validCanvasId = savedActiveId && migratedCanvases.find((c: any) => c.id === savedActiveId)
                ? savedActiveId
                : migratedCanvases[0]?.id;
              setActiveCanvasId(validCanvasId);
            });
        } else {
          setCanvases(canvases);
          const savedActiveId = localStorage.getItem("openui-active-canvas");
          // Validate that saved canvas ID exists, otherwise use first canvas
          const validCanvasId = savedActiveId && canvases.find((c: any) => c.id === savedActiveId)
            ? savedActiveId
            : canvases[0]?.id;
          setActiveCanvasId(validCanvasId);
        }
      })
      .catch(console.error);
  }, [setCanvases, setActiveCanvasId]);

  // Keyboard shortcuts for switching between agents
  useEffect(() => {
    const getAgentNodeIds = () => {
      return activeCanvasNodes
        .filter((n) => n.type === "agent")
        .sort((a: any, b: any) => {
          // Sort top-to-bottom, left-to-right for consistent ordering
          if (Math.abs(a.position.y - b.position.y) < 50) {
            return a.position.x - b.position.x;
          }
          return a.position.y - b.position.y;
        })
        .map((n) => n.id);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInInput = () => {
        const target = e.target as HTMLElement;
        return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      };

      const isMod = e.metaKey || e.ctrlKey;
      const agentNodeIds = getAgentNodeIds();

      // Alt + 1-9 for agents on current canvas
      const digitMatch = e.altKey && !e.shiftKey && !isMod && e.code?.match(/^Digit(\d)$/);
      if (digitMatch) {
        if (agentNodeIds.length > 0) {
          e.preventDefault();
          const index = parseInt(digitMatch[1]) - 1;
          if (index >= 0 && index < agentNodeIds.length) {
            setSelectedNodeId(agentNodeIds[index]);
            setSidebarOpen(true);
          }
        }
        return;
      }

      // Alt + [ (prev) and ] (next) for agents
      if (e.altKey && (e.code === "BracketLeft" || e.code === "BracketRight") && !isMod && agentNodeIds.length > 0) {
        e.preventDefault();
        const currentIndex = selectedNodeId
          ? agentNodeIds.indexOf(selectedNodeId)
          : -1;
        const newIndex =
          e.code === "BracketLeft"
            ? currentIndex <= 0
              ? agentNodeIds.length - 1
              : currentIndex - 1
            : currentIndex >= agentNodeIds.length - 1
              ? 0
              : currentIndex + 1;
        setSelectedNodeId(agentNodeIds[newIndex]);
        setSidebarOpen(true);
        return;
      }

      // Cmd/Ctrl + I: Jump to next agent needing input
      if (isMod && e.key === "i" && !e.shiftKey && !e.altKey && !isInInput()) {
        e.preventDefault();
        const needsInputIds = agentNodeIds.filter((id) => {
          const s = useStore.getState().sessions.get(id);
          return s?.status === "waiting_input";
        });
        if (needsInputIds.length > 0) {
          // Rotate: find current index and go to next
          const currentIdx = selectedNodeId ? needsInputIds.indexOf(selectedNodeId) : -1;
          const nextIdx = currentIdx >= needsInputIds.length - 1 ? 0 : currentIdx + 1;
          setSelectedNodeId(needsInputIds[nextIdx]);
          setSidebarOpen(true);
        }
        return;
      }

      // Alt + N: New agent
      if (e.altKey && e.code === "KeyN" && !e.shiftKey && !isMod) {
        e.preventDefault();
        setAddAgentModalOpen(true);
        return;
      }

      // ? key: Open help panel
      if (e.key === "?" && !isMod && !isInInput()) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("openui:toggle-help"));
        return;
      }

      // Escape to close sidebar
      const hasOpenDialog = document.querySelector("[data-modal-overlay]");
      if (e.key === "Escape" && sidebarOpen && !isInInput() && !hasOpenDialog) {
        e.preventDefault();
        setSidebarOpen(false);
        setSelectedNodeId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCanvasNodes, selectedNodeId, sidebarOpen, setSelectedNodeId, setSidebarOpen]);

  // Keyboard shortcuts for canvas switching
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInInput = () => {
        const target = e.target as HTMLElement;
        return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      };

      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K: Open conversation search (works even from inputs)
      if (isMod && e.key === "k") {
        e.preventDefault();
        // Toggle the search modal via a custom event
        window.dispatchEvent(new CustomEvent("openui:toggle-search"));
        return;
      }

      // Skip if typing in input/textarea for remaining shortcuts
      if (isInInput()) {
        return;
      }

      // Get fresh state on each keypress to avoid stale closures
      const { canvases, addCanvas } = useStore.getState();

      // Alt + Shift + 1-9: Switch to canvas by index
      const shiftDigitMatch = e.altKey && e.shiftKey && !isMod && e.code?.match(/^Digit(\d)$/);
      if (shiftDigitMatch) {
        e.preventDefault();
        const index = parseInt(shiftDigitMatch[1]) - 1;
        if (index >= 0 && index < canvases.length) {
          setActiveCanvasId(canvases[index].id);
        }
        return;
      }

      // Alt + T: New canvas
      if (e.altKey && e.code === "KeyT" && !isMod && !e.shiftKey) {
        e.preventDefault();
        const newCanvas = {
          id: `canvas-${Date.now()}`,
          name: `Canvas ${canvases.length + 1}`,
          color: "#3B82F6",
          order: canvases.length,
          createdAt: new Date().toISOString(),
        };

        fetch("/api/canvases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newCanvas),
        }).then(() => {
          addCanvas(newCanvas);
          setActiveCanvasId(newCanvas.id);
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setActiveCanvasId]);

  // Notify when any agent transitions to waiting_input (only if enabled in settings)
  useEffect(() => {
    const prevStatuses = new Map<string, string>();
    // Seed with current statuses so we only notify on future transitions
    for (const [nodeId, session] of useStore.getState().sessions) {
      prevStatuses.set(nodeId, session.status);
    }
    const unsub = useStore.subscribe((state) => {
      if (!state.notificationsEnabled) return;
      for (const [nodeId, session] of state.sessions) {
        const prev = prevStatuses.get(nodeId);
        prevStatuses.set(nodeId, session.status);
        if (session.status === "waiting_input" && prev !== undefined && prev !== "waiting_input") {
          const name = session.customName || session.agentName || "Agent";
          // In-page toast notification (React-managed)
          const toastId = `toast-${Date.now()}`;
          useStore.getState().addToast({ id: toastId, message: `${name} needs input`, nodeId });
          setTimeout(() => useStore.getState().removeToast(toastId), 4500);
          // Native notification
          if ("Notification" in window && Notification.permission === "granted") {
            try { new Notification(`${name} needs input`, { body: "An agent is waiting for your input.", requireInteraction: true }); } catch {}
          }
        }
      }
    });
    return unsub;
  }, []);

  // Poll for status updates every second to catch any missed WebSocket messages
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) {
          useStore.getState().setConnected(true);
          const sessionsData = await res.json();
          const currentSessions = useStore.getState().sessions;
          for (const sessionData of sessionsData) {
            if (sessionData.nodeId && sessionData.status) {
              const existing = currentSessions.get(sessionData.nodeId);
              if (existing) {
                const updates: Record<string, any> = {};
                if (existing.status !== sessionData.status) {
                  updates.status = sessionData.status;
                }
                if ((existing.longRunningTool || false) !== (sessionData.longRunningTool || false)) {
                  updates.longRunningTool = sessionData.longRunningTool || false;
                }
                if (sessionData.tokens != null && existing.tokens !== sessionData.tokens) {
                  updates.tokens = sessionData.tokens;
                }
                if ((existing.totalTokens ?? null) !== (sessionData.totalTokens ?? null)) {
                  updates.totalTokens = sessionData.totalTokens ?? undefined;
                }
                if (sessionData.contextTokens != null && existing.contextTokens !== sessionData.contextTokens) {
                  updates.contextTokens = sessionData.contextTokens;
                }
                if (sessionData.model && existing.model !== sessionData.model) {
                  updates.model = sessionData.model;
                }
                if ((existing.sleepEndTime || undefined) !== (sessionData.sleepEndTime || undefined)) {
                  updates.sleepEndTime = sessionData.sleepEndTime;
                }
                if (sessionData.cwd && existing.cwd !== sessionData.cwd) {
                  updates.cwd = sessionData.cwd;
                }
                if (sessionData.gitBranch && existing.gitBranch !== sessionData.gitBranch) {
                  updates.gitBranch = sessionData.gitBranch;
                }
                if (Object.keys(updates).length > 0) {
                  updateSession(sessionData.nodeId, updates);
                }
              }
            }
          }
        } else {
          useStore.getState().setConnected(false);
        }
      } catch (e) {
        useStore.getState().setConnected(false);
      }
    };

    // Poll immediately and then every second
    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => clearInterval(interval);
  }, [updateSession]);

  // Poll auto-resume progress during startup
  useEffect(() => {
    const { setAutoResumeProgress } = useStore.getState();
    let stopped = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/auto-resume/progress");
        if (res.ok) {
          const progress = await res.json();
          setAutoResumeProgress(progress);
          // Stop polling once queue is inactive and we've seen at least one update
          if (!progress.isActive && progress.total > 0) {
            // Keep showing for 2s after completion then clear
            setTimeout(() => {
              if (!stopped) setAutoResumeProgress(null);
            }, 2000);
            return; // Don't schedule another poll
          }
          if (!progress.isActive && progress.total === 0) {
            setAutoResumeProgress(null);
            return; // No auto-resume happening
          }
        }
      } catch {
        // Ignore errors
      }
      if (!stopped) setTimeout(poll, 1500);
    };

    poll();
    return () => { stopped = true; };
  }, []);

  // Global UI WebSocket for server-pushed UI actions (e.g. select-node from CLI)
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/ui`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "ui-action" && msg.action === "select-node" && msg.nodeId) {
          setSelectedNodeId(msg.nodeId);
          setSidebarOpen(true);
        } else if (msg.type === "session-created" && msg.nodeId && msg.sessionId) {
          // A new session was created (e.g. via CLI or orchestrator) — add node if missing
          const state = useStore.getState();
          if (!state.sessions.has(msg.nodeId) && msg.nodeId !== "orchestrator") {
            const agent = state.agents.find((a: any) => a.id === msg.agentId);
            const existingNodes = state.nodes;
            // Place node at a free position
            const { x, y } = findFreePosition(400, 300, existingNodes);
            addNode({
              id: msg.nodeId,
              type: "agent",
              position: { x, y },
              data: {
                label: msg.agentName || agent?.name || "Agent",
                agentId: msg.agentId,
                color: msg.color || agent?.color || "#F97316",
                icon: agent?.icon || "sparkles",
                sessionId: msg.sessionId,
                canvasId: activeCanvasIdRef.current,
              },
            });
            addSession(msg.nodeId, {
              id: msg.nodeId,
              sessionId: msg.sessionId,
              agentId: msg.agentId,
              agentName: msg.agentName || agent?.name || "Agent",
              command: msg.command || "",
              color: msg.color || agent?.color || "#F97316",
              createdAt: new Date().toISOString(),
              cwd: msg.cwd || "",
              gitBranch: msg.gitBranch || undefined,
              status: "idle",
              remote: msg.remote || undefined,
            });
          }
        }
      } catch {}
    };
    ws.onclose = () => {
      // Reconnect after a delay
      setTimeout(() => {
        // Component will re-mount or we rely on polling
      }, 3000);
    };
    return () => ws.close();
  }, [setSelectedNodeId, setSidebarOpen, addNode, addSession]);

  // Restore sessions and categories after agents are loaded
  useEffect(() => {
    if (agents.length === 0 || hasRestoredRef.current) return;

    Promise.all([
      fetch("/api/sessions").then((res) => res.json()),
      fetch("/api/state").then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json()).catch(() => []),
    ])
      .then(async ([sessions, { nodes: savedNodes, websiteNodes: savedWebsiteNodes }, categories]) => {
        // Create preset categories if none exist
        if (categories.length === 0) {
          const created = [];
          for (const preset of PRESET_CATEGORIES) {
            const cat = {
              id: `category-${Date.now()}-${preset.label.toLowerCase().replace(/\s+/g, "-")}`,
              label: preset.label,
              color: preset.color,
              position: preset.position,
              width: PRESET_CAT_WIDTH,
              height: PRESET_CAT_HEIGHT,
            };
            await fetch("/api/categories", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(cat),
            });
            created.push(cat);
          }
          categories = created;
        }

        const restoredNodes: any[] = [];

        // Restore categories first (they should be behind agents)
        categories.forEach((cat: any) => {
          restoredNodes.push({
            id: cat.id,
            type: "category",
            position: cat.position,
            style: { width: cat.width, height: cat.height },
            data: {
              label: cat.label,
              color: cat.color,
            },
            zIndex: -1, // Behind agent nodes
          });
        });

        // Restore agent sessions
        sessions.forEach((session: any, index: number) => {
          const saved = savedNodes?.find((n: any) => n.sessionId === session.sessionId);
          const agent = agents.find((a) => a.id === session.agentId);
          const position = saved?.position?.x
            ? saved.position
            : {
                x: 100 + (index % 5) * 220,
                y: 100 + Math.floor(index / 5) * 150,
              };

          addSession(session.nodeId, {
            id: session.nodeId,
            sessionId: session.sessionId,
            agentId: session.agentId,
            agentName: session.agentName,
            command: session.command,
            color: session.customColor || agent?.color || "#888",
            createdAt: session.createdAt,
            cwd: session.cwd,
            gitBranch: session.gitBranch,
            status: session.status || "idle",
            customName: session.customName,
            customColor: session.customColor,
            notes: session.notes,
            isRestored: session.isRestored,
            ticketId: session.ticketId,
            ticketTitle: session.ticketTitle,
            categoryId: session.categoryId,
            sortOrder: session.sortOrder,
            dueDate: session.dueDate,
            remote: session.remote,
            originalCwd: session.originalCwd,
          });

          restoredNodes.push({
            id: session.nodeId,
            type: "agent",
            position,
            data: {
              label: session.customName || session.agentName,
              agentId: session.agentId,
              color: session.customColor || agent?.color || "#888",
              icon: agent?.icon || "cpu",
              sessionId: session.sessionId,
              canvasId: saved?.canvasId || activeCanvasId,
            },
          });
        });

        // Restore website nodes
        if (savedWebsiteNodes) {
          savedWebsiteNodes.forEach((wn: any) => {
            restoredNodes.push({
              id: wn.nodeId,
              type: "website",
              position: wn.position || { x: 0, y: 0 },
              data: {
                url: wn.url,
                title: wn.title,
                favicon: wn.favicon,
                description: wn.description,
                canvasId: wn.canvasId || activeCanvasId,
              },
            });
          });
        }

        hasRestoredRef.current = true;
        setNodes(restoredNodes);
        setStoreNodes(restoredNodes);
      })
      .catch(console.error);
  }, [agents, addSession, setNodes, setStoreNodes, activeCanvasId]);

  // Reload sessions when archive toggle changes
  useEffect(() => {
    if (!hasRestoredRef.current) return; // Skip on initial load

    const archivedParam = showArchived ? "?archived=true" : "";
    Promise.all([
      fetch(`/api/sessions${archivedParam}`).then((res) => res.json()),
      fetch(`/api/state${archivedParam}`).then((res) => res.json()),
    ])
      .then(([sessions, { nodes: savedNodes, websiteNodes: savedWebsiteNodes }]) => {
        const updatedNodes: any[] = [];

        // Update agent sessions
        sessions.forEach((session: any, index: number) => {
          const saved = savedNodes?.find((n: any) => n.sessionId === session.sessionId);
          const agent = agents.find((a) => a.id === session.agentId);
          const position = saved?.position?.x
            ? saved.position
            : {
                x: 100 + (index % 5) * 220,
                y: 100 + Math.floor(index / 5) * 150,
              };

          updatedNodes.push({
            id: session.nodeId,
            type: "agent",
            position,
            data: {
              agentName: session.agentName,
              customName: session.customName,
              color: session.customColor || agent?.color || "#888",
              status: session.status,
              cwd: session.cwd,
              gitBranch: session.gitBranch,
              isRestored: session.isRestored,
              ticketId: session.ticketId,
              ticketTitle: session.ticketTitle,
              icon: agent?.icon || "cpu",
              sessionId: session.sessionId,
              canvasId: saved?.canvasId || activeCanvasIdRef.current,
            },
          });

          addSession(session.nodeId, {
            id: session.nodeId,
            sessionId: session.sessionId,
            agentId: session.agentId,
            agentName: session.agentName,
            command: session.command,
            color: session.customColor || agent?.color || "#888",
            createdAt: session.createdAt,
            cwd: session.cwd,
            gitBranch: session.gitBranch,
            status: session.status,
            customName: session.customName,
            customColor: session.customColor,
            notes: session.notes,
            isRestored: session.isRestored,
            ticketId: session.ticketId,
            ticketTitle: session.ticketTitle,
          });
        });

        // Preserve website nodes across archive toggle
        if (savedWebsiteNodes) {
          savedWebsiteNodes.forEach((wn: any) => {
            updatedNodes.push({
              id: wn.nodeId,
              type: "website",
              position: wn.position || { x: 0, y: 0 },
              data: {
                url: wn.url,
                title: wn.title,
                favicon: wn.favicon,
                description: wn.description,
                canvasId: wn.canvasId || activeCanvasIdRef.current,
              },
            });
          });
        }

        setNodes(updatedNodes);
        setStoreNodes(updatedNodes);

        // Auto-center viewport after nodes are updated
        setTimeout(() => {
          if (updatedNodes.length > 0) {
            reactFlowInstance.fitView({
              padding: 0.2,      // 20% breathing room
              duration: 300,     // Smooth 300ms transition
              nodes: updatedNodes
            });
          }
        }, 50); // Wait for ReactFlow to process new nodes
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived, agents, addSession, setNodes, setStoreNodes, reactFlowInstance]);

  // Re-fit view when sidebar opens/closes or panel is resized
  useEffect(() => {
    const timer = setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: sidebarOpen ? 0 : 300 });
    }, sidebarOpen ? 0 : 250);
    return () => clearTimeout(timer);
  }, [sidebarOpen, sidebarWidth, reactFlowInstance]);

  // Helper to save all positions - accepts nodes directly to avoid sync issues
  const saveAllPositions = useCallback((nodesToSave?: typeof nodes) => {
    const currentNodes = nodesToSave || useStore.getState().nodes;
    if (currentNodes.length === 0) return;

    const positions: Record<string, { x: number; y: number; canvasId?: string }> = {};
    const GRID_SIZE = 24;
    currentNodes.forEach((node: any) => {
      if (node.type === "agent" || node.type === "website") {
        positions[node.id] = {
          x: Math.round(node.position.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(node.position.y / GRID_SIZE) * GRID_SIZE,
          canvasId: node.data?.canvasId,
        };
      }
      // Save category positions/sizes separately
      if (node.type === "category") {
        // Get dimensions - could be in style, measured, or width/height
        const width = node.measured?.width || node.width || (typeof node.style?.width === 'number' ? node.style.width : parseInt(node.style?.width as string) || 250);
        const height = node.measured?.height || node.height || (typeof node.style?.height === 'number' ? node.style.height : parseInt(node.style?.height as string) || 200);

        fetch(`/api/categories/${node.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position: {
              x: Math.round(node.position.x / GRID_SIZE) * GRID_SIZE,
              y: Math.round(node.position.y / GRID_SIZE) * GRID_SIZE,
            },
            width,
            height,
          }),
        }).catch(console.error);
      }
    });
    if (Object.keys(positions).length > 0) {
      fetch("/api/state/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      }).catch(console.error);
    }
  }, [nodes]);

  // Save positions on window close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveAllPositions();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveAllPositions]);

  // Track which nodes are being group-dragged with a category
  const groupDragRef = useRef<Map<string, Set<string>>>(new Map());

  // Save positions when nodes are moved or resized
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // Group drag: when a category is dragged, move contained agent nodes too
    const extraChanges: NodeChange[] = [];
    for (const change of changes) {
      if (change.type !== "position" || !("position" in change) || !change.position) continue;
      const node = nodes.find(n => n.id === change.id);
      if (!node || node.type !== "category") continue;

      const isDragging = "dragging" in change && change.dragging;
      if (!isDragging) {
        // Drag ended - clean up tracking
        groupDragRef.current.delete(change.id);
        continue;
      }

      const dx = change.position.x - node.position.x;
      const dy = change.position.y - node.position.y;
      if (dx === 0 && dy === 0) continue;

      const catW = node.measured?.width || node.width || (typeof node.style?.width === "number" ? node.style.width : parseInt(node.style?.width as string) || 250);
      const catH = node.measured?.height || node.height || (typeof node.style?.height === "number" ? node.style.height : parseInt(node.style?.height as string) || 200);

      // On first drag frame, snapshot which agents are inside
      if (!groupDragRef.current.has(change.id)) {
        const contained = new Set<string>();
        for (const agent of nodes) {
          if (agent.type !== "agent") continue;
          const cx = agent.position.x + 110; // ~half agent width
          const cy = agent.position.y + 70;  // ~half agent height
          if (cx >= node.position.x && cx <= node.position.x + catW &&
              cy >= node.position.y && cy <= node.position.y + catH) {
            contained.add(agent.id);
          }
        }
        groupDragRef.current.set(change.id, contained);
      }

      const contained = groupDragRef.current.get(change.id)!;
      for (const agentId of contained) {
        const agent = nodes.find(n => n.id === agentId);
        if (!agent) continue;
        extraChanges.push({
          type: "position",
          id: agentId,
          position: { x: agent.position.x + dx, y: agent.position.y + dy },
          dragging: true,
        } as NodeChange);
      }
    }

    const allChanges = extraChanges.length > 0 ? [...changes, ...extraChanges] : changes;
    onNodesChange(allChanges);

    // Debounced save for position changes only
    const positionChanges = allChanges.filter(
      c => c.type === "position" && "dragging" in c && !c.dragging
    );
    // Check for dimension changes - resizing property might be true, false, or undefined
    const dimensionChanges = allChanges.filter(
      (c) => c.type === "dimensions" && (!("resizing" in c) || c.resizing === false)
    );

    if (positionChanges.length > 0 || dimensionChanges.length > 0) {
      if (positionUpdateTimeout.current) {
        clearTimeout(positionUpdateTimeout.current);
      }
      // Compute updated nodes immediately to avoid sync delay issues
      const updatedNodes = applyNodeChanges(allChanges, nodes);
      positionUpdateTimeout.current = setTimeout(() => {
        saveAllPositions(updatedNodes);
      }, 300);
    }
  }, [onNodesChange, saveAllPositions, nodes]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      // Only open sidebar for agent nodes
      if (node.type === "agent") {
        setSelectedNodeId(node.id);
        setSidebarOpen(true);
      }
    },
    [setSelectedNodeId, setSidebarOpen]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSidebarOpen(false);
  }, [setSelectedNodeId, setSidebarOpen]);

  // Right-click on canvas pane
  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    setPendingWebsitePosition(position);
    setCanvasContextMenu({ x: event.clientX, y: event.clientY });
  }, [reactFlowInstance, setPendingWebsitePosition, setCanvasContextMenu]);

  // Website node creation (handles create, drag-drop, paste)
  const { createWebsiteNode, onDragOver, onDrop } = useWebsiteNodes();

  const isEmpty = nodes.length === 0;

  return (
    <div className="w-screen h-screen bg-canvas overflow-hidden flex flex-col">
      <Header />
      <AuthBanner />
      {uiMode === "canvas" && <CanvasTabs />}

      {uiMode === "list" ? (
        <ListView />
      ) : (
        <div
          className="flex-1 relative"
          style={{ marginRight: sidebarOpen ? `${sidebarWidth}vw` : 0 }}
        >
          <ReactFlow
            nodes={activeCanvasNodes}
            edges={[]}
            onNodesChange={handleNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={2}
            nodesDraggable
            nodesConnectable={false}
            selectNodesOnDrag={false}
            snapToGrid
            snapGrid={[24, 24]}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color={theme === "light" ? "#d0d0d0" : "#252525"}
            />
            <Controls
              showInteractive={false}
              position="bottom-left"
            />
            <CanvasControls />
          </ReactFlow>

          {/* Empty state */}
          {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center pointer-events-auto">
                <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-8 h-8 text-faint" />
                </div>
                <h2 className="text-lg font-medium text-secondary mb-2">No agents yet</h2>
                <p className="text-sm text-muted mb-4 max-w-xs">
                  Spawn your first AI agent to get started
                </p>
                <button
                  onClick={() => setAddAgentModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-accent text-accent-contrast font-medium text-sm hover:bg-accent-hover transition-colors"
                >
                  Create Agent
                </button>
              </div>
            </div>
          )}

          <Sidebar />

          {/* Canvas right-click context menu */}
          {canvasContextMenu && (
            <CanvasContextMenu
              position={canvasContextMenu}
              onClose={() => setCanvasContextMenu(null)}
              onAddAgent={() => {
                setAddAgentModalOpen(true);
                setCanvasContextMenu(null);
              }}
              onAddWebsite={() => {
                setAddWebsiteModalOpen(true);
                setCanvasContextMenu(null);
              }}
            />
          )}
        </div>
      )}

      <OrchestratorPanel />

      <AddWebsiteModal
        open={addWebsiteModalOpen}
        onClose={() => {
          setAddWebsiteModalOpen(false);
          setPendingWebsitePosition(null);
        }}
        position={pendingWebsitePosition}
        onCreateWebsiteNode={createWebsiteNode}
      />

      <NewSessionModal
        open={addAgentModalOpen || newSessionModalOpen}
        onClose={() => {
          setAddAgentModalOpen(false);
          setNewSessionModalOpen(false);
          setNewSessionForNodeId(null);
        }}
        existingSession={newSessionForNodeId ? sessions.get(newSessionForNodeId) : undefined}
        existingNodeId={newSessionForNodeId || undefined}
      />

      <ToastContainer />
      <ImageToastContainer />
    </div>
  );
}

function App() {
  useEffect(() => {
    const saved = localStorage.getItem("openui-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);
  return (
    <ReactFlowProvider>
      <TerminalPoolProvider maxSize={6}>
        <AppContent />
      </TerminalPoolProvider>
    </ReactFlowProvider>
  );
}

export default App;
