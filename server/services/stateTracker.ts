import { spawn } from "bun-pty";
import type { Session } from "../types";
import { handleClaudeJsonEvent } from "./statusDetector";

export function createStateTracker(session: Session, sessionId: string, command: string, cwd: string) {
  if (!command.includes("claude")) {
    console.log(`\x1b[38;5;245m[tracker]\x1b[0m Skipping for non-claude: ${command}`);
    return null;
  }

  try {
    const jsonCommand = `${command} --output-format=stream-json`;
    const trackerPty = spawn("/bin/bash", ["-c", jsonCommand], {
      name: "xterm-256color",
      cwd,
      env: { ...process.env, TERM: "xterm-256color" },
      rows: 30,
      cols: 120,
    });

    let jsonBuffer = "";

    trackerPty.onData((data: string) => {
      jsonBuffer += data;
      const lines = jsonBuffer.split("\n");
      jsonBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line);
          const newStatus = handleClaudeJsonEvent(session, event);

          if (newStatus !== session.status) {
            session.status = newStatus;
            console.log(`\x1b[38;5;141m[tracker]\x1b[0m ${sessionId} → ${newStatus}`);

            for (const client of session.clients) {
              if (client.readyState === 1) {
                client.send(JSON.stringify({
                  type: "status",
                  status: newStatus,
                  tool: session.currentTool,
                }));
              }
            }
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    });

    console.log(`\x1b[38;5;141m[tracker]\x1b[0m Created for ${sessionId}`);
    return trackerPty;
  } catch (e) {
    console.error(`\x1b[38;5;245m[tracker]\x1b[0m Failed:`, e);
    return null;
  }
}
