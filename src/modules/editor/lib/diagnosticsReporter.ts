import { diagnosticCount, forEachDiagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useDiagnosticsStore, type DiagnosticItem } from "./diagnosticsStore";

export function diagnosticsReporter(getPath: () => string): Extension {
  return EditorView.updateListener.of((update) => {
    if (
      !update.docChanged &&
      !update.transactions.some((tr) => tr.effects.length > 0)
    ) {
      return;
    }
    const total = diagnosticCount(update.state);
    let errors = 0;
    let warnings = 0;
    const items: DiagnosticItem[] = [];

    if (total > 0) {
      forEachDiagnostic(update.state, (d) => {
        if (d.severity === "error") errors += 1;
        else if (d.severity === "warning") warnings += 1;

        const lineObj = update.state.doc.lineAt(
          Math.min(d.from, update.state.doc.length),
        );
        items.push({
          message: d.message,
          severity: d.severity === "error" ? "error" : d.severity === "warning" ? "warning" : "info",
          from: d.from,
          to: d.to,
          line: lineObj.number,
          col: Math.max(1, d.from - lineObj.from + 1),
          source: d.source,
        });
      });
    }

    useDiagnosticsStore.getState().report(getPath(), {
      errors,
      warnings,
      items,
    });
  });
}
