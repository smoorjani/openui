import { Terminal as XTerm, type FontWeight } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { readSnapshot, writeSnapshot, clearLegacySnapshot } from "./terminalSnapshot";
import { useStore } from "../stores/useStore";
import { DARK_TERMINAL_THEME, LIGHT_TERMINAL_THEME, getTerminalTheme } from "./terminalTheme";
import { getTerminalFontFamily } from "./terminalFont";
import { setupImageUpload } from "./imageUpload";

interface PooledTerminal {
  id: string;
  sessionId: string;
  nodeId: string;
  color: string;
  isShell: boolean;
  term: XTerm;
  fitAddon: FitAddon;
  serializeAddon: SerializeAddon;
  webglAddon: WebglAddon | null;
  container: HTMLDivElement;
  ws: WebSocket | null;
  wsReconnectTimer: ReturnType<typeof setTimeout> | null;
  lastSeq: number;
  committedSeq: number;
  lastAccessTime: number;
  userScrolledUp: boolean;
  // Pre-write snapshot of viewportY for restoring position when auto-scroll is off.
  // Set just before write(), cleared in write callback. Accessed by onWriteParsed.
  targetViewportY: number;
  cacheTimeout: ReturnType<typeof setTimeout> | null;
  resizeObserver: ResizeObserver | null;
  cleanupImageUpload: (() => void) | null;
  alive: boolean; // false after release()
}

export interface PoolCallbacks {
  onStatusUpdate: (nodeId: string, updates: any) => void;
  onAuthRequired: (url: string) => void;
  onAuthClear: () => void;
  getScrollEnabled: () => boolean;
}

export class TerminalPool {
  private pool = new Map<string, PooledTerminal>();
  private maxSize: number;
  private callbacks: PoolCallbacks;
  private currentlyAttachedId: string | null = null;
  private unsubTheme: (() => void) | null = null;

