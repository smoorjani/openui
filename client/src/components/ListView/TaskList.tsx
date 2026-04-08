import { useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Edit3, Bot } from "lucide-react";
import { useStore, type ListSection } from "../../stores/useStore";
import { TaskItem } from "./TaskItem";
import { WorkspaceTabs } from "../WorkspaceTabs";

interface TaskListProps {
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
}

export function TaskList({ selectedNodeId, onSelect }: TaskListProps) {
  const { sessions, listSections, addListSection, updateListSection, removeListSection, updateSession, setAddAgentModalOpen, setNewAgentTargetCategoryId, activeWorkspace } = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [sectionContextMenu, setSectionContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  const allSessions = Array.from(sessions.entries()).filter(
    ([, s]) => s.agentName !== "Orchestrator"
  );

  const workspaceSections = useMemo(
    () => listSections.filter((s) => s.workspace === activeWorkspace),
    [listSections, activeWorkspace]
  );
  // Uncategorized sessions count as backlog-new
  const sessionsForSection = (sectionId: string) => {
    const direct = allSessions.filter(([, s]) => s.categoryId === sectionId);
    // backlog-new also absorbs uncategorized sessions
    if (sectionId === "backlog-new") {
      const uncategorized = allSessions.filter(
        ([, s]) => !s.categoryId || !listSections.find((sec) => sec.id === s.categoryId)
      );
      return [...direct, ...uncategorized].sort(([, a], [, b]) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    }
    return direct.sort(([, a], [, b]) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  };

  const handleAddSection = () => {
    if (!newLabel.trim()) return;
    addListSection({
      id: `section-${Date.now()}`,
      label: newLabel.trim(),
      color: newColor,
      workspace: activeWorkspace as "sprint" | "oncall" | "backlog",
    });
    setNewLabel("");
    setNewColor("#3B82F6");
    setShowAddForm(false);
  };

  const handleToggleCollapse = (id: string) => {
    const sec = listSections.find((s) => s.id === id);
    if (sec) updateListSection(id, { collapsed: !sec.collapsed });
  };

  const handleSectionContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setSectionContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const handleDeleteSection = (id: string) => {
    allSessions.forEach(([nodeId, s]) => {
      if (s.categoryId === id) {
        updateSession(nodeId, { categoryId: undefined });
        fetch(`/api/sessions/${s.sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: null }),
        }).catch(console.error);
      }
    });
    removeListSection(id);
    setSectionContextMenu(null);
  };

  const handleNewAgentInSection = (sectionId: string) => {
    setNewAgentTargetCategoryId(sectionId);
    setAddAgentModalOpen(true);
    setSectionContextMenu(null);
  };

  const handleStartEdit = (id: string) => {
    const sec = listSections.find((s) => s.id === id);
    if (sec) {
      setEditingId(id);
      setEditLabel(sec.label);
    }
    setSectionContextMenu(null);
  };

  const handleFinishEdit = () => {
    if (editingId && editLabel.trim()) {
      updateListSection(editingId, { label: editLabel.trim() });
    }
    setEditingId(null);
  };

  // Drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    e.dataTransfer.setData("text/plain", nodeId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSection(sectionId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverSection(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetSectionId: string | null) => {
      e.preventDefault();
      setDragOverSection(null);
      const nodeId = e.dataTransfer.getData("text/plain");
      if (!nodeId) return;

      const session = sessions.get(nodeId);
      if (!session) return;

      const inSection = allSessions.filter(([, s]) => s.categoryId === targetSectionId);
      const maxOrder = inSection.reduce((max, [, s]) => Math.max(max, s.sortOrder ?? 0), 0);
      const newOrder = maxOrder + 1;

      updateSession(nodeId, { categoryId: targetSectionId || undefined, sortOrder: newOrder });
      fetch(`/api/sessions/${session.sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: targetSectionId, sortOrder: newOrder }),
      }).catch(console.error);
    },
    [sessions, allSessions, updateSession]
  );

  const sectionColors = ["#22C55E", "#3B82F6", "#8B5CF6", "#F97316", "#EC4899", "#EF4444", "#FBBF24", "#14B8A6"];

  const renderSection = (section: ListSection) => {
    const items = sessionsForSection(section.id);
    const isOver = dragOverSection === section.id;

    return (
      <div key={section.id} className="mb-2">
        {/* Section header */}
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer select-none transition-colors ${
            isOver ? "bg-white/10" : "hover:bg-white/5"
          }`}
          onClick={() => handleToggleCollapse(section.id)}
          onContextMenu={(e) => handleSectionContextMenu(e, section.id)}
          onDragOver={(e) => handleDragOver(e, section.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, section.id)}
        >
          {section.collapsed ? (
            <ChevronRight className="w-3 h-3 text-zinc-500" />
          ) : (
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          )}
          <div
            className="w-2 h-2 rounded-sm flex-shrink-0"
            style={{ backgroundColor: section.color }}
          />
          {editingId === section.id ? (
            <input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onBlur={handleFinishEdit}
              onKeyDown={(e) => e.key === "Enter" && handleFinishEdit()}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 text-xs font-medium text-white bg-canvas border border-border rounded px-1.5 py-0.5 focus:outline-none"
              autoFocus
            />
          ) : (
            <span className="flex-1 text-xs font-medium text-zinc-300 uppercase tracking-wider">
              {section.label}
            </span>
          )}
          <span className="text-[10px] text-zinc-600 tabular-nums">{items.length}</span>
        </div>

        {/* Tasks */}
        {!section.collapsed && (
          <div
            className="ml-2 mt-0.5 space-y-0.5"
            onDragOver={(e) => handleDragOver(e, section.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, section.id)}
          >
            {items.map(([nodeId]) => (
              <TaskItem
                key={nodeId}
                nodeId={nodeId}
                onSelect={onSelect}
                isSelected={selectedNodeId === nodeId}
                onDragStart={handleDragStart}
              />
            ))}
            {items.length === 0 && (
              <div className="text-[10px] text-zinc-700 px-3 py-2 italic">
                Drop tasks here
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-canvas-dark">
      {/* Workspace tabs */}
      <div className="flex-shrink-0 px-3 pt-2 pb-1 border-b border-border">
        <WorkspaceTabs />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Active workspace sections */}
        {workspaceSections.map(renderSection)}


      </div>

      {/* Add section */}
      <div className="flex-shrink-0 border-t border-border p-3">
        {showAddForm ? (
          <div className="space-y-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
              placeholder="Section name"
              className="w-full px-2.5 py-1.5 rounded-md bg-canvas border border-border text-white text-xs focus:outline-none focus:border-zinc-500"
              autoFocus
            />
            <div className="flex gap-1">
              {sectionColors.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full transition-all ${
                    newColor === c ? "ring-2 ring-white ring-offset-1 ring-offset-canvas-dark" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowAddForm(false); setNewLabel(""); }}
                className="flex-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-white hover:bg-surface-active transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSection}
                disabled={!newLabel.trim()}
                className="flex-1 px-2 py-1 rounded text-xs font-medium bg-white text-canvas hover:bg-zinc-100 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Section
          </button>
        )}
      </div>

      {/* Section context menu */}
      {sectionContextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setSectionContextMenu(null)} />
          <div
            className="fixed z-50 w-40 bg-surface border border-border rounded-lg shadow-xl py-1"
            style={{ left: sectionContextMenu.x, top: sectionContextMenu.y }}
          >
            <button
              onClick={() => handleNewAgentInSection(sectionContextMenu.id)}
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <Bot className="w-3 h-3" />
              New Agent
            </button>
            <button
              onClick={() => handleStartEdit(sectionContextMenu.id)}
              className="w-full px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
            >
              <Edit3 className="w-3 h-3" />
              Rename
            </button>
            <button
              onClick={() => handleDeleteSection(sectionContextMenu.id)}
              className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
