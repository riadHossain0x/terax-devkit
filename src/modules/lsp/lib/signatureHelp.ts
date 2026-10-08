import { StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  EditorView,
  showTooltip,
  type Tooltip,
  type PluginValue,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from "@codemirror/view";
import type { TeraxLspClient, LspPos } from "./client";

export type ParameterInformation = {
  label: string | [number, number];
  documentation?: string | { kind: string; value: string };
};

export type SignatureInformation = {
  label: string;
  documentation?: string | { kind: string; value: string };
  parameters?: ParameterInformation[];
  activeParameter?: number;
};

export type SignatureHelp = {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
};

export type SignatureHelpState = {
  help: SignatureHelp | null;
  pos: number;
  activeSignatureIdx: number;
};

export const setSignatureHelpEffect = StateEffect.define<SignatureHelpState | null>();

export const nextSignatureEffect = StateEffect.define<void>();
export const prevSignatureEffect = StateEffect.define<void>();

export function getDocString(doc?: string | { kind: string; value: string }): string {
  if (!doc) return "";
  if (typeof doc === "string") return doc;
  return doc.value || "";
}

export function parseParamLabel(
  param: ParameterInformation,
  sigLabel: string,
): { labelText: string; start: number; end: number } {
  if (Array.isArray(param.label)) {
    const [start, end] = param.label;
    const labelText = sigLabel.slice(start, end);
    return { labelText, start, end };
  }
  const labelText = String(param.label);
  const start = sigLabel.indexOf(labelText);
  const end = start >= 0 ? start + labelText.length : -1;
  return { labelText, start, end };
}

export function renderSignatureTooltipDOM(
  state: SignatureHelpState,
  view: EditorView,
): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-signature-tooltip";

  const { help, activeSignatureIdx } = state;
  if (!help || help.signatures.length === 0) return dom;

  const currentSigIdx = Math.max(
    0,
    Math.min(activeSignatureIdx, help.signatures.length - 1),
  );
  const sig = help.signatures[currentSigIdx];
  const activeParamIdx =
    sig.activeParameter ?? help.activeParameter ?? 0;

  // Header container
  const header = document.createElement("div");
  header.className = "cm-signature-header";

  // Label with highlighted active param
  const labelEl = document.createElement("div");
  labelEl.className = "cm-signature-label";

  const params = sig.parameters ?? [];
  let paramSpanFound = false;

  if (params.length > 0 && activeParamIdx >= 0 && activeParamIdx < params.length) {
    const activeParam = params[activeParamIdx];
    const { start, end } = parseParamLabel(activeParam, sig.label);

    if (start >= 0 && end > start) {
      paramSpanFound = true;
      const before = sig.label.slice(0, start);
      const highlighted = sig.label.slice(start, end);
      const after = sig.label.slice(end);

      labelEl.appendChild(document.createTextNode(before));
      const activeSpan = document.createElement("span");
      activeSpan.className = "cm-signature-param-active";
      activeSpan.textContent = highlighted;
      labelEl.appendChild(activeSpan);
      labelEl.appendChild(document.createTextNode(after));
    }
  }

  if (!paramSpanFound) {
    labelEl.textContent = sig.label;
  }
  header.appendChild(labelEl);

  // Overload counter if multiple signatures
  if (help.signatures.length > 1) {
    const counter = document.createElement("div");
    counter.className = "cm-signature-counter";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "cm-signature-nav-btn";
    prevBtn.textContent = "▲";
    prevBtn.title = "Previous overload (Alt+Up)";
    prevBtn.onclick = (e) => {
      e.preventDefault();
      view.dispatch({ effects: prevSignatureEffect.of() });
    };

    const countText = document.createElement("span");
    countText.textContent = `${currentSigIdx + 1}/${help.signatures.length}`;

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "cm-signature-nav-btn";
    nextBtn.textContent = "▼";
    nextBtn.title = "Next overload (Alt+Down)";
    nextBtn.onclick = (e) => {
      e.preventDefault();
      view.dispatch({ effects: nextSignatureEffect.of() });
    };

    counter.appendChild(prevBtn);
    counter.appendChild(countText);
    counter.appendChild(nextBtn);
    header.appendChild(counter);
  }

  dom.appendChild(header);

  // Active parameter documentation (if any)
  if (params.length > 0 && activeParamIdx >= 0 && activeParamIdx < params.length) {
    const paramDoc = getDocString(params[activeParamIdx].documentation);
    if (paramDoc) {
      const pDocEl = document.createElement("div");
      pDocEl.className = "cm-signature-param-doc";
      pDocEl.textContent = paramDoc;
      dom.appendChild(pDocEl);
    }
  }

  // Method / constructor documentation (if any)
  const sigDoc = getDocString(sig.documentation);
  if (sigDoc) {
    const sigDocEl = document.createElement("div");
    sigDocEl.className = "cm-signature-doc";
    sigDocEl.textContent = sigDoc;
    dom.appendChild(sigDocEl);
  }

  return dom;
}

