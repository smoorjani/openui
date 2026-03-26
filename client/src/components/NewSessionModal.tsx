import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  FolderOpen,
  FolderPlus,
  Terminal,
  Loader2,
  AlertCircle,
  Home,
  ArrowUp,
  Clock,
  ChevronDown,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useStore, Agent, AgentSession } from "../stores/useStore";

interface NewSessionModalProps {
  open: boolean;
  onClose: () => void;
  existingSession?: AgentSession;
  existingNodeId?: string;
}

// Node dimensions for collision detection
const NODE_WIDTH = 200;
const NODE_HEIGHT = 120;
const SPACING = 24;

function findFreePosition(
  targetX: number,
  targetY: number,
  existingNodes: { position?: { x: number; y: number } }[],
): { x: number; y: number } {
  const GRID = SPACING;
  const startX = Math.round(targetX / GRID) * GRID;
  const startY = Math.round(targetY / GRID) * GRID;

  const validNodes = existingNodes.filter(
    (n): n is { position: { x: number; y: number } } =>
      n.position !== undefined &&
      typeof n.position.x === "number" &&
      typeof n.position.y === "number"
  );

  const isOverlapping = (x: number, y: number) => {
    for (const n of validNodes) {
      if (
        Math.abs(x - n.position.x) < NODE_WIDTH + SPACING &&
        Math.abs(y - n.position.y) < NODE_HEIGHT + SPACING
      )
        return true;
    }
    return false;
  };

  for (let radius = 0; radius <= 20; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = startX + dx * (NODE_WIDTH + SPACING);
        const y = startY + dy * (NODE_HEIGHT + SPACING);
        if (!isOverlapping(x, y)) return { x, y };
      }
    }
  }

  return { x: startX, y: startY };
}

const FALLBACK_CWD = "~";
const FALLBACK_REMOTE_CWD = "~";
const MAX_RECENT_DIRS = 5;

const recentDirsKey = (host?: string) =>
  host ? `openui-recent-dirs-${host}` : "openui-recent-dirs";

const loadRecentDirs = (host?: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(recentDirsKey(host)) || "[]");
  } catch {
    return [];
  }
};

const saveRecentDir = (dir: string, host?: string) => {
  if (!dir) return;
  const key = recentDirsKey(host);
  const recent = loadRecentDirs(host).filter((d) => d !== dir);
  recent.unshift(dir);
  localStorage.setItem(key, JSON.stringify(recent.slice(0, MAX_RECENT_DIRS)));
};

