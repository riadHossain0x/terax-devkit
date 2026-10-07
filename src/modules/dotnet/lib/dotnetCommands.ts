import { quoteShellArg } from "@/lib/shellQuote";

export type DotnetCommandType =
  | "build"
  | "run"
  | "test"
  | "watch"
  | "clean"
  | "restore";

export function buildDotnetCommand(
  type: DotnetCommandType,
  targetPath?: string,
  extraArgs?: string[],
): string {
  const quoted = targetPath ? quoteShellArg(targetPath) : "";
  const extra = extraArgs && extraArgs.length > 0 ? ` ${extraArgs.join(" ")}` : "";

  switch (type) {
    case "build":
      return targetPath ? `dotnet build ${quoted}${extra}` : `dotnet build${extra}`;
    case "run":
      return targetPath
        ? `dotnet run --project ${quoted}${extra}`
        : `dotnet run${extra}`;
    case "test":
      return targetPath ? `dotnet test ${quoted}${extra}` : `dotnet test${extra}`;
    case "watch":
      return targetPath
        ? `dotnet watch --project ${quoted} run${extra}`
        : `dotnet watch run${extra}`;
    case "clean":
      return targetPath ? `dotnet clean ${quoted}${extra}` : `dotnet clean${extra}`;
    case "restore":
      return targetPath ? `dotnet restore ${quoted}${extra}` : `dotnet restore${extra}`;
  }
}
