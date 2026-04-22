#!/bin/bash

# Magic Keyword Detection Hook
# Detects natural language keywords in user prompts and injects
# system messages nudging Claude to use the corresponding skill.
#
# Hook type: UserPromptSubmit
# Input: JSON on stdin with user_prompt field
# Output: JSON with systemMessage field if keyword matched

INPUT=$(cat)

# Extract user prompt
if command -v jq &> /dev/null; then
  USER_PROMPT=$(echo "$INPUT" | jq -r '.user_prompt // empty' 2>/dev/null || echo "")
else
  USER_PROMPT=$(echo "$INPUT" | grep -o '"user_prompt":"[^"]*"' | sed 's/"user_prompt":"//;s/"$//' || echo "")
fi

# Nothing to do if empty
[ -z "$USER_PROMPT" ] && exit 0

# Lowercase for matching
LP=$(echo "$USER_PROMPT" | tr '[:upper:]' '[:lower:]')

SKILL=""
HINT=""

# --- Tier 1: Highest-impact keywords (from usage analysis) ---

# Team / multi-agent orchestration (user's #1 priority)
if echo "$LP" | grep -qE '\bteam\b.*(agent|up|spawn|create|start)|\bspawn.*(team|agents)|\bcreate.*(team|agents)|\borchestrate\b'; then
  SKILL="openui-status:orchestrator"
  HINT="Use the orchestrator skill with --team flag to spawn a coordinated team of agents. Run: /openui-status:orchestrator"

# Spawn single agent
elif echo "$LP" | grep -qE '\bspawn\b.*agent|\bcreate\b.*agent'; then
  SKILL="openui-status:orchestrator"
  HINT="Use the orchestrator skill to spawn an agent. Run: /openui-status:orchestrator"

# Papercut / bug filing (238 NL uses vs ~0 slash uses)
elif echo "$LP" | grep -qE '\bpapercut\b|\bfile a (bug|jira)\b|\bf&f\b|\bfix and finish\b|\bfound a bug\b|\bsmall bug\b|\bminor (bug|issue)\b|\bui nit\b'; then
  SKILL="mlflow-bug"
  HINT="This looks like a bug report. Use the mlflow-bug skill to file a Jira ticket. Run: /mlflow-bug"

# Fix CI / lint / tests (156 NL uses)
elif echo "$LP" | grep -qE '\bfix (the )?(ci|lint|linter|tests?|build|failing)\b|\b(ci|lint|linter|build) (is )?failing\b|\bfailing (ci|tests?|build|lint)\b'; then
  SKILL="ci-fix"
  HINT="Use the ci-fix skill to diagnose and fix the failures. Run: /ci-fix"

# Push changes (131 NL uses vs 42 slash uses)
elif echo "$LP" | grep -qE '\bpush (this|it|the changes|the code|the commit|the branch)\b|\bcan you push\b|\bgo ahead and push\b'; then
  SKILL="quick-push"
  HINT="Use the quick-push skill to push changes. Run: /quick-push"

# Address PR comments (94 NL uses vs 1 slash use)
elif echo "$LP" | grep -qE '\b(address|resolve|respond to|handle|fix) (the |pr |review )?(comments?|feedback|review)\b|\bpr comments?\b|\breview comments?\b'; then
  SKILL="resolve-pr-comments"
  HINT="Use the resolve-pr-comments skill to address PR review feedback. Run: /resolve-pr-comments"

# Code review (78 NL uses vs 14 slash uses)
elif echo "$LP" | grep -qE '\breview (this|the pr|my |the diff|the code|the changes)\b|\bcode review\b|\breview it\b'; then
  SKILL="code-review:code-review"
  HINT="Use the code-review skill to review the code. Run: /code-review:code-review"

# What's next / priority dashboard
elif echo "$LP" | grep -qE "\bwhat.?s next\b|\bmy status\b|\bprioritize (my )?day\b|\bwhat (should|do) i (do|have)\b|\bmorning briefing\b|\bstart my day\b|\bwhat.?s on my plate\b|\btriage my work\b|\bwhat.?s urgent\b|\bquick status\b|\bdaily standup\b"; then
  SKILL="whats-next"
  HINT="Use the whats-next skill to see a prioritized dashboard of all your work. Run: /whats-next"

