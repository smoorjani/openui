import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Key, Check, AlertCircle, Loader2, ExternalLink, GitBranch, Plus, Trash2, Folder, ChevronRight } from "lucide-react";

interface WorktreeRepo {
  name: string;
  path: string;
  baseBranch: string;
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; user?: { name: string; email: string }; error?: string } | null>(null);
  const [defaultBaseBranch, setDefaultBaseBranch] = useState("main");
  const [createWorktree, setCreateWorktree] = useState(true);
  const [ticketPromptTemplate, setTicketPromptTemplate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [worktreeRepos, setWorktreeRepos] = useState<WorktreeRepo[]>([]);
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPath, setNewRepoPath] = useState("");
  const [newRepoBaseBranch, setNewRepoBaseBranch] = useState("main");
  const [browsePath, setBrowsePath] = useState("");
  const [browseDirectories, setBrowseDirectories] = useState<{ name: string; path: string }[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);

  // Load existing config
  useEffect(() => {
    if (open) {
      fetch("/api/linear/config")
        .then((res) => res.json())
        .then((config) => {
          setHasExistingKey(config.hasApiKey);
          setDefaultBaseBranch(config.defaultBaseBranch || "main");
          setCreateWorktree(config.createWorktree ?? true);
          setTicketPromptTemplate(config.ticketPromptTemplate || "");
        })
        .catch(console.error);

      fetch("/api/worktree/config")
        .then((res) => res.json())
        .then((config) => {
          setWorktreeRepos(config.worktreeRepos || []);
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

    const newRepo: WorktreeRepo = {
      name: newRepoName.trim(),
      path: newRepoPath.trim(),
      baseBranch: newRepoBaseBranch.trim() || "main",
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

  const handleValidate = async () => {
    if (!apiKey.trim()) return;

    setIsValidating(true);
    setValidationResult(null);

    try {
      const res = await fetch("/api/linear/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const result = await res.json();
      setValidationResult(result);
    } catch (e) {
      setValidationResult({ valid: false, error: "Failed to validate" });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await fetch("/api/linear/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: apiKey.trim() || undefined,
          defaultBaseBranch,
          createWorktree,
          ticketPromptTemplate: ticketPromptTemplate || undefined,
        }),
      });

      if (apiKey.trim()) {
        setHasExistingKey(true);
      }
      setApiKey("");
      setValidationResult(null);
      onClose();
    } catch (e) {
      console.error("Failed to save settings:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveKey = async () => {
    setIsSaving(true);
    try {
      await fetch("/api/linear/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "" }),
      });
      setHasExistingKey(false);
      setApiKey("");
      setValidationResult(null);
    } catch (e) {
      console.error("Failed to remove key:", e);
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
            <div className="bg-surface rounded-xl border border-border shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Settings</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-6 max-h-[60vh] overflow-y-auto">
                {/* Linear Integration */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded bg-indigo-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 7.5L7.5 3H21v13.5L16.5 21H3V7.5z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-white">Linear Integration</h3>
                  </div>

                  {hasExistingKey ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20">
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-400">API key configured</span>
                        <button
                          onClick={handleRemoveKey}
                          className="ml-auto text-xs text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-xs text-zinc-500">
                        You can start sessions from Linear tickets.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-zinc-500">
                        Connect Linear to start agent sessions from tickets.{" "}
                        <a
                          href="https://linear.app/settings/api"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5"
                        >
                          Get your API key
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                          <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => {
                              setApiKey(e.target.value);
                              setValidationResult(null);
                            }}
                            placeholder="lin_api_..."
                            className="w-full pl-9 pr-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                          />
                        </div>
                        <button
                          onClick={handleValidate}
                          disabled={!apiKey.trim() || isValidating}
                          className="px-3 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                        >
                          {isValidating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Validate"
                          )}
                        </button>
                      </div>

                      {validationResult && (
                        <div
                          className={`flex items-center gap-2 px-3 py-2 rounded-md ${
                            validationResult.valid
                              ? "bg-green-500/10 border border-green-500/20"
                              : "bg-red-500/10 border border-red-500/20"
                          }`}
                        >
                          {validationResult.valid ? (
                            <>
                              <Check className="w-4 h-4 text-green-500" />
                              <span className="text-sm text-green-400">
                                Connected as {validationResult.user?.name}
                              </span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-red-500" />
                              <span className="text-sm text-red-400">
                                {validationResult.error}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Git Settings */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-3">Git Settings</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-zinc-500 block mb-1.5">
                        Default base branch
                      </label>
                      <input
                        type="text"
                        value={defaultBaseBranch}
                        onChange={(e) => setDefaultBaseBranch(e.target.value)}
                        placeholder="main"
                        className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createWorktree}
                        onChange={(e) => setCreateWorktree(e.target.checked)}
                        className="w-4 h-4 rounded border-zinc-600 bg-canvas text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0"
                      />
                      <span className="text-sm text-zinc-300">
                        Create git worktree for ticket branches
                      </span>
                    </label>
                    <p className="text-xs text-zinc-600 ml-6">
                      Each ticket gets an isolated working directory
                    </p>
                  </div>
                </div>

                {/* Ticket Prompt Template */}
                <div>
                  <h3 className="text-sm font-medium text-white mb-3">Ticket Prompt</h3>
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-500">
                      Message sent to the agent when starting from a ticket. Use <code className="text-indigo-400">{"{{url}}"}</code>, <code className="text-indigo-400">{"{{id}}"}</code>, <code className="text-indigo-400">{"{{title}}"}</code> as placeholders.
                    </p>
                    <textarea
                      value={ticketPromptTemplate}
                      onChange={(e) => setTicketPromptTemplate(e.target.value)}
                      placeholder="Here is the ticket for this session: {{url}}&#10;&#10;Please use the Linear MCP tool or fetch the URL to read the full ticket details before starting work."
                      rows={4}
                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none font-mono"
                    />
                  </div>
                </div>

                {/* Worktree Repositories */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center">
                        <GitBranch className="w-4 h-4 text-orange-400" />
                      </div>
                      <h3 className="text-sm font-medium text-white">Worktree Repositories</h3>
                    </div>
                    {!showAddRepo && (
                      <button
                        onClick={() => setShowAddRepo(true)}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-zinc-500 mb-3">
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
                          <Folder className="w-4 h-4 text-zinc-500" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{repo.name}</div>
                            <div className="text-xs text-zinc-600 font-mono truncate">{repo.path}</div>
                          </div>
                          <span className="text-xs text-zinc-500 px-1.5 py-0.5 rounded bg-surface">
                            {repo.baseBranch}
                          </span>
                          <button
                            onClick={() => handleDeleteRepo(index)}
                            className="p-1 rounded text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : !showAddRepo ? (
                    <div className="text-center py-4 text-xs text-zinc-600">
                      No repositories configured
                    </div>
                  ) : null}

                  {/* Add new repo form */}
                  {showAddRepo && (
                    <div className="space-y-3 p-3 rounded-md bg-canvas border border-border">
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">Name</label>
                        <input
                          type="text"
                          value={newRepoName}
                          onChange={(e) => setNewRepoName(e.target.value)}
                          placeholder="MLflow"
                          className="w-full px-3 py-2 rounded-md bg-surface border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">Path</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newRepoPath}
                            onChange={(e) => setNewRepoPath(e.target.value)}
                            placeholder="/path/to/repo"
                            className="flex-1 px-3 py-2 rounded-md bg-surface border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                          />
                          <button
                            onClick={() => handleBrowse(newRepoPath || undefined)}
                            className="px-3 py-2 rounded-md bg-surface border border-border text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                          >
                            <Folder className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Directory browser */}
                      {showBrowser && (
                        <div className="border border-border rounded-md bg-surface max-h-40 overflow-y-auto">
                          <div className="px-3 py-2 border-b border-border text-xs text-zinc-500 font-mono truncate bg-canvas sticky top-0">
                            {browsePath}
                          </div>
                          {browsePath !== "/" && (
                            <button
                              onClick={() => handleBrowse(browsePath.split("/").slice(0, -1).join("/") || "/")}
                              className="w-full px-3 py-1.5 text-left text-sm text-zinc-400 hover:bg-canvas flex items-center gap-2"
                            >
                              <ChevronRight className="w-3 h-3 rotate-180" />
                              ..
                            </button>
                          )}
                          {browseDirectories.map((dir) => (
                            <button
                              key={dir.path}
                              onClick={() => handleSelectDirectory(dir.path)}
                              className="w-full px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-canvas flex items-center gap-2"
                            >
                              <Folder className="w-3 h-3 text-zinc-500" />
                              {dir.name}
                            </button>
                          ))}
                          {browseDirectories.length === 0 && (
                            <div className="px-3 py-2 text-xs text-zinc-600">No subdirectories</div>
                          )}
                        </div>
                      )}

                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">Base branch</label>
                        <input
                          type="text"
                          value={newRepoBaseBranch}
                          onChange={(e) => setNewRepoBaseBranch(e.target.value)}
                          placeholder="main"
                          className="w-full px-3 py-2 rounded-md bg-surface border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          onClick={() => {
                            setShowAddRepo(false);
                            setShowBrowser(false);
                            resetNewRepoForm();
                          }}
                          className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-surface transition-colors"
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
                  className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || (!!apiKey.trim() && !validationResult?.valid)}
                  className="px-4 py-1.5 rounded-md text-sm font-medium bg-white text-canvas hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
