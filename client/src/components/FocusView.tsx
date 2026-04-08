import { useState, useEffect, useRef } from "react";
import { Settings2, Plus, X, FileText, RotateCw, CheckCircle, PauseCircle, Trash2, ArrowRight } from "lucide-react";
import { useStore, AgentStatus } from "../stores/useStore";
import { Terminal } from "./Terminal";
import { FocusSessionPicker } from "./FocusSessionPicker";
import { WorkspaceTabs } from "./WorkspaceTabs";

const IN_REVIEW_MAP: Record<string, string> = {
  sprint: "in-review",
  oncall: "oncall-in-review",
};

const WORKSPACE_OPTIONS = [
  { id: "sprint", label: "Sprint", color: "#F97316", defaultSection: "in-progress" },
  { id: "oncall", label: "On Call", color: "#06B6D4", defaultSection: "oncall-in-progress" },
  { id: "backlog", label: "Backlog", color: "#FBBF24", defaultSection: "backlog-new" },
];

function ContextNote({ nodeId, sessionId, notes }: { nodeId: string; sessionId: string; notes?: string }) {
  const updateSession = useStore((s) => s.updateSession);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes || "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync if notes change externally
  useEffect(() => { setValue(notes || ""); }, [notes]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed === (notes || "")) return;
    updateSession(nodeId, { notes: trimmed || undefined });
    fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: trimmed }),
    }).catch(console.error);
  };

  if (!editing && !notes) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 px-3 py-1 text-[10px] text-faint hover:text-muted transition-colors"
      >
        <FileText className="w-3 h-3" />
        Add context...
      </button>
    );
  }

  if (editing) {
    return (
      <div className="px-3 py-1.5 border-b border-border bg-canvas">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === "Escape") { setValue(notes || ""); setEditing(false); }
          }}
          placeholder="What is this session for?"
          rows={2}
          className="w-full bg-transparent text-xs text-secondary placeholder-faint resize-none focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="px-3 py-1 border-b border-border bg-canvas cursor-pointer hover:bg-elevated transition-colors"
    >
      <p className="text-xs text-muted whitespace-pre-wrap line-clamp-2">{notes}</p>
    </div>
  );
}

function getHeaderBg(status: AgentStatus): string {
  switch (status) {
    case "waiting_input":
      return "bg-green-500/15";
    case "idle":
    case "disconnected":
      return "bg-orange-500/15";
    case "error":
      return "bg-red-500/15";
    default:
      return "bg-surface";
  }
}

function getStatusLabel(status: AgentStatus): { text: string; className: string } {
  switch (status) {
    case "waiting_input":
      return { text: "Needs Input", className: "bg-green-500/20 text-green-400" };
    case "running":
      return { text: "Running", className: "bg-blue-500/20 text-blue-400" };
    case "tool_calling":
      return { text: "Tool", className: "bg-violet-500/20 text-violet-400" };
    case "idle":
      return { text: "Idle", className: "bg-orange-500/20 text-orange-400" };
    case "disconnected":
      return { text: "Disconnected", className: "bg-orange-500/20 text-orange-400" };
    case "error":
      return { text: "Error", className: "bg-red-500/20 text-red-400" };
    case "compacting":
      return { text: "Compacting", className: "bg-yellow-500/20 text-yellow-400" };
    case "creating":
      return { text: "Creating", className: "bg-cyan-500/20 text-cyan-400" };
    default:
      return { text: status, className: "bg-zinc-500/20 text-zinc-400" };
  }
}

