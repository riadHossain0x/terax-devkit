import {
  type Extension,
  RangeSet,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
} from "@codemirror/view";

export const setActiveDebugLineEffect = StateEffect.define<number | null>();

class DebugPointerMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-debug-pointer";
    el.innerHTML = "▶";
    el.style.fontSize = "11px";
    el.style.fontWeight = "bold";
    el.style.color = "#f59e0b";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.userSelect = "none";
    el.style.filter = "drop-shadow(0 0 4px rgba(245, 158, 11, 0.8))";
    return el;
  }
}

const pointerMarker = new DebugPointerMarker();

const activeLineDecoration = Decoration.line({
  attributes: {
    class: "cm-debug-active-line",
  },
});

export const debugActiveLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setActiveDebugLineEffect)) {
        if (e.value === null) return Decoration.none;
        const lineNum = e.value;
        const doc = tr.state.doc;
        if (lineNum >= 1 && lineNum <= doc.lines) {
          const line = doc.line(lineNum);
          return Decoration.set([activeLineDecoration.range(line.from)]);
        }
        return Decoration.none;
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const debugPointerGutterField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(markers, tr) {
    markers = markers.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setActiveDebugLineEffect)) {
        if (e.value === null) return RangeSet.empty;
        const lineNum = e.value;
        const doc = tr.state.doc;
        if (lineNum >= 1 && lineNum <= doc.lines) {
          const line = doc.line(lineNum);
          const builder = new RangeSetBuilder<GutterMarker>();
          builder.add(line.from, line.from, pointerMarker);
          return builder.finish();
        }
        return RangeSet.empty;
      }
    }
    return markers;
  },
});

export function debugActiveLineExtension(): Extension {
  return [
    debugActiveLineField,
    debugPointerGutterField,
    gutter({
      class: "cm-debug-pointer-gutter",
      markers: (view) => view.state.field(debugPointerGutterField),
    }),
    EditorView.theme({
      ".cm-debug-pointer-gutter": {
        width: "14px",
        minWidth: "14px",
      },
      ".cm-debug-pointer-gutter .cm-gutterElement": {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0",
      },
      ".cm-debug-active-line": {
        backgroundColor: "rgba(245, 158, 11, 0.22) !important",
        borderLeft: "3px solid #f59e0b",
      },
    }),
  ];
}
