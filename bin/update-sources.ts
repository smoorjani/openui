// Update source configuration for universe
// JJ27/openui has its own version of this file with a public fallback source.
// This file is excluded from auto-updates in JJ27 (rsync --exclude).

export interface UpdateSource {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  apiBase: string;
}

export const DEFAULT_UPDATE_SOURCE: UpdateSource = {
  owner: "databricks-eng",
  repo: "universe",
  path: "openui",
  ref: "master",
  apiBase: "https://api.github.com",
};

// No fallback — universe users always have gh auth
export const FALLBACK_UPDATE_SOURCE: UpdateSource | null = null;