# --- Tier 2: Medium-impact keywords ---

# Simplify / refactor (57 NL uses)
elif echo "$LP" | grep -qE '\bsimplify (this|the|it)\b|\brefactor (this|the|it)\b|\bclean (this |it )?up\b'; then
  SKILL="simplify"
  HINT="Use the simplify skill to clean up and refactor the code. Run: /simplify"

# Blog writing (48 NL uses)
elif echo "$LP" | grep -qE '\bblog post\b|\bwrite a blog\b|\bdraft a blog\b|\bedit (the )?blog\b'; then
  SKILL="blog-writing"
  HINT="Use the blog-writing skill for this blog content. Run: /blog-writing"

# Confluence / docs (39 NL uses)
elif echo "$LP" | grep -qE '\bconfluence\b|\bwiki page\b|\bupdate (the )?docs\b|\boncall docs\b|\brunbook\b|\bsop\b'; then
  SKILL="ai-ops-confluence-docs"
  HINT="Use the ai-ops-confluence-docs skill for Confluence documentation. Run: /ai-ops-confluence-docs"

# Sync upstream (21 NL uses vs 0 slash uses)
elif echo "$LP" | grep -qE '\bsync (with )?(upstream|master|main)\b|\brebase off\b|\bpull from upstream\b'; then
  SKILL="sync-upstream"
  HINT="Use the sync-upstream skill to sync with upstream. Run: /sync-upstream"

# Babysit PR (11 NL uses)
elif echo "$LP" | grep -qE '\bbabysit\b|\bmonitor (the |this )?pr\b|\bwatch (the |this )?pr\b|\bkeep an eye on\b'; then
  SKILL="babysit-pr:monitor-pr"
  HINT="Use the babysit-pr skill to monitor this PR. Run: /babysit-pr:monitor-pr"

# Session pause/resume
elif echo "$LP" | grep -qE '\bhandoff\b|\bsession pause\b|\bhand off\b|\bpause (the )?session\b'; then
  SKILL="session_pause"
  HINT="Use the session_pause skill to create a handoff file. Run: /session_pause"
elif echo "$LP" | grep -qE '\bpick up where\b|\bsession resume\b|\bresume (the )?session\b'; then
  SKILL="session_resume"
  HINT="Use the session_resume skill to resume from the handoff file. Run: /session_resume"

# Peer feedback
elif echo "$LP" | grep -qE '\bpeer feedback\b|\bperf feedback\b|\bwrite feedback for\b'; then
  SKILL="peer-feedback"
  HINT="Use the peer-feedback skill to structure peer feedback. Run: /peer-feedback"

# Create ticket
elif echo "$LP" | grep -qE '\bcreate (a )?ticket\b|\bfile (a )?ticket\b|\bnew ticket\b|\blog (a )?ticket\b'; then
  SKILL="create-ticket"
  HINT="Use the create-ticket skill to file a Jira ticket. Run: /create-ticket"
fi

# --- Pattern-based detection ---

# ML-NNNNN ticket reference (auto-detect bare ticket numbers)
if [ -z "$SKILL" ]; then
  TICKET=$(echo "$USER_PROMPT" | grep -oE 'ML-[0-9]{4,5}' | head -1)
  if [ -n "$TICKET" ]; then
    SKILL="fix-ticket"
    HINT="Detected ticket reference $TICKET. Use the fix-ticket skill to implement it. Run: /fix-ticket $TICKET"
  fi
fi

# Output system message if skill detected
if [ -n "$SKILL" ]; then
  if command -v jq &> /dev/null; then
    echo "{\"systemMessage\": $(echo "Keyword match: /$SKILL -- $HINT" | jq -Rs .)}"
  else
    # Escape for JSON manually
    MSG="Keyword match: /$SKILL -- $HINT"
    MSG=$(echo "$MSG" | sed 's/\\/\\\\/g; s/"/\\"/g')
    echo "{\"systemMessage\": \"$MSG\"}"
  fi
fi

exit 0
