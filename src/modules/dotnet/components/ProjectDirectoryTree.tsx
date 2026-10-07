import { fileIconUrl, folderIconUrl } from "@/modules/explorer/lib/iconResolver";
import { ArrowDown01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
};

type Props = {
  dirPath: string;
  onOpenFile: (path: string) => void;
  level?: number;
};

// Ignore build output and internal package directories inside projects
const IGNORE_DIRS = new Set(["bin", "obj", "node_modules", ".git", ".vs"]);

export function ProjectDirectoryTree({ dirPath, onOpenFile, level = 0 }: Props) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invoke<DirEntry[]>("fs_read_dir", { path: dirPath, showHidden: false })
      .then((res) => {
        if (cancelled) return;
        const filtered = res
          .filter((e) => {
            if (e.kind === "dir" && IGNORE_DIRS.has(e.name)) return false;
            // Omit .csproj here as it is displayed at top or as project file
            if (e.name.toLowerCase().endsWith(".csproj")) return false;
            return true;
          })
          .sort((a, b) => {
            if (a.kind === "dir" && b.kind !== "dir") return -1;
            if (a.kind !== "dir" && b.kind === "dir") return 1;
            return a.name.localeCompare(b.name);
          });
        setEntries(filtered);
        setLoaded(true);
      })
      .catch((err) => {
        console.error("[ProjectDirectoryTree] fs_read_dir failed for:", dirPath, err);
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [dirPath]);

  if (!loaded) return null;

  return (
    <div className="space-y-0.5" style={{ paddingLeft: level > 0 ? "14px" : "0" }}>
      {entries.map((entry) => {
        const fullPath = `${dirPath}/${entry.name}`.replace(/\/+/g, "/");
        const isDir = entry.kind === "dir";

        if (isDir) {
          const isExpanded = expandedDirs[fullPath] ?? false;
          return (
            <div key={fullPath}>
              <div
                className="flex h-6 items-center gap-1.5 rounded px-1.5 hover:bg-foreground/[0.04] cursor-pointer text-muted-foreground hover:text-foreground text-[11px]"
                onClick={() =>
                  setExpandedDirs((prev) => ({
                    ...prev,
                    [fullPath]: !prev[fullPath],
                  }))
                }
              >
                <HugeiconsIcon
                  icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                  size={11}
                  className="shrink-0"
                />
                <img
                  src={folderIconUrl(entry.name, isExpanded)}
                  alt=""
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="truncate">{entry.name}</span>
              </div>
              {isExpanded && (
                <ProjectDirectoryTree
                  dirPath={fullPath}
                  onOpenFile={onOpenFile}
                  level={level + 1}
                />
              )}
            </div>
          );
        }

        return (
          <div
            key={fullPath}
            className="flex h-5.5 items-center gap-1.5 rounded px-1.5 pl-4 hover:bg-foreground/[0.04] cursor-pointer text-muted-foreground hover:text-foreground text-[11px]"
            onClick={() => onOpenFile(fullPath)}
          >
            <img
              src={fileIconUrl(entry.name)}
              alt=""
              className="h-3.5 w-3.5 shrink-0"
            />
            <span className="truncate text-foreground/90">{entry.name}</span>
          </div>
        );
      })}
    </div>
  );
}
