import { useState, useRef } from "react";
import { GripVertical, Calendar, Trash2, ArrowRight, Edit3 } from "lucide-react";
import { useStore, AgentStatus, ListSection } from "../../stores/useStore";

const statusConfig: Record<AgentStatus, { label: string; color: string }> = {
  creating: { label: "Creating", color: "#3B82F6" },
  running: { label: "Running", color: "#22C55E" },
  waiting_input: { label: "Waiting", color: "#F97316" },
  tool_calling: { label: "Tool Call", color: "#8B5CF6" },
  idle: { label: "Idle", color: "#FBBF24" },
  disconnected: { label: "Disconnected", color: "#EF4444" },
  error: { label: "Error", color: "#EF4444" },
};

function relativeDueDate(iso: string): { text: string; overdue: boolean } {
  const now = new Date();
  const due = new Date(iso);
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - now.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue: true };
  if (diff === 0) return { text: "Today", overdue: false };
  if (diff === 1) return { text: "Tomorrow", overdue: false };
  return { text: `In ${diff}d`, overdue: false };
}

interface TaskItemProps {
  nodeId: string;
  onSelect: (nodeId: string) => void;
  isSelected: boolean;
  onDragStart: (e: React.DragEvent, nodeId: string) => void;
}

export function TaskItem({ nodeId, onSelect, isSelected, onDragStart }: TaskItemProps) {
  const { sessions, updateSession, listSections } = useStore();
  const session = sessions.get(nodeId);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const dateRef = useRef<HTMLInputElement>(null);

  if (!session) return null;

  const status = statusConfig[session.status || "idle"];
  const displayName = session.customName || session.agentName;
  const dueDateInfo = session.dueDate ? relativeDueDate(session.dueDate) : null;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setShowMoveMenu(false);
  };

  const handleSetDueDate = (date: string) => {
    updateSession(nodeId, { dueDate: date || undefined });
    fetch(`/api/sessions/${session.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: date || null }),
    }).catch(console.error);
    setShowDatePicker(false);
    closeContextMenu();
  };

  const handleMoveToSection = (sectionId: string | null) => {
    updateSession(nodeId, { categoryId: sectionId || undefined });
    fetch(`/api/sessions/${session.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: sectionId }),
    }).catch(console.error);
    closeContextMenu();
  };

  const handleStartRename = () => {
    setRenameName(session.customName || session.agentName);
    setIsRenaming(true);
    closeContextMenu();
  };

  const handleFinishRename = () => {
    if (!renameName.trim()) {
      setIsRenaming(false);
      return;
    }
    const customName = renameName.trim() !== session.agentName ? renameName.trim() : undefined;
    updateSession(nodeId, { customName });
    fetch(`/api/sessions/${session.sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customName: customName ?? null }),
    }).catch(console.error);
    setIsRenaming(false);
  };

  const handleDelete = () => {
    closeContextMenu();
    // Remove from UI immediately, then tell server to clean up
    useStore.getState().removeSession(nodeId);
    useStore.getState().removeNode(nodeId);
    fetch(`/api/sessions/${session.sessionId}`, { method: "DELETE" }).catch(console.error);
  };

  return (
    <>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, nodeId)}
        onClick={() => onSelect(nodeId)}
        onContextMenu={handleContextMenu}
        className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
          isSelected
            ? "bg-white/10 ring-1 ring-white/20"
            : "hover:bg-white/5"
        }`}
      >
        <GripVertical className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 flex-shrink-0 cursor-grab" />
        <div className="flex-1 min-w-0">
          {isRenaming ? (
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishRename();
                if (e.key === "Escape") setIsRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm text-white bg-canvas border border-border rounded px-1.5 py-0.5 focus:outline-none focus:border-zinc-500"
              autoFocus
            />
          ) : (
            <div className="text-sm text-zinc-200 truncate">{displayName}</div>
          )}
          {session.gitBranch && (
            <span className="text-[10px] text-zinc-600 font-mono truncate block mt-0.5">
              {session.gitBranch}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {dueDateInfo && (
            <span
              className={`text-[10px] ${
                dueDateInfo.overdue ? "text-red-400" : "text-zinc-500"
              }`}
            >
              {dueDateInfo.text}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
            style={{
              backgroundColor: status.color + "20",
              color: status.color,
            }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: status.color }}
            />
            {status.label}
          </span>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={closeContextMenu} />
          <div
            className="fixed z-50 w-48 bg-surface border border-border rounded-lg shadow-xl py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleStartRename}
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <Edit3 className="w-3 h-3" />
              Rename
            </button>
            <button
              onClick={() => setShowDatePicker(true)}
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <Calendar className="w-3 h-3" />
              {session.dueDate ? "Change due date" : "Set due date"}
            </button>
            {showDatePicker && (
              <div className="px-3 py-1.5">
                <input
                  ref={dateRef}
                  type="date"
                  defaultValue={session.dueDate?.split("T")[0] || ""}
                  onChange={(e) => handleSetDueDate(e.target.value)}
                  className="w-full px-2 py-1 rounded bg-canvas border border-border text-xs text-white"
                  autoFocus
                />
                {session.dueDate && (
                  <button
                    onClick={() => handleSetDueDate("")}
                    className="mt-1 text-[10px] text-red-400 hover:text-red-300"
                  >
                    Clear date
                  </button>
                )}
              </div>
            )}
            <button
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <ArrowRight className="w-3 h-3" />
              Move to section
            </button>
            {showMoveMenu && (
              <div className="border-t border-border mt-1 pt-1">
                {listSections.map((sec: ListSection) => (
                  <button
                    key={sec.id}
                    onClick={() => handleMoveToSection(sec.id)}
                    className="w-full px-4 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
                  >
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: sec.color }}
                    />
                    {sec.label}
                  </button>
                ))}
                <button
                  onClick={() => handleMoveToSection(null)}
                  className="w-full px-4 py-1.5 text-left text-xs text-zinc-400 hover:bg-white/5"
                >
                  Uncategorized
                </button>
              </div>
            )}
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={handleDelete}
                className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
