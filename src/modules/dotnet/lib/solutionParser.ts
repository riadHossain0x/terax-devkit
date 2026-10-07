export type DotnetPackageRef = {
  name: string;
  version?: string;
};

export type DotnetProject = {
  name: string;
  path: string;
  directory: string;
  relativePath: string;
  targetFramework?: string;
  projectReferences: string[];
  packageReferences: DotnetPackageRef[];
};

export type DotnetSolution = {
  name: string;
  path: string;
  format: "sln" | "slnx" | "standalone-project";
  projects: DotnetProject[];
};

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

function resolveRelative(baseDir: string, relative: string): string {
  const normBase = normalizeSlashes(baseDir).replace(/\/+$/, "");
  const normRel = normalizeSlashes(relative).replace(/^\/+/, "");
  const parts = normBase.split("/");
  for (const seg of normRel.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") {
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join("/");
}

function getBasename(filePath: string): string {
  const norm = normalizeSlashes(filePath);
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}

/**
 * Parses a Visual Studio Classic (.sln) file content.
 * Extracts Project blocks: Project("{...}") = "Name", "RelativePath.csproj", "{...}"
 */
export function parseSlnContent(
  _slnPath: string,
  content: string,
): { name: string; relativePath: string }[] {
  const results: { name: string; relativePath: string }[] = [];
  const projectRegex =
    /Project\s*\(\s*"\{[A-F0-9-]+\}"\s*\)\s*=\s*"([^"]+)"\s*,\s*"([^"]+)"/gi;
  let match: RegExpExecArray | null;

  while ((match = projectRegex.exec(content)) !== null) {
    const name = match[1]?.trim();
    const relPath = match[2]?.trim();
    if (
      name &&
      relPath &&
      (relPath.endsWith(".csproj") ||
        relPath.endsWith(".fsproj") ||
        relPath.endsWith(".vbproj"))
    ) {
      results.push({ name, relativePath: normalizeSlashes(relPath) });
    }
  }

  return results;
}

/**
 * Parses modern .NET 9/10 XML-based (.slnx) solution file.
 * <Solution>
 *   <Project Path="src/MyApp/MyApp.csproj" />
 * </Solution>
 */
export function parseSlnxContent(
  _slnxPath: string,
  content: string,
): { name: string; relativePath: string }[] {
  const results: { name: string; relativePath: string }[] = [];
  const projectTagRegex = /<Project\s+[^>]*Path="([^"]+)"[^>]*\/?>/gi;
  let match: RegExpExecArray | null;

  while ((match = projectTagRegex.exec(content)) !== null) {
    const rawPath = match[1]?.trim();
    if (rawPath) {
      const relPath = normalizeSlashes(rawPath);
      const name = getBasename(relPath).replace(/\.[^.]+$/, "");
      results.push({ name, relativePath: relPath });
    }
  }

  return results;
}

/**
 * Parses a .csproj XML file content to extract TargetFramework,
 * ProjectReferences, and PackageReferences.
 */
export function parseCsprojContent(content: string): {
  targetFramework?: string;
  projectReferences: string[];
  packageReferences: DotnetPackageRef[];
} {
  let targetFramework: string | undefined;

  const tfMatch =
    /<TargetFramework>(.*?)<\/TargetFramework>/i.exec(content) ||
    /<TargetFrameworks>(.*?)<\/TargetFrameworks>/i.exec(content);
  if (tfMatch?.[1]) {
    targetFramework = tfMatch[1].trim();
  }

  const projectReferences: string[] = [];
  const projRefRegex = /<ProjectReference\s+[^>]*Include="([^"]+)"[^>]*\/?>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = projRefRegex.exec(content)) !== null) {
    const inc = pMatch[1]?.trim();
    if (inc) projectReferences.push(normalizeSlashes(inc));
  }

  const packageReferences: DotnetPackageRef[] = [];
  const pkgRefRegex =
    /<PackageReference\s+[^>]*Include="([^"]+)"(?:\s+[^>]*Version="([^"]+)")?[^>]*\/?>/gi;
  let kMatch: RegExpExecArray | null;
  while ((kMatch = pkgRefRegex.exec(content)) !== null) {
    const name = kMatch[1]?.trim();
    const version = kMatch[2]?.trim();
    if (name) {
      packageReferences.push({ name, version: version || undefined });
    }
  }

  return { targetFramework, projectReferences, packageReferences };
}

export function buildProjectModel(
  solutionDir: string,
  name: string,
  relativePath: string,
  csprojContent: string,
): DotnetProject {
  const fullPath = resolveRelative(solutionDir, relativePath);
  const parsed = parseCsprojContent(csprojContent);
  const lastSlash = fullPath.lastIndexOf("/");
  const directory = lastSlash > 0 ? fullPath.slice(0, lastSlash) : fullPath;

  return {
    name,
    path: fullPath,
    directory,
    relativePath,
    targetFramework: parsed.targetFramework,
    projectReferences: parsed.projectReferences,
    packageReferences: parsed.packageReferences,
  };
}
