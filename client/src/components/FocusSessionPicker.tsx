import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Search, ChevronDown, ChevronRight } from "lucide-react";
import { useStore, type ListSection, type AgentSession } from "../stores/useStore";
import { WorkspaceTabs } from "./WorkspaceTabs";

interface FocusSessionPickerProps {
  open: boolean;
  onClose: () => void;
}

type SessionEntry = [string, AgentSession];

const BACKLOG_SECTIONS = new Set(["backlog-new", "backlog-on-hold"]);
const IN_PROGRESS_MAP: Record<string, string> = {
  sprint: "in-progress",
  oncall: "oncall-in-progress",
};

function CollapsibleSection({
  section,
  entries,
  focusSessions,
  toggle,
}: {
  section: ListSection;
  entries: SessionEntry[];
  focusSessions: string[];
  toggle: (nodeId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-canvas rounded transition-colors"
      >
        <Chevron className="w-3 h-3 text-muted flex-shrink-0" />
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: section.color }} />
        <span className="text-xs font-medium text-secondary">{section.label}</span>
        <span className="text-[10px] text-faint">({entries.length})</span>
      </button>
      {!collapsed && (
        <div className="space-y-1 pl-3 pr-1">
          {entries.map(([nodeId, session]) => (
            <SessionRow key={nodeId} nodeId={nodeId} session={session} checked={focusSessions.includes(nodeId)} toggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  nodeId,
  session,
  checked,
  toggle,
}: {
  nodeId: string;
  session: AgentSession;
  checked: boolean;
  toggle: (nodeId: string) => void;
}) {
  const name = session.customName || session.agentName;
  return (
    <button
      onClick={() => toggle(nodeId)}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
        checked
          ? "bg-violet-500/10 border border-violet-500/30"
          : "hover:bg-canvas border border-transparent"
      }`}
    >
      <div
        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
          checked ? "bg-violet-500" : "border border-border"
        }`}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-primary truncate">{name}</div>
        <div className="text-xs text-muted truncate">
          {session.status} {session.gitBranch ? `· ${session.gitBranch}` : ""}
        </div>
      </div>
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: session.customColor || session.color }}
      />
    </button>
  );
}

export function FocusSessionPicker({ open, onClose }: FocusSessionPickerProps) {
  const sessions = useStore((s) => s.sessions);
  const focusSessions = useStore((s) => s.focusSessions);
  const addFocusSession = useStore((s) => s.addFocusSession);
  const removeFocusSession = useStore((s) => s.removeFocusSession);
  const updateSession = useStore((s) => s.updateSession);
  const listSections = useStore((s) => s.listSections);
  const activeWorkspace = useStore((s) => s.activeWorkspace);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allSessions: SessionEntry[] = Array.from(sessions.entries())
    .filter(([, s]) => !s.archived && s.agentName !== "Orchestrator")
    .filter(([, s]) => {
      if (!query) return true;
      const q = query.toLowerCase();
      const name = (s.customName || s.agentName).toLowerCase();
      const branch = (s.gitBranch || "").toLowerCase();
      const status = s.status.toLowerCase();
      return name.includes(q) || branch.includes(q) || status.includes(q);
    })
    .sort((a, b) => (a[1].customName || a[1].agentName).localeCompare(b[1].customName || b[1].agentName));

  const toggle = (nodeId: string) => {
    if (focusSessions.includes(nodeId)) {
      removeFocusSession(nodeId);
    } else {
      addFocusSession(nodeId);
      // Auto-move to In Progress if in backlog or uncategorized
      const session = sessions.get(nodeId);
      if (session) {
        const catId = session.categoryId;
        const isBacklog = catId && BACKLOG_SECTIONS.has(catId);
        const isUncategorized = !catId || !listSections.find((s) => s.id === catId);
        if (isBacklog || isUncategorized) {
          const targetSection = IN_PROGRESS_MAP[activeWorkspace];
          if (targetSection) {
            updateSession(nodeId, { categoryId: targetSection });
            fetch(`/api/sessions/${session.sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ categoryId: targetSection }),
            }).catch(console.error);
          }
        }
      }
    }
  };

  // Filter sections to active workspace only
  const visibleSections = listSections.filter((s) => s.workspace === activeWorkspace);

  const sessionsBySection = new Map<string, SessionEntry[]>();

  for (const section of visibleSections) {
    sessionsBySection.set(section.id, []);
  }
  for (const entry of allSessions) {
    const catId = entry[1].categoryId;
    if (catId && sessionsBySection.has(catId)) {
      sessionsBySection.get(catId)!.push(entry);
    } else {
      // Uncategorized sessions go into backlog-new
      const backlogNew = sessionsBySection.get("backlog-new");
      if (backlogNew) {
        backlogNew.push(entry);
      }
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-sm mx-4">
              <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden max-h-[60vh] flex flex-col">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-primary">Focus Sessions</h2>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-canvas transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="px-3 pt-2 pb-1">
                  <WorkspaceTabs />
                </div>
                <div className="px-3 pt-1.5 pb-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, branch, or status..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-md bg-canvas border border-border text-primary text-xs placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="px-3 pb-3 overflow-y-auto space-y-1">
                  {allSessions.length === 0 && (
                    <p className="text-xs text-muted text-center py-4">No sessions available</p>
                  )}
                  {visibleSections.map((section) => {
                    const entries = sessionsBySection.get(section.id) || [];
                    if (entries.length === 0) return null;
                    return (
                      <CollapsibleSection
                        key={section.id}
                        section={section}
                        entries={entries}
                        focusSessions={focusSessions}
                        toggle={toggle}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
