# OpenUI

**AI Agent Command Center**

Manage multiple AI coding agents working in parallel. See what each agent is working on, their status, and jump in when they need help.

## Setup

```bash
git clone git@github.com:smoorjani/openui.git
cd openui

bun install
cd client && bun install && cd ..
```

## Running

```bash
bun run dev
```

Opens at `http://localhost:6969`. Server runs on port 6968.

## Usage

1. Click "+" to spawn agents
2. Click any session to open its terminal
3. Use categories to organize sessions

## Tech Stack

- **Runtime**: Bun
- **Backend**: Hono + WebSockets + bun-pty
- **Frontend**: React + xterm.js
- **State**: Zustand

## Requirements

- Bun 1.0+
- Claude Code (`isaac`)
