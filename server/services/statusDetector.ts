import type { Session, AgentStatus } from "../types";

// Parse Claude Code JSON events for accurate state tracking
export function handleClaudeJsonEvent(session: Session, event: any): AgentStatus {
  session.lastJsonEvent = event;

  switch (event.type) {
    case "message_start":
      return "running";

    case "content_block_start":
      if (event.content_block?.type === "tool_use") {
        session.currentTool = event.content_block.name;
        if (event.content_block.name === "AskUserQuestion") {
          return "waiting_input";
        }
        return "tool_calling";
      }
      return "running";

    case "content_block_delta":
      if (event.delta?.type === "text_delta") {
        return "running";
      }
      return session.status;

    case "content_block_stop":
      return session.status;

    case "message_stop":
      if (event.stop_reason === "end_turn") {
        return "idle";
      } else if (event.stop_reason === "tool_use") {
        if (session.currentTool === "AskUserQuestion") {
          return "waiting_input";
        }
        return "idle";
      }
      return "idle";

    default:
      return session.status;
  }
}

// Status detection fallback for OpenCode (text-based)
export function detectStatus(session: Session): AgentStatus {
  if (session.isRestored || !session.pty) {
    return "disconnected";
  }

  const now = Date.now();
  const timeSinceOutput = now - session.lastOutputTime;
  const timeSinceInput = now - session.lastInputTime;
  const buffer = session.outputBuffer.join("");
  const lastChunk = buffer.slice(-3000);
  const lastChunkLower = lastChunk.toLowerCase();
  const userJustTyped = timeSinceInput < 1000;

  // Question patterns
  const questionPatterns = [
    /○/,
    /●.*\d+\s+questions/i,
    /What brings you to/i,
    /Enter to select.*Tab.*Arrow.*Esc/i,
    /\[.*\]\s*\?/,
    /\d+\.\s+[A-Z][^.]+\?/m,
    /please select/i,
    /choose an option/i,
    /which.*would you like/i,
    /what would you like/i,
    /how can i help/i,
    /what can i do/i,
    /select.*option/i,
    /type.*message/i,
    /waiting.*input/i,
    /press.*enter/i,
  ];

  for (const pattern of questionPatterns) {
    if (pattern.test(lastChunk)) {
      return "waiting_input";
    }
  }

  // Simple string patterns
  const waitingStrings = ["(y/n)", "[y/n]", "[yes/no]", "continue?", "proceed?", "confirm?"];
  for (const pattern of waitingStrings) {
    if (lastChunkLower.includes(pattern)) {
      return "waiting_input";
    }
  }

  // Shell prompts
  const lastLine = buffer.slice(-150);
  const promptPatterns = [/[>$%#❯λ]\s*$/, /\]\s*$/];
  for (const pattern of promptPatterns) {
    if (pattern.test(lastLine)) {
      return "waiting_input";
    }
  }

  // Tool calling patterns
  const toolCallPatterns = [
    /→\s+(Read|Write|Edit|Bash|Grep|Glob|Task|WebFetch|WebSearch)/i,
    /using the (read|write|edit|bash|grep|glob|task|file)/i,
    /calling.*tool/i,
    /executing.*command/i,
    /running.*command/i,
    /\[tool:\s*\w+\]/i,
    /\[executing\]/i,
    /\[running\]/i,
    /reading.*file/i,
    /writing.*file/i,
    /editing.*file/i,
    /searching.*file/i,
  ];

  for (const pattern of toolCallPatterns) {
    if (pattern.test(lastChunk) && timeSinceOutput < 3000) {
      return "tool_calling";
    }
  }

  // Active streaming
  if (timeSinceOutput < 500 && session.recentOutputSize > 50 && !userJustTyped) {
    return "running";
  }

  if (timeSinceOutput < 2000 && session.recentOutputSize > 100 && !userJustTyped) {
    return "running";
  }

  return "idle";
}
