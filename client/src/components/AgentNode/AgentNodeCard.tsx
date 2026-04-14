import { useState, useEffect } from "react";
import { MessageSquare, WifiOff, GitBranch, Folder, Wrench, Clock, Zap, Flame, Archive, Trash2, Loader2, Coffee, AlertTriangle, RefreshCw } from "lucide-react";
import { useStore, AgentStatus } from "../../stores/useStore";
import { getContextWindowSize, getContextColor } from "../../utils/contextWindow";

// Status config with visual priority levels
const defaultStatusConfig: Record<AgentStatus, { label: string; color: string; isActive?: boolean; needsAttention?: boolean }> = {
  running: { label: "Working", color: "#22C55E", isActive: true },
  tool_calling: { label: "Working", color: "#22C55E", isActive: true },
  waiting: { label: "Waiting", color: "#6366F1" },
  compacting: { label: "Compacting", color: "#06B6D4" },
  waiting_input: { label: "Needs Input", color: "#F97316", needsAttention: true },
  idle: { label: "Idle", color: "#FBBF24", needsAttention: true },
  disconnected: { label: "Offline", color: "#6B7280" },
  error: { label: "Error", color: "#EF4444", needsAttention: true },
  creating: { label: "Creating worktree…", color: "#06B6D4", isActive: true },
};

// Colorblind-friendly overrides: replaces orange (Needs Input) with pink for
// better contrast against yellow (Idle) for red-green color vision deficiency.
const colorblindOverrides: Partial<Record<AgentStatus, { color: string }>> = {
  waiting_input: { color: "#F472B6" },
};

function getStatusConfig(colorblindMode: boolean) {
  if (!colorblindMode) return defaultStatusConfig;
  const config = { ...defaultStatusConfig };
  for (const [key, overrides] of Object.entries(colorblindOverrides)) {
    config[key as AgentStatus] = { ...config[key as AgentStatus], ...overrides };
  }
  return config;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

function formatModelName(model: string): string {
  // Extract context window suffix like [1m], [200k] etc.
  const ctxMatch = model.match(/\[(\d+[mk])\]/i);
  const ctxSuffix = ctxMatch ? ` (${ctxMatch[1].toUpperCase()})` : "";
  const base = model.replace(/\[.*\]/, "");

  // "claude-sonnet-4-6" → "Sonnet 4.6"
  // "claude-opus-4-6[1m]" → "Opus 4.6 (1M)"
  // "claude-haiku-4-5-20251001" → "Haiku 4.5"
  const m = base.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (m) return `${m[1].charAt(0).toUpperCase() + m[1].slice(1)} ${m[2]}.${m[3]}${ctxSuffix}`;

  // Short names: "opus[1m]" → "Opus (1M)", "sonnet" → "Sonnet"
  const short = base.match(/^(opus|sonnet|haiku)$/i);
  if (short) return `${short[1].charAt(0).toUpperCase() + short[1].slice(1)}${ctxSuffix}`;

  return model;
}

function formatSleepTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Tool name display mapping
const toolDisplayNames: Record<string, string> = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  Bash: "Running",
  Grep: "Searching",
  Glob: "Finding",
  Task: "Tasking",
  WebFetch: "Fetching",
  WebSearch: "Searching",
  TodoWrite: "Planning",
  AskUserQuestion: "Asking",
};

