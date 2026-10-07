import { describe, expect, it } from "vitest";
import {
  buildProjectModel,
  parseCsprojContent,
  parseSlnContent,
  parseSlnxContent,
} from "./solutionParser";

describe("parseSlnContent", () => {
  it("extracts projects from classic .sln file", () => {
    const sln = `
Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "MyApp.Web", "src\\MyApp.Web\\MyApp.Web.csproj", "{A1B2C3D4-E5F6-7890-1234-567890ABCDEF}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "MyApp.Core", "src/MyApp.Core/MyApp.Core.csproj", "{B1C2D3E4-F5A6-7890-1234-567890ABCDEF}"
EndProject
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Solution Items", "Solution Items", "{C1D2E3F4-A5B6-7890-1234-567890ABCDEF}"
EndProject
Global
EndGlobal
    `;
    const projects = parseSlnContent("/repo/MyApp.sln", sln);
    expect(projects).toEqual([
      { name: "MyApp.Web", relativePath: "src/MyApp.Web/MyApp.Web.csproj" },
      { name: "MyApp.Core", relativePath: "src/MyApp.Core/MyApp.Core.csproj" },
    ]);
  });
});

describe("parseSlnxContent", () => {
  it("extracts projects from modern .slnx file", () => {
    const slnx = `
<Solution>
  <Folder Name="/src/">
    <Project Path="src/MyApp.Api/MyApp.Api.csproj" />
    <Project Path="src/MyApp.Shared/MyApp.Shared.csproj" />
  </Folder>
</Solution>
    `;
    const projects = parseSlnxContent("/repo/MyApp.slnx", slnx);
    expect(projects).toEqual([
      { name: "MyApp.Api", relativePath: "src/MyApp.Api/MyApp.Api.csproj" },
      {
        name: "MyApp.Shared",
        relativePath: "src/MyApp.Shared/MyApp.Shared.csproj",
      },
    ]);
  });

  it("handles complex solutions like TrueCare.slnx with 30+ projects", () => {
    const slnx = `
<Solution>
  <Folder Name="/src/">
    <Project Path="src/Slice.Application/Slice.Application.csproj" />
    <Project Path="src/TrueCare.Billing/TrueCare.Billing.csproj" />
    <Project Path="src/TrueCare.Host/TrueCare.Host.csproj" />
  </Folder>
</Solution>
    `;
    const projects = parseSlnxContent("/Users/uapp/Downloads/uapp/TrueCare/TrueCare.slnx", slnx);
    expect(projects).toHaveLength(3);
    expect(projects.map((p) => p.name)).toEqual([
      "Slice.Application",
      "TrueCare.Billing",
      "TrueCare.Host",
    ]);
  });
});

describe("parseCsprojContent", () => {
  it("extracts TargetFramework, ProjectReferences, and PackageReferences", () => {
    const csproj = `
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../MyApp.Core/MyApp.Core.csproj" />
  </ItemGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="9.0.0" />
    <PackageReference Include="Scalar.AspNetCore" Version="1.2.50" />
  </ItemGroup>
</Project>
    `;
    const parsed = parseCsprojContent(csproj);
    expect(parsed.targetFramework).toBe("net9.0");
    expect(parsed.projectReferences).toEqual([
      "../MyApp.Core/MyApp.Core.csproj",
    ]);
    expect(parsed.packageReferences).toEqual([
      { name: "Microsoft.AspNetCore.OpenApi", version: "9.0.0" },
      { name: "Scalar.AspNetCore", version: "1.2.50" },
    ]);
  });
});

describe("buildProjectModel", () => {
  it("resolves relative path to absolute normalized path", () => {
    const csproj = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>`;
    const model = buildProjectModel(
      "/Users/dev/solution",
      "MyApp",
      "src/MyApp/MyApp.csproj",
      csproj,
    );
    expect(model.name).toBe("MyApp");
    expect(model.path).toBe("/Users/dev/solution/src/MyApp/MyApp.csproj");
    expect(model.directory).toBe("/Users/dev/solution/src/MyApp");
    expect(model.targetFramework).toBe("net8.0");
  });
});