export function NewSessionModal({
  open,
  onClose,
  existingSession,
  existingNodeId,
}: NewSessionModalProps) {
  const { agents, addNode, addSession, updateSession, nodes, launchCwd } =
    useStore();

  const reactFlowInstance = useReactFlow();
  const isReplacing = !!existingSession;

  // Form state
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [cwd, setCwd] = useState("");
  const [customName, setCustomName] = useState("");
  const [commandArgs, setCommandArgs] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [useTeam, setUseTeam] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Directory picker state
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [dirBrowsePath, setDirBrowsePath] = useState("");
  const [dirBrowseParent, setDirBrowseParent] = useState<string | null>(null);
  const [dirBrowseDirs, setDirBrowseDirs] = useState<
    { name: string; path: string }[]
  >([]);
  const [dirBrowseLoading, setDirBrowseLoading] = useState(false);
  const [dirBrowseError, setDirBrowseError] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Remote host state
  const [remoteHosts, setRemoteHosts] = useState<string[]>([]);
  const [remote, setRemote] = useState<string>("");

  // User-configurable defaults from .openui/config.json
  const [defaultCwd, setDefaultCwd] = useState(FALLBACK_CWD);
  const [defaultRemoteCwd, setDefaultRemoteCwd] = useState(FALLBACK_REMOTE_CWD);

  // Recent directories
  const [recentDirs, setRecentDirs] = useState<string[]>([]);

  const [initialized, setInitialized] = useState(false);

  // Update cwd, recent dirs, and close dir picker when remote changes
  useEffect(() => {
    setShowDirPicker(false);
    setCwd(remote ? defaultRemoteCwd : defaultCwd);
    setRecentDirs(loadRecentDirs(remote || undefined));
  }, [remote, defaultCwd, defaultRemoteCwd]);

  // Reset form when modal opens
  useEffect(() => {
    if (open && !initialized) {
      const claudeAgent = agents.find((a) => a.id === "claude");

      // Fetch user settings (defaultCwd, defaultRemoteCwd) from config
      fetch("/api/settings")
        .then((r) => r.json())
        .then((settings) => {
          const localCwd = settings.defaultCwd || FALLBACK_CWD;
          const remoteCwd = settings.defaultRemoteCwd || FALLBACK_REMOTE_CWD;
          setDefaultCwd(localCwd);
          setDefaultRemoteCwd(remoteCwd);
          if (!existingSession) {
            setCwd(localCwd);
          }
        })
        .catch(() => {});

      if (existingSession) {
        const agent = agents.find((a) => a.id === existingSession.agentId);
        setSelectedAgent(agent || claudeAgent || null);
        setCwd(existingSession.cwd);
        setCustomName(existingSession.customName || "");
        setCommandArgs("");
      } else {
        setSelectedAgent(claudeAgent || null);
        setCwd(defaultCwd);
        setCustomName("");
        setCommandArgs("");
      }
      setRemote("");
      setInitialPrompt("");
      setUseTeam(false);
      setShowAdvanced(false);
      setRecentDirs(loadRecentDirs());
      setInitialized(true);
      fetch("/api/remotes")
        .then((r) => r.json())
        .then(setRemoteHosts)
        .catch(() => {});
    } else if (!open) {
      setInitialized(false);
    }
  }, [open, initialized, existingSession, agents]);

  // Directory browsing
  const browsePath = async (path?: string) => {
    setDirBrowseLoading(true);
    setDirBrowseError(null);
    setShowNewFolder(false);
    try {
      const params = new URLSearchParams();
      if (path) params.set("path", path);
      if (remote) params.set("remote", remote);
      const res = await fetch(`/api/browse?${params.toString()}`);
      const data = await res.json();
      if (data.error) {
        setDirBrowseError(data.error);
      } else {
        setDirBrowsePath(data.current);
        setDirBrowseParent(data.parent);
        setDirBrowseDirs(data.directories);
      }
    } catch (e: any) {
      setDirBrowseError(e.message);
    } finally {
      setDirBrowseLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !dirBrowsePath) return;
    setCreatingFolder(true);
    try {
      const fullPath = `${dirBrowsePath}/${newFolderName.trim()}`;
      const res = await fetch("/api/mkdir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, ...(remote && { remote }) }),
      });
      const data = await res.json();
      if (data.error) {
        setDirBrowseError(data.error);
      } else {
        setNewFolderName("");
        setShowNewFolder(false);
        await browsePath(dirBrowsePath);
        selectDirectory(fullPath);
      }
    } catch (e: any) {
      setDirBrowseError(e.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const openDirPicker = () => {
    setShowDirPicker(true);
    browsePath(remote ? defaultRemoteCwd : cwd || launchCwd);
  };

  const selectDirectory = (path: string) => {
    setCwd(path);
    setShowDirPicker(false);
  };

  const handleClose = () => onClose();

  const handleCreate = async () => {
    if (!selectedAgent) return;
    setIsCreating(true);

    try {
      let workingDir =
        cwd || (isReplacing ? existingSession?.cwd : null) || launchCwd;

      // Create team directory if team mode is enabled
      if (useTeam && customName.trim()) {
        const teamSlug = customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const homeDir = remote ? defaultRemoteCwd : defaultCwd;
        const teamDir = `${homeDir}/teams/${teamSlug}`;
        await fetch("/api/mkdir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: teamDir, ...(remote && { remote }) }),
        });
        workingDir = teamDir;
      }

      saveRecentDir(workingDir, remote || undefined);
      const fullCommand = selectedAgent.command
        ? commandArgs
          ? `${selectedAgent.command} ${commandArgs}`
          : selectedAgent.command
        : commandArgs;

      if (isReplacing && existingSession && existingNodeId) {
        await fetch(`/api/sessions/${existingSession.sessionId}`, {
          method: "DELETE",
        });

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            cwd: workingDir,
            nodeId: existingNodeId,
            customName: customName || existingSession.customName,
            customColor: existingSession.customColor,
            ...(remote && { remote }),
            ...(initialPrompt.trim() && { initialPrompt: initialPrompt.trim() }),
            ...(useTeam && { useTeam: true }),
          }),
        });

        if (res.ok) {
          const {
            sessionId: newSessionId,
            gitBranch,
            cwd: newCwd,
          } = await res.json();
          updateSession(existingNodeId, {
            sessionId: newSessionId,
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            cwd: newCwd || workingDir,
            status: "idle",
            isRestored: false,
            gitBranch: gitBranch || undefined,
            remote: remote || undefined,
          });
        }
      } else {
        const viewport = reactFlowInstance.getViewport();
        const viewportBounds = document
          .querySelector(".react-flow")
          ?.getBoundingClientRect();
        const viewportWidth = viewportBounds?.width || window.innerWidth;
        const viewportHeight = viewportBounds?.height || window.innerHeight;
        const centerX = (-viewport.x + viewportWidth / 2) / viewport.zoom;
        const centerY = (-viewport.y + viewportHeight / 2) / viewport.zoom;
        const { x, y } = findFreePosition(centerX, centerY, nodes);

        const nodeId = `node-${Date.now()}-0`;
        const agentName = customName || selectedAgent.name;

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: selectedAgent.id,
            agentName: selectedAgent.name,
            command: fullCommand,
            cwd: workingDir,
            nodeId,
            customName: customName || undefined,
            ...(remote && { remote }),
            ...(initialPrompt.trim() && { initialPrompt: initialPrompt.trim() }),
            ...(useTeam && { useTeam: true }),
          }),
        });

        const { sessionId, gitBranch, cwd: newCwd } = await res.json();

        addNode({
          id: nodeId,
          type: "agent",
          position: { x, y },
          data: {
            label: agentName,
            agentId: selectedAgent.id,
            color: selectedAgent.color,
            icon: selectedAgent.icon,
            sessionId,
          },
        });

        addSession(nodeId, {
          id: nodeId,
          sessionId,
          agentId: selectedAgent.id,
          agentName: selectedAgent.name,
          command: fullCommand,
          color: selectedAgent.color,
          createdAt: new Date().toISOString(),
          cwd: newCwd || workingDir,
          gitBranch: gitBranch || undefined,
          status: "idle",
          customName: customName || undefined,
          remote: remote || undefined,
        });
      }

      handleClose();
    } catch (error) {
      console.error("Failed to create session:", error);
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
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-md mx-4">
              <div className="rounded-xl bg-surface border border-border shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="px-5 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
                  <h2 className="text-base font-semibold text-white">
                    {isReplacing ? "New Session" : "New Agent"}
                  </h2>
                  <button
                    onClick={handleClose}
                    className="w-7 h-7 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Name */}
                  {!isReplacing && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs text-zinc-500">
                          Name {useTeam ? "" : "(optional)"}
                        </label>
                        <input
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          placeholder={selectedAgent?.name || "My Agent"}
                          className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useTeam}
                          onChange={(e) => setUseTeam(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-600 bg-canvas text-violet-600 focus:ring-violet-500 focus:ring-offset-0"
                        />
                        <span className="text-sm text-zinc-300">Use team</span>
                        <span className="text-[10px] text-zinc-600">{"Creates ~/teams/<name> and enables agent teams"}</span>
                      </label>
                    </>
                  )}

                  {/* Initial prompt */}
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">
                      Prompt (optional)
                    </label>
                    <textarea
                      value={initialPrompt}
                      onChange={(e) => setInitialPrompt(e.target.value)}
                      placeholder="What should this agent work on?"
                      rows={2}
                      className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Run on (local vs remote) */}
                  {remoteHosts.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs text-zinc-500">Run on</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRemote("")}
                          className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            !remote
                              ? "bg-white text-canvas"
                              : "bg-canvas border border-border text-zinc-400 hover:text-white hover:border-zinc-500"
                          }`}
                        >
                          Local
                        </button>
                        {remoteHosts.map((host) => (
                          <button
                            key={host}
                            onClick={() => setRemote(host)}
                            className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                              remote === host
                                ? "bg-white text-canvas"
                                : "bg-canvas border border-border text-zinc-400 hover:text-white hover:border-zinc-500"
                            }`}
                          >
                            {host}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Advanced options */}
                  <div>
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform ${
                          showAdvanced ? "" : "-rotate-90"
                        }`}
                      />
                      Advanced
                    </button>

                    {showAdvanced && (
                      <div className="mt-3 space-y-4">
                        {/* Command arguments */}
                        <div className="space-y-2">
                          <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                            <Terminal className="w-3 h-3" />
                            {selectedAgent?.command
                              ? "Arguments"
                              : "Command"}
                          </label>
                          <input
                            type="text"
                            value={commandArgs}
                            onChange={(e) => setCommandArgs(e.target.value)}
                            placeholder={
                              selectedAgent?.command
                                ? "e.g. --model opus or --resume"
                                : "e.g. ralph --monitor"
                            }
                            className="w-full px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                          />
                          {selectedAgent &&
                            (selectedAgent.command || commandArgs) && (
                              <p className="text-[10px] text-zinc-600 font-mono">
                                {selectedAgent.command}
                                {selectedAgent.command && commandArgs
                                  ? " "
                                  : ""}
                                {commandArgs}
                              </p>
                            )}
                        </div>

                        {/* Working directory */}
                        <div className="space-y-2">
                          <label className="text-xs text-zinc-500 flex items-center gap-1.5">
                            <FolderOpen className="w-3 h-3" />
                            Working Directory
                          </label>
                          {recentDirs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {recentDirs.map((dir) => (
                                <button
                                  key={dir}
                                  onClick={() => setCwd(dir)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                                    cwd === dir
                                      ? "bg-white/10 text-white border border-zinc-500"
                                      : "bg-canvas border border-border text-zinc-400 hover:text-white hover:border-zinc-500"
                                  }`}
                                >
                                  <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                                  {dir.split("/").slice(-2).join("/")}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={cwd}
                              onChange={(e) => setCwd(e.target.value)}
                              placeholder={
                                existingSession?.cwd || launchCwd || "~/"
                              }
                              className="flex-1 px-3 py-2 rounded-md bg-canvas border border-border text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors font-mono"
                            />
                            <button
                              type="button"
                              onClick={openDirPicker}
                              className="px-3 py-2 rounded-md bg-canvas border border-border text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                              title="Browse directories"
                            >
                              <FolderOpen className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Directory picker */}
                          {showDirPicker && (
                            <div className="rounded-md border border-border bg-canvas overflow-hidden">
                              <div className="px-3 py-2 bg-surface border-b border-border flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {dirBrowseParent && (
                                    <button
                                      onClick={() =>
                                        browsePath(dirBrowseParent)
                                      }
                                      className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                                      title="Go up"
                                    >
                                      <ArrowUp className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => browsePath("~")}
                                    className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                                    title="Home directory"
                                  >
                                    <Home className="w-4 h-4" />
                                  </button>
                                  <span
                                    className="text-xs font-mono text-zinc-400 truncate"
                                    title={dirBrowsePath}
                                  >
                                    {dirBrowsePath}
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    setShowNewFolder(!showNewFolder);
                                    setNewFolderName("");
                                  }}
                                  className="p-1 rounded hover:bg-surface-active text-zinc-400 hover:text-white transition-colors flex-shrink-0 ml-1"
                                  title="New folder"
                                >
                                  <FolderPlus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setShowDirPicker(false)}
                                  className="p-1 rounded hover:bg-surface-active text-zinc-500 hover:text-white transition-colors flex-shrink-0 ml-1"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {showNewFolder && (
                                <div className="px-3 py-2 border-b border-border flex gap-2">
                                  <input
                                    type="text"
                                    value={newFolderName}
                                    onChange={(e) =>
                                      setNewFolderName(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                      e.key === "Enter" && handleCreateFolder()
                                    }
                                    placeholder="Folder name"
                                    autoFocus
                                    className="flex-1 px-2 py-1 rounded bg-surface border border-border text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                                  />
                                  <button
                                    onClick={handleCreateFolder}
                                    disabled={
                                      !newFolderName.trim() || creatingFolder
                                    }
                                    className="px-2 py-1 rounded bg-orange-600 text-white text-xs font-medium hover:bg-orange-500 disabled:opacity-50 transition-colors"
                                  >
                                    {creatingFolder ? "..." : "Create"}
                                  </button>
                                </div>
                              )}

                              <div className="max-h-40 overflow-y-auto">
                                {dirBrowseLoading ? (
                                  <div className="p-4 text-center">
                                    <Loader2 className="w-4 h-4 text-zinc-500 animate-spin mx-auto" />
                                  </div>
                                ) : dirBrowseError ? (
                                  <div className="p-3 text-center">
                                    <AlertCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
                                    <p className="text-xs text-red-400">
                                      {dirBrowseError}
                                    </p>
                                  </div>
                                ) : dirBrowseDirs.length === 0 ? (
                                  <div className="p-4 text-center text-zinc-500 text-xs">
                                    No subdirectories
                                  </div>
                                ) : (
                                  dirBrowseDirs.map((dir) => (
                                    <div
                                      key={dir.path}
                                      className="flex items-center border-b border-border last:border-b-0"
                                    >
                                      <button
                                        onClick={() => browsePath(dir.path)}
                                        className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-surface-active transition-colors text-left"
                                      >
                                        <FolderOpen className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                        <span className="text-sm text-white truncate">
                                          {dir.name}
                                        </span>
                                      </button>
                                      <button
                                        onClick={() =>
                                          selectDirectory(dir.path)
                                        }
                                        className="px-3 py-2 text-xs text-zinc-500 hover:text-white hover:bg-surface-active transition-colors border-l border-border"
                                      >
                                        Select
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>

                              <div className="px-3 py-2 border-t border-border">
                                <button
                                  onClick={() =>
                                    selectDirectory(dirBrowsePath)
                                  }
                                  className="w-full px-3 py-1.5 rounded-md text-xs font-medium text-white bg-surface-active hover:bg-zinc-700 transition-colors"
                                >
                                  Select current:{" "}
                                  {dirBrowsePath.split("/").pop() ||
                                    dirBrowsePath}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-canvas border-t border-border flex justify-end gap-2 flex-shrink-0">
                  <button
                    onClick={handleClose}
                    className="px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={
                      !selectedAgent ||
                      isCreating ||
                      (!selectedAgent?.command && !commandArgs) ||
                      (useTeam && !customName.trim())
                    }
                    className="px-4 py-1.5 rounded-md text-sm font-medium text-canvas bg-white hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isCreating
                      ? "Creating..."
                      : isReplacing
                      ? "Start Session"
                      : "Create"}
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
