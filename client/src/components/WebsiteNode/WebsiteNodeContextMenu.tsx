import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

interface WebsiteNodeContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onDelete: () => void;
}

export function WebsiteNodeContextMenu({
  position,
  onClose,
  onDelete,
}: WebsiteNodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handler, true);
    });
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] min-w-[160px] rounded-lg border shadow-xl py-1"
      style={{ left: position.x, top: position.y, backgroundColor: "#262626", borderColor: "#333" }}
    >
      <button
        onPointerDown={() => { onDelete(); onClose(); }}
        className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5 flex items-center gap-2"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>,
    document.body
  );
}
