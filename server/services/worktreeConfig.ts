import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { WorktreeRepo, WorktreeConfig } from "../types";

const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();
const CONFIG_FILE = join(LAUNCH_CWD, ".openui", "config.json");

const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  worktreeRepos: []
};

export function loadWorktreeConfig(): WorktreeConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const fileConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      if (fileConfig.worktreeRepos && Array.isArray(fileConfig.worktreeRepos)) {
        return { worktreeRepos: fileConfig.worktreeRepos };
      }
    }
  } catch (e) {
    console.error("Failed to load worktree config:", e);
  }
  return DEFAULT_WORKTREE_CONFIG;
}

export interface AppSettings {
  skipPermissions?: boolean;
  defaultCwd?: string;
  defaultRemoteCwd?: string;
  remoteHosts?: Record<string, string>;
  worktreeRepos?: WorktreeRepo[];
}

export function loadSettings(): AppSettings {
  try {
    if (existsSync(CONFIG_FILE)) {
      const fileConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      return {
        skipPermissions: fileConfig.skipPermissions ?? false,
        defaultCwd: fileConfig.defaultCwd,
        defaultRemoteCwd: fileConfig.defaultRemoteCwd,
        remoteHosts: fileConfig.remoteHosts,
        worktreeRepos: fileConfig.worktreeRepos,
      };
    }
  } catch (e) {
    console.error("Failed to load settings:", e);
  }
  return { skipPermissions: false };
}

export function saveSettings(settings: AppSettings): void {
  try {
    const dir = join(LAUNCH_CWD, ".openui");
    if (!existsSync(dir)) {
      require("fs").mkdirSync(dir, { recursive: true });
    }

    let existingConfig = {};
    if (existsSync(CONFIG_FILE)) {
      existingConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }

    const updatedConfig = {
      ...existingConfig,
      ...settings,
    };

    writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2));
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

export function saveWorktreeConfig(worktreeRepos: WorktreeRepo[]): void {
  try {
    const dir = join(LAUNCH_CWD, ".openui");
    if (!existsSync(dir)) {
      require("fs").mkdirSync(dir, { recursive: true });
    }

    let existingConfig = {};
    if (existsSync(CONFIG_FILE)) {
      existingConfig = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    }

    const updatedConfig = {
      ...existingConfig,
      worktreeRepos
    };

    writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2));
  } catch (e) {
    console.error("Failed to save worktree config:", e);
  }
}
