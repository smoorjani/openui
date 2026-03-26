import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Bot } from "lucide-react";
import { useStore } from "../stores/useStore";
import { Terminal } from "./Terminal";

export function OrchestratorPanel() {
  const {
    orchestratorOpen,
    setOrchestratorOpen,
    orchestratorSessionId,
    setOrchestratorSessionId,
    launchCwd,
  } = useStore();

  const [height, setHeight] = useState(() => {
    const saved = localStorage.getItem("openui-orchestrator-height");
    return saved ? parseInt(saved, 10) : 250;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [creating, setCreating] = useState(false);
  const hasCreatedRef = useRef(false);

  // Validate existing session is alive; clear stale ID if dead/disconnected
  useEffect(() => {
    if (!orchestratorOpen || !orchestratorSessionId) return;
    fetch(`/api/sessions/${orchestratorSessionId}/status`)
      .then((res) => {
        if (!res.ok) {
          setOrchestratorSessionId(null);
          hasCreatedRef.current = false;
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data && (data.status === "disconnected" || data.isRestored)) {
          // Dead session — delete it and create fresh
          fetch(`/api/sessions/${orchestratorSessionId}`, { method: "DELETE" }).catch(() => {});
          setOrchestratorSessionId(null);
          hasCreatedRef.current = false;
        }
      })
      .catch(() => {
        setOrchestratorSessionId(null);
        hasCreatedRef.current = false;
      });
  }, [orchestratorOpen, orchestratorSessionId, setOrchestratorSessionId]);

  // Create session on first open
  useEffect(() => {
    if (!orchestratorOpen || orchestratorSessionId || creating || hasCreatedRef.current) return;
    hasCreatedRef.current = true;
    setCreating(true);

    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "claude",
        agentName: "Claude Code",
        command: "isaac",
        cwd: launchCwd || "~",
        nodeId: "orchestrator",
        customName: "Orchestrator",
        initialPrompt:
          "You are an orchestrator agent. Use the /orchestrator skill to learn how to spawn and manage other agents via the openui-ctl CLI.",
      }),
    })
      .then((res) => res.json())
      .then(({ sessionId }) => {
        setOrchestratorSessionId(sessionId);
      })
      .catch((e) => {
        console.error("Failed to create orchestrator session:", e);
        hasCreatedRef.current = false;
      })
      .finally(() => setCreating(false));
  }, [orchestratorOpen, orchestratorSessionId, creating, launchCwd, setOrchestratorSessionId]);

  // Resize handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setHeight(Math.max(150, Math.min(newHeight, window.innerHeight - 100)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem("openui-orchestrator-height", height.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, height]);

  return (
    <AnimatePresence>
      {orchestratorOpen && (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height }}
          exit={{ height: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative border-t border-violet-800/50 bg-canvas-dark flex flex-col overflow-hidden"
        >
          {/* Resize handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-violet-500/50 transition-colors z-10 ${isResizing ? "bg-violet-500/50" : ""}`}
          />

          {/* Header bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2 text-violet-300 text-xs font-medium">
              <Bot className="w-3.5 h-3.5" />
              Orchestrator
              {creating && <span className="text-zinc-500">Starting...</span>}
            </div>
            <button
              onClick={() => setOrchestratorOpen(false)}
              className="p-1 rounded text-zinc-500 hover:text-white hover:bg-surface-active transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Terminal */}
          <div className="flex-1 min-h-0">
            {orchestratorSessionId ? (
              <Terminal
                sessionId={orchestratorSessionId}
                color="#8B5CF6"
                nodeId="orchestrator"
                isActive={orchestratorOpen}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                Starting orchestrator...
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
