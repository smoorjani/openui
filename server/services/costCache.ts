import { readFileSync, existsSync, readdirSync, statSync, openSync, readSync, closeSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const COST_CACHE_PATH = join(homedir(), ".claude", "cost_cache.json");
const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CACHE_TTL = 10_000; // 10 seconds
const CONTEXT_CACHE_TTL = 30_000; // 30s — context tokens only change on assistant responses

let cachedSessions: Record<string, { tokens?: number; cost?: number; project?: string }> = {};
let lastReadTime = 0;

function refreshCache() {
  const now = Date.now();
  if (now - lastReadTime < CACHE_TTL) return;
  lastReadTime = now;

  try {
    if (!existsSync(COST_CACHE_PATH)) return;
    const raw = readFileSync(COST_CACHE_PATH, "utf8");
    const data = JSON.parse(raw);
    cachedSessions = data.sessions || {};
  } catch {
    // File may be mid-write or corrupted — keep stale cache
  }
}

export function getTokensForSession(claudeSessionId: string | undefined): number | null {
  if (!claudeSessionId) return null;
  refreshCache();
  const entry = cachedSessions[claudeSessionId];
  return entry?.tokens ?? null;
}

export function getTotalTokensForNode(
  currentSessionId: string | undefined,
  history: string[] | undefined
): number | null {
  if (!history || history.length === 0) return null;
  refreshCache();
  let total = 0;
  for (const id of history) {
    const entry = cachedSessions[id];
    if (entry?.tokens) total += entry.tokens;
  }
  if (currentSessionId) {
    const entry = cachedSessions[currentSessionId];
    if (entry?.tokens) total += entry.tokens;
  }
  return total > 0 ? total : null;
}

// Current context window usage (same logic as Claude Code's /context)
const contextCache = new Map<string, { used: number; time: number }>();
// Cache claudeSessionId → JSONL file path to avoid rescanning directories
const jsonlPathCache = new Map<string, string>();

export function invalidateContextCache(claudeSessionId: string): void {
  contextCache.delete(claudeSessionId);
}

function findSessionJsonl(claudeSessionId: string): string | null {
  // Check path cache first — if cached file still exists, return immediately
  const cachedPath = jsonlPathCache.get(claudeSessionId);
  if (cachedPath && existsSync(cachedPath)) return cachedPath;

  refreshCache();
  const entry = cachedSessions[claudeSessionId];
  if (entry?.project) {
    const path = join(CLAUDE_PROJECTS_DIR, entry.project, `${claudeSessionId}.jsonl`);
    if (existsSync(path)) {
      jsonlPathCache.set(claudeSessionId, path);
      return path;
    }
  }
  try {
    if (!existsSync(CLAUDE_PROJECTS_DIR)) return null;
    for (const dir of readdirSync(CLAUDE_PROJECTS_DIR)) {
      const path = join(CLAUDE_PROJECTS_DIR, dir, `${claudeSessionId}.jsonl`);
      if (existsSync(path)) {
        jsonlPathCache.set(claudeSessionId, path);
        return path;
      }
    }
  } catch {}
  return null;
}

/**
 * Parse model name from Claude Code's PTY output.
 *
 * Two distinct patterns carry the model name:
 *
 * 1. Startup banner (block-art anchor):
 *    ▝▜█████▛▘  Opus 4.6 (1M context) · Claude Enterprise
 *
 * 2. /model change message:
 *    Set model to Sonnet 4.6 (1M context) · Billed as extra usage.
 *
 * Both are specific enough to avoid false positives from conversation text
 * (a bare "Sonnet 4.6" in chat would NOT match).
 *
 * We scan from the END of the buffer to get the most recent (current) model.
 *
 * Returns a normalized model string like "claude-opus-4-6[1m]" or "claude-sonnet-4-6".
 */

// Banner anchor: block chars followed by model
// Matches "█████▛▘  Opus 4.6 (1M context)" or "█████▛▘Opus4.6(1Mcontext)"
const BANNER_RE = /█+▛▘\s*(Opus|Sonnet|Haiku)\s*(\d+)\.(\d+)\s*(?:\((\d+[MKmk])\s*context\))?/i;
// /model change: "Set model to Opus 4.6 (1M context)"
const MODEL_CHANGE_RE = /Set model to (Opus|Sonnet|Haiku)\s*(\d+)\.(\d+)\s*(?:\((\d+[MKmk])\s*context\))?/i;

function extractModel(m: RegExpExecArray): string {
  const family = m[1].toLowerCase();
  const major = m[2];
  const minor = m[3];
  const ctxRaw = m[4]; // e.g. "1M" or undefined
  const base = `claude-${family}-${major}-${minor}`;
  return ctxRaw ? `${base}[${ctxRaw.toLowerCase()}]` : base;
}

export function parseModelFromOutput(outputBuffer: string[]): string | null {
  // Scan from the end — the last match is the current model
  for (let i = outputBuffer.length - 1; i >= 0; i--) {
    const chunk = outputBuffer[i];

    // Strip ANSI escape sequences for matching
    const clean = chunk.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
                       .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, "")
                       .replace(/\x1b\][^\x07]*\x07/g, "");

    // Check /model change first (higher priority — most recent user action)
    const changeMatches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    const changeRe = new RegExp(MODEL_CHANGE_RE, "gi");
    while ((m = changeRe.exec(clean)) !== null) changeMatches.push(m);
    if (changeMatches.length > 0) {
      return extractModel(changeMatches[changeMatches.length - 1]);
    }

    // Check banner
    const bannerMatches: RegExpExecArray[] = [];
    const bannerRe = new RegExp(BANNER_RE, "gi");
    while ((m = bannerRe.exec(clean)) !== null) bannerMatches.push(m);
    if (bannerMatches.length > 0) {
      return extractModel(bannerMatches[bannerMatches.length - 1]);
    }
  }
  return null;
}

export function getContextTokens(claudeSessionId: string | undefined): number | null {
  if (!claudeSessionId) return null;

  const cached = contextCache.get(claudeSessionId);
  if (cached && Date.now() - cached.time < CONTEXT_CACHE_TTL) return cached.used;

  const jsonlPath = findSessionJsonl(claudeSessionId);
  if (!jsonlPath) return null;

  try {
    // Read only the tail of the file — the last assistant message with usage
    // info is almost always in the final 64KB, avoiding multi-MB full reads
    const stat = statSync(jsonlPath);
    const tailSize = Math.min(stat.size, 64 * 1024);
    const buffer = Buffer.alloc(tailSize);
    const fd = openSync(jsonlPath, "r");
    try {
      readSync(fd, buffer, 0, tailSize, stat.size - tailSize);
    } finally {
      closeSync(fd);
    }
    const raw = buffer.toString("utf8");
    const lines = raw.trimEnd().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === "assistant" && obj.message?.usage) {
          const u = obj.message.usage;
          const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
          contextCache.set(claudeSessionId, { used, time: Date.now() });
          return used;
        }
      } catch { continue; }
    }
  } catch {}
  return null;
}
