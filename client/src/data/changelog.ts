export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  description: string;
}

// Newest first. Only the top 10 are ever shown in the UI.
export const changelog: ChangelogEntry[] = [
  {
    id: "2026-03-17-context-bar",
    date: "2026-03-17",
    title: "Context Window Progress Bar",
    description:
      "Visual progress bar showing context window usage per agent. Detects model and context size from the terminal. Toggle in Settings.",
  },
  {
    id: "2026-03-17-scroll-fix",
    date: "2026-03-17",
    title: "Smooth Terminal Scrolling",
    description:
      "Fixed terminal jumping to the top on every output. Auto-scroll setting now works. Relies on xterm.js native scrolling.",
  },
  {
    id: "2026-03-17-model-detection",
    date: "2026-03-17",
    title: "Per-Agent Model Detection",
    description:
      "Agent cards now show the exact model and context window (e.g. Opus 4.6 (1M)) detected from the terminal banner.",
  },
  {
    id: "2026-03-17-settings-expansion",
    date: "2026-03-17",
    title: "Expanded Settings",
    description:
      "New settings: token display toggle, context bar toggle (beta), reconnect history size, and working auto-scroll control.",
  },
  {
    id: "2026-03-17-header-cwd",
    date: "2026-03-17",
    title: "Dynamic Header Directory",
    description:
      "The directory path in the header now reflects the selected agent's working directory instead of the launch directory.",
  },
  {
    id: "2026-03-16-terminal-pool",
    date: "2026-03-16",
    title: "Instant Agent Switching",
    description:
      "GPU-accelerated terminal pool keeps your last 6 agents alive in memory. Switching is now <5ms instead of ~1 second.",
  },
  {
    id: "2026-03-16-delta-caching-shells",
    date: "2026-03-16",
    title: "Delta Caching & Shell Sessions",
    description:
      "Terminals restore instantly on reconnect via delta caching. Open dedicated shell tabs alongside any agent.",
  },
  {
    id: "2026-03-16-usage-tracking",
    date: "2026-03-16",
    title: "Usage Tracking & Keyboard Shortcuts",
    description:
      "Hover the daily spend badge for weekly/monthly breakdown. Use Alt+1-9, Alt+[/], Cmd+I, and Option+← to scroll to bottom.",
  },
  {
    id: "2026-03-16-universe-migration",
    date: "2026-03-16",
    title: "Now in Universe",
    description:
      "OpenUI now lives at universe/openui. Contributions welcome as PRs. Auto-updates pull from universe master.",
  },
  {
    id: "2026-02-25-help-shortcuts",
    date: "2026-02-25",
    title: "Help & Keyboard Shortcuts",
    description:
      "Press ? to see all keyboard shortcuts. Use Cmd+I to jump to the next agent needing input, Cmd+N for a new agent.",
  },
  {
    id: "2026-02-25-compacting-status",
    date: "2026-02-25",
    title: "Compacting Status",
    description:
      'Agent cards now show a "Compacting" status when Claude is summarizing its conversation context.',
  },
  {
    id: "2026-02-24-model-display",
    date: "2026-02-24",
    title: "Model Name on Cards",
    description:
      'Agent cards now show the exact model (e.g. "Sonnet 4.6") instead of generic "claude".',
  },
  {
    id: "2026-02-24-sleep-timer",
    date: "2026-02-24",
    title: "Sleep Timer Countdown",
    description:
      'When an agent runs a sleep command, the card shows a live countdown timer instead of "Needs Input".',
  },
];
