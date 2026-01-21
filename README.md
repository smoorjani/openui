<div align="center">

# OpenUI

### The Visual Canvas for AI Coding Agents

Stop juggling terminal windows. See all your AI agents at once.

[Demo](#demo) | [Install](#installation) | [Features](#features) | [Contributing](#contributing)

<!-- Add actual screenshot here -->
![OpenUI Canvas](https://via.placeholder.com/800x450/1a1a2e/ffffff?text=OpenUI+Canvas+Screenshot)

</div>

---

## The Problem

You're using Claude Code, OpenCode, or other AI coding agents. You have 5 terminal tabs open. You can't remember which agent is working on what. One is waiting for input and you didn't notice. Sound familiar?

## The Solution

**OpenUI** gives you a visual canvas where every AI agent is a node you can see, organize, and interact with — all in one place.

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│    ┌──────────┐     ┌──────────┐     ┌──────────┐            │
│    │  Claude  │     │  Claude  │     │ OpenCode │            │
│    │  Code    │     │  Code    │     │          │            │
│    │ ● RUNNING│     │ ○ IDLE   │     │ ⏳ WAITING│            │
│    └──────────┘     └──────────┘     └──────────┘            │
│         │                                   │                  │
│         └───────────── Canvas ─────────────┘                  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

## Demo

<!-- Replace with actual GIF/video -->
https://github.com/user-attachments/assets/your-demo-video

## Features

**Visual Agent Management**
- Spawn multiple AI agents on an infinite canvas
- Drag, drop, and arrange agents however you like
- Color-code and name your agents for easy identification

**Real-time Status Monitoring**
- See at a glance: running, idle, waiting for input, or error
- Never miss when an agent needs your attention

**Integrated Terminal**
- Full terminal emulation right in the browser
- Click any agent to open its terminal session
- Everything you'd expect: colors, scrollback, resize support

**Session Persistence**
- Your layout survives browser refreshes
- Pick up right where you left off

**Supported Agents**
- Claude Code (Anthropic's official CLI)
- OpenCode
- More coming soon...

## Installation

### Prerequisites

- [Bun](https://bun.sh) runtime

```bash
curl -fsSL https://bun.sh/install | bash
```

### Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/openui.git
cd openui

# Install dependencies
bun install
bun run install:client

# Start OpenUI
bun run dev
```

Then open [http://localhost:5173](http://localhost:5173)

### One-liner (coming soon)

```bash
bunx openui
```

## Usage

1. **Start OpenUI** — Run `bun run dev` from the project root
2. **Add an agent** — Click the + button to spawn a new AI agent
3. **Interact** — Click any agent node to open its terminal
4. **Organize** — Drag nodes around the canvas to arrange your workspace
5. **Customize** — Right-click to rename, recolor, or add notes

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | [Bun](https://bun.sh) |
| Backend | [Hono](https://hono.dev) + WebSockets |
| Frontend | [React](https://react.dev) + [Vite](https://vitejs.dev) |
| Canvas | [React Flow](https://reactflow.dev) |
| Terminal | [xterm.js](https://xtermjs.org) |
| State | [Zustand](https://zustand-demo.pmnd.rs) |
| Styling | [Tailwind CSS](https://tailwindcss.com) |

## Architecture

```
Browser                          Server (Bun)
┌─────────────────────┐         ┌─────────────────────┐
│                     │         │                     │
│  React + ReactFlow  │◄──REST──►  Hono HTTP Server   │
│                     │         │                     │
│  xterm.js Terminal  │◄──WS────►  PTY Sessions       │
│                     │         │  (bun-pty)          │
│  Zustand Store      │         │                     │
│                     │         │  State Persistence  │
└─────────────────────┘         │  ~/.openui/         │
                                └─────────────────────┘
```

## Development

```bash
# Run in development mode (hot reload)
bun run dev

# Build for production
bun run build

# Run production server
bun run start
```

## Roadmap

- [ ] Plugin system for custom agents
- [ ] Agent-to-agent communication
- [ ] Shared canvas sessions (multiplayer)
- [ ] Task queuing and orchestration
- [ ] Docker support
- [ ] Cloud deployment option

## Contributing

Contributions are welcome! Whether it's:

- Bug reports
- Feature requests
- Pull requests
- Documentation improvements

Please feel free to open an issue or submit a PR.

## License

MIT

---

<div align="center">

**If OpenUI helps you manage your AI agents better, give it a star!**

Made with coffee and too many terminal tabs

</div>
