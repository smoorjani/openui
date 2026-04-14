import { useState, useEffect, useRef } from "react";
import { Settings2, Plus, X, FileText, RotateCw } from "lucide-react";
import { useStore, AgentStatus } from "../stores/useStore";
import { Terminal } from "./Terminal";
import { FocusSessionPicker } from "./FocusSessionPicker";
import { getContextWindowSize, getContextColor } from "../utils/contextWindow";

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

function getBorderClass(status: AgentStatus): string {
  switch (status) {
    case "waiting_input":
      return "border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.3)]";
    case "idle":
    case "disconnected":
      return "border-orange-500";
    case "error":
      return "border-red-500";
    default:
      return "border-border";
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

export function FocusView() {
  const focusSessions = useStore((s) => s.focusSessions);
  const setFocusSessions = useStore((s) => s.setFocusSessions);
  const sessions = useStore((s) => s.sessions);
  const removeFocusSession = useStore((s) => s.removeFocusSession);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeFocusIndex, setActiveFocusIndex] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [refreshKeys, setRefreshKeys] = useState<Record<string, number>>({});

  // Filter to only sessions that still exist
  const validSessions = focusSessions.filter((id) => sessions.has(id));

  // Keyboard: Ctrl+` cycles focus
  // xterm dispatches a custom event since it swallows keyboard events
  useEffect(() => {
    const handleCycleFocus = () => {
      const currentSessions = useStore.getState().focusSessions.filter(
        (id) => useStore.getState().sessions.has(id)
      );
      if (currentSessions.length === 0) return;
      setActiveFocusIndex((prev) => (prev + 1) % currentSessions.length);
    };
    // Also handle Ctrl+` when focus is NOT in a terminal (e.g. on the toolbar)
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

  if (validSessions.length === 0) {
    return (
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
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface">
        <span className="text-xs text-muted">
          {validSessions.length} session{validSessions.length !== 1 ? "s" : ""} · <span className="text-faint">Ctrl+` to cycle</span>
        </span>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-tertiary hover:text-primary hover:bg-canvas transition-colors"
        >
          <Settings2 className="w-3 h-3" />
          Configure
        </button>
      </div>

      {/* Panels */}
      <div className="flex-1 flex overflow-hidden">
        {validSessions.map((nodeId, index) => {
          const session = sessions.get(nodeId)!;
          const name = session.customName || session.agentName;
          const borderClass = getBorderClass(session.status);
          const statusLabel = getStatusLabel(session.status);
          const isActive = index === activeFocusIndex;

          return (
            <div
              key={nodeId}
              className={`flex-1 min-w-0 flex flex-col border-2 rounded-lg m-1 overflow-hidden transition-all ${borderClass} ${
                isActive ? "ring-1 ring-violet-500/50" : ""
              } ${dragOverIndex === index && dragIndex !== index ? "opacity-50" : ""}`}
            >
              {/* Panel header — draggable */}
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
                className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-border cursor-grab active:cursor-grabbing"
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
                  {/* Context window indicator */}
                  {session.contextTokens != null && session.contextTokens > 0 && (() => {
                    const showBar = useStore.getState().showContextBar;
                    const maxTokens = getContextWindowSize(session.model);
                    const pct = Math.min(100, Math.round((session.contextTokens / maxTokens) * 100));
                    const color = getContextColor(pct);
                    if (!showBar) {
                      return (
                        <span className="text-[10px] text-muted font-mono">
                          {Math.round(session.contextTokens / 1_000)}K ctx
                        </span>
                      );
                    }
                    return (
                      <div className="flex items-center gap-1.5 min-w-[60px]">
                        <div className="w-12 h-1 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-[10px] text-muted font-mono">{pct}%</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setRefreshKeys((prev) => ({ ...prev, [nodeId]: (prev[nodeId] || 0) + 1 }))}
                    className="p-0.5 rounded text-faint hover:text-primary transition-colors"
                    title="Reconnect terminal"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => removeFocusSession(nodeId)}
                    className="p-0.5 rounded text-faint hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Context note */}
              <ContextNote nodeId={nodeId} sessionId={session.sessionId} notes={session.notes} />

              {/* Terminal */}
              <div className="flex-1 overflow-hidden">
                <Terminal
                  key={`${nodeId}-${refreshKeys[nodeId] || 0}`}
                  sessionId={session.sessionId}
                  color={session.customColor || session.color}
                  nodeId={nodeId}
                  isActive={isActive}
                />
              </div>
            </div>
          );
        })}
      </div>

      <FocusSessionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}
