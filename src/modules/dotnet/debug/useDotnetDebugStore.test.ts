import { describe, expect, it } from "vitest";
import { useDotnetDebugStore } from "./useDotnetDebugStore";

describe("useDotnetDebugStore", () => {
  it("toggles, removes, and enables/disables breakpoints correctly", () => {
    const store = useDotnetDebugStore.getState();
    const filePath = "/test/Program.cs";

    // Add line 10
    store.toggleBreakpoint(filePath, 10);
    expect(useDotnetDebugStore.getState().breakpoints[filePath]).toEqual([
      { line: 10, enabled: true },
    ]);

    // Add line 20
    store.toggleBreakpoint(filePath, 20);
    expect(useDotnetDebugStore.getState().breakpoints[filePath]).toEqual([
      { line: 10, enabled: true },
      { line: 20, enabled: true },
    ]);

    // Disable line 10
    store.setBreakpointEnabled(filePath, 10, false);
    expect(useDotnetDebugStore.getState().breakpoints[filePath][0].enabled).toBe(
      false,
    );

    // Toggle line 10 removes it
    store.toggleBreakpoint(filePath, 10);
    expect(useDotnetDebugStore.getState().breakpoints[filePath]).toEqual([
      { line: 20, enabled: true },
    ]);

    // Remove line 20
    store.removeBreakpoint(filePath, 20);
    expect(useDotnetDebugStore.getState().breakpoints[filePath]).toEqual([]);
  });
});