  constructor(maxSize: number, callbacks: PoolCallbacks) {
    this.maxSize = maxSize;
    this.callbacks = callbacks;

    // Update all pooled terminals when theme changes
    this.unsubTheme = useStore.subscribe((state) => {
      const t = state.theme === "light" ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME;
      for (const [, entry] of this.pool) {
        if (!entry.alive) continue;
        entry.term.options.theme = { ...t, cursor: entry.color };
        entry.container.style.backgroundColor = t.background;
      }
    });

    // Recover from background tab GPU reclamation — browsers kill WebGL contexts
    // when a tab is inactive. When the tab becomes visible again, re-initialize
    // WebGL for all pooled terminals that lost their context.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      console.log(`[pool] Tab visible — checking ${this.pool.size} pooled terminals`);
      for (const [id, entry] of this.pool) {
        if (!entry.alive) continue;
        const hasWebgl = !!entry.webglAddon;
        const wsState = entry.ws?.readyState ?? -1;
        const dims = `${entry.container.clientWidth}x${entry.container.clientHeight}`;
        const display = entry.container.style.display;
        console.log(`[pool]   ${id}: webgl=${hasWebgl} ws=${wsState} dims=${dims} display="${display}"`);
        if (!hasWebgl) {
          console.log(`[pool]   ${id}: WebGL lost — recreating`);
          try {
            const addon = new WebglAddon();
            addon.onContextLoss(() => {
              console.log(`[pool] WebGL context lost for ${entry.id}`);
              addon.dispose();
              entry.webglAddon = null;
            });
            entry.term.loadAddon(addon);
            entry.webglAddon = addon;
            console.log(`[pool]   ${id}: WebGL recreated successfully`);
          } catch (e) {
            console.log(`[pool]   ${id}: WebGL recreation failed: ${e}`);
          }
        }
      }
    });
  }

  /** Get or create a pooled terminal. Updates LRU time. Evicts if needed. */
  acquire(
    id: string,
    sessionId: string,
    nodeId: string,
    color: string,
    isShell: boolean
  ): PooledTerminal {
    const existing = this.pool.get(id);
    if (existing) {
      existing.lastAccessTime = Date.now();
      return existing;
    }

    // Evict LRU if pool is full
    while (this.pool.size >= this.maxSize) {
      this._evictLRU();
    }

    const entry = this._createTerminal(id, sessionId, nodeId, color, isShell);
    this.pool.set(id, entry);
    return entry;
  }

  /** Remove from pool, saving snapshot and disposing everything. */
  release(id: string): void {
    const entry = this.pool.get(id);
    if (!entry) return;
    this._dispose(entry);
    this.pool.delete(id);
    if (this.currentlyAttachedId === id) {
      this.currentlyAttachedId = null;
    }
  }

  /** Show terminal in the mount point (hide others). */
  attachTo(id: string, mountPoint: HTMLDivElement): void {
    const entry = this.pool.get(id);
    if (!entry) return;

    // Hide previous terminal
    if (this.currentlyAttachedId && this.currentlyAttachedId !== id) {
      const prev = this.pool.get(this.currentlyAttachedId);
      if (prev) prev.container.style.display = "none";
    }

    // Ensure container is in the current mount point.
    // entry.container.parentNode may be non-null but disconnected (the old mount
    // point was removed from the document when the sidebar unmounted). In that
    // case clientWidth/Height will be 0, so we must re-parent to the new mount.
    if (entry.container.parentNode !== mountPoint) {
      if (entry.container.parentNode) {
        entry.container.parentNode.removeChild(entry.container);
      }
      entry.container.style.display = "none";
      mountPoint.appendChild(entry.container);
    }

    // Show this terminal
    entry.container.style.display = "";
    this.currentlyAttachedId = id;

    // Reset scroll tracking — user expects to see latest output
    entry.userScrolledUp = false;

    const dims = `${entry.container.clientWidth}x${entry.container.clientHeight}`;
    const wsState = entry.ws?.readyState ?? -1;
    console.log(`[pool] attachTo ${id}: webgl=${!!entry.webglAddon} ws=${wsState} dims=${dims} rows=${entry.term.rows} cols=${entry.term.cols}`);

    // Wait for container to have real dimensions before fitting + loading WebGL.
    // The container was just appended/shown, but the browser may not have laid it
    // out yet (clientWidth/Height = 0). Poll via rAF up to 10 frames.
    const tryFitAndInit = (attemptsLeft: number) => {
      if (!entry.alive) return;

      if (entry.container.clientWidth === 0 || entry.container.clientHeight === 0) {
        if (attemptsLeft > 0) {
          requestAnimationFrame(() => tryFitAndInit(attemptsLeft - 1));
          return;
        }
        console.log(`[pool] attachTo ${id}: gave up waiting for dimensions`);
        return;
      }

      try { entry.fitAddon.fit(); } catch {}

      // Lazily load WebGL addon on first show (needs a properly-sized canvas)
      if (!entry.webglAddon) {
        try {
          const addon = new WebglAddon();
          addon.onContextLoss(() => {
            addon.dispose();
            entry.webglAddon = null;
          });
          entry.term.loadAddon(addon);
          entry.webglAddon = addon;
        } catch (e) {
          console.log(`[pool] attachTo ${id}: WebGL load failed: ${e}`);
        }
      }

      entry.term.scrollToBottom();
      entry.term.focus();

      if (entry.term.cols > 20 && entry.term.rows > 5 && entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({
          type: "resize",
          cols: entry.term.cols,
          rows: entry.term.rows,
        }));
      }
    };

    requestAnimationFrame(() => tryFitAndInit(10));
  }

  /** Park terminal in the off-screen holding div (stays alive, stays in document). */
  detach(id: string): void {
    const entry = this.pool.get(id);
    if (!entry) return;
    entry.container.style.display = "none";
    // Free WebGL context while hidden — attachTo() will re-create lazily.
    // Only the visible terminal needs a GPU context; parking all of them
    // would exhaust the browser's WebGL context limit (~16 Chrome, ~8 Safari).
    if (entry.webglAddon) {
      try { entry.webglAddon.dispose(); } catch {}
      entry.webglAddon = null;
    }
    if (this.currentlyAttachedId === id) {
      this.currentlyAttachedId = null;
    }
  }

  /** Detach all terminals. */
  detachAll(): void {
    for (const [id] of this.pool) {
      this.detach(id);
    }
  }

  /** Refit all pooled terminals (e.g., on window resize). */
  resize(): void {
    for (const [, entry] of this.pool) {
      if (!entry.alive) continue;
      try {
        entry.fitAddon.fit();
      } catch {}
      if (entry.ws?.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify({
          type: "resize",
          cols: entry.term.cols,
          rows: entry.term.rows,
        }));
      }
    }
  }

  /** Check if a terminal is in the pool. */
  has(id: string): boolean {
    return this.pool.has(id);
  }

  /** Apply updated font settings to all currently open terminals. */
  updateFontSettings(): void {
    const fontFamily = getTerminalFontFamily();
    const fontSize = parseInt(localStorage.getItem("openui-terminal-font-size") || "12", 10);
    const fontWeight = (localStorage.getItem("openui-terminal-font-weight") || "400") as FontWeight;

    for (const entry of this.pool.values()) {
      if (!entry.alive) continue;
      entry.term.options.fontFamily = fontFamily;
      entry.term.options.fontSize = fontSize;
      entry.term.options.fontWeight = fontWeight;
      try { entry.fitAddon.fit(); } catch {}
    }
  }

  /** Dispose everything (app unmount). */
  destroy(): void {
    this.unsubTheme?.();
    this.unsubTheme = null;
    for (const [id] of this.pool) {
      this.release(id);
    }
  }

  // --- Private ---

  private _createTerminal(
    id: string,
    sessionId: string,
    nodeId: string,
    color: string,
    isShell: boolean
  ): PooledTerminal {
    // Create off-screen container
    const container = document.createElement("div");
    container.className = "w-full h-full overflow-hidden";
    const termTheme = getTerminalTheme();
    container.style.cssText = `padding: 12px; background-color: ${termTheme.background}; min-height: 200px; box-sizing: border-box;`;

    // Create xterm
    const fontFamily = getTerminalFontFamily();
    const fontSize = parseInt(localStorage.getItem("openui-terminal-font-size") || "12", 10);
    const fontWeight = (localStorage.getItem("openui-terminal-font-weight") || "400") as FontWeight;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize,
      fontFamily,
      fontWeight,
      lineHeight: 1.4,
      letterSpacing: 0,
      theme: { ...termTheme, cursor: color },
      allowProposedApi: true,
      scrollback: 7500,
    });

    // Load addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const serializeAddon = new SerializeAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(serializeAddon);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";

    // Open terminal into the off-screen container
    term.open(container);

    // Skip initial fit — container has zero dimensions until attachTo().
    // WebGL addon is also deferred to attachTo() so it gets a properly-sized canvas.
    let webglAddon: WebglAddon | null = null;

    // Reset attributes and show cursor
    term.write("\x1b[0m\x1b[?25h");

    const entry: PooledTerminal = {
      id,
      sessionId,
      nodeId,
      color,
      isShell,
      term,
      fitAddon,
      serializeAddon,
      webglAddon,
      container,
      ws: null,
      wsReconnectTimer: null,
      lastSeq: 0,
      committedSeq: 0,
      lastAccessTime: Date.now(),
      userScrolledUp: false,
      targetViewportY: -1,
      cacheTimeout: null,
      resizeObserver: null,
      cleanupImageUpload: null,
      alive: true,
    };

    // Drop legacy snapshot keys
    clearLegacySnapshot(sessionId);

    // Restore from cache
    const snapshot = readSnapshot(sessionId, term.cols);
    let restoredFromCache = false;
    if (snapshot) {
      entry.lastSeq = snapshot.seq;
      entry.committedSeq = snapshot.seq;
      restoredFromCache = true;
    }

    // Correct viewport displacement synchronously during write processing.
    // onScroll fires synchronously when ydisp changes — before any render is
    // scheduled. Correcting here means the render never sees the displaced
    // position, eliminating the flash entirely.
    // onRender/onWriteParsed fire too late (after the frame is already painted).
    term.onScroll((newPosition) => {
      if (!entry.alive) return;
      const scrollEnabled = this.callbacks.getScrollEnabled();
      const bY = term.buffer.active.baseY;
      if (scrollEnabled && !entry.userScrolledUp && newPosition < bY) {
        console.log(`[scroll] onScroll displaced: pos=${newPosition} baseY=${bY} gap=${bY - newPosition} — correcting`);
        term.scrollToBottom();
      } else if (!scrollEnabled && entry.userScrolledUp && entry.targetViewportY >= 0 && newPosition !== entry.targetViewportY) {
        console.log(`[scroll] onScroll pinning: pos=${newPosition} → targetY=${entry.targetViewportY}`);
        term.scrollToLine(entry.targetViewportY);
      }
    });

    // Set up input handler
    term.onData((data) => {
      if (entry.ws?.readyState === WebSocket.OPEN) {
        const filtered = data.replace(/\x1b\[\d+;\d+R/g, "");
        if (filtered) {
          entry.ws.send(JSON.stringify({ type: "input", data: filtered }));
        }
      }
    });

    // Set up resize observer on container
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!entry.alive || container.clientWidth === 0 || container.clientHeight === 0) return;

        const wasAtBottom = term.buffer.active.viewportY >= term.buffer.active.baseY;
        try { fitAddon.fit(); } catch {}
        if (wasAtBottom) term.scrollToBottom();

        // Only send resize if dimensions are reasonable
        if (term.cols > 20 && term.rows > 5 && entry.ws?.readyState === WebSocket.OPEN) {
          entry.ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      }, 150);
    });
    resizeObserver.observe(container);
    entry.resizeObserver = resizeObserver;

    // Set up wheel handler for scroll tracking
    container.addEventListener("wheel", (e: WheelEvent) => {
      if (e.deltaY < 0) {
        entry.userScrolledUp = true;
      } else if (e.deltaY > 0) {
        requestAnimationFrame(() => {
          if (!entry.alive) return;
          if (term.buffer.active.viewportY >= term.buffer.active.baseY) {
            entry.userScrolledUp = false;
          }
        });
      }
    }, { passive: true });

    // Option+Left Arrow: scroll to bottom
    container.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.altKey && e.code === "ArrowLeft") {
        e.preventDefault();
        entry.term.scrollToBottom();
        entry.userScrolledUp = false;
      }
    });

    // Image paste & drop — uploads to server, shows toast with path
    entry.cleanupImageUpload = setupImageUpload(container, sessionId, (filePath) => {
      const toastId = `img-${Date.now()}`;
      useStore.getState().addImageToast({ id: toastId, filePath, sessionId });
      setTimeout(() => useStore.getState().removeImageToast(toastId), 15000);
    });

    // Connect WebSocket — parallel with snapshot restore
    if (snapshot) {
      // Buffer messages until snapshot write completes
      const messageBuffer: MessageEvent[] = [];
      let snapshotWritten = false;

      // Start WS immediately (parallel)
      this._connectWs(entry, restoredFromCache, (event) => {
        if (!snapshotWritten) {
          messageBuffer.push(event);
        } else {
          // After snapshot is written, first message already consumed by buffer flush
          // so we go straight to live handling
          this._handleLiveWsMessage(entry, event);
        }
      });

      // Write snapshot content
      term.write(snapshot.content, () => {
        if (entry.alive) {
          term.scrollToBottom();
          term.focus();
        }
        snapshotWritten = true;
        // Flush buffered messages — the first one gets first-message treatment
        let firstFlushed = false;
        for (const msg of messageBuffer) {
          if (!firstFlushed) {
            firstFlushed = true;
            this._handleFirstWsMessage(entry, msg, restoredFromCache);
          } else {
            this._handleLiveWsMessage(entry, msg);
          }
        }
        messageBuffer.length = 0;
      });
    } else {
      // No cache — connect immediately
      this._connectWs(entry, restoredFromCache);
    }

    return entry;
  }

  private _connectWs(
    entry: PooledTerminal,
    restoredFromCache: boolean,
    messageInterceptor?: (event: MessageEvent) => void
  ): void {
    if (!entry.alive) return;
    // "pending-" prefix means the real sessionId hasn't been assigned yet (worktree still creating).
    // Skip the WebSocket connection entirely to avoid connecting with an invalid session ID.
    if (entry.sessionId.startsWith("pending-")) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsBase = `${protocol}//${window.location.host}/ws?sessionId=${entry.sessionId}`;
    const ws = new WebSocket(`${wsBase}&lastSeq=${entry.committedSeq}`);
    entry.ws = ws;

    // Per-connection first-message tracking via closure
    let isFirstMessage = true;

    ws.onopen = () => {
      // Send current dimensions (no fit() here, just send dims)
      if (entry.alive) {
        ws.send(JSON.stringify({
          type: "resize",
          cols: entry.term.cols,
          rows: entry.term.rows,
        }));
      }
    };

    ws.onmessage = messageInterceptor || ((event) => {
      if (isFirstMessage) {
        isFirstMessage = false;
        this._handleFirstWsMessage(entry, event, restoredFromCache);
      } else {
        this._handleLiveWsMessage(entry, event);
      }
    });

    ws.onerror = () => {};

    ws.onclose = () => {
      // Auto-reconnect after 2s if still alive
      if (entry.alive) {
        entry.wsReconnectTimer = setTimeout(() => {
          if (entry.alive) {
            this._connectWs(entry, true); // always use delta on reconnect
          }
        }, 2000);
      }
    };
  }

  /** Handle the first message from a new WebSocket connection. */
  private _handleFirstWsMessage(
    entry: PooledTerminal,
    event: MessageEvent,
    restoredFromCache: boolean
  ): void {
    if (!entry.alive) return;

    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "output") {
        if (msg.seq !== undefined) {
          entry.lastSeq = msg.seq;
        }

        if (restoredFromCache && (!msg.data || msg.data.length === 0)) {
          // Cache hit — already displaying
          entry.committedSeq = entry.lastSeq;
          entry.term.focus();
        } else if (restoredFromCache && msg.isDelta && msg.data) {
          // Delta replay — append missed output
          console.log(`[scroll] delta-replay write: ${msg.data.length} bytes — hiding container`);
          entry.container.style.opacity = "0";
          const seqAtWrite = entry.lastSeq;
          entry.term.write(msg.data, () => {
            if (entry.alive) {
              entry.committedSeq = seqAtWrite;
              entry.term.scrollToBottom();
              entry.term.focus();
              this._scheduleCacheSave(entry);
              console.log(`[scroll] delta-replay write complete — showing container`);
              entry.container.style.opacity = "";
            }
          });
        } else if (msg.data && msg.data.length > 0) {
          // Full buffer — clear and render fresh.
          // Hide the container during write to avoid the intermediate render
          // flashes that occur as xterm processes the large buffer in chunks.
          console.log(`[scroll] full-buffer write: ${msg.data.length} bytes — hiding container`);
          entry.container.style.opacity = "0";
          entry.term.clear();
          entry.term.write("\x1b[2J\x1b[H\x1b[0m\x1b[?25h");
          const seqAtWrite = entry.lastSeq;
          entry.term.write(msg.data, () => {
            if (entry.alive) {
              entry.committedSeq = seqAtWrite;
              entry.term.scrollToBottom();
              entry.term.focus();
              this._scheduleCacheSave(entry);
              console.log(`[scroll] full-buffer write complete — showing container`);
              entry.container.style.opacity = "";
            }
          });
        } else {
          // No cache, no buffer — empty terminal
          entry.term.write("\x1b[?25h");
          entry.term.focus();
        }
      } else {
        // Non-output first message — delegate to common handler
        this._handleNonOutputMessage(entry, msg);
      }
    } catch {
      entry.term.write(event.data);
    }
  }

  /** Handle all messages after the first from a WebSocket connection. */
  private _handleLiveWsMessage(
    entry: PooledTerminal,
    event: MessageEvent
  ): void {
    if (!entry.alive) return;

    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "output") {
        if (msg.seq !== undefined) {
          entry.lastSeq = msg.seq;
        }

        if (msg.data) {
          const seqAtWrite = entry.lastSeq;
          const scrollEnabled = this.callbacks.getScrollEnabled();

          // Capture viewport position before write so onWriteParsed can restore
          // it when auto-scroll is off and user has scrolled up. -1 = no constraint.
          entry.targetViewportY = (!scrollEnabled && entry.userScrolledUp)
            ? entry.term.buffer.active.viewportY
            : -1;

          entry.term.write(msg.data, () => {
            entry.committedSeq = seqAtWrite;
            entry.targetViewportY = -1;
          });
          this._scheduleCacheSave(entry);
        }
      } else {
        this._handleNonOutputMessage(entry, msg);
      }
    } catch {
      entry.term.write(event.data);
    }
  }

  /** Handle status, auth, and other non-output message types. */
  private _handleNonOutputMessage(
    entry: PooledTerminal,
    msg: any
  ): void {
    if (msg.type === "status" && !entry.isShell) {
      this.callbacks.onStatusUpdate(entry.nodeId, {
        status: msg.status,
        isRestored: msg.isRestored,
        currentTool: msg.currentTool,
        ...(msg.gitBranch ? { gitBranch: msg.gitBranch } : {}),
        longRunningTool: msg.longRunningTool || false,
        ...(msg.model ? { model: msg.model } : {}),
        sleepEndTime: msg.sleepEndTime,
      });
    } else if (msg.type === "auth_required") {
      this.callbacks.onAuthRequired(msg.url);
    } else if (msg.type === "auth_complete") {
      this.callbacks.onAuthClear();
    }
  }

  private _scheduleCacheSave(entry: PooledTerminal): void {
    if (entry.cacheTimeout) clearTimeout(entry.cacheTimeout);
    entry.cacheTimeout = setTimeout(() => {
      if (!entry.alive) return;
      entry.term.write("", () => {
        if (!entry.alive) return;
        try {
          const serialized = entry.serializeAddon.serialize();
          writeSnapshot(entry.sessionId, {
            content: serialized,
            seq: entry.committedSeq,
            cols: entry.term.cols,
            rows: entry.term.rows,
          });
        } catch {}
      });
    }, 500);
  }

  private _evictLRU(): void {
    let oldest: PooledTerminal | null = null;
    for (const [, entry] of this.pool) {
      // Never evict the currently attached terminal
      if (entry.id === this.currentlyAttachedId) continue;
      if (!oldest || entry.lastAccessTime < oldest.lastAccessTime) {
        oldest = entry;
      }
    }
    if (oldest) {
      this.release(oldest.id);
    }
  }

  private _dispose(entry: PooledTerminal): void {
    entry.alive = false;

    // Save snapshot before disposing
    try {
      const serialized = entry.serializeAddon.serialize();
      writeSnapshot(entry.sessionId, {
        content: serialized,
        seq: entry.committedSeq,
        cols: entry.term.cols,
        rows: entry.term.rows,
      });
    } catch {}

    // Clear timers
    if (entry.cacheTimeout) clearTimeout(entry.cacheTimeout);
    if (entry.wsReconnectTimer) clearTimeout(entry.wsReconnectTimer);

    // Disconnect
    entry.resizeObserver?.disconnect();
    entry.cleanupImageUpload?.();
    entry.ws?.close();

    // Dispose WebGL before terminal
    try { entry.webglAddon?.dispose(); } catch {}
    entry.webglAddon = null;
    entry.term.dispose();

    // Remove container from DOM if attached
    if (entry.container.parentNode) {
      entry.container.parentNode.removeChild(entry.container);
    }
  }
}
