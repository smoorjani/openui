import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Globe } from "lucide-react";

interface AddWebsiteModalProps {
  open: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
  onCreateWebsiteNode: (url: string, position: { x: number; y: number }, title?: string) => void;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function AddWebsiteModal({ open, onClose, position, onCreateWebsiteNode }: AddWebsiteModalProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl("");
      setTitle("");
      setTimeout(() => urlInputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    let finalUrl = url.trim();
    if (!finalUrl) return;

    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = `https://${finalUrl}`;
    }

    if (!isValidUrl(finalUrl)) return;

    const pos = position || { x: 200, y: 200 };
    onCreateWebsiteNode(finalUrl, pos, title.trim() || undefined);
    onClose();
  }, [url, title, position, onCreateWebsiteNode, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-modal-overlay
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />

          <motion.div
            className="relative w-[380px] rounded-xl border overflow-hidden"
            style={{ backgroundColor: "#1a1a1a", borderColor: "#2a2a2a" }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-zinc-200">Add Website</span>
              </div>
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">URL</label>
                <input
                  ref={urlInputRef}
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  Title <span className="text-zinc-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Website"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={!url.trim()}
                className="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                Add
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
