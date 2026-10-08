import { cn } from "@/lib/utils";
import {
  CodeSquareIcon,
  Folder01Icon,
  PackageIcon,
  PlayIcon,
  RefreshIcon,
  Wrench01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  MoreHorizontalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import {
  ExplorerSearch,
  type ExplorerSearchHandle,
} from "@/modules/explorer/ExplorerSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDotnetStore } from "../lib/dotnetStore";
import { ProjectDirectoryTree } from "./ProjectDirectoryTree";

type Props = {
  workspaceRoot: string | null;
  onRunCommand: (command: string) => void;
  onOpenFile: (path: string) => void;
};

export function SolutionExplorer({
  workspaceRoot,
  onRunCommand,
  onOpenFile,
}: Props) {
  const {
    solutions,
    isLoading,
    refreshSolutions,
    selectedSolution,
    selectSolution,
  } = useDotnetStore();

  useEffect(() => {
    if (workspaceRoot) {
      void refreshSolutions(workspaceRoot);
    }
  }, [workspaceRoot, refreshSolutions]);

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedDeps, setExpandedDeps] = useState<Record<string, boolean>>({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchRef = useRef<ExplorerSearchHandle>(null);

  const toggleProject = (path: string) => {
    setExpandedProjects((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const toggleDeps = (path: string) => {
    setExpandedDeps((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  if (!workspaceRoot) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-muted-foreground">
        Open a folder with a .NET solution or project to view the Solution Explorer.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        <HugeiconsIcon icon={RefreshIcon} size={14} className="mr-1.5 animate-spin" />
        Scanning for solutions...
      </div>
    );
  }

  if (solutions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
        <HugeiconsIcon icon={CodeSquareIcon} size={28} className="mb-2 opacity-50" />
        <p className="font-medium text-foreground">No .NET Solution Found</p>
        <p className="mt-1 leading-relaxed">
          No .sln, .slnx, or .csproj files were detected in this workspace.
        </p>
        <button
          type="button"
          onClick={() => onRunCommand("dotnet new sln")}
          className="mt-3 rounded-md bg-foreground/10 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-foreground/15"
        >
          Create Solution (dotnet new sln)
        </button>
      </div>
    );
  }

  const solution = selectedSolution || solutions[0];

  const projects = solution.projects?.filter(Boolean) ?? [];
  const hasAnyExpanded = projects.some(
    (p) => expandedProjects[p.path] ?? true,
  );

  const toggleAllProjects = () => {
    const next: Record<string, boolean> = {};
    const targetState = !hasAnyExpanded;
    for (const p of projects) {
      next[p.path] = targetState;
    }
    setExpandedProjects(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-[12px] select-none">
      {/* Header toolbar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
          <HugeiconsIcon icon={CodeSquareIcon} size={14} className="text-primary shrink-0" />
          <span className="truncate">{solution.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Search files"
            aria-label="Search files"
            onClick={() => setIsSearchOpen((v) => !v)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground",
              isSearchOpen && "bg-foreground/10 text-foreground",
            )}
          >
            <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Build Solution"
            onClick={() => onRunCommand("dotnet build")}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Wrench01Icon} size={13} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="More Actions"
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} size={13} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={toggleAllProjects}
                className="gap-2 cursor-pointer text-xs"
              >
                <HugeiconsIcon
                  icon={hasAnyExpanded ? ArrowRight01Icon : ArrowDown01Icon}
                  size={13}
                />
                <span>
                  {hasAnyExpanded ? "Collapse All Projects" : "Expand All Projects"}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            title="Refresh Solutions"
            onClick={() => workspaceRoot && void refreshSolutions(workspaceRoot)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={RefreshIcon} size={13} />
          </button>
        </div>
      </div>

      <ExplorerSearch
        ref={searchRef}
        rootPath={workspaceRoot || ""}
        onOpenFile={onOpenFile}
        open={isSearchOpen}
        onRequestClose={() => setIsSearchOpen(false)}
        onActiveChange={setIsSearchActive}
      />

      {/* Solution tree */}
      {!isSearchActive && (
        <div className="flex-1 min-h-0 overflow-y-auto px-1 py-1.5">
        {solutions.length > 1 && (
          <div className="mb-2 px-2">
            <select
              value={solution.path}
              onChange={(e) => {
                const s = solutions.find((x) => x.path === e.target.value);
                if (s) selectSolution(s);
              }}
              className="w-full rounded border border-border bg-card px-2 py-1 text-[11px] text-foreground outline-none"
            >
              {solutions.map((s) => (
                <option key={s.path} value={s.path}>
                  {s.name} ({s.projects.length} projects)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-0.5">
          {solution.projects?.filter(Boolean).map((proj) => {
            const isExpanded = expandedProjects[proj.path] ?? true;
            const depsExpanded = expandedDeps[proj.path] ?? false;

            return (
              <div key={proj.path} className="flex flex-col">
                {/* Project Header Row */}
                <div
                  className={cn(
                    "group flex h-7 items-center justify-between rounded-md px-1.5 hover:bg-foreground/[0.045] cursor-pointer",
                  )}
                  onClick={() => toggleProject(proj.path)}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      className="p-0.5 text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProject(proj.path);
                      }}
                    >
                      <HugeiconsIcon
                        icon={isExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                        size={12}
                      />
                    </button>
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={14}
                      className="text-amber-500/80 shrink-0"
                    />
                    <span className="truncate font-medium text-foreground">
                      {proj.name}
                    </span>
                    {proj.targetFramework && (
                      <span className="rounded bg-foreground/[0.06] px-1 py-0.2 text-[9px] text-muted-foreground font-mono">
                        {proj.targetFramework}
                      </span>
                    )}
                  </div>

                  {/* Quick action buttons */}
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button
                      type="button"
                      title={`Run ${proj.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunCommand(`dotnet run --project '${proj.path}'`);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded hover:bg-foreground/15 text-muted-foreground hover:text-foreground"
                    >
                      <HugeiconsIcon icon={PlayIcon} size={11} />
                    </button>
                    <button
                      type="button"
                      title={`Build ${proj.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRunCommand(`dotnet build '${proj.path}'`);
                      }}
                      className="flex h-5 w-5 items-center justify-center rounded hover:bg-foreground/15 text-muted-foreground hover:text-foreground"
                    >
                      <HugeiconsIcon icon={Wrench01Icon} size={11} />
                    </button>
                  </div>
                </div>

                {/* Project Children */}
                {isExpanded && (
                  <div className="pl-5 text-[11px] space-y-0.5">
                    {/* Dependencies Node */}
                    <div
                      className="flex h-6 items-center gap-1.5 rounded px-1.5 hover:bg-foreground/[0.04] cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => toggleDeps(proj.path)}
                    >
                      <HugeiconsIcon
                        icon={depsExpanded ? ArrowDown01Icon : ArrowRight01Icon}
                        size={11}
                      />
                      <HugeiconsIcon icon={PackageIcon} size={13} className="text-blue-500/80" />
                      <span>Dependencies</span>
                      <span className="text-[10px] opacity-70">
                        ({proj.packageReferences.length + proj.projectReferences.length})
                      </span>
                    </div>

                    {/* Dependencies Expanded List */}
                    {depsExpanded && (
                      <div className="pl-4 space-y-0.5 text-muted-foreground">
                        {proj.packageReferences.map((pkg) => (
                          <div
                            key={pkg.name}
                            className="flex h-5 items-center justify-between gap-1 px-1.5 rounded hover:bg-foreground/[0.03]"
                          >
                            <span className="truncate">{pkg.name}</span>
                            {pkg.version && (
                              <span className="font-mono text-[9px] opacity-70">
                                {pkg.version}
                              </span>
                            )}
                          </div>
                        ))}
                        {proj.projectReferences.map((ref) => (
                          <div
                            key={ref}
                            className="flex h-5 items-center gap-1 px-1.5 rounded hover:bg-foreground/[0.03]"
                          >
                            <span className="truncate">{ref.split("/").pop()}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Project File (.csproj) */}
                    <div
                      className="flex h-5.5 items-center gap-1.5 rounded px-1.5 hover:bg-foreground/[0.04] cursor-pointer text-muted-foreground hover:text-foreground"
                      onClick={() => onOpenFile(proj.path)}
                    >
                      <img
                        src={fileIconUrl(proj.relativePath.split("/").pop() ?? "project.csproj")}
                        alt=""
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span className="truncate font-mono text-[10.5px]">
                        {proj.relativePath.split("/").pop()}
                      </span>
                    </div>

                    {/* Source Code Files & Folders (.cs, folders, etc.) */}
                    <ProjectDirectoryTree
                      dirPath={proj.directory}
                      onOpenFile={onOpenFile}
                    />
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
