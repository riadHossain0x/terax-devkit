import { DotnetProject } from "../lib/solutionParser";

export function resolveProjectAssemblyPath(
  project: DotnetProject,
  configuration = "Debug",
): string {
  const dir = project.directory.replace(/\\/g, "/").replace(/\/+$/, "");
  const tfm = project.targetFramework || "net10.0";
  const projectName = project.name;
  return `${dir}/bin/${configuration}/${tfm}/${projectName}.dll`;
}
