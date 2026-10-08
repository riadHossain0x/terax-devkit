import {
  type Extension,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  EditorView,
  GutterMarker,
  gutter,
} from "@codemirror/view";
import { useDotnetDebugStore } from "@/modules/dotnet/debug/useDotnetDebugStore";

class BreakpointMarker extends GutterMarker {
  constructor(readonly enabled: boolean) {
    super();
  }

  toDOM() {
    const dot = document.createElement("div");
    dot.className = "cm-breakpoint-dot";
    dot.style.width = "10px";
    dot.style.height = "10px";
    dot.style.borderRadius = "50%";
    dot.style.backgroundColor = this.enabled ? "#ef4444" : "#71717a";
    dot.style.boxShadow = this.enabled
      ? "0 0 6px rgba(239, 68, 68, 0.8)"
      : "none";
    dot.style.transition = "transform 0.1s ease";
    return dot;
  }
}

const activeBreakpointMarker = new BreakpointMarker(true);
const disabledBreakpointMarker = new BreakpointMarker(false);

export const setBreakpointsEffect = StateEffect.define<
  Array<{ line: number; enabled: boolean }>
>();

export const breakpointField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(markers, tr) {
    markers = markers.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setBreakpointsEffect)) {
        const builder = new RangeSetBuilder<GutterMarker>();
        const doc = tr.state.doc;
        const sorted = [...e.value].sort((a, b) => a.line - b.line);
        for (const bp of sorted) {
          if (bp.line >= 1 && bp.line <= doc.lines) {
            const line = doc.line(bp.line);
            builder.add(
              line.from,
              line.from,
              bp.enabled ? activeBreakpointMarker : disabledBreakpointMarker,
            );
          }
        }
        return builder.finish();
      }
    }
    return markers;
  },
});

export function breakpointGutterExtension(getFilePath: () => string): Extension {
  return [
    breakpointField,
    gutter({
      class: "cm-breakpoint-gutter",
      markers: (view) => view.state.field(breakpointField),
      initialSpacer: () => new BreakpointMarker(true),
      domEventHandlers: {
        mousedown(view, line) {
          const docLine = view.state.doc.lineAt(line.from).number;
          const filePath = getFilePath();
          if (filePath) {
            useDotnetDebugStore.getState().toggleBreakpoint(filePath, docLine);
          }
          return true;
        },
      },
    }),
    EditorView.theme({
      ".cm-breakpoint-gutter": {
        width: "20px",
        minWidth: "20px",
      },
      ".cm-breakpoint-gutter .cm-gutterElement": {
        padding: "0 4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
      },
      ".cm-breakpoint-gutter .cm-gutterElement:hover:not(:has(.cm-breakpoint-dot))::after": {
        content: "''",
        width: "9px",
        height: "9px",
        borderRadius: "50%",
        backgroundColor: "rgba(239, 68, 68, 0.4)",
        display: "block",
      },
      ".cm-breakpoint-gutter .cm-gutterElement:hover .cm-breakpoint-dot": {
        transform: "scale(1.15)",
      },
    }),
  ];
}
