import { describe, expect, it } from "vitest";
import {
  CSHARP_SNIPPETS,
  csharpSnippetCompletionSource,
} from "./csharpSnippets";

describe("csharpSnippets", () => {
  it("contains essential C# snippets with high boost", () => {
    const labels = CSHARP_SNIPPETS.map((s) => s.label);
    expect(labels).toContain("prop");
    expect(labels).toContain("propg");
    expect(labels).toContain("propr");
    expect(labels).toContain("ctor");
    expect(labels).toContain("cw");
    expect(labels).toContain("class");
    expect(labels).toContain("interface");
    expect(labels).toContain("record");
    expect(labels).toContain("async");
    expect(labels).toContain("foreach");
    expect(labels).toContain("try");
    for (const s of CSHARP_SNIPPETS) {
      expect(s.type).toBe("snippet");
      expect(s.detail).toMatch(/^Snippet:/);
    }
  });

  it("completes when typing word prefix", () => {
    const mockContext = {
      matchBefore: (_regex: RegExp) => ({
        from: 0,
        to: 4,
        text: "prop",
      }),
      explicit: false,
    } as any;

    const result = csharpSnippetCompletionSource(mockContext);
    expect(result).not.toBeNull();
    expect(result?.from).toBe(0);
    expect(result?.options.length).toBeGreaterThan(10);
  });
});
