import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Search } from "lucide-react";
import { useStore } from "../stores/useStore";

interface FocusSessionPickerProps {
  open: boolean;
  onClose: () => void;
}

export function FocusSessionPicker({ open, onClose }: FocusSessionPickerProps) {
  const sessions = useStore((s) => s.sessions);
  const focusSessions = useStore((s) => s.focusSessions);
  const addFocusSession = useStore((s) => s.addFocusSession);
  const removeFocusSession = useStore((s) => s.removeFocusSession);

  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allSessions = Array.from(sessions.entries())
    .filter(([, s]) => !s.archived)
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
    }
  };

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
                <div className="px-3 pt-3 pb-1.5">
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
                  {allSessions.map(([nodeId, session]) => {
                    const checked = focusSessions.includes(nodeId);
                    const name = session.customName || session.agentName;
                    return (
                      <button
                        key={nodeId}
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
