import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useStore, AgentStatus } from "../stores/useStore";

interface TerminalProps {
  sessionId: string;
  color: string;
  nodeId: string;
}

export function Terminal({ sessionId, color, nodeId }: TerminalProps) {
  const updateSession = useStore((state) => state.updateSession);
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!terminalRef.current || !sessionId) return;

    // Prevent double mount in strict mode
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Clear container completely
    while (terminalRef.current.firstChild) {
      terminalRef.current.removeChild(terminalRef.current.firstChild);
    }

    // Create terminal
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 12,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace',
      fontWeight: "400",
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: "#0d0d0d",
        foreground: "#d4d4d4",
        cursor: color,
        cursorAccent: "#0d0d0d",
        selectionBackground: "#3b3b3b",
        selectionForeground: "#ffffff",
        black: "#1a1a1a",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#fbbf24",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#d4d4d4",
        brightBlack: "#525252",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fcd34d",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Helper to fit and send resize - only when visible with valid dimensions
    const fitAndResize = (ws: WebSocket | null) => {
      if (!fitAddonRef.current || !xtermRef.current) return;

      // Check if terminal container is visible and has size
      const rect = terminalRef.current?.getBoundingClientRect();
      if (!rect || rect.width < 50 || rect.height < 50) return;

      fitAddonRef.current.fit();

      const cols = xtermRef.current.cols;
      const rows = xtermRef.current.rows;

      // Only send if we have valid dimensions
      if (cols > 0 && rows > 0 && ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    };

    // Initial fit with delay
    setTimeout(() => fitAndResize(null), 50);

    // Connect WebSocket with small delay to allow session to be ready
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws?sessionId=${sessionId}`;

    let ws: WebSocket | null = null;

    const connectWs = () => {
      if (!mountedRef.current) return;

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // Send resize immediately after connection
        fitAndResize(ws);

        // Send multiple resize events to ensure TUI syncs properly
        setTimeout(() => fitAndResize(ws), 200);
        setTimeout(() => fitAndResize(ws), 500);
        setTimeout(() => fitAndResize(ws), 1000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            term.write(msg.data);
          } else if (msg.type === "status") {
            updateSession(nodeId, {
              status: msg.status as AgentStatus,
              isRestored: msg.isRestored,
              currentTool: msg.currentTool,
            });
          }
        } catch (e) {
          term.write(event.data);
        }
      };

      ws.onerror = () => {
        // Silently handle errors - don't spam the terminal
      };

      ws.onclose = () => {
        // Only show if not intentionally closed
      };
    };

    // Small delay to let server session be ready
    const connectTimeout = setTimeout(connectWs, 100);

    // Handle Shift+Enter to insert newline
    term.attachCustomKeyEventHandler((event) => {
      if (event.key === 'Enter' && event.shiftKey) {
        // Send newline only on keydown, but block ALL event types (keydown, keypress, keyup)
        // to prevent double newlines from keypress also being processed
        if (event.type === 'keydown' && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "input", data: "\n" }));
        }
        return false; // Block all Shift+Enter events
      }
      return true; // Allow default handling for other keys
    });

    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Debounced resize handling
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastCols = 0;
    let lastRows = 0;

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);

      resizeTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          if (!fitAddonRef.current || !xtermRef.current) return;

          fitAddonRef.current.fit();

          const cols = xtermRef.current.cols;
          const rows = xtermRef.current.rows;

          // Only send if dimensions actually changed and are valid
          if (cols > 0 && rows > 0 && (cols !== lastCols || rows !== lastRows)) {
            lastCols = cols;
            lastRows = rows;

            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "resize", cols, rows }));
            }
          }
        });
      }, 50);
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      mountedRef.current = false;
      clearTimeout(connectTimeout);
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [sessionId, color, nodeId, updateSession]);

  return (
    <div
      ref={terminalRef}
      className="w-full h-full"
      style={{ 
        padding: "12px", 
        backgroundColor: "#0d0d0d",
        minHeight: "200px"
      }}
    />
  );
}
