import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface ShellTerminalProps {
  sessionId: string;
  cwd: string;
  color: string;
}

export function ShellTerminal({ sessionId, cwd, color }: ShellTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!terminalRef.current || !sessionId) return;

    if (mountedRef.current) return;
    mountedRef.current = true;

    while (terminalRef.current.firstChild) {
      terminalRef.current.removeChild(terminalRef.current.firstChild);
    }

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
    term.write("\x1b[0m\x1b[?25h");
    setTimeout(() => fitAddon.fit(), 50);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/shell?sessionId=${sessionId}&cwd=${encodeURIComponent(cwd)}`;

    let ws: WebSocket | null = null;

    const connectWs = () => {
      if (!mountedRef.current) return;

      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (xtermRef.current) {
          ws?.send(JSON.stringify({ type: "resize", cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            term.write(msg.data);
          }
        } catch (e) {
          term.write(event.data);
        }
      };

      ws.onerror = () => {};
      ws.onclose = () => {};
    };

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
      return true;
    });

    term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
        if (ws?.readyState === WebSocket.OPEN && xtermRef.current) {
          ws.send(JSON.stringify({
            type: "resize",
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows
          }));
        }
      });
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      mountedRef.current = false;
      clearTimeout(connectTimeout);
      resizeObserver.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [sessionId, cwd, color]);

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
