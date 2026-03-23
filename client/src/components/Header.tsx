import { useState, useEffect, useRef } from "react";
import { Plus, Folder, Settings, GitBranch, AlertTriangle, Bot } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "../stores/useStore";
import { SettingsModal } from "./SettingsModal";
import { WorktreeModal } from "./WorktreeModal";
import { InvestigationModal } from "./InvestigationModal";

export function Header() {
  const { setAddAgentModalOpen, sessions, launchCwd, orchestratorOpen, setOrchestratorOpen } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [investigationOpen, setInvestigationOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key.toLowerCase()) {
          case "k":
            e.preventDefault();
            setAddAgentModalOpen(true);
            break;
          case "b":
            e.preventDefault();
            setWorktreeOpen(true);
            break;
          case "i":
            e.preventDefault();
            setInvestigationOpen(true);
            break;
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setAddAgentModalOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  return (
    <header className="h-14 px-4 flex items-center justify-between border-b border-border bg-canvas-dark">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-orange-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white" />
          </div>
          <span className="text-sm font-semibold text-white">OpenUI</span>
        </div>

        <div className="h-4 w-px bg-border mx-2" />

        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Folder className="w-3 h-3" />
          <span className="font-mono truncate max-w-[200px]">{launchCwd || "~"}</span>
        </div>
      </div>

      {/* Center - Session count */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface text-xs text-zinc-400">
          <div className={`w-1.5 h-1.5 rounded-full ${sessions.size > 0 ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <span>{sessions.size} agent{sessions.size !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-md text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
        <motion.button
          onClick={() => setOrchestratorOpen(!orchestratorOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface border text-sm font-medium transition-colors ${
            orchestratorOpen
              ? "border-violet-500 text-violet-200 bg-violet-900/30"
              : "border-violet-800/50 text-violet-300 hover:bg-violet-900/30 hover:text-violet-200"
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Bot className="w-4 h-4" />
          Orchestrator
        </motion.button>
        <div className="relative" ref={dropdownRef}>
          <motion.button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white text-canvas text-sm font-medium hover:bg-zinc-100 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Plus className="w-4 h-4" />
          </motion.button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-surface border border-border shadow-xl z-50 py-1">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-surface-active hover:text-white transition-colors"
                onClick={() => { setDropdownOpen(false); setAddAgentModalOpen(true); }}
              >
                <Plus className="w-4 h-4" />
                New Agent
                <kbd className="ml-auto text-[11px] text-zinc-500 font-mono">⌘K</kbd>
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-surface-active hover:text-white transition-colors"
                onClick={() => { setDropdownOpen(false); setWorktreeOpen(true); }}
              >
                <GitBranch className="w-4 h-4" />
                New Worktree
                <kbd className="ml-auto text-[11px] text-zinc-500 font-mono">⌘B</kbd>
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-surface-active hover:text-white transition-colors"
                onClick={() => { setDropdownOpen(false); setInvestigationOpen(true); }}
              >
                <AlertTriangle className="w-4 h-4" />
                New Investigation
                <kbd className="ml-auto text-[11px] text-zinc-500 font-mono">⌘I</kbd>
              </button>
            </div>
          )}
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorktreeModal open={worktreeOpen} onClose={() => setWorktreeOpen(false)} />
      <InvestigationModal open={investigationOpen} onClose={() => setInvestigationOpen(false)} />
    </header>
  );
}
