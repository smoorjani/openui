import { useState, useCallback, useEffect } from "react";
import { useStore } from "../../stores/useStore";
import { TaskList } from "./TaskList";
import { TaskDetailPanel } from "./TaskDetailPanel";

export function ListView() {
  const { setSelectedNodeId, selectedNodeId } = useStore();

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("openui-list-panel-width");
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleSelect = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId]
  );

  const handleClose = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = e.clientX;
      setPanelWidth(Math.max(200, Math.min(newWidth, 600)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setPanelWidth((w) => {
        localStorage.setItem("openui-list-panel-width", w.toString());
        return w;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left panel - task list */}
      <div className="flex-shrink-0 border-r border-border" style={{ width: panelWidth }}>
        <TaskList selectedNodeId={selectedNodeId} onSelect={handleSelect} />
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-zinc-500 transition-colors ${
          isResizing ? "bg-zinc-500" : ""
        }`}
      />

      {/* Right panel - detail/terminal */}
      <div className="flex-1 min-w-0">
        <TaskDetailPanel nodeId={selectedNodeId} onClose={handleClose} />
      </div>
    </div>
  );
}
