import { useState, useCallback } from "react";
import { NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import { useStore } from "../../stores/useStore";
import { WebsiteNodeCard } from "./WebsiteNodeCard";
import { WebsiteNodeContextMenu } from "./WebsiteNodeContextMenu";

export interface WebsiteNodeData {
  url: string;
  title?: string;
  favicon?: string;
  description?: string;
  canvasId?: string;
}

export const WebsiteNode = ({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as WebsiteNodeData;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDelete = useCallback(() => {
    useStore.getState().removeNode(id);
    fetch(`/api/website-nodes/${id}`, { method: "DELETE" }).catch(console.error);
  }, [id]);

  let hostname = "";
  try {
    hostname = new URL(nodeData.url).hostname;
  } catch {
    hostname = nodeData.url;
  }

  return (
    <>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onContextMenu={handleContextMenu}
      >
        <WebsiteNodeCard
          selected={selected}
          title={nodeData.title || hostname}
          url={nodeData.url}
          hostname={hostname}
          onDelete={handleDelete}
        />
      </motion.div>

      {contextMenu && (
        <WebsiteNodeContextMenu
          position={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={handleDelete}
        />
      )}
    </>
  );
};