export const signatureHelpField = StateField.define<SignatureHelpState | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSignatureHelpEffect)) {
        return effect.value;
      }
      if (effect.is(nextSignatureEffect) && value && value.help) {
        const total = value.help.signatures.length;
        if (total > 1) {
          const nextIdx = (value.activeSignatureIdx + 1) % total;
          return { ...value, activeSignatureIdx: nextIdx };
        }
      }
      if (effect.is(prevSignatureEffect) && value && value.help) {
        const total = value.help.signatures.length;
        if (total > 1) {
          const prevIdx = (value.activeSignatureIdx - 1 + total) % total;
          return { ...value, activeSignatureIdx: prevIdx };
        }
      }
    }
    if (value && tr.docChanged) {
      const newPos = tr.changes.mapPos(value.pos);
      return { ...value, pos: newPos };
    }
    return value;
  },
  provide: (field) =>
    showTooltip.from(field, (val) => {
      if (!val || !val.help || val.help.signatures.length === 0) return null;
      return {
        pos: val.pos,
        above: true,
        strictSide: false,
        create(view) {
          const dom = renderSignatureTooltipDOM(val, view);
          return { dom };
        },
      } as Tooltip;
    }),
});

class SignatureHelpPlugin implements PluginValue {
  private inflight = false;

  constructor(
    private view: EditorView,
    private client: TeraxLspClient,
    private documentUri: string,
  ) {}

  update(update: ViewUpdate) {
    const current = update.state.field(signatureHelpField);

    // If doc changed or selection moved, check if we need to request or dismiss
    if (update.docChanged) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      const charBefore = pos > line.from ? line.text[pos - line.from - 1] : "";

      if (charBefore === "(" || charBefore === "," || charBefore === "<") {
        void this.requestHelp(pos, charBefore);
        return;
      }

      if (charBefore === ")") {
        this.dismiss();
        return;
      }

      if (current) {
        void this.requestHelp(pos);
      }
    } else if (update.selectionSet && current) {
      // Re-evaluate signature help at new cursor position if already open
      const pos = update.state.selection.main.head;
      void this.requestHelp(pos);
    }
  }

  async requestHelp(pos: number, triggerChar?: string) {
    if (!this.client.ready || this.inflight) return;
    this.inflight = true;
    try {
      const line = this.view.state.doc.lineAt(pos);
      const lspPos: LspPos = {
        line: line.number - 1,
        character: pos - line.from,
      };

      const res = await this.client.textDocumentSignatureHelp({
        textDocument: { uri: this.documentUri },
        position: lspPos,
        context: triggerChar
          ? {
              triggerKind: 2,
              triggerCharacter: triggerChar,
              isRetrigger: this.view.state.field(signatureHelpField) !== null,
            }
          : {
              triggerKind: 1,
              isRetrigger: this.view.state.field(signatureHelpField) !== null,
            },
      });

      if (!res || !res.signatures || res.signatures.length === 0) {
        if (this.view.state.field(signatureHelpField)) {
          this.dismiss();
        }
        return;
      }

      const activeSigIdx = res.activeSignature ?? 0;
      this.view.dispatch({
        effects: setSignatureHelpEffect.of({
          help: res,
          pos,
          activeSignatureIdx: activeSigIdx,
        }),
      });
    } catch {
      // ignore
    } finally {
      this.inflight = false;
    }
  }

  dismiss() {
    this.view.dispatch({
      effects: setSignatureHelpEffect.of(null),
    });
  }

  destroy() {}
}

export function signatureHelpExtension(opts: {
  client: TeraxLspClient;
  documentUri: string;
}): Extension {
  return [
    signatureHelpField,
    ViewPlugin.define(
      (view) => new SignatureHelpPlugin(view, opts.client, opts.documentUri),
    ),
    keymap.of([
      {
        key: "Mod-Shift-Space",
        run: (view) => {
          const plugin = view.plugin(
            ViewPlugin.define(
              () => new SignatureHelpPlugin(view, opts.client, opts.documentUri),
            ),
          );
          const pos = view.state.selection.main.head;
          void (plugin ? plugin.requestHelp(pos) : null);
          return true;
        },
      },
      {
        key: "Escape",
        run: (view) => {
          if (view.state.field(signatureHelpField)) {
            view.dispatch({ effects: setSignatureHelpEffect.of(null) });
            return true;
          }
          return false;
        },
      },
      {
        key: "Alt-ArrowUp",
        run: (view) => {
          if (view.state.field(signatureHelpField)) {
            view.dispatch({ effects: prevSignatureEffect.of() });
            return true;
          }
          return false;
        },
      },
      {
        key: "Alt-ArrowDown",
        run: (view) => {
          if (view.state.field(signatureHelpField)) {
            view.dispatch({ effects: nextSignatureEffect.of() });
            return true;
          }
          return false;
        },
      },
    ]),
  ];
}
