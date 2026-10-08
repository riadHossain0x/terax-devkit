import { describe, expect, it } from "vitest";
import { getDocString, parseParamLabel } from "./signatureHelp";

describe("signatureHelp helper functions", () => {
  it("extracts documentation text whether plain string or markup object", () => {
    expect(getDocString("Simple string doc")).toBe("Simple string doc");
    expect(getDocString({ kind: "markdown", value: "Markdown doc" })).toBe(
      "Markdown doc",
    );
    expect(getDocString(undefined)).toBe("");
  });

  it("parses parameter labels as substrings and offsets", () => {
    const sigLabel = "void Greeter.Greet(string message, bool shout)";
    
    // Label as string
    const stringParam = { label: "string message" };
    const res1 = parseParamLabel(stringParam, sigLabel);
    expect(res1.labelText).toBe("string message");
    expect(res1.start).toBe(sigLabel.indexOf("string message"));
    expect(res1.end).toBe(res1.start + "string message".length);

    // Label as [start, end] tuple
    const tupleParam = { label: [19, 33] as [number, number] };
    const res2 = parseParamLabel(tupleParam, sigLabel);
    expect(res2.labelText).toBe("string message");
    expect(res2.start).toBe(19);
    expect(res2.end).toBe(33);
  });

  it("identifies active parameter substring boundaries accurately", () => {
    const sigLabel = "void Test(int a, string b)";
    const param0 = { label: "int a" };
    const param1 = { label: "string b" };

    const p0 = parseParamLabel(param0, sigLabel);
    expect(sigLabel.slice(p0.start, p0.end)).toBe("int a");

    const p1 = parseParamLabel(param1, sigLabel);
    expect(sigLabel.slice(p1.start, p1.end)).toBe("string b");
  });
});
