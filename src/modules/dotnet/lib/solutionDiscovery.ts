import { invoke } from "@tauri-apps/api/core";
import {
  type DotnetProject,
  type DotnetSolution,
  buildProjectModel,
  parseCsprojContent,
  parseSlnContent,
  parseSlnxContent,
} from "./solutionParser";

type FsReadFileResult = {
  kind: "text" | "binary" | "tooLarge";
  content?: string;
};

type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
};

type SearchHit = {
  path: string;
  name: string;
};

type SearchResult = {
  hits: SearchHit[];
  truncated: boolean;
};

async function readFileText(filePath: string): Promise<string | null> {
  try {
    const res = await invoke<FsReadFileResult>("fs_read_file", {
      path: filePath,
    });
    return res.kind === "text" && res.content !== undefined ? res.content : null;
  } catch {
    return null;
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function getBasename(filePath: string): string {
  const norm = normalizePath(filePath);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

function getDirname(filePath: string): string {
  const norm = normalizePath(filePath);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? "" : norm.slice(0, idx);
}

export async function discoverSolutions(
  workspaceRoot: string,
): Promise<DotnetSolution[]> {
  const solutions: DotnetSolution[] = [];
  const normRoot = normalizePath(workspaceRoot);

  try {
    const discoveredPaths: string[] = [];

    // 1. Direct root check with fs_read_dir: Instant & 100% reliable for top-level solution files
    const rootEntries = await invoke<DirEntry[]>("fs_read_dir", {
      path: normRoot,
      showHidden: false,
    }).catch(() => []);

    for (const entry of rootEntries) {
      if (entry.kind === "file") {
        const lower = entry.name.toLowerCase();
        if (lower.endsWith(".sln") || lower.endsWith(".slnx")) {
          discoveredPaths.push(`${normRoot}/${entry.name}`);
        }
      }
    }

    // 2. If not found in immediate root, use fs_search to look deeper
    if (discoveredPaths.length === 0) {
      const slnRes = await invoke<SearchResult>("fs_search", {
        root: normRoot,
        query: ".sln",
        limit: 10,
      }).catch(() => null);

      if (slnRes?.hits) {
        for (const hit of slnRes.hits) {
          discoveredPaths.push(normalizePath(hit.path));
        }
      }

      const slnxRes = await invoke<SearchResult>("fs_search", {
        root: normRoot,
        query: ".slnx",
        limit: 10,
      }).catch(() => null);

      if (slnxRes?.hits) {
        for (const hit of slnxRes.hits) {
          discoveredPaths.push(normalizePath(hit.path));
        }
      }
    }

    const seenPaths = new Set<string>();

    for (const p of discoveredPaths) {
      if (seenPaths.has(p)) continue;
      seenPaths.add(p);

      const isSln = p.endsWith(".sln");
      const isSlnx = p.endsWith(".slnx");
      if (!isSln && !isSlnx) continue;

      const content = await readFileText(p);
      if (!content) continue;

      const rawProjects = isSln ? parseSlnContent(p, content) : parseSlnxContent(p, content);
      const solutionDir = getDirname(p);
      const projects: DotnetProject[] = [];

      for (const proj of rawProjects) {
        try {
          const projModel = await loadProject(solutionDir, proj.name, proj.relativePath);
          if (projModel) {
            projects.push(projModel);
          }
        } catch (e) {
          console.warn("[dotnet] Failed to load project:", proj.name, e);
        }
      }

      solutions.push({
        name: getBasename(p),
        path: p,
        format: isSln ? "sln" : "slnx",
        projects,
      });
    }

    // 3. If still no solution found, check for standalone .csproj files
    if (solutions.length === 0) {
      const rootCsproj = rootEntries.filter(
        (e) => e.kind === "file" && e.name.toLowerCase().endsWith(".csproj"),
      );

      const standaloneProjectPaths: string[] = rootCsproj.map(
        (e) => `${normRoot}/${e.name}`,
      );

      if (standaloneProjectPaths.length === 0) {
        const csprojRes = await invoke<SearchResult>("fs_search", {
          root: normRoot,
          query: ".csproj",
          limit: 10,
        }).catch(() => null);

        if (csprojRes?.hits) {
          for (const hit of csprojRes.hits) {
            standaloneProjectPaths.push(normalizePath(hit.path));
          }
        }
      }

      if (standaloneProjectPaths.length > 0) {
        const projects: DotnetProject[] = [];
        for (const p of standaloneProjectPaths) {
          const name = getBasename(p).replace(/\.csproj$/, "");
          const content = (await readFileText(p)) ?? "";
          const parsed = parseCsprojContent(content);
          const lastSlash = p.lastIndexOf("/");
          const directory = lastSlash > 0 ? p.slice(0, lastSlash) : p;
          projects.push({
            name,
            path: p,
            directory,
            relativePath: p.startsWith(normRoot)
              ? p.slice(normRoot.length).replace(/^\/+/, "")
              : p,
            targetFramework: parsed.targetFramework,
            projectReferences: parsed.projectReferences,
            packageReferences: parsed.packageReferences,
          });
        }

        if (projects.length > 0) {
          solutions.push({
            name: "Standalone Projects",
            path: normRoot,
            format: "standalone-project",
            projects,
          });
        }
      }
    }
  } catch (e) {
    console.error("[dotnet] Failed to discover solutions:", e);
  }

  return solutions;
}

async function loadProject(
  solutionDir: string,
  name: string,
  relativePath: string,
): Promise<DotnetProject | null> {
  const normRel = normalizePath(relativePath);
  const fullPath = `${solutionDir}/${normRel}`.replace(/\/+/g, "/");
  const content = await readFileText(fullPath);
  if (!content) return null;
  return buildProjectModel(solutionDir, name, normRel, content);
}
