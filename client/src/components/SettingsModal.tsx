import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitBranch, Plus, Trash2, Folder, ChevronRight, LayoutGrid, List, Columns, Shield, Sun, Moon } from "lucide-react";
import { useStore } from "../stores/useStore";
import { useTerminalPool } from "../contexts/TerminalPoolContext";

interface WorktreeRepo {
  name: string;
  path: string;
  baseBranch: string;
  sparseCheckout?: boolean;
  sparseCheckoutPaths?: string[];
  remote?: string;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const { uiMode, setUiMode } = useStore();
  const notificationsEnabled = useStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useStore((s) => s.setNotificationsEnabled);
  const showTokensOnCard = useStore((s) => s.showTokensOnCard);
  const setShowTokensOnCard = useStore((s) => s.setShowTokensOnCard);
  const showContextBar = useStore((s) => s.showContextBar);
  const setShowContextBar = useStore((s) => s.setShowContextBar);
  const colorblindMode = useStore((s) => s.colorblindMode);
  const setColorblindMode = useStore((s) => s.setColorblindMode);
  const terminalPool = useTerminalPool();

  const [worktreeRepos, setWorktreeRepos] = useState<WorktreeRepo[]>([]);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPath, setNewRepoPath] = useState("");
  const [newRepoBaseBranch, setNewRepoBaseBranch] = useState("main");
  const [newRepoSparseCheckout, setNewRepoSparseCheckout] = useState(false);
  const [newRepoSparsePaths, setNewRepoSparsePaths] = useState("");
  const [newRepoRemote, setNewRepoRemote] = useState("");
  const [browsePath, setBrowsePath] = useState("");
  const [browseDirectories, setBrowseDirectories] = useState<{ name: string; path: string }[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [skipPermissions, setSkipPermissions] = useState(false);
  const [defaultBaseBranch, setDefaultBaseBranch] = useState("main");
  const [terminalScrollToBottom, setTerminalScrollToBottom] = useState(true);
  const [maxHistoryKB, setMaxHistoryKB] = useState(128);
  const [terminalFontFamily, setTerminalFontFamily] = useState('"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace');
  const [terminalFontSize, setTerminalFontSize] = useState(12);
  const [terminalFontWeight, setTerminalFontWeight] = useState<"400" | "500" | "700">("400");
  const [fontExpanded, setFontExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load existing config
  useEffect(() => {
    if (open) {
      fetch("/api/worktree/config")
        .then((res) => res.json())
        .then((config) => {
          setWorktreeRepos(config.worktreeRepos || []);
        })
        .catch(console.error);
      fetch("/api/settings")
        .then((res) => res.json())
        .then((settings) => {
          setSkipPermissions(settings.skipPermissions ?? false);
          setDefaultBaseBranch(settings.defaultBaseBranch || "main");
          const scrollEnabled = settings.terminalScrollToBottom !== false;
          setTerminalScrollToBottom(scrollEnabled);
          localStorage.setItem("openui-terminal-scroll", String(scrollEnabled));
          setMaxHistoryKB(settings.maxHistoryKB ?? 128);
          const fontFamily = settings.terminalFontFamily || '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace';
          const fontSize = settings.terminalFontSize ?? 12;
          const fontWeight = settings.terminalFontWeight || "400";
          setTerminalFontFamily(fontFamily);
          setTerminalFontSize(fontSize);
          setTerminalFontWeight(fontWeight);
          localStorage.setItem("openui-terminal-font-family", fontFamily);
          localStorage.setItem("openui-terminal-font-size", String(fontSize));
          localStorage.setItem("openui-terminal-font-weight", fontWeight);
        })
        .catch(console.error);
    } else {
      setShowAddRepo(false);
      setShowBrowser(false);
      resetNewRepoForm();
    }
  }, [open]);

  const resetNewRepoForm = () => {
    setNewRepoName("");
    setNewRepoPath("");
    setNewRepoBaseBranch("main");
    setNewRepoSparseCheckout(false);
    setNewRepoSparsePaths("");
    setNewRepoRemote("");
  };

  const handleBrowse = async (path?: string) => {
    try {
      const res = await fetch(`/api/browse?path=${encodeURIComponent(path || "~")}`);
      const data = await res.json();
      setBrowsePath(data.current);
      setBrowseDirectories(data.directories || []);
      setShowBrowser(true);
    } catch (e) {
      console.error("Failed to browse directories:", e);
    }
  };

  const handleSelectDirectory = (path: string) => {
    setNewRepoPath(path);
    const name = path.split("/").pop() || "Repo";
    if (!newRepoName) {
      setNewRepoName(name.charAt(0).toUpperCase() + name.slice(1));
    }
    setShowBrowser(false);
  };

  const handleAddRepo = async () => {
    if (!newRepoName.trim() || !newRepoPath.trim()) return;

    const sparsePaths = newRepoSparsePaths.trim()
      ? newRepoSparsePaths.split(/[,\s]+/).filter(Boolean)
      : undefined;

    const newRepo: WorktreeRepo = {
      name: newRepoName.trim(),
      path: newRepoPath.trim(),
      baseBranch: newRepoBaseBranch.trim() || "main",
      ...(newRepoSparseCheckout && { sparseCheckout: true }),
      ...(newRepoSparseCheckout && sparsePaths && { sparseCheckoutPaths: sparsePaths }),
      ...(newRepoRemote.trim() && { remote: newRepoRemote.trim() }),
    };

    const updatedRepos = [...worktreeRepos, newRepo];
    setWorktreeRepos(updatedRepos);

    try {
      await fetch("/api/worktree/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worktreeRepos: updatedRepos }),
      });
    } catch (e) {
      console.error("Failed to save worktree repos:", e);
    }

    setShowAddRepo(false);
    resetNewRepoForm();
  };

  const handleDeleteRepo = async (index: number) => {
    const updatedRepos = worktreeRepos.filter((_, i) => i !== index);
    setWorktreeRepos(updatedRepos);

    try {
      await fetch("/api/worktree/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worktreeRepos: updatedRepos }),
      });
    } catch (e) {
      console.error("Failed to save worktree repos:", e);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultBaseBranch,
          terminalScrollToBottom,
          maxHistoryKB,
          terminalFontFamily,
          terminalFontSize,
          terminalFontWeight,
        }),
      });

      // Sync to localStorage for instant client-side access by TerminalPool
      localStorage.setItem("openui-terminal-scroll", String(terminalScrollToBottom));
      localStorage.setItem("openui-terminal-font-family", terminalFontFamily);
      localStorage.setItem("openui-terminal-font-size", String(terminalFontSize));
      localStorage.setItem("openui-terminal-font-weight", terminalFontWeight);

      terminalPool.updateFontSettings();

      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setIsSaving(false);
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
            <div className="pointer-events-auto w-full max-w-md mx-4">
            <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-lg font-semibold text-primary">Settings</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-canvas transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-6 overflow-y-auto max-h-[60vh]">
                {/* Appearance */}
                <div>
                  <h3 className="text-sm font-medium text-primary mb-3">Appearance</h3>
                  <div className="space-y-2">
                    <label className="text-xs text-muted block mb-1.5">
                      Theme
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTheme("dark")}
                        className={`flex-1 px-3 py-2 rounded-md text-sm border transition-colors flex items-center justify-center gap-2 ${
                          theme === "dark"
                            ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                            : "border-border bg-canvas text-tertiary hover:text-primary hover:border-zinc-500"
                        }`}
                      >
                        <Moon className="w-3.5 h-3.5" />
                        Dark
                      </button>
                      <button
                        onClick={() => setTheme("light")}
                        className={`flex-1 px-3 py-2 rounded-md text-sm border transition-colors flex items-center justify-center gap-2 ${
                          theme === "light"
                            ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                            : "border-border bg-canvas text-tertiary hover:text-primary hover:border-zinc-500"
                        }`}
                      >
                        <Sun className="w-3.5 h-3.5" />
                        Light
                      </button>
                    </div>
                    <label className="flex items-center justify-between cursor-pointer pt-2">
                      <span className="text-xs text-tertiary">Colorblind-friendly status colors</span>
                      <button
                        onClick={() => setColorblindMode(!colorblindMode)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          colorblindMode ? "bg-green-600" : "bg-elevated"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            colorblindMode ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>

                {/* UI Mode */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-violet-500/20 flex items-center justify-center">
                      <LayoutGrid className="w-4 h-4 text-violet-400" />
                    </div>
                    <h3 className="text-sm font-medium text-primary">UI Mode</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setUiMode("canvas")}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-colors ${
                        uiMode === "canvas"
                          ? "border-violet-500 bg-violet-500/10 text-primary"
                          : "border-border bg-canvas text-tertiary hover:text-primary hover:border-zinc-500"
                      }`}
                    >
                      <LayoutGrid className="w-5 h-5" />
                      <span className="text-xs font-medium">Canvas</span>
                      <span className="text-[10px] text-muted">Drag nodes freely</span>
                    </button>
                    <button
                      onClick={() => setUiMode("list")}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-colors ${
                        uiMode === "list"
                          ? "border-violet-500 bg-violet-500/10 text-primary"
                          : "border-border bg-canvas text-tertiary hover:text-primary hover:border-zinc-500"
                      }`}
                    >
                      <List className="w-5 h-5" />
                      <span className="text-xs font-medium">List</span>
                      <span className="text-[10px] text-muted">Focused task view</span>
                    </button>
                    <button
                      onClick={() => setUiMode("focus")}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-colors ${
                        uiMode === "focus"
                          ? "border-violet-500 bg-violet-500/10 text-primary"
                          : "border-border bg-canvas text-tertiary hover:text-primary hover:border-zinc-500"
                      }`}
                    >
                      <Columns className="w-5 h-5" />
                      <span className="text-xs font-medium">Focus</span>
                      <span className="text-[10px] text-muted">Side-by-side terminals</span>
                    </button>
                  </div>
                </div>

                {/* Terminal Settings */}
                <div>
                  <h3 className="text-sm font-medium text-primary mb-3">Terminal</h3>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-tertiary">Auto-scroll to bottom on new output</span>
                      <button
                        onClick={() => setTerminalScrollToBottom(!terminalScrollToBottom)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          terminalScrollToBottom ? "bg-green-600" : "bg-elevated"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            terminalScrollToBottom ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </label>
                    <p className="text-xs text-faint">
                      {terminalScrollToBottom
                        ? "Terminal follows new output automatically."
                        : "Terminal stays at current scroll position when new output arrives."}
                    </p>

                    <div className="pt-2">
                      <button
                        onClick={() => setFontExpanded(!fontExpanded)}
                        className="flex items-center gap-1.5 text-xs text-muted hover:text-secondary transition-colors"
                      >
                        <span className={`transition-transform ${fontExpanded ? "rotate-90" : ""}`}>▶</span>
                        Font
                      </button>
                      {fontExpanded && (
                        <div className="mt-2 space-y-2">
                          <div>
                            <label className="text-xs text-muted block mb-1.5">Font Family</label>
                            {(() => {
                              const presets = [
                                { label: "JetBrains Mono", value: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace' },
                                { label: "SF Mono", value: '"SF Mono", Menlo, monospace' },
                                { label: "Menlo", value: "Menlo, monospace" },
                                { label: "Monaco", value: "Monaco, monospace" },
                                { label: "Consolas", value: "Consolas, monospace" },
                                { label: "Courier New", value: '"Courier New", monospace' },
                              ];
                              const isCustom = !presets.some((p) => p.value === terminalFontFamily);
                              return (
                                <>
                                  <select
                                    value={isCustom ? "__custom__" : terminalFontFamily}
                                    onChange={(e) => {
                                      if (e.target.value !== "__custom__") {
                                        setTerminalFontFamily(e.target.value);
                                      } else {
                                        setTerminalFontFamily("");
                                      }
                                    }}
                                    className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-primary text-sm focus:outline-none focus:border-zinc-500 transition-colors"
                                  >
                                    {presets.map(({ label, value }) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                    <option value="__custom__">Custom...</option>
                                  </select>
                                  {isCustom && (
                                    <input
                                      type="text"
                                      value={terminalFontFamily}
                                      onChange={(e) => setTerminalFontFamily(e.target.value)}
                                      placeholder="e.g. JetBrainsMono Nerd Font Mono"
                                      className="w-full mt-1.5 px-2 py-1.5 rounded-md bg-canvas border border-border text-primary text-xs placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors"
                                    />
                                  )}
                                </>
                              );
                            })()}
                          </div>

                          <div>
                            <label className="text-xs text-muted block mb-1.5">Font Size</label>
                            <div className="flex gap-2">
                              {([10, 12, 14, 16] as const).map((size) => (
                                <button
                                  key={size}
                                  onClick={() => setTerminalFontSize(size)}
                                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                                    terminalFontSize === size
                                      ? "bg-overlay-10 text-primary border-overlay-20"
                                      : "text-muted border-border hover:text-secondary hover:border-overlay-10"
                                  }`}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-xs text-muted block mb-1.5">Font Weight</label>
                            <div className="flex gap-2">
                              {([
                                { label: "Regular", value: "400" },
                                { label: "Medium", value: "500" },
                                { label: "Bold", value: "700" },
                              ] as const).map(({ label, value }) => (
                                <button
                                  key={value}
                                  onClick={() => setTerminalFontWeight(value)}
                                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                                    terminalFontWeight === value
                                      ? "bg-overlay-10 text-primary border-overlay-20"
                                      : "text-muted border-border hover:text-secondary hover:border-overlay-10"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Agent Cards */}
                <div>
                  <h3 className="text-sm font-medium text-primary mb-3">Agent Cards</h3>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-tertiary">Show token counts on cards</span>
                      <button
                        onClick={() => setShowTokensOnCard(!showTokensOnCard)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          showTokensOnCard ? "bg-green-600" : "bg-elevated"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            showTokensOnCard ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </label>
                    <p className="text-xs text-faint">
                      {showTokensOnCard
                        ? "Session and cumulative token counts are shown on agent cards."
                        : "Token counts are hidden to keep agent cards compact."}
                    </p>
                    <label className="flex items-center justify-between cursor-pointer pt-2">
                      <span className="text-xs text-tertiary">
                        Context progress bar
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/20 text-violet-400">BETA</span>
                      </span>
                      <button
                        onClick={() => setShowContextBar(!showContextBar)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          showContextBar ? "bg-green-600" : "bg-elevated"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            showContextBar ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </label>
                    <p className="text-xs text-faint">
                      {showContextBar
                        ? "Shows context window usage as a progress bar with model detection."
                        : "Shows raw context token count without progress bar."}
                    </p>
                  </div>
                </div>

                {/* Notifications */}
                <div>
                  <h3 className="text-sm font-medium text-primary mb-3">Notifications</h3>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-xs text-tertiary">Notify when agents need input</span>
                      <button
                        onClick={() => {
                          const next = !notificationsEnabled;
                          setNotificationsEnabled(next);
                          if (next && "Notification" in window && Notification.permission === "default") {
                            Notification.requestPermission();
                          }
                        }}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          notificationsEnabled ? "bg-green-600" : "bg-elevated"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            notificationsEnabled ? "translate-x-4" : ""
                          }`}
                        />
                      </button>
                    </label>
                    <p className="text-xs text-faint">
                      {notificationsEnabled
                        ? "Toast and native notifications when an agent is waiting."
                        : "No notifications when agents need input."}
                    </p>
                  </div>
                </div>

                {/* Performance */}
                <div>
                  <h3 className="text-sm font-medium text-primary mb-3">Performance</h3>
                  <div className="space-y-2">
                    <label className="text-xs text-tertiary block">Reconnect history size</label>
                    <div className="flex gap-2">
                      {([
                        { label: "Fast", kb: 64 },
                        { label: "Balanced", kb: 128 },
                        { label: "Full", kb: 512 },
                      ] as const).map(({ label, kb }) => (
                        <button
                          key={kb}
                          onClick={() => setMaxHistoryKB(kb)}
                          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                            maxHistoryKB === kb
                              ? "bg-overlay-10 text-primary border-overlay-20"
                              : "text-muted border-border hover:text-secondary hover:border-overlay-10"
                          }`}
                        >
                          {label} ({kb} KB)
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-faint">
                      How much terminal output to replay when reconnecting to an agent. Lower loads faster, higher preserves more scrollback.
                    </p>
                  </div>
                </div>

                {/* Skip Permissions */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-red-500/20 flex items-center justify-center">
                        <Shield className="w-4 h-4 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-primary">Skip Permissions</h3>
                        <p className="text-[10px] text-muted">Append --dangerously-skip-permissions to isaac</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const newValue = !skipPermissions;
                        setSkipPermissions(newValue);
                        fetch("/api/settings", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ skipPermissions: newValue }),
                        }).catch(console.error);
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        skipPermissions ? "bg-red-600" : "bg-elevated"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          skipPermissions ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Git Settings */}
                <div>
                  <h3 className="text-sm font-medium text-primary mb-3">Git</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted block mb-1.5">
                        Default base branch
                      </label>
                      <input
                        type="text"
                        value={defaultBaseBranch}
                        onChange={(e) => setDefaultBaseBranch(e.target.value)}
                        placeholder="main"
                        className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-primary text-sm placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors"
                      />
                    </div>

                    <p className="text-xs text-muted">
                      Branches automatically use git worktrees for isolation
                    </p>
                  </div>
                </div>

                {/* Worktree Repositories */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center">
                        <GitBranch className="w-4 h-4 text-orange-400" />
                      </div>
                      <h3 className="text-sm font-medium text-primary">Worktree Repositories</h3>
                    </div>
                    {!showAddRepo && (
                      <button
                        onClick={() => setShowAddRepo(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-tertiary hover:text-primary hover:bg-canvas transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-muted mb-3">
                    Repositories available for quick worktree creation via "New Worktree" button.
                  </p>

                  {/* Existing repos list */}
                  {worktreeRepos.length > 0 ? (
                    <div className="space-y-2 mb-3">
                      {worktreeRepos.map((repo, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 px-3 py-2 rounded-md bg-canvas border border-border group"
                        >
                          <Folder className="w-4 h-4 text-muted" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-primary truncate">{repo.name}</div>
                            <div className="text-xs text-faint font-mono truncate">{repo.path}</div>
                          </div>
                          <span className="text-xs text-muted px-1.5 py-0.5 rounded bg-surface">
                            {repo.baseBranch}
                          </span>
                          {repo.remote && (
                            <span className="text-[10px] text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/10">
                              {repo.remote}
                            </span>
                          )}
                          {repo.sparseCheckout && (
                            <span className="text-[10px] text-orange-400 px-1.5 py-0.5 rounded bg-orange-500/10">
                              sparse
                            </span>
                          )}
                          <button
                            onClick={() => handleDeleteRepo(index)}
                            className="p-1 rounded text-faint hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : !showAddRepo ? (
                    <div className="text-center py-4 text-xs text-faint">
                      No repositories configured
                    </div>
                  ) : null}

                  {/* Add new repo form */}
                  {showAddRepo && (
                    <div className="space-y-3 p-3 rounded-md bg-canvas border border-border">
                      <div>
                        <label className="text-xs text-muted block mb-1.5">Name</label>
                        <input
                          type="text"
                          value={newRepoName}
                          onChange={(e) => setNewRepoName(e.target.value)}
                          placeholder="MLflow"
                          className="w-full px-3 py-2 rounded-md bg-surface border border-border text-primary text-sm placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted block mb-1.5">Path</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newRepoPath}
                            onChange={(e) => setNewRepoPath(e.target.value)}
                            placeholder="/path/to/repo"
                            className="flex-1 px-3 py-2 rounded-md bg-surface border border-border text-primary text-sm placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                          />
                          <button
                            onClick={() => handleBrowse(newRepoPath || undefined)}
                            className="px-3 py-2 rounded-md bg-surface border border-border text-tertiary hover:text-primary hover:border-zinc-500 transition-colors"
                          >
                            <Folder className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Directory browser */}
                      {showBrowser && (
                        <div className="border border-border rounded-md bg-surface max-h-40 overflow-y-auto">
                          <div className="px-3 py-2 border-b border-border text-xs text-muted font-mono truncate bg-canvas sticky top-0">
                            {browsePath}
                          </div>
                          {browsePath !== "/" && (
                            <button
                              onClick={() => handleBrowse(browsePath.split("/").slice(0, -1).join("/") || "/")}
                              className="w-full px-3 py-1.5 text-left text-sm text-tertiary hover:bg-canvas flex items-center gap-2"
                            >
                              <ChevronRight className="w-3 h-3 rotate-180" />
                              ..
                            </button>
                          )}
                          {browseDirectories.map((dir) => (
                            <button
                              key={dir.path}
                              onClick={() => handleSelectDirectory(dir.path)}
                              className="w-full px-3 py-1.5 text-left text-sm text-secondary hover:bg-canvas flex items-center gap-2"
                            >
                              <Folder className="w-3 h-3 text-muted" />
                              {dir.name}
                            </button>
                          ))}
                          {browseDirectories.length === 0 && (
                            <div className="px-3 py-2 text-xs text-faint">No subdirectories</div>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-muted block mb-1.5">Base branch</label>
                        <input
                          type="text"
                          value={newRepoBaseBranch}
                          onChange={(e) => setNewRepoBaseBranch(e.target.value)}
                          placeholder="main"
                          className="w-full px-3 py-2 rounded-md bg-surface border border-border text-primary text-sm placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newRepoSparseCheckout}
                          onChange={(e) => setNewRepoSparseCheckout(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-600 bg-canvas text-orange-600 focus:ring-orange-500 focus:ring-offset-0"
                        />
                        <span className="text-xs text-secondary">Sparse checkout</span>
                      </label>

                      {newRepoSparseCheckout && (
                        <div>
                          <label className="text-xs text-muted block mb-1.5">Sparse checkout paths</label>
                          <input
                            type="text"
                            value={newRepoSparsePaths}
                            onChange={(e) => setNewRepoSparsePaths(e.target.value)}
                            placeholder="docs, src/lib, tests"
                            className="w-full px-3 py-2 rounded-md bg-surface border border-border text-primary text-sm placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                          />
                          <p className="text-[10px] text-faint mt-1">Comma or space separated directories</p>
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-muted block mb-1.5">Remote (optional)</label>
                        <input
                          type="text"
                          value={newRepoRemote}
                          onChange={(e) => setNewRepoRemote(e.target.value)}
                          placeholder="e.g. arca"
                          className="w-full px-3 py-2 rounded-md bg-surface border border-border text-primary text-sm placeholder-faint focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                        <p className="text-[10px] text-faint mt-1">SSH remote host for worktree creation (leave empty for local)</p>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => {
                            setShowAddRepo(false);
                            setShowBrowser(false);
                            resetNewRepoForm();
                          }}
                          className="px-3 py-1.5 rounded-md text-xs text-tertiary hover:text-primary hover:bg-surface transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddRepo}
                          disabled={!newRepoName.trim() || !newRepoPath.trim()}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Add Repository
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-sm text-tertiary hover:text-primary hover:bg-canvas transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-contrast hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
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
