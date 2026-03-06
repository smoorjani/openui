import { useState, useEffect } from "react";
import {
  X,
  Clock,
  Folder,
  RotateCcw,
  GitBranch,
  MessageSquare,
  Terminal as TerminalIcon,
  Columns2,
  Rows2,
} from "lucide-react";
import { useStore, AgentStatus } from "../../stores/useStore";
import { Terminal } from "../Terminal";
import { ShellTerminal } from "../ShellTerminal";

type TerminalTab = "claude" | "shell";
type LayoutMode = "tabbed" | "split";

const statusConfig: Record<AgentStatus, { label: string; color: string }> = {
  creating: { label: "Creating worktree", color: "#3B82F6" },
  running: { label: "Running", color: "#22C55E" },
  waiting_input: { label: "Waiting for input", color: "#F97316" },
  tool_calling: { label: "Tool Calling", color: "#8B5CF6" },
  idle: { label: "Idle", color: "#FBBF24" },
  disconnected: { label: "Disconnected", color: "#EF4444" },
  error: { label: "Error", color: "#EF4444" },
};

interface TaskDetailPanelProps {
  nodeId: string | null;
  onClose: () => void;
}

export function TaskDetailPanel({ nodeId, onClose }: TaskDetailPanelProps) {
  const { sessions, updateSession, setNewSessionModalOpen, setNewSessionForNodeId } = useStore();
  const session = nodeId ? sessions.get(nodeId) : null;

  const [terminalKey, setTerminalKey] = useState(0);
  const [activeTab, setActiveTab] = useState<TerminalTab>("claude");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    return (localStorage.getItem("openui-layout-mode") as LayoutMode) || "tabbed";
  });

  useEffect(() => {
    setActiveTab("claude");
  }, [session?.sessionId]);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas-dark">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center mx-auto mb-3">
            <TerminalIcon className="w-5 h-5 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-500">Select a task to view its terminal</p>
        </div>
      </div>
    );
  }

  const displayColor = session.customColor || session.color || "#888";
  const statusInfo = statusConfig[session.status || "idle"];
  const isDisconnected = session.status === "disconnected" || session.status === "error" || session.isRestored;

  const handleResume = async () => {
    try {
      const res = await fetch(`/api/sessions/${session.sessionId}/restart`, { method: "POST" });
      if (res.ok) {
        setTerminalKey((k) => k + 1);
        updateSession(nodeId!, { status: "running", isRestored: false });
      }
    } catch (e) {
      console.error("Failed to resume session:", e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-canvas-dark">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: displayColor }} />
          <h2 className="text-sm font-medium text-white truncate flex-1">
            {session.customName || session.agentName}
          </h2>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusInfo.color }} />
            <span className="text-[10px] text-zinc-500">{statusInfo.label}</span>
          </div>
          <button
            onClick={handleResume}
            className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-green-400 hover:bg-green-500/10 transition-colors"
            title="Reconnect / Resume session"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Disconnected / error banner */}
      {isDisconnected && (
        <div className="flex-shrink-0 px-4 py-3 bg-red-500/10 border-b border-red-500/20">
          <div className="space-y-2.5">
            <div>
              <p className="text-sm text-red-400 font-medium">
                {session.status === "error" ? "Session Error" : "Session Disconnected"}
              </p>
              {session.sshError ? (
                <p className="text-xs text-red-400/70 mt-0.5 font-mono">
                  {session.sshError}
                  {session.reconnectAttempt && session.maxReconnectAttempts
                    ? ` (attempt ${session.reconnectAttempt}/${session.maxReconnectAttempts})`
                    : ""}
                </p>
              ) : (
                <p className="text-xs text-red-400/70 mt-0.5">Resume to continue or start a new session.</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleResume}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resume
              </button>
              <button
                onClick={() => {
                  if (nodeId) {
                    setNewSessionForNodeId(nodeId);
                    setNewSessionModalOpen(true);
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-zinc-700 text-white text-sm font-medium hover:bg-zinc-600 transition-colors"
              >
                New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Creating banner */}
      {session.status === "creating" && (
        <div className="flex-shrink-0 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-xs text-blue-400">{session.creationProgress || "Creating worktree..."}</p>
          </div>
        </div>
      )}

      {/* Terminal tabs + layout toggle */}
      <div className="flex-shrink-0 px-4 py-1.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-1">
          {layoutMode === "tabbed" ? (
            <>
              <button
                onClick={() => setActiveTab("claude")}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === "claude" ? "bg-surface-active text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                Claude Log
              </button>
              <button
                onClick={() => setActiveTab("shell")}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  activeTab === "shell" ? "bg-surface-active text-white" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <TerminalIcon className="w-3 h-3" />
                Shell
              </button>
            </>
          ) : (
            <span className="text-xs text-zinc-500">Claude Log + Shell</span>
          )}
        </div>
        <button
          onClick={() => {
            const next = layoutMode === "tabbed" ? "split" : "tabbed";
            setLayoutMode(next);
            localStorage.setItem("openui-layout-mode", next);
          }}
          className="p-1 rounded text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
          title={layoutMode === "tabbed" ? "Split view" : "Tabbed view"}
        >
          {layoutMode === "tabbed" ? <Columns2 className="w-3.5 h-3.5" /> : <Rows2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Terminal area */}
      {layoutMode === "tabbed" ? (
        <div className="flex-1 min-h-0 bg-[#0d0d0d] relative">
          <div className={`absolute inset-0 ${activeTab === "claude" ? "" : "invisible"}`}>
            <Terminal
              key={`${session.sessionId}-${terminalKey}`}
              sessionId={session.sessionId}
              color={displayColor}
              nodeId={nodeId!}
              isActive={activeTab === "claude"}
            />
          </div>
          <div className={`absolute inset-0 ${activeTab === "shell" ? "" : "invisible"}`}>
            <ShellTerminal
              key={`shell-${session.sessionId}`}
              sessionId={session.sessionId}
              cwd={session.cwd}
              color={displayColor}
              remote={session.remote}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-[#0d0d0d] flex flex-row">
          <div className="flex-1 min-w-0 min-h-0">
            <Terminal
              key={`${session.sessionId}-${terminalKey}`}
              sessionId={session.sessionId}
              color={displayColor}
              nodeId={nodeId!}
              isActive
            />
          </div>
          <div className="w-px bg-zinc-700 flex-shrink-0" />
          <div className="flex-1 min-w-0 min-h-0">
            <ShellTerminal
              key={`shell-${session.sessionId}`}
              sessionId={session.sessionId}
              cwd={session.cwd}
              color={displayColor}
              remote={session.remote}
            />
          </div>
        </div>
      )}

      {/* Compact single-line footer */}
      <div className="flex-shrink-0 px-3 py-1.5 border-t border-border flex items-center gap-3 text-[10px] text-zinc-500 font-mono overflow-hidden">
        <span className="flex items-center gap-1 flex-shrink-0">
          <Clock className="w-2.5 h-2.5" />
          {new Date(session.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <span className="text-zinc-700">|</span>
        <span className="flex items-center gap-1 truncate">
          <Folder className="w-2.5 h-2.5 flex-shrink-0" />
          {session.cwd.split("/").slice(-2).join("/")}
        </span>
        {session.gitBranch && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="flex items-center gap-1 flex-shrink-0 text-purple-400">
              <GitBranch className="w-2.5 h-2.5" />
              {session.gitBranch}
            </span>
          </>
        )}
        <span className="text-zinc-700">|</span>
        <span
          className="truncate cursor-pointer hover:text-zinc-300"
          title={`Click to copy: ${session.sessionId}`}
          onClick={() => navigator.clipboard.writeText(session.sessionId)}
        >
          ID: {session.sessionId.slice(0, 20)}...
        </span>
      </div>
    </div>
  );
}
