import { useStore } from "../stores/useStore";

const WORKSPACES = [
  { id: "sprint", label: "Sprint", color: "#F97316" },
  { id: "oncall", label: "On Call", color: "#06B6D4" },
  { id: "backlog", label: "Backlog", color: "#FBBF24" },
] as const;

export function WorkspaceTabs({ className = "" }: { className?: string }) {
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {WORKSPACES.map((ws) => {
        const isActive = activeWorkspace === ws.id;
        return (
          <button
            key={ws.id}
            onClick={() => setActiveWorkspace(ws.id)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium uppercase tracking-wider transition-colors ${
              isActive
                ? "text-primary"
                : "text-faint hover:text-muted"
            }`}
            style={isActive ? { backgroundColor: `${ws.color}20`, color: ws.color } : undefined}
          >
            {ws.label}
          </button>
        );
      })}
    </div>
  );
}
