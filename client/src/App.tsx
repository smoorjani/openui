import { useEffect, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  BackgroundVariant,
  ReactFlowProvider,
  NodeChange,
  applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus } from "lucide-react";

import { useStore } from "./stores/useStore";
import { AgentNode } from "./components/AgentNode/index";
import { CategoryNode } from "./components/CategoryNode";
import { Sidebar } from "./components/Sidebar";
import { NewSessionModal } from "./components/NewSessionModal";
import { Header } from "./components/Header";
import { CanvasControls } from "./components/CanvasControls";
import { ListView } from "./components/ListView/ListView";

const nodeTypes = {
  agent: AgentNode,
  category: CategoryNode,
};

const PRESET_CATEGORIES = [
  { label: "TODO", color: "#22C55E", position: { x: 50, y: 80 } },
  { label: "In Progress", color: "#3B82F6", position: { x: 370, y: 80 } },
  { label: "In Review", color: "#8B5CF6", position: { x: 690, y: 80 } },
  { label: "On Hold", color: "#FBBF24", position: { x: 1010, y: 80 } },
];
const PRESET_CAT_WIDTH = 280;
const PRESET_CAT_HEIGHT = 400;

function AppContent() {
  const {
    nodes: storeNodes,
    setNodes: setStoreNodes,
    setAgents,
    setLaunchCwd,
    setSelectedNodeId,
    setSidebarOpen,
    addSession,
    updateSession,
    agents,
    addAgentModalOpen,
    setAddAgentModalOpen,
    newSessionModalOpen,
    setNewSessionModalOpen,
    newSessionForNodeId,
    setNewSessionForNodeId,
    sessions,
    uiMode,
  } = useStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const positionUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasRestoredRef = useRef(false);

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
      .then((config) => setLaunchCwd(config.launchCwd))
      .catch(console.error);

    fetch("/api/agents")
      .then((res) => res.json())
      .then((agents) => setAgents(agents))
      .catch(console.error);
  }, [setAgents, setLaunchCwd]);

  // Poll for status updates every second to catch any missed WebSocket messages
  useEffect(() => {
    const pollStatus = async () => {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) {
          const sessionsData = await res.json();
          const currentSessions = useStore.getState().sessions;
          for (const sessionData of sessionsData) {
            if (sessionData.nodeId && sessionData.status) {
              const existing = currentSessions.get(sessionData.nodeId);
              if (existing && existing.status !== sessionData.status) {
                console.log(`[poll] Updating ${sessionData.nodeId} status: ${existing.status} -> ${sessionData.status}`);
                updateSession(sessionData.nodeId, { status: sessionData.status });
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
    };

    // Poll immediately and then every second
    pollStatus();
    const interval = setInterval(pollStatus, 1000);
    return () => clearInterval(interval);
  }, [updateSession]);

  // Restore sessions and categories after agents are loaded
  useEffect(() => {
    if (agents.length === 0 || hasRestoredRef.current) return;

    Promise.all([
      fetch("/api/sessions").then((res) => res.json()),
      fetch("/api/state").then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json()),
    ])
      .then(async ([sessions, { nodes: savedNodes }, categories]) => {
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
            originalCwd: session.originalCwd,
            gitBranch: session.gitBranch,
            status: session.status || "idle",
            customName: session.customName,
            customColor: session.customColor,
            notes: session.notes,
            isRestored: session.isRestored,
            remote: session.remote,
            categoryId: session.categoryId,
            sortOrder: session.sortOrder,
            dueDate: session.dueDate,
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
            },
          });
        });

        hasRestoredRef.current = true;
        setNodes(restoredNodes);
        setStoreNodes(restoredNodes);
      })
      .catch(console.error);
  }, [agents, addSession, setNodes, setStoreNodes]);

  // Helper to save all positions - accepts nodes directly to avoid sync issues
  const saveAllPositions = useCallback((nodesToSave?: typeof nodes) => {
    const currentNodes = nodesToSave || useStore.getState().nodes;
    if (currentNodes.length === 0) return;

    const positions: Record<string, { x: number; y: number }> = {};
    const GRID_SIZE = 24;
    currentNodes.forEach((node) => {
      // Only save agent positions to state/positions
      if (node.type === "agent") {
        positions[node.id] = {
          x: Math.round(node.position.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(node.position.y / GRID_SIZE) * GRID_SIZE,
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

    const positionChanges = allChanges.filter(
      (c) => c.type === "position" && "dragging" in c && c.dragging === false
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

  const isEmpty = nodes.length === 0;

  return (
    <div className="w-screen h-screen bg-canvas overflow-hidden flex flex-col">
      <Header />

      {uiMode === "list" ? (
        <ListView />
      ) : (
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={[]}
            onNodesChange={handleNodesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
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
              color="#252525"
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
                  <Plus className="w-8 h-8 text-zinc-600" />
                </div>
                <h2 className="text-lg font-medium text-zinc-300 mb-2">No agents yet</h2>
                <p className="text-sm text-zinc-500 mb-4 max-w-xs">
                  Spawn your first AI agent to get started
                </p>
                <button
                  onClick={() => setAddAgentModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-white text-canvas font-medium text-sm hover:bg-zinc-100 transition-colors"
                >
                  Create Agent
                </button>
              </div>
            </div>
          )}

          <Sidebar />
        </div>
      )}

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
    </div>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <AppContent />
    </ReactFlowProvider>
  );
}

export default App;
