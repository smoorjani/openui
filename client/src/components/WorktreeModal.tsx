import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, GitBranch, Loader2, ChevronDown } from "lucide-react";
import { useStore } from "../stores/useStore";

interface WorktreeRepo {
  name: string;
  path: string;
  baseBranch: string;
}

interface WorktreeModalProps {
  open: boolean;
  onClose: () => void;
}

export function WorktreeModal({ open, onClose }: WorktreeModalProps) {
  const { addSession, addNode, nodes } = useStore();
  const [repos, setRepos] = useState<WorktreeRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<WorktreeRepo | null>(null);
  const [branchName, setBranchName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setError(null);
      fetch("/api/worktree/config")
        .then((res) => res.json())
        .then((config) => {
          setRepos(config.worktreeRepos || []);
          if (config.worktreeRepos?.length > 0) {
            setSelectedRepo(config.worktreeRepos[0]);
          }
        })
        .catch((e) => {
          console.error("Failed to load worktree config:", e);
          setError("Failed to load repository configuration");
        })
        .finally(() => setIsLoading(false));
    } else {
      setBranchName("");
      setError(null);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!selectedRepo || !branchName.trim()) return;

    setIsCreating(true);
    setError(null);

    try {
      const nodeId = `node-${Date.now()}`;
      const displayName = branchName.trim();
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: "claude",
          agentName: "Claude Code",
          command: "claude",
          cwd: selectedRepo.path,
          branchName: displayName,
          baseBranch: selectedRepo.baseBranch,
          createWorktree: true,
          nodeId,
          customName: displayName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create session");
      }

      const maxX = nodes.reduce((max, n) => Math.max(max, (n.position?.x || 0)), 0);
      const newNode = {
        id: nodeId,
        type: "agent",
        position: { x: maxX + 420, y: 100 },
        data: { nodeId, label: displayName },
      };
      addNode(newNode);

      addSession(nodeId, {
        id: nodeId,
        sessionId: data.sessionId,
        agentId: "claude",
        agentName: "Claude Code",
        customName: displayName,
        command: "claude",
        color: "#F97316",
        createdAt: new Date().toISOString(),
        cwd: data.cwd || selectedRepo.path,
        gitBranch: data.gitBranch || branchName.trim(),
        originalCwd: selectedRepo.path,
        status: "running",
      });

      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to create worktree session");
    } finally {
      setIsCreating(false);
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
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center">
                      <GitBranch className="w-4 h-4 text-orange-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-white">New Worktree</h2>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
                    </div>
                  ) : repos.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm text-zinc-400 mb-2">
                        No repositories configured
                      </p>
                      <p className="text-xs text-zinc-600">
                        Add repositories in Settings to use worktrees
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">
                          Repository
                        </label>
                        <div className="relative">
                          <select
                            value={selectedRepo?.path || ""}
                            onChange={(e) => {
                              const repo = repos.find((r) => r.path === e.target.value);
                              setSelectedRepo(repo || null);
                            }}
                            className="w-full px-3 py-2 pr-8 rounded-md bg-canvas border border-border text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors appearance-none cursor-pointer"
                          >
                            {repos.map((repo) => (
                              <option key={repo.path} value={repo.path}>
                                {repo.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                        </div>
                        {selectedRepo && (
                          <p className="text-xs text-zinc-600 mt-1 font-mono truncate">
                            {selectedRepo.path}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-xs text-zinc-500 block mb-1.5">
                          Branch name
                        </label>
                        <input
                          type="text"
                          value={branchName}
                          onChange={(e) => setBranchName(e.target.value)}
                          placeholder="feature/my-feature"
                          className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && branchName.trim() && selectedRepo) {
                              handleCreate();
                            }
                          }}
                        />
                        {selectedRepo && (
                          <p className="text-xs text-zinc-600 mt-1">
                            Based on <span className="text-zinc-400">{selectedRepo.baseBranch}</span>
                          </p>
                        )}
                      </div>

                      {error && (
                        <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                          {error}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-canvas transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={isCreating || !branchName.trim() || !selectedRepo || repos.length === 0}
                    className="px-4 py-1.5 rounded-md text-sm font-medium bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <GitBranch className="w-4 h-4" />
                        Create & Start Claude
                      </>
                    )}
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
