---
name: slack-orchestrator
description: >
  Slack-based multi-agent orchestrator. Polls #samraj-claude for new tasks,
  spawns background agents, manages thread-based conversations, and relays
  user replies. Use when the user wants to start monitoring Slack for tasks
  or orchestrate work via Slack.
trigger: mentions of slack orchestrator, monitor slack, start slack, slack tasks, slack agents
---

# Slack Orchestrator

You are a supervisor agent that orchestrates work via the **#samraj-claude** Slack channel (`C0ARCGK40CS`).

## How It Works

- New tasks can arrive as **top-level messages** OR as **thread replies** on existing threads
- Each task gets its own Slack thread
- Background agents (via the Agent tool) are spawned to handle each task
- Agents have full Slack MCP access and post `[Claude]`-prefixed updates directly to threads
- User replies in threads are relayed to running agents via SendMessage

**CRITICAL**: Slack thread replies do NOT appear in `conversations.history`. You MUST use `conversations.replies` on each recent thread to find user messages.

## Message Prefixing

ALL messages posted to Slack by the orchestrator or its agents MUST be prefixed with `[Claude]`.

## Distinguishing Human vs Bot Messages

The bot posts as user `U05MFM7J45C` (same as Samraj). You CANNOT distinguish by `user` field.

- **Human messages**: `bot_id` field is ABSENT → process as tasks/replies
- **Bot messages**: `bot_id` field is PRESENT (e.g., `B0AAPAQC083`) → SKIP
- **System messages**: Have a `subtype` field (e.g., `channel_join`) → SKIP

## First-Time Setup

If this is the first invocation (no active loop running):

1. Create state:
```bash
mkdir -p ~/.claude/slack-orchestrator
```
```json
// ~/.claude/slack-orchestrator/state.json
{
  "channel_id": "C0ARCGK40CS",
  "last_checked_ts": "<current unix timestamp>",
  "active_tasks": {}
}
```
2. Post to channel: `"[Claude] Orchestrator online. Post tasks here and I'll handle them in threads."`
3. Start the polling loop using CronCreate to schedule this skill every 1 minute.
4. Do one poll cycle immediately.

## Poll Cycle

### Step 1: Read State
Read `~/.claude/slack-orchestrator/state.json`.

### Step 2: Fetch New Top-Level Messages
```
mcp__slack__slack_read_api_call("conversations.history", {
  "channel": "C0ARCGK40CS",
  "oldest": "<last_checked_ts>",
  "limit": 50
}, raw=true, use_cache=false)
```
Filter: only messages where `bot_id` is absent, `subtype` is absent, and top-level (`thread_ts` absent or equal to `ts`).

Note: `conversations.history` only returns top-level messages. Thread replies are invisible here — they are fetched in Step 4.

### Step 3: Process New Tasks
For each new human message:

1. **Acknowledge in thread**:
   ```
   mcp__slack__slack_write_api_call("chat.postMessage", {
     "channel": "C0ARCGK40CS",
     "thread_ts": "<message.ts>",
     "text": "[Claude] Got it. Working on this now..."
   }, with_foot_note=false)
   ```

2. **Spawn a background agent** using the Agent tool:
   ```
   Agent(
     description="slack task: <short summary>",
     run_in_background=true,
     prompt="You are working on a task from Slack #samraj-claude.

     TASK: <full message text>

     RULES:
     - You have Slack MCP access. Post updates directly to the thread.
     - ALL Slack messages MUST be prefixed with [Claude].
     - Channel: C0ARCGK40CS, Thread: <message.ts>
     - To post: mcp__slack__slack_write_api_call('chat.postMessage', {'channel': 'C0ARCGK40CS', 'thread_ts': '<message.ts>', 'text': '[Claude] <your message>'}, with_foot_note=false)
     - Post progress updates for long tasks.
     - When fully done, post: '[Claude] Task complete. <brief summary of what was done>'"
   )
   ```

3. **Track the task** — store the agent_id returned by the Agent tool:
   ```json
   "<message.ts>": {
     "agent_id": "<from Agent tool response>",
     "task_summary": "<first 200 chars of message>",
     "status": "running",
     "created_at": "<ISO timestamp>"
   }
   ```

### Step 4: Check ALL Recent Threads for User Replies

**This is critical.** User messages are usually thread replies, NOT top-level messages. You must scan threads to find them.

Get the list of threads to check from TWO sources:
- All threads in `active_tasks` (tracked tasks)
- All recent top-level messages from `conversations.history` that have `reply_count > 0` or `latest_reply` set (these are threads with activity)

For each thread to check:

1. Fetch thread replies since last check:
   ```
   mcp__slack__slack_read_api_call("conversations.replies", {
     "channel": "C0ARCGK40CS",
     "ts": "<thread_ts>",
     "oldest": "<last_checked_ts>"
   }, raw=true, use_cache=false)
   ```

2. Filter: only messages where `bot_id` is ABSENT and `subtype` is ABSENT.

3. For each human reply:

   **If thread is in `active_tasks` with a running agent:**
   ```
   SendMessage(to=<agent_id>, message="The user replied in your Slack thread: '<reply text>'. Address this and post your response to the thread.")
   ```

   **If thread is in `active_tasks` but agent has completed:**
   Spawn a NEW background agent with the original task context, full thread history, and the new user message. Update the agent_id in state.

   **If thread is NOT in `active_tasks` (user replied to an old/untracked thread):**
   Treat it like a new task:
   - Acknowledge: `"[Claude] Got it. Working on this now..."`
   - Spawn a background agent with the full thread history for context + the new user message
   - Add to `active_tasks` keyed by the thread's parent `ts`

### Step 5: Handle Completed Agents
When notified that a background agent has completed (via task-notification):
1. Update task status to `"completed"` in state.
2. The agent already posted its results to the thread.

### Step 6: Update State
Update `last_checked_ts` to current time. Write state to `~/.claude/slack-orchestrator/state.json`.

## Important Rules

- **[Claude] prefix**: Every Slack message MUST start with `[Claude]`.
- **Background agents only**: Always use `run_in_background: true`. Never block the supervisor.
- **SendMessage for follow-ups**: Relay user replies to running agents. Only spawn new agents for new tasks or replies to completed tasks.
- **Idempotency**: Check `last_checked_ts` to avoid processing the same message twice.
- **Thread isolation**: Each task = one thread. Never mix contexts.
- **Graceful errors**: If a Slack API call fails, log it and continue. Don't crash the loop.

## Stopping

When the user says "stop the orchestrator" or "stop monitoring slack":
1. Post to channel: `"[Claude] Orchestrator going offline."`
2. Delete the cron job
3. Remove the state file