interface AgentNodeCardProps {
  selected: boolean;
  displayColor: string;
  displayName: string;
  Icon: any;
  agentId: string;
  status: AgentStatus;
  currentTool?: string;
  cwd?: string;
  originalCwd?: string;
  gitBranch?: string;
  remote?: string;
  creationProgress?: string;
  ticketId?: string;
  ticketTitle?: string;
  longRunningTool?: boolean;
  tokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  model?: string;
  command?: string;
  sleepEndTime?: number;
  isArchived?: boolean;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function AgentNodeCard({
  selected,
  displayColor,
  displayName,
  Icon,
  agentId,
  status,
  currentTool,
  cwd,
  originalCwd,
  gitBranch,
  remote,
  creationProgress,
  ticketId,
  ticketTitle,
  longRunningTool,
  tokens,
  totalTokens,
  contextTokens,
  model,
  command,
  sleepEndTime,
  isArchived,
  onArchive,
  onDelete,
}: AgentNodeCardProps) {
  const showTokensOnCard = useStore((s) => s.showTokensOnCard);
  const colorblindMode = useStore((s) => s.colorblindMode);
  const statusConfig = getStatusConfig(colorblindMode);
  const statusInfo = statusConfig[status] || statusConfig.idle;
  const isActive = statusInfo.isActive;
  const isToolCalling = status === "tool_calling";
  const isCreating = status === "creating";
  const needsAttention = statusInfo.needsAttention;
  const isWaiting = status === "waiting";
  const isCompacting = status === "compacting";
  const isCalm = isWaiting || isCompacting; // Calm states: subtle border, no glow

  // When cwd is a worktree root like .../universe/.isaac/worktree_pool/worktree-02,
  // the last segment "worktree-02" is meaningless — show the repo name instead.
  // If the agent cd's into a subdir, the last segment is already useful as-is.
  // Preserve local: use originalCwd (mother repo) if available
  const displayCwd = originalCwd || cwd;
  const dirName = displayCwd
    ? (displayCwd.match(/\/([^/]+)\/\.isaac\/worktree_pool\/worktree-\d+$/)?.[1]
      || displayCwd.split("/").pop()
      || displayCwd)
    : null;

  // Get display name for current tool
  const toolDisplay = currentTool ? (toolDisplayNames[currentTool] || currentTool) : null;

  // Sleep countdown timer
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!sleepEndTime) {
      setSleepRemaining(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((sleepEndTime - Date.now()) / 1000));
      setSleepRemaining(left > 0 ? left : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sleepEndTime]);

