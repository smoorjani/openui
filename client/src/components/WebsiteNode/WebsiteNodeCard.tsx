import { useState } from "react";
import { GitPullRequest, GitBranch, Laptop, ExternalLink, Lock, Trash2 } from "lucide-react";

type UrlType = "github-pr" | "local-dev" | "generic";

function detectUrlType(url: string): UrlType {
  if (/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)) return "github-pr";
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|\.local(:\d+)?/.test(url)) return "local-dev";
  return "generic";
}

function extractPrInfo(url: string) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: match[3] };
}

function extractLocalInfo(url: string) {
  const match = url.match(/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/);
  return { port: match?.[2]?.replace(":", "") || "3000" };
}

function getDisplayTitle(url: string, title: string | undefined, urlType: UrlType): string {
  if (title) return title;
  if (urlType === "github-pr") {
    const i = extractPrInfo(url);
    return i ? `${i.repo} #${i.number}` : url;
  }
  if (urlType === "local-dev") return `localhost:${extractLocalInfo(url).port}`;
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const Bar = ({ w }: { w: string }) => (
  <div className="h-2 rounded-sm" style={{ width: w, backgroundColor: "rgba(255,255,255,0.06)" }} />
);

const Block = ({ className = "" }: { className?: string }) => (
  <div className={`rounded-sm ${className}`} style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
);

const GenericSkeleton = () => (
  <div className="p-2.5 space-y-2">
    <div className="flex items-center gap-1.5">
      <Block className="w-3 h-3 rounded-full" />
      <Block className="h-2 w-12" />
      <div className="flex-1" />
      <Block className="h-2 w-6" />
      <Block className="h-2 w-6" />
    </div>
    <Block className="h-5 w-full rounded" />
    <div className="space-y-1">
      <Bar w="100%" />
      <Bar w="75%" />
      <Bar w="50%" />
    </div>
  </div>
);

const GitHubPrSkeleton = ({ url }: { url: string }) => {
  const info = extractPrInfo(url);
  return (
    <div className="p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <GitPullRequest className="w-4 h-4 flex-shrink-0" style={{ color: "#22C55E" }} />
        <span className="text-[10px] font-mono text-zinc-500 truncate">
          {info?.owner}/{info?.repo}
        </span>
        <span className="text-[10px] font-mono text-zinc-600">#{info?.number}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-600">
        <GitBranch className="w-3 h-3" />
        <Block className="h-2 w-16" />
        <span>&larr;</span>
        <Block className="h-2 w-10" />
      </div>
      <div className="space-y-1 px-2 py-1.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
        <Bar w="100%" />
        <Bar w="70%" />
      </div>
    </div>
  );
};

const LocalDevSkeleton = ({ url }: { url: string }) => {
  const { port } = extractLocalInfo(url);
  return (
    <div className="p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono"
          style={{ color: "#60A5FA", backgroundColor: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)" }}
        >
          <Laptop className="w-3 h-3" />
          dev
        </div>
        <span className="text-[10px] font-mono text-zinc-500">:{port}</span>
      </div>
      <div className="rounded overflow-hidden">
        <div className="h-0.5" style={{ background: "linear-gradient(to right, rgba(96,165,250,0.4), #60A5FA, rgba(96,165,250,0.4))" }} />
        <div className="p-2 space-y-1" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
          <div className="flex items-center gap-1.5">
            <Block className="w-3 h-3 rounded" />
            <Block className="h-2 w-10" />
            <div className="flex-1" />
            <Block className="h-2 w-6" />
          </div>
          <Bar w="100%" />
          <Bar w="60%" />
        </div>
      </div>
    </div>
  );
};

// --- Main card ---

interface WebsiteNodeCardProps {
  selected?: boolean;
  title: string;
  url: string;
  hostname: string;
  onDelete: () => void;
}

export function WebsiteNodeCard({ selected, title, url, hostname, onDelete }: WebsiteNodeCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const urlType = detectUrlType(url);
  const displayTitle = getDisplayTitle(url, title !== hostname ? title : undefined, urlType);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {selected && (
        <div
          className="absolute -inset-[3px] rounded-[11px] pointer-events-none"
          style={{ border: "2px solid #60A5FA", boxShadow: "0 0 12px rgba(96,165,250,0.3)" }}
        />
      )}

      {isHovered && (
        <div className="absolute -top-2.5 -right-2.5 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
      )}

      <div
        onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
        className="rounded-lg overflow-hidden transition-all cursor-pointer"
        style={{
          width: 240,
          backgroundColor: "#1a1a1a",
          border: `1px solid ${isHovered && !selected ? "#60A5FA" : "#2a2a2a"}`,
          boxShadow: isHovered && !selected
            ? "0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(96,165,250,0.15)"
            : "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: "linear-gradient(to bottom, #2a2a2a, #222)" }}>
          <div className="flex items-center gap-[5px]">
            <div className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: "#FF5F57" }} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: "#FEBC2E" }} />
            <div className="w-[8px] h-[8px] rounded-full" style={{ backgroundColor: "#28C840" }} />
          </div>
          <div
            className="flex-1 min-w-0 flex items-center gap-1.5 rounded px-2 py-0.5 overflow-hidden"
            style={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }}
          >
            {urlType === "local-dev" ? (
              <Laptop className="w-3 h-3 text-zinc-500 flex-shrink-0" />
            ) : (
              <Lock className="w-3 h-3 text-zinc-500 flex-shrink-0" />
            )}
            <span className="text-[10px] font-mono text-zinc-400 truncate">{displayTitle}</span>
          </div>
          <ExternalLink className="w-3 h-3 text-zinc-600 flex-shrink-0" />
        </div>

        {/* Type-specific wireframe */}
        {urlType === "github-pr" && <GitHubPrSkeleton url={url} />}
        {urlType === "local-dev" && <LocalDevSkeleton url={url} />}
        {urlType === "generic" && <GenericSkeleton />}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-2.5 py-1.5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <span className="text-[9px] font-mono" style={{ color: urlType === "github-pr" ? "#A855F7" : urlType === "local-dev" ? "#60A5FA" : "#555" }}>
            {urlType === "github-pr" ? "pull-request" : urlType === "local-dev" ? "dev-server" : "website"}
          </span>
        </div>
      </div>
    </div>
  );
}
