import { useStore } from "../stores/useStore";

export async function createQuickAgent(options: {
  customName?: string;
  categoryId?: string;
}): Promise<string | null> {
  const { customName, categoryId } = options;
  const state = useStore.getState();
  const { agents, launchCwd, addSession, addNode, updateSession, addFocusSession, activeCanvasId } = state;

  // Read last-used settings from localStorage
  const lastAgentId = localStorage.getItem("openui-last-agent-id");
  const lastCwd = localStorage.getItem("openui-last-cwd");
  const lastCliMode = localStorage.getItem("openui-last-cli-mode") as "isaac" | "claude" | null;

  const agent = (lastAgentId ? agents.find((a) => a.id === lastAgentId) : null) || agents[0];
  if (!agent) return null;

  const cwd = lastCwd || launchCwd;
  const cliMode = lastCliMode || "claude";
  const command = cliMode === "isaac" ? "isaac" : agent.command;

  const nodeId = `node-${Date.now()}-0`;

  // Create placeholder node + session
  addNode({
    id: nodeId,
    type: "agent",
    position: { x: 0, y: 0 },
    data: {
      label: customName || agent.name,
      agentId: agent.id,
      color: agent.color,
      icon: agent.icon,
      sessionId: `pending-${nodeId}`,
      canvasId: activeCanvasId,
    },
  });

  addSession(nodeId, {
    id: nodeId,
    sessionId: `pending-${nodeId}`,
    agentId: agent.id,
    agentName: agent.name,
    command,
    color: agent.color,
    createdAt: new Date().toISOString(),
    cwd,
    status: "creating",
    customName: customName || undefined,
    categoryId: categoryId || undefined,
  });

  // Add to focus immediately
  addFocusSession(nodeId);

  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: agent.id,
        agentName: agent.name,
        command,
        cwd,
        nodeId,
        customName: customName || undefined,
        ...(categoryId && { categoryId }),
      }),
    });

    if (res.ok) {
      const { sessionId, cwd: newCwd, gitBranch } = await res.json();
      updateSession(nodeId, {
        sessionId,
        cwd: newCwd || cwd,
        gitBranch: gitBranch || undefined,
        status: "idle",
      });
      // Update node data with real sessionId
      const currentNode = useStore.getState().nodes.find((n) => n.id === nodeId);
      if (currentNode) {
        useStore.getState().setNodes(
          useStore.getState().nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, sessionId } } : n
          )
        );
      }
      return nodeId;
    } else {
      // Clean up on failure
      useStore.getState().removeSession(nodeId);
      useStore.getState().removeNode(nodeId);
      useStore.getState().removeFocusSession(nodeId);
      return null;
    }
  } catch {
    useStore.getState().removeSession(nodeId);
    useStore.getState().removeNode(nodeId);
    useStore.getState().removeFocusSession(nodeId);
    return null;
  }
}
