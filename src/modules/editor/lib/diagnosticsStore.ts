import { create } from "zustand";

export type DiagnosticItem = {
  message: string;
  severity: "error" | "warning" | "info";
  from: number;
  to: number;
  line: number;
  col: number;
  source?: string;
};

export type DiagnosticCounts = {
  errors: number;
  warnings: number;
  items?: DiagnosticItem[];
};

type State = {
  byPath: Record<string, DiagnosticCounts>;
  report: (path: string, counts: DiagnosticCounts | null) => void;
};

export const useDiagnosticsStore = create<State>((set) => ({
  byPath: {},
  report: (path, counts) =>
    set((s) => {
      const prev = s.byPath[path];
      if (
        counts &&
        prev &&
        prev.errors === counts.errors &&
        prev.warnings === counts.warnings &&
        (prev.items?.length ?? 0) === (counts.items?.length ?? 0) &&
        prev.items?.[0]?.message === counts.items?.[0]?.message
      ) {
        return s;
      }
      if (!counts && !prev) return s;
      const byPath = { ...s.byPath };
      if (counts) byPath[path] = counts;
      else delete byPath[path];
      return { byPath };
    }),
}));
