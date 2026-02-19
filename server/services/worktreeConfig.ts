import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { WorktreeRepo, WorktreeConfig } from "../types";

const LAUNCH_CWD = process.env.LAUNCH_CWD || process.cwd();
const CONFIG_FILE = join(LAUNCH_CWD, ".openui", "config.json");

const DEFAULT_WORKTREE_CONFIG: WorktreeConfig = {
  worktreeRepos: [
    {
      name: "MLflow",
      path: "/Users/samraj.moorjani/personal_repos/mlflow",
      baseBranch: "master"
    },
    {
      name: "Universe",
      path: "/Users/samraj.moorjani/universe",
      baseBranch: "main",
      sparseCheckout: true,
      sparseCheckoutPaths: ["docs", "managed-evals", "managed-rag", "rag", "mlflow"]
    },
    {
      name: "Universe (Arca)",
      path: "~/universe",
      baseBranch: "main",
      sparseCheckout: true,
      sparseCheckoutPaths: ["docs", "managed-evals", "managed-rag", "rag", "mlflow"],
      remote: "arca"
    }
  ]
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
