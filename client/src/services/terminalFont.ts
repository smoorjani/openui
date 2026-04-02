const DEFAULT_FONT_FAMILY = '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace';

/**
 * Read the terminal font-family from localStorage and ensure it's a valid
 * CSS font-family string.  Raw font names with spaces (e.g. from the
 * "Custom…" input) are wrapped in double-quotes so xterm doesn't split
 * them into separate family tokens.
 */
export function getTerminalFontFamily(): string {
  const raw = localStorage.getItem("openui-terminal-font-family");
  if (!raw) return DEFAULT_FONT_FAMILY;

  // Already looks like a proper CSS font stack (contains a comma or starts with a quote)
  if (raw.includes(",") || raw.startsWith('"') || raw.startsWith("'")) return raw;

  // Raw single font name — quote it and add the full default fallback chain
  return `"${raw}", ${DEFAULT_FONT_FAMILY}`;
}
