import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Zap,
  Database,
  Terminal,
  DollarSign,
  Keyboard,
  GitFork,
  Code,
  BarChart3,
  ScrollText,
  Settings,
  FolderOpen,
} from "lucide-react";

const featureCards = [
  {
    icon: BarChart3,
    title: "Context Progress Bar",
    desc: "Visual context window usage with per-agent model detection",
    color: "text-violet-400",
    isBeta: true,
  },
  {
    icon: ScrollText,
    title: "Smooth Scrolling",
    desc: "No more terminal jumping \u2014 native xterm.js auto-scroll",
    color: "text-green-400",
  },
  {
    icon: Zap,
    title: "Instant Switching",
    desc: "GPU-accelerated terminal pool \u2014 switch agents in <5ms",
    color: "text-green-400",
  },
  {
    icon: Database,
    title: "Delta Caching",
    desc: "Instant terminal restore on reconnect",
    color: "text-blue-400",
  },
  {
    icon: Terminal,
    title: "Shell Sessions",
    desc: "Open dedicated shells alongside your agents",
    color: "text-violet-400",
  },
  {
    icon: DollarSign,
    title: "Usage Tracking",
    desc: "Daily, weekly & monthly spend at a glance",
    color: "text-emerald-400",
  },
  {
    icon: Settings,
    title: "More Settings",
    desc: "Token display, context bar, history size, auto-scroll",
    color: "text-cyan-400",
  },
  {
    icon: FolderOpen,
    title: "Dynamic CWD",
    desc: "Header shows selected agent\u2019s working directory",
    color: "text-yellow-400",
  },
  {
    icon: Keyboard,
    title: "Keyboard Shortcuts",
    desc: "Alt+1-9, Alt+[/], Cmd+I, ?, Opt+\u2190 to scroll",
    color: "text-cyan-400",
  },
  {
    icon: GitFork,
    title: "Fork & Cleanup",
    desc: "Fork sessions with automatic git branch cleanup",
    color: "text-pink-400",
  },
  {
    icon: Code,
    title: "Now in Universe",
    desc: "Lives in universe/openui \u2014 contributions welcome as PRs",
    color: "text-tertiary",
  },
];

export function WhatsNewV2Modal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((config) => {
        if (config.tourCompleted && !config.v2Welcomed) {
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = () => {
    setVisible(false);
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ v2Welcomed: true }),
    }).catch(() => {});
  };

  if (!visible) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: "rgba(10, 10, 10, 0.97)" }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-2xl w-full px-6"
      >
        {/* Title */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-2xl font-bold text-primary tracking-tight">
            What&apos;s New in OpenUI v2
          </h1>
          <p className="text-sm text-tertiary mt-1">
            Here&apos;s what&apos;s been added since your last visit.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {featureCards.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="bg-overlay-5 rounded-lg p-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <f.icon className={`w-6 h-6 ${f.color}`} />
                {(f as any).isBeta && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-yellow-500/20 text-yellow-400">BETA</span>
                )}
              </div>
              <h3 className="text-sm font-medium text-primary">{f.title}</h3>
              <p className="text-xs text-muted">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Got it button */}
        <div className="flex justify-center">
          <motion.button
            onClick={dismiss}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="px-6 py-2.5 rounded-lg bg-accent text-accent-contrast text-sm font-semibold hover:bg-accent-hover transition-colors shadow-lg"
          >
            Got it
          </motion.button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