  return (
    <div
      className={`group relative w-[220px] rounded-lg transition-all duration-300 cursor-pointer ${
        selected ? "ring-1 ring-overlay-20" : ""
      }`}
      style={{
        backgroundColor: "var(--color-node-bg)",
        border: needsAttention
          ? `2px solid ${statusInfo.color}`
          : isActive || isCalm
          ? `1px solid ${statusInfo.color}40`
          : "1px solid var(--color-node-border)",
        boxShadow: needsAttention
          ? `0 0 16px ${statusInfo.color}40, 0 0 32px ${statusInfo.color}20, 0 4px 12px rgba(0, 0, 0, var(--shadow-opacity))`
          : isActive || isCalm
          ? `0 0 12px ${statusInfo.color}15, 0 4px 12px rgba(0, 0, 0, var(--shadow-opacity))`
          : selected
          ? `0 8px 24px rgba(0, 0, 0, calc(var(--shadow-opacity) * 1.5))`
          : `0 4px 12px rgba(0, 0, 0, var(--shadow-opacity))`,
      }}
    >
      {/* Animated effects for different states */}
      {isActive && !needsAttention && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${statusInfo.color}20, transparent)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s ease-in-out infinite',
          }}
        />
      )}
      {/* Pulsing glow for attention states */}
      {needsAttention && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            boxShadow: `0 0 20px ${statusInfo.color}50, 0 0 40px ${statusInfo.color}25`,
            animation: 'attention-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      {/* Hover action buttons */}
      {(onArchive || onDelete) && (
        <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              className={`p-1 rounded hover:bg-overlay-10 text-muted transition-colors ${isArchived ? "hover:text-green-400" : "hover:text-amber-400"}`}
              title={isArchived ? "Unarchive" : "Archive"}
            >
              <Archive className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 rounded hover:bg-overlay-10 text-muted hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Status banner */}
      <div
        className="px-3 py-1.5 flex items-center gap-2 relative"
        style={{ borderBottom: `1px solid ${statusInfo.color}20` }}
      >
        {/* Status icon */}
        {status === "running" || status === "tool_calling" || status === "creating" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: statusInfo.color }} />
        ) : status === "waiting_input" ? (
          <MessageSquare className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "waiting" ? (
          <Clock className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "compacting" ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: statusInfo.color }} />
        ) : status === "idle" ? (
          <Coffee className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "error" ? (
          <AlertTriangle className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : status === "disconnected" ? (
          <WifiOff className="w-3.5 h-3.5" style={{ color: statusInfo.color }} />
        ) : (
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusInfo.color }} />
        )}
        <span className="text-xs font-medium" style={{ color: statusInfo.color }}>
          {statusInfo.label}
        </span>
        {/* Sleep countdown timer */}
        {isWaiting && sleepRemaining != null && (
          <span className="text-[10px] flex items-center gap-1" style={{ color: statusInfo.color }}>
            <Clock className="w-2.5 h-2.5" />
            {formatSleepTime(sleepRemaining)}
          </span>
        )}
        {/* Show long-running indicator or current tool */}
        {!isWaiting && longRunningTool && (
          <span className="text-[10px] text-tertiary flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            Long task
          </span>
        )}
        {!isWaiting && isToolCalling && toolDisplay && !longRunningTool && (
          <span className="text-[10px] text-tertiary flex items-center gap-1">
            <Wrench className="w-2.5 h-2.5" />
            {toolDisplay}
          </span>
        )}
        {/* Preserve local: Show progress when creating worktree */}
        {isCreating && creationProgress && (
          <span className="text-[10px] text-blue-300 flex items-center gap-1 truncate max-w-[120px]">
            <Loader2 className="w-2.5 h-2.5 animate-spin flex-shrink-0" />
            {creationProgress}
          </span>
        )}
      </div>

      <div className="p-3 relative">
        {/* Agent name and icon */}
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${displayColor}20` }}
          >
            <Icon className="w-5 h-5" style={{ color: displayColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-primary truncate leading-tight">{displayName}</h3>
            <p className="text-[10px] text-muted">
              {command?.startsWith("isaac") ? "isaac" : command?.startsWith("claude") ? "claude" : null}
              {command?.startsWith("isaac") || command?.startsWith("claude") ? " · " : ""}
              {model ? formatModelName(model) : agentId}
            </p>
          </div>
        </div>

        {/* Ticket/Issue info */}
        {ticketId && (
          <div className="mt-2.5 px-2 py-1.5 rounded-md bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-semibold text-blue-400">{ticketId}</span>
            </div>
            {ticketTitle && (
              <p className="text-[10px] text-blue-300/70 truncate mt-0.5">{ticketTitle}</p>
            )}
          </div>
        )}

        {/* Repo, Branch & Tokens */}
        {(dirName || gitBranch || remote || (tokens != null && tokens > 0) || (totalTokens != null && totalTokens > 0)) && (
          <div className="mt-2 space-y-1">
            {/* Preserve local: remote field */}
            {remote && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/10 font-medium">
                  {remote}
                </span>
              </div>
            )}
            {dirName && (
              <div className="flex items-center gap-1.5">
                <Folder className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                <span className="text-[11px] text-tertiary font-mono truncate">{dirName}</span>
              </div>
            )}
            {gitBranch && (
              <div className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                <span className="text-[11px] text-purple-400 font-mono truncate">{gitBranch}</span>
              </div>
            )}
            {showTokensOnCard && tokens != null && tokens > 0 && (
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                <span className="text-[11px] text-tertiary font-mono">{formatTokens(tokens)} <span className="text-muted">session</span></span>
              </div>
            )}
            {showTokensOnCard && totalTokens != null && totalTokens > 0 && totalTokens !== tokens && (
              <div className="flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-faint flex-shrink-0" />
                <span className="text-[11px] text-muted font-mono">{formatTokens(totalTokens)} <span className="text-faint">all</span></span>
              </div>
            )}
          </div>
        )}

        {/* Context window progress bar (or raw count when bar is disabled) */}
        {contextTokens != null && contextTokens > 0 && (() => {
          const showBar = useStore.getState().showContextBar;
          const usedK = Math.round(contextTokens / 1_000);
          if (!showBar) {
            return (
              <div className="mt-1 px-0.5">
                <span className="text-[10px] text-muted font-mono">{usedK}K ctx</span>
              </div>
            );
          }
          const maxTokens = getContextWindowSize(model);
          const pct = Math.min(100, Math.round((contextTokens / maxTokens) * 100));
          const color = getContextColor(pct);
          return (
            <div className="mt-2 px-0.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-muted">Context</span>
                <span className="text-[10px] text-tertiary font-mono">{pct}%</span>
              </div>
              <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })()}

      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes attention-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
