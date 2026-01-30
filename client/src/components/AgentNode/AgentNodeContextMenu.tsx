import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

interface AgentNodeContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: () => void;
}

export function AgentNodeContextMenu({
  position,
  onClose,
  onDelete,
}: AgentNodeContextMenuProps) {
  return createPortal(
    <>
      {/* Transparent backdrop to catch clicks outside the menu */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className="context-menu-container fixed z-[9999] min-w-[160px] rounded-lg border shadow-xl py-1"
        style={{
          left: position.x,
          top: position.y,
          backgroundColor: "#262626",
          borderColor: "#333",
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            onClose();
          }}
          className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5 flex items-center gap-2"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </>,
    document.body
  );
}
