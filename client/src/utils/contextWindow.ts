/**
 * Extract context window size from model string.
 *
 * Model strings from Claude Code include a bracket suffix with the context
 * window size, e.g. "claude-opus-4-6[1m]", "claude-sonnet-4-6[200k]".
 * Parse that first; fall back to known defaults if missing.
 */
export function getContextWindowSize(model?: string): number {
  if (!model) return 200_000;

  // Parse bracket suffix: [1m] → 1_000_000, [200k] → 200_000
  const ctxMatch = model.match(/\[(\d+)([mk])\]/i);
  if (ctxMatch) {
    const num = parseInt(ctxMatch[1], 10);
    const unit = ctxMatch[2].toLowerCase();
    return unit === "m" ? num * 1_000_000 : num * 1_000;
  }

  // Fallback for model strings without bracket suffix
  const m = model.toLowerCase();
  if (m.includes("opus")) return 200_000;
  if (m.includes("sonnet")) return 200_000;
  if (m.includes("haiku")) return 200_000;
  return 200_000;
}

/**
 * Smooth gradient color for context usage percentage.
 * Transitions through HSL hue: green (120°) → yellow (50°) → red (0°).
 * Returns a hex color string.
 */
export function getContextColor(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  // Map 0-100% to hue 140° (vivid green) → 0° (red)
  const hue = 140 * (1 - clamped / 100);
  // High saturation throughout, peaking at extremes
  const saturation = 80 + (clamped / 100) * 10; // 80% → 90%
  const lightness = 42 - (clamped / 100) * 2;   // 42% → 40%
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