function RemovePopover({
  nodeId,
  anchorRef,
  onClose,
}: {
  nodeId: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const updateSession = useStore((s) => s.updateSession);
  const removeFocusSession = useStore((s) => s.removeFocusSession);
  const removeSession = useStore((s) => s.removeSession);
  const removeNode = useStore((s) => s.removeNode);
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const session = sessions.get(nodeId);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        // Click outside = just remove from focus, no state change
        removeFocusSession(nodeId);
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [nodeId, removeFocusSession, onClose, anchorRef]);

  const moveAndRemove = (targetCategoryId: string) => {
    if (session) {
      updateSession(nodeId, { categoryId: targetCategoryId });
      fetch(`/api/sessions/${session.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: targetCategoryId }),
      }).catch(console.error);
    }
    removeFocusSession(nodeId);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (session) {
      await fetch(`/api/sessions/${session.sessionId}`, { method: "DELETE" }).catch(console.error);
      removeSession(nodeId);
      removeNode(nodeId);
    }
    removeFocusSession(nodeId);
    onClose();
  };

  const reviewSection = IN_REVIEW_MAP[activeWorkspace] || "in-review";

  // Position near the anchor button
  const rect = anchorRef.current?.getBoundingClientRect();
  const style: React.CSSProperties = rect
    ? { position: "fixed", top: rect.bottom + 4, right: window.innerWidth - rect.right, zIndex: 60 }
    : { position: "fixed", top: 0, right: 0, zIndex: 60 };

  return (
    <div ref={popoverRef} style={style} className="w-44 bg-surface border border-border rounded-lg shadow-xl py-1">
      <button
        onClick={() => moveAndRemove(reviewSection)}
        className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
      >
        <CheckCircle className="w-3.5 h-3.5 text-violet-400" />
        In Review
      </button>
      <button
        onClick={() => moveAndRemove("backlog-on-hold")}
        className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
      >
        <PauseCircle className="w-3.5 h-3.5 text-yellow-400" />
        On Hold
      </button>
      <div className="h-px bg-border my-0.5" />
      <button
        onClick={handleDelete}
        className={`w-full px-3 py-1.5 text-left text-xs flex items-center gap-2 ${
          confirmDelete ? "text-red-300 bg-red-500/10" : "text-red-400 hover:bg-red-500/10"
        }`}
      >
        <Trash2 className="w-3.5 h-3.5" />
        {confirmDelete ? "Confirm Delete" : "Delete"}
      </button>
    </div>
  );
}

export function FocusView() {
  const focusSessions = useStore((s) => s.focusSessions);
  const setFocusSessions = useStore((s) => s.setFocusSessions);
  const sessions = useStore((s) => s.sessions);
  const updateSession = useStore((s) => s.updateSession);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeFocusIndex, setActiveFocusIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});
  const [removePopoverNodeId, setRemovePopoverNodeId] = useState<string | null>(null);
  const [panelContextMenu, setPanelContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false);
  const xButtonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const listSections = useStore((s) => s.listSections);
  const activeWorkspace = useStore((s) => s.activeWorkspace);

  // Filter to sessions that exist and belong to active workspace or backlog
  const validSessions = focusSessions.filter((id) => {
    if (!sessions.has(id)) return false;
    const session = sessions.get(id)!;
    const section = listSections.find((s) => s.id === session.categoryId);
    const ws = section?.workspace;
    // Show if in active workspace, backlog, or uncategorized
    return !ws || ws === activeWorkspace || ws === "backlog";
  });

  // Keyboard: Ctrl+` cycles focus
  // Use a ref so the handler always sees the current validSessions count
  const validSessionsRef = useRef(validSessions);
  validSessionsRef.current = validSessions;

  useEffect(() => {
    const handleCycleFocus = () => {
      const count = validSessionsRef.current.length;
      if (count === 0) return;
      setActiveFocusIndex((prev) => (prev + 1) % count);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Backquote" && e.ctrlKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        handleCycleFocus();
      }
    };
    window.addEventListener("openui:cycle-focus", handleCycleFocus);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("openui:cycle-focus", handleCycleFocus);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  // Clamp index
  useEffect(() => {
    if (activeFocusIndex >= validSessions.length) {
      setActiveFocusIndex(Math.max(0, validSessions.length - 1));
    }
  }, [validSessions.length, activeFocusIndex]);

  const renderPanel = (nodeId: string, index: number) => {
    const session = sessions.get(nodeId)!;
    const name = session.customName || session.agentName;
    const headerBg = getHeaderBg(session.status);
    const statusLabel = getStatusLabel(session.status);
    const isActive = index === activeFocusIndex;

    return (
      <div
        key={nodeId}
        className={`flex-1 min-w-0 flex flex-col border rounded-lg m-1 overflow-hidden transition-all border-border ${
          isActive ? "ring-1 ring-violet-500/50" : ""
        } ${dragOverIndex === index && dragIndex !== index ? "opacity-50" : ""}`}
      >
        <div
          draggable
          onDragStart={(e) => {
            setDragIndex(index);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverIndex(index);
          }}
          onDragLeave={() => setDragOverIndex(null)}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null && dragIndex !== index) {
              const reordered = [...validSessions];
              const [moved] = reordered.splice(dragIndex, 1);
              reordered.splice(index, 0, moved);
              setFocusSessions(reordered);
            }
            setDragIndex(null);
            setDragOverIndex(null);
          }}
          onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
          onContextMenu={(e) => {
            e.preventDefault();
            setPanelContextMenu({ nodeId, x: e.clientX, y: e.clientY });
            setShowMoveSubmenu(false);
          }}
          className={`flex items-center justify-between px-3 py-1.5 ${headerBg} border-b border-border cursor-grab active:cursor-grabbing`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: session.customColor || session.color }}
            />
            <span className="text-xs font-medium text-primary truncate">{name}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusLabel.className}`}>
              {statusLabel.text}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                // Restart the server-side session (kills old PTY, re-spawns)
                fetch(`/api/sessions/${session.sessionId}/restart`, { method: "POST" })
                  .then(() => {
                    // Small delay for PTY to initialize, then remount terminal
                    setTimeout(() => {
                      setRefreshKeys((prev) => ({ ...prev, [nodeId]: (prev[nodeId] || 0) + 1 }));
                    }, 500);
                  })
                  .catch(console.error);
              }}
              className="p-0.5 rounded text-faint hover:text-primary transition-colors"
              title="Restart session"
            >
              <RotateCw className="w-3 h-3" />
            </button>
            <button
              ref={(el) => { xButtonRefs.current.set(nodeId, el); }}
              onClick={() => setRemovePopoverNodeId(removePopoverNodeId === nodeId ? null : nodeId)}
              className="p-0.5 rounded text-faint hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
        <ContextNote nodeId={nodeId} sessionId={session.sessionId} notes={session.notes} />
        <div className="flex-1 overflow-hidden">
          <Terminal
            key={`${nodeId}-${refreshKeys[nodeId] || 0}`}
            sessionId={session.sessionId}
            color={session.customColor || session.color}
            nodeId={nodeId}
            isActive={isActive}
          />
        </div>
        {removePopoverNodeId === nodeId && (
          <RemovePopover
            nodeId={nodeId}
            anchorRef={{ current: xButtonRefs.current.get(nodeId) ?? null }}
            onClose={() => setRemovePopoverNodeId(null)}
          />
        )}
      </div>
    );
  };

  if (validSessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center px-3 py-1.5 border-b border-border bg-surface">
          <WorkspaceTabs />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
              <Plus className="w-8 h-8 text-faint" />
            </div>
            <h2 className="text-lg font-medium text-secondary mb-2">No focus sessions</h2>
            <p className="text-sm text-muted mb-4 max-w-xs">
              Add sessions to view their terminals side by side
          </p>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-4 py-2 rounded-lg bg-accent text-accent-contrast font-medium text-sm hover:bg-accent-hover transition-colors"
          >
            Add Sessions
          </button>
          <FocusSessionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
        <div className="flex items-center gap-3">
          <WorkspaceTabs />
          <span className="text-xs text-muted">
            {validSessions.length} session{validSessions.length !== 1 ? "s" : ""} · <span className="text-faint">Ctrl+` to cycle</span>
          </span>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-tertiary hover:text-primary hover:bg-canvas transition-colors"
        >
          <Settings2 className="w-3 h-3" />
          Configure
        </button>
      </div>

      {/* Panels — flat equal layout */}
      <div className="flex-1 flex overflow-hidden">
        {validSessions.map((nodeId, index) => renderPanel(nodeId, index))}
      </div>

      <FocusSessionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />

      {/* Panel context menu */}
      {panelContextMenu && (() => {
        const ctxSession = sessions.get(panelContextMenu.nodeId);
        const ctxSection = listSections.find((s) => s.id === ctxSession?.categoryId);
        const currentWs = ctxSection?.workspace;

        const handleMoveToWorkspace = (workspaceId: string) => {
          const ws = WORKSPACE_OPTIONS.find((w) => w.id === workspaceId);
          if (!ws || !ctxSession) return;
          updateSession(panelContextMenu.nodeId, { categoryId: ws.defaultSection });
          fetch(`/api/sessions/${ctxSession.sessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ categoryId: ws.defaultSection }),
          }).catch(console.error);
          setPanelContextMenu(null);
          setShowMoveSubmenu(false);
        };

        return (
          <>
            <div className="fixed inset-0 z-50" onClick={() => { setPanelContextMenu(null); setShowMoveSubmenu(false); }} />
            <div
              className="fixed z-[51] w-48 bg-surface border border-border rounded-lg shadow-xl py-1"
              style={{ left: panelContextMenu.x, top: panelContextMenu.y }}
            >
              <button
                onClick={() => setShowMoveSubmenu(!showMoveSubmenu)}
                className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
              >
                <ArrowRight className="w-3 h-3" />
                Move to workspace
              </button>
              {showMoveSubmenu && (
                <div className="border-t border-border mt-1 pt-1">
                  {WORKSPACE_OPTIONS.filter((ws) => ws.id !== currentWs).map((ws) => (
                    <button
                      key={ws.id}
                      onClick={(e) => { e.stopPropagation(); handleMoveToWorkspace(ws.id); }}
                      className="w-full px-4 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ws.color }} />
                      {ws.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
