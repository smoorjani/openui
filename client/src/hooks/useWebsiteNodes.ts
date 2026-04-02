import { useCallback, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useStore } from "../stores/useStore";

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function snapToGrid(value: number, gridSize = 24): number {
  return Math.round(value / gridSize) * gridSize;
}

export function useWebsiteNodes() {
  const reactFlowInstance = useReactFlow();

  const createWebsiteNode = useCallback((url: string, position: { x: number; y: number }, title?: string) => {
    const nodeId = `website-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = url;
    }
    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
    const currentCanvasId = useStore.getState().activeCanvasId;

    useStore.getState().addNode({
      id: nodeId,
      type: "website" as const,
      position,
      data: {
        url,
        title: title || hostname,
        favicon,
        canvasId: currentCanvasId || "canvas-default",
      },
    });

    fetch("/api/website-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId,
        url,
        title: title || hostname,
        favicon,
        position,
        canvasId: currentCanvasId,
      }),
    }).catch(console.error);

    if (!title) {
      fetch(`/api/url-title?url=${encodeURIComponent(url)}`)
        .then(res => res.json())
        .then(({ title: fetchedTitle }) => {
          if (fetchedTitle) {
            useStore.getState().updateNode(nodeId, {
              data: { url, title: fetchedTitle, favicon, canvasId: currentCanvasId || "canvas-default" },
            });
            fetch(`/api/website-nodes/${nodeId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: fetchedTitle }),
            }).catch(console.error);
          }
        })
        .catch(() => {});
    }
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();

    const url =
      event.dataTransfer.getData("text/uri-list") ||
      event.dataTransfer.getData("text/plain") ||
      event.dataTransfer.getData("URL");

    if (!url || !isValidUrl(url)) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    createWebsiteNode(url, {
      x: snapToGrid(position.x),
      y: snapToGrid(position.y),
    });
  }, [reactFlowInstance, createWebsiteNode]);

  // Paste URL from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      let url = text;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        if (/^[\w.-]+\.\w{2,}(\/|$)/.test(url)) {
          url = `https://${url}`;
        } else {
          return;
        }
      }
      if (!isValidUrl(url)) return;

      e.preventDefault();

      const canvasDiv = document.querySelector("[data-tour='canvas-area']");
      const w = canvasDiv?.clientWidth || 800;
      const h = canvasDiv?.clientHeight || 600;
      const center = reactFlowInstance.screenToFlowPosition({ x: w / 2, y: h / 2 });

      createWebsiteNode(url, {
        x: snapToGrid(center.x),
        y: snapToGrid(center.y),
      });
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [reactFlowInstance, createWebsiteNode]);

  return { createWebsiteNode, onDragOver, onDrop };
}
