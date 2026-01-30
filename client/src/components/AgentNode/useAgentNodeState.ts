import { useState } from "react";
import { useStore, AgentSession } from "../../stores/useStore";

interface AgentNodeData {
  sessionId: string;
}

export function useAgentNodeState(
  id: string,
  nodeData: AgentNodeData,
  session: AgentSession | undefined
) {
  const { removeNode, removeSession, setSelectedNodeId, setSidebarOpen } =
    useStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleDelete = async () => {
    const sessionId = session?.sessionId || nodeData.sessionId;
    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    }
    removeSession(id);
    removeNode(id);
    setSelectedNodeId(null);
    setSidebarOpen(false);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  return {
    contextMenu,
    handleContextMenu,
    handleDelete,
    closeContextMenu,
  };
}
