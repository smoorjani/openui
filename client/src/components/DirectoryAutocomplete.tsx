import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { FolderOpen } from "lucide-react";

interface DirectoryAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (path: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

interface DirEntry {
  name: string;
  path: string;
}

interface SuggestionSection {
  label: string;
  items: DirEntry[];
}

export function DirectoryAutocomplete({
  value,
  onChange,
  onSelect,
  disabled,
  placeholder,
  className,
}: DirectoryAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sections, setSections] = useState<SuggestionSection[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const recentsCacheRef = useRef<DirEntry[] | null>(null);
  const recentsPromiseRef = useRef<Promise<DirEntry[]> | null>(null);

  // Flatten sections into a single list for keyboard navigation
  const allItems = sections.flatMap((s) => s.items);
  const allItemsRef = useRef(allItems);
  allItemsRef.current = allItems;

  // Fetch recent directories (cached for modal lifetime, deduped via promise ref)
  const fetchRecents = useCallback(async (): Promise<DirEntry[]> => {
    if (recentsCacheRef.current) return recentsCacheRef.current;
    if (recentsPromiseRef.current) return recentsPromiseRef.current;
    const promise = fetch("/api/recent-dirs")
      .then((res) => res.json())
      .then((data) => {
        const dirs: DirEntry[] = data.directories || [];
        recentsCacheRef.current = dirs;
        return dirs;
      })
      .catch(() => {
        recentsPromiseRef.current = null; // allow retry on next focus/keystroke
        return [] as DirEntry[];
      });
    recentsPromiseRef.current = promise;
    return promise;
  }, []);

  // Fetch directory matches from /api/browse with query
  const fetchMatches = useCallback(
    async (parentPath: string, query: string): Promise<DirEntry[]> => {
      try {
        const params = new URLSearchParams({ path: parentPath });
        if (query) params.set("query", query);
        const res = await fetch(`/api/browse?${params}`);
        const data = await res.json();
        return data.directories || [];
      } catch {
        return [];
      }
    },
    []
  );

  // Split typed value into parent path and partial name
  const splitPath = useCallback(
    (input: string): { parent: string; partial: string } => {
      if (!input || input === "~") return { parent: input || "~", partial: "" };
      if (input.endsWith("/")) return { parent: input, partial: "" };
      const lastSlash = input.lastIndexOf("/");
      if (lastSlash === -1) return { parent: ".", partial: input };
      return {
        parent: input.substring(0, lastSlash + 1),
        partial: input.substring(lastSlash + 1),
      };
    },
    []
  );

  // Build suggestions based on current input
  const updateSuggestions = useCallback(
    async (input: string) => {
      const id = ++requestIdRef.current;
      setLoading(true);

      const recents = await fetchRecents();
      const { parent, partial } = splitPath(input);

      // Fetch filesystem matches
      const matches = await fetchMatches(parent, partial);

      // Discard stale response
      if (id !== requestIdRef.current) return;

      const newSections: SuggestionSection[] = [];

      // Filter recents that match the current input
      const matchingRecents = input
        ? recents.filter((r) => r.path.toLowerCase().includes(input.toLowerCase()))
        : recents;

      // Deduplicate: remove from matches any paths already in recents
      const recentPaths = new Set(matchingRecents.map((r) => r.path));
      const uniqueMatches = matches.filter((m) => !recentPaths.has(m.path));

      if (matchingRecents.length > 0) {
        newSections.push({ label: "Recent", items: matchingRecents });
      }
      if (uniqueMatches.length > 0) {
        newSections.push({ label: "Matches", items: uniqueMatches });
      }

      setSections(newSections);
      setActiveIndex(-1);
      setIsOpen(newSections.some((s) => s.items.length > 0));
      setLoading(false);
    },
    [fetchRecents, fetchMatches, splitPath]
  );

  // Handle input change with debounce
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Immediately fetch on "/" (navigating deeper)
      if (newValue.endsWith("/")) {
        updateSuggestions(newValue);
      } else {
        debounceRef.current = setTimeout(() => {
          updateSuggestions(newValue);
        }, 200);
      }
    },
    [onChange, updateSuggestions]
  );

  // Handle focus — show recents
  const handleFocus = useCallback(() => {
    updateSuggestions(value);
  }, [value, updateSuggestions]);

  // Handle item selection
  const selectItem = useCallback(
    (item: DirEntry) => {
      onChange(item.path);
      onSelect(item.path);
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange, onSelect]
  );

  // Keyboard navigation (uses refs for always-current data)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) return;
      const items = allItemsRef.current;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < items.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : items.length - 1
          );
          break;
        case "Enter":
        case "Tab":
          if (activeIndex >= 0 && activeIndex < items.length) {
            e.preventDefault();
            selectItem(items[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    },
    [isOpen, activeIndex, selectItem]
  );

  // Close dropdown on blur (with delay to allow click-on-item to fire first)
  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(-1);
    }, 150);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  // Update dropdown position based on input's viewport position
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen, sections]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll("[data-autocomplete-item]");
      items[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Pre-compute section offsets for flat indexing in keyboard navigation
  const sectionOffsets = sections.map((_, i) =>
    sections.slice(0, i).reduce((sum, s) => sum + s.items.length, 0)
  );

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full ${className}`}
        autoComplete="off"
      />

      {isOpen && !disabled && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
          className="z-[9999] rounded-md border border-border bg-canvas shadow-lg max-h-60 overflow-y-auto"
        >
          {sections.map((section, sectionIdx) => (
            <div key={section.label}>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 bg-surface border-b border-border sticky top-0">
                {section.label}
              </div>
              {section.items.map((item, i) => {
                const idx = sectionOffsets[sectionIdx] + i;
                return (
                  <button
                    key={item.path}
                    data-autocomplete-item
                    onClick={() => selectItem(item)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                      idx === activeIndex
                        ? "bg-surface-active text-white"
                        : "text-zinc-300 hover:bg-surface-active hover:text-white"
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                    <span className="truncate font-mono text-xs">{item.path}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {loading && sections.length === 0 && (
            <div className="px-3 py-3 text-center text-xs text-zinc-500">
              Loading...
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
