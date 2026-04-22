#!/bin/bash

# Slack Agent Done Hook (SubagentStop)
# Updates orchestrator state when a background agent finishes.
# Posts a fallback "completed" notification to the Slack thread
# in case the agent didn't post its own results.
#
# Only fires when the orchestrator is active (state file exists).

STATE_FILE="$HOME/.claude/slack-orchestrator/state.json"

# Skip if orchestrator not active
[ ! -f "$STATE_FILE" ] && exit 0

INPUT=$(cat)

# Extract agent info from hook input
if command -v jq &> /dev/null; then
  AGENT_ID=$(echo "$INPUT" | jq -r '.subagent_id // .agent_id // empty' 2>/dev/null || echo "")
  AGENT_TYPE=$(echo "$INPUT" | jq -r '.subagent_type // empty' 2>/dev/null || echo "")
else
  exit 0
fi

[ -z "$AGENT_ID" ] && exit 0

# Find the task in state that matches this agent_id
THREAD_TS=$(jq -r --arg aid "$AGENT_ID" '
  .active_tasks | to_entries[] |
  select(.value.agent_id == $aid) |
  .key
' "$STATE_FILE" 2>/dev/null)

[ -z "$THREAD_TS" ] && exit 0

CHANNEL_ID=$(jq -r '.channel_id' "$STATE_FILE" 2>/dev/null)
TASK_SUMMARY=$(jq -r --arg ts "$THREAD_TS" '.active_tasks[$ts].task_summary // "unknown task"' "$STATE_FILE" 2>/dev/null)

# Update state: mark task as completed
jq --arg ts "$THREAD_TS" '
  .active_tasks[$ts].status = "completed" |
  .active_tasks[$ts].completed_at = (now | todate)
' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null && mv "${STATE_FILE}.tmp" "$STATE_FILE"

# Post fallback notification to the thread
# The agent should have already posted its detailed results,
# but this ensures the thread always gets a completion signal.
OPENUI_HOST="${OPENUI_HOST:-localhost}"
OPENUI_PORT="${OPENUI_PORT:-6969}"

# We can't call MCP tools from bash, so we'll mark state only.
# The supervisor will notice the completed status on next poll
# and post a completion message if the agent didn't.

exit 0
