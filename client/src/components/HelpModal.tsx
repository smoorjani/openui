import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RotateCcw, ChevronDown, Sparkles } from "lucide-react";
import type { ChangelogEntry } from "../data/changelog";

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
const mod = isMac ? "\u2318" : "Ctrl";

const shortcuts: { keys: string; desc: string }[] = [
  { keys: `Alt+1\u20139`, desc: "Select agent by position" },
  { keys: `Alt+[ / ]`, desc: "Previous / next agent" },
  { keys: `${mod}+I`, desc: "Jump to next agent needing input" },
  { keys: `${mod}+K`, desc: "Search conversations" },
  { keys: `Alt+N`, desc: "New agent" },
  { keys: `Alt+Shift+1\u20139`, desc: "Switch canvas by index" },
  { keys: `Alt+T`, desc: "New canvas" },
  { keys: `?`, desc: "Open this help panel" },
  { keys: "Esc", desc: "Close sidebar / dialogs" },
];

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  onRestartTour: () => void;
  unseenUpdates: ChangelogEntry[];
  olderUpdates: ChangelogEntry[];
  onMarkAsSeen: () => void;
}

function UpdateEntry({ entry, isNew }: { entry: ChangelogEntry; isNew?: boolean }) {
  return (
    <div className={`py-2 ${isNew ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-mono text-muted">{entry.date}</span>
        {isNew && (
          <span className="text-[9px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
            New
          </span>
        )}
      </div>
      <p className="text-xs font-medium text-zinc-200">{entry.title}</p>
      <p className="text-[11px] text-muted leading-relaxed mt-0.5">{entry.description}</p>
    </div>
  );
}

export function HelpModal({ open, onClose, onRestartTour, unseenUpdates, olderUpdates, onMarkAsSeen }: HelpModalProps) {
  const [showOlder, setShowOlder] = useState(false);
  const hasUpdates = unseenUpdates.length > 0 || olderUpdates.length > 0;

  // Mark as seen when modal opens with unseen updates
  useEffect(() => {
    if (open && unseenUpdates.length > 0) {
      onMarkAsSeen();
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-sm rounded-xl bg-surface border border-border shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <h2 className="text-sm font-semibold text-primary">Help</h2>
              <button
                onClick={onClose}
                className="text-muted hover:text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* What's New section */}
              {hasUpdates && (
                <div className="px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-semibold text-secondary">What's New</span>
                  </div>

                  {/* Unseen updates */}
                  {unseenUpdates.map((entry) => (
                    <UpdateEntry key={entry.id} entry={entry} isNew />
                  ))}

                  {/* Older updates (collapsible) */}
                  {olderUpdates.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowOlder(!showOlder)}
                        className="flex items-center gap-1 text-[11px] text-faint hover:text-tertiary transition-colors mt-1"
                      >
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${showOlder ? "rotate-180" : ""}`}
                        />
                        {showOlder ? "Hide" : "Show"} previous updates ({olderUpdates.length})
                      </button>
                      {showOlder &&
                        olderUpdates.map((entry) => (
                          <UpdateEntry key={entry.id} entry={entry} />
                        ))}
                    </>
                  )}
                </div>
              )}

              {/* Shortcuts list */}
              <div className="px-5 py-3">
                <span className="text-xs font-semibold text-secondary mb-2 block">Keyboard Shortcuts</span>
                <div className="space-y-0.5">
                  {shortcuts.map((s) => (
                    <div key={s.keys} className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-tertiary">{s.desc}</span>
                      <kbd className="text-[11px] font-mono text-secondary bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                        {s.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Restart tour */}
            <div className="px-5 py-4 border-t border-border flex-shrink-0">
              <button
                onClick={() => {
                  onRestartTour();
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-secondary text-xs font-medium hover:bg-elevated transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restart Onboarding Tour
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
