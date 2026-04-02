import { useStore } from "../stores/useStore";

export const DARK_TERMINAL_THEME = {
  background: "#0d0d0d",
  foreground: "#d4d4d4",
  cursorAccent: "#0d0d0d",
  selectionBackground: "#3b3b3b",
  selectionForeground: "#ffffff",
  black: "#1a1a1a",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#d4d4d4",
  brightBlack: "#525252",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fcd34d",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

export const LIGHT_TERMINAL_THEME = {
  background: "#fafafa",
  foreground: "#1a1a1a",
  cursorAccent: "#fafafa",
  selectionBackground: "#b4d5fe",
  selectionForeground: "#1a1a1a",
  black: "#1a1a1a",
  red: "#dc2626",
  green: "#16a34a",
  yellow: "#ca8a04",
  blue: "#2563eb",
  magenta: "#9333ea",
  cyan: "#0891b2",
  white: "#d4d4d4",
  brightBlack: "#737373",
  brightRed: "#ef4444",
  brightGreen: "#22c55e",
  brightYellow: "#eab308",
  brightBlue: "#3b82f6",
  brightMagenta: "#a855f7",
  brightCyan: "#06b6d4",
  brightWhite: "#ffffff",
};

export function getTerminalTheme() {
  return useStore.getState().theme === "light" ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME;
}

export function getTerminalThemeForTheme(theme: string) {
  return theme === "light" ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME;
}
