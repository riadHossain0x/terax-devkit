import { describe, expect, it } from "vitest";
import { buildDotnetCommand } from "./dotnetCommands";

describe("buildDotnetCommand", () => {
  it("builds solution build command without target", () => {
    expect(buildDotnetCommand("build")).toBe("dotnet build");
  });

  it("builds project build command with target", () => {
    expect(buildDotnetCommand("build", "src/MyApp/MyApp.csproj")).toBe(
      "dotnet build 'src/MyApp/MyApp.csproj'",
    );
  });

  it("builds run command with project option", () => {
    expect(buildDotnetCommand("run", "src/MyApp/MyApp.csproj")).toBe(
      "dotnet run --project 'src/MyApp/MyApp.csproj'",
    );
  });

  it("builds test command", () => {
    expect(buildDotnetCommand("test", "tests/MyApp.Tests.csproj")).toBe(
      "dotnet test 'tests/MyApp.Tests.csproj'",
    );
  });

  it("builds watch command", () => {
    expect(buildDotnetCommand("watch", "src/MyApp/MyApp.csproj")).toBe(
      "dotnet watch --project 'src/MyApp/MyApp.csproj' run",
    );
  });
});
