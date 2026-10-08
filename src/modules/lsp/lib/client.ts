import { highlightingFor, indentUnit, language } from "@codemirror/language";
import {
  type Extension,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state";
import {
  activateHover,
  closeHoverTooltips,
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
} from "@codemirror/view";
import { highlightCode } from "@lezer/highlight";
import {
  LanguageServerClient,
  languageServerPlugin,
  renameSymbol,
} from "codemirror-languageserver";
import {
  type LocationItem,
  locationsPanel,
  openLocationsPanel,
} from "./locationsPanel";
import { toast } from "sonner";
import {
  type DocumentSymbol,
  flattenDocumentSymbols,
  type SymbolInformation,
} from "./symbols";
import { fileUriToPath } from "./uri";
import { getLspNavigator } from "./navigator";

import {
  languageServerWithTransport as baseLanguageServerWithTransport,
  SynchronizationMethod,
} from "codemirror-languageserver";
import {
  autocompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import {
  csharpSnippetCompletionSource,
  CSHARP_SNIPPET_LABELS,
} from "@/modules/editor/lib/snippets/csharpSnippets";
import {
  signatureHelpExtension,
  type SignatureHelp,
} from "./signatureHelp";

export { SynchronizationMethod };

export function languageServerWithTransport(
  options: Parameters<typeof baseLanguageServerWithTransport>[0],
): Extension {
  const exts = baseLanguageServerWithTransport(options);
  if (!Array.isArray(exts) || exts.length < 3) return exts;

  const isCSharp = options.languageId === "csharp" || options.languageId === "cs";

  const customAc = autocompletion({
    override: [
      async (context: CompletionContext) => {
        const { state, pos, explicit, view } = context;
        if (!view) return null;
        const plugin = view.plugin(languageServerPlugin);
        if (plugin == null) return null;
        const line = state.doc.lineAt(pos);
        let trigKind = 1;
        let trigChar: string | undefined;
        const prov = plugin.client.capabilities?.completionProvider;
        const triggerChars =
          prov?.triggerCharacters && prov.triggerCharacters.length > 0
            ? prov.triggerCharacters
            : isCSharp
              ? [".", "'"]
              : ["."];

        const prevChar = pos > line.from ? line.text[pos - line.from - 1] : "";
        if (!explicit && triggerChars.includes(prevChar)) {
          trigKind = 2;
          trigChar = prevChar;
        }
        if (!explicit && trigKind === 1 && !context.matchBefore(/\w+$/)) {
          return null;
        }
        const lspPos = { line: line.number - 1, character: pos - line.from };
        const lspResult = await plugin.requestCompletion(context, lspPos, {
          triggerCharacter: trigChar,
          triggerKind: trigKind as 1 | 2 | 3,
        });

        if (!isCSharp) {
          return lspResult;
        }

        const snippetResult = csharpSnippetCompletionSource(context);
        if (!lspResult) {
          return snippetResult;
        }
        if (!snippetResult) {
          return lspResult;
        }

        // When a rich snippet exists (e.g. "class", "prop", "ctor", "interface"),
        // filter out plain LSP keyword duplicates that only insert bare text.
        const filteredLspOptions = lspResult.options.filter((opt: Completion) => {
          if (CSHARP_SNIPPET_LABELS.has(opt.label)) {
            // Drop plain keyword completions from LSP in favor of the rich snippet template
            if (opt.type === "keyword" || !opt.apply) {
              return false;
            }
          }
          return true;
        });

        return {
          from: Math.min(lspResult.from, snippetResult.from),
          options: [...snippetResult.options, ...filteredLspOptions],
          validFor: lspResult.validFor ?? snippetResult.validFor,
        };
      },
    ],
  });

  const wrapped = [...exts];
  wrapped[2] = customAc;
  return wrapped;
}

export type LspPos = { line: number; character: number };
type LspRange = { start: LspPos; end?: LspPos };

type LspLocation = { uri: string; range: LspRange };
type LspLocationLink = {
  targetUri: string;
  targetRange: LspRange;
  targetSelectionRange?: LspRange;
};
type DefinitionResult =
  | LspLocation
  | LspLocation[]
  | LspLocationLink[]
  | null
  | undefined;

function normalizeLocations(result: DefinitionResult): LspLocation[] {
  if (!result) return [];
  const list = Array.isArray(result) ? result : [result];
  const out: LspLocation[] = [];
  for (const loc of list) {
    if ("uri" in loc) {
      out.push(loc);
    } else if (loc.targetUri) {
      out.push({
        uri: loc.targetUri,
        range: loc.targetSelectionRange ?? loc.targetRange,
      });
    }
  }
  return out;
}

function offsetOf(doc: Text, pos: LspPos): number {
  if (pos.line >= doc.lines) return doc.length;
  const line = doc.line(pos.line + 1);
  return Math.min(line.from + pos.character, line.to);
}

export type LspFormatResult = "done" | "unsupported";

// The lib's formatDocument command fires and forgets; save needs to await
// the edits before writing to disk. "unsupported" surfaces servers that
// simply have no formatter (pyright) so the UI can say so instead of
// silently doing nothing.
export async function formatDocumentAndWait(
  view: EditorView,
): Promise<LspFormatResult> {
  const plugin = view.plugin(languageServerPlugin);
  if (!plugin) return "unsupported";
  const { client } = plugin;
  if (!client.ready || !client.capabilities?.documentFormattingProvider) {
    return "unsupported";
  }
  const doc = view.state.doc;
  const edits = await client.textDocumentFormatting({
    textDocument: { uri: plugin.documentUri },
    options: {
      tabSize: view.state.tabSize,
      insertSpaces: view.state.facet(indentUnit) !== "\t",
    },
  });
  if (!edits || edits.length === 0) return "done";
  // Edits are offsets into the requested snapshot; typing during the
  // round-trip would corrupt the document.
  if (view.state.doc !== doc) return "done";
  view.dispatch({
    changes: edits.map((e) => ({
      from: offsetOf(doc, e.range.start),
      to: offsetOf(doc, e.range.end),
      insert: e.newText,
    })),
  });
  return "done";
}

export async function openDocumentSymbols(
  view: EditorView,
): Promise<"done" | "unsupported"> {
  const plugin = view.plugin(languageServerPlugin);
  if (!plugin) return "unsupported";
  const client = plugin.client as unknown as TeraxLspClient;
  if (!client.ready) return "unsupported";

  let result: (DocumentSymbol | SymbolInformation)[] | null;
  try {
    result = await client.textDocumentDocumentSymbol({
      textDocument: { uri: plugin.documentUri },
    });
  } catch {
    return "unsupported";
  }
  if (!result || result.length === 0) return "unsupported";
  const flat = flattenDocumentSymbols(result);
  if (flat.length === 0) return "unsupported";

  const items: LocationItem[] = flat.map((s) => ({
    uri: plugin.documentUri,
    line: s.line,
    character: s.character,
    label: s.label,
  }));

  openLocationsPanel(view, {
    title: "Symbols in File",
    items,
    onPick: (item) => {
      const targetLine = Math.min(item.line + 1, view.state.doc.lines);
      const lineObj = view.state.doc.line(targetLine);
      const target = Math.min(lineObj.from + item.character, lineObj.to);
      view.dispatch({
        selection: { anchor: target },
        effects: EditorView.scrollIntoView(target, { y: "center" }),
      });
      view.focus();
    },
  });
  return "done";
}

function lspPositionAt(view: EditorView, pos: number) {
  const line = view.state.doc.lineAt(pos);
  return { line: line.number - 1, character: pos - line.from };
}

function lspNavigateTo(view: EditorView, documentUri: string, loc: LspLocation): void {
  if (loc.uri === documentUri) {
    const targetLine = Math.min(loc.range.start.line + 1, view.state.doc.lines);
    const lineObj = view.state.doc.line(targetLine);
    const target = Math.min(lineObj.from + loc.range.start.character, lineObj.to);
    view.dispatch({
      selection: { anchor: target },
      effects: EditorView.scrollIntoView(target, { y: "center" }),
    });
    view.focus();
  } else {
    const target = fileUriToPath(loc.uri);
    if (target) getLspNavigator()?.openFile(target, loc.range.start.line + 1);
  }
}

function lspDisplayResults(
  view: EditorView,
  documentUri: string,
  title: string,
  locs: LspLocation[],
): void {
  if (locs.length === 0) {
    toast.info(`No ${title.toLowerCase()} found`);
    return;
  }
  if (locs.length === 1) {
    lspNavigateTo(view, documentUri, locs[0]);
    return;
  }
  const seen = new Set<string>();
  const items: LocationItem[] = [];
  for (const loc of locs) {
    const rawKey = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`;
    if (seen.has(rawKey)) continue;
    seen.add(rawKey);

    const path = fileUriToPath(loc.uri) ?? loc.uri;
    const parts = path.split(/[\\/]/);
    const filename = parts.pop() ?? path;
    const parent = parts.pop();
    const rel = parent ? `${parent}/${filename}` : filename;
    const label = `${rel}:${loc.range.start.line + 1}`;

    items.push({
      uri: loc.uri,
      line: loc.range.start.line,
      character: loc.range.start.character,
      label,
    });
  }
  items.sort((a, b) => a.label.localeCompare(b.label));

  openLocationsPanel(view, {
    title,
    items,
    onPick: (item) =>
      lspNavigateTo(view, documentUri, {
        uri: item.uri,
        range: { start: { line: item.line, character: item.character } },
      }),
  });
}

export async function lspGotoDefinitionAtCursor(
  view: EditorView,
): Promise<"done" | "unsupported"> {
  const plugin = view.plugin(languageServerPlugin);
  if (!plugin) return "unsupported";
  const client = plugin.client as unknown as TeraxLspClient;
  if (!client.ready) return "unsupported";
  const pos = view.state.selection.main.head;
  try {
    const result = await client.textDocumentDefinition({
      textDocument: { uri: plugin.documentUri },
      position: lspPositionAt(view, pos),
    });
    lspDisplayResults(view, plugin.documentUri, "Definitions", normalizeLocations(result));
    return "done";
  } catch {
    return "unsupported";
  }
}

export async function lspGotoDeclarationAtCursor(
  view: EditorView,
): Promise<"done" | "unsupported"> {
  const plugin = view.plugin(languageServerPlugin);
  if (!plugin) return "unsupported";
  const client = plugin.client as unknown as TeraxLspClient;
  if (!client.ready) return "unsupported";
  const pos = view.state.selection.main.head;
  try {
    const result = await client.textDocumentDeclaration({
      textDocument: { uri: plugin.documentUri },
      position: lspPositionAt(view, pos),
    });
    lspDisplayResults(view, plugin.documentUri, "Declarations", normalizeLocations(result));
    return "done";
  } catch {
    return "unsupported";
  }
}

export async function lspGotoImplementationAtCursor(
  view: EditorView,
): Promise<"done" | "unsupported"> {
  const plugin = view.plugin(languageServerPlugin);
  if (!plugin) return "unsupported";
  const client = plugin.client as unknown as TeraxLspClient;
  if (!client.ready) return "unsupported";
  const pos = view.state.selection.main.head;
  try {
    const result = await client.textDocumentImplementation({
      textDocument: { uri: plugin.documentUri },
      position: lspPositionAt(view, pos),
    });
    lspDisplayResults(view, plugin.documentUri, "Implementations", normalizeLocations(result));
    return "done";
  } catch {
    return "unsupported";
  }
}

export async function lspGotoTypeDefinitionAtCursor(
  view: EditorView,
): Promise<"done" | "unsupported"> {
  const plugin = view.plugin(languageServerPlugin);
  if (!plugin) return "unsupported";
  const client = plugin.client as unknown as TeraxLspClient;
  if (!client.ready) return "unsupported";
  const pos = view.state.selection.main.head;
  try {
    const result = await client.textDocumentTypeDefinition({
      textDocument: { uri: plugin.documentUri },
      position: lspPositionAt(view, pos),
    });
    lspDisplayResults(view, plugin.documentUri, "Type Definitions", normalizeLocations(result));
    return "done";
  } catch {
    return "unsupported";
  }
}

export async function lspFindReferencesAtCursor(
  view: EditorView,
): Promise<"done" | "unsupported"> {
  const plugin = view.plugin(languageServerPlugin);
  if (!plugin) return "unsupported";
  const client = plugin.client as unknown as TeraxLspClient;
  if (!client.ready) return "unsupported";
  const pos = view.state.selection.main.head;
  try {
    const result = await client.textDocumentReferences({
      textDocument: { uri: plugin.documentUri },
      position: lspPositionAt(view, pos),
      context: { includeDeclaration: true },
    });
    lspDisplayResults(view, plugin.documentUri, "References", result ?? []);
    return "done";
  } catch {
    return "unsupported";
  }
}

function highlightBlock(el: HTMLElement, view: EditorView): void {
  const lang = view.state.facet(language);
  const code = el.textContent;
  if (!lang || !code) return;
  const frag = document.createDocumentFragment();
  highlightCode(
    code,
    lang.parser.parse(code),
    { style: (tags) => highlightingFor(view.state, tags) },
    (text, classes) => {
      if (!classes) {
        frag.appendChild(document.createTextNode(text));
        return;
      }
      const span = document.createElement("span");
      span.className = classes;
      span.textContent = text;
      frag.appendChild(span);
    },
    () => frag.appendChild(document.createTextNode("\n")),
  );
  el.replaceChildren(frag);
}

// Tooltip docs arrive as plain markdown-rendered code; tokenize them with
// the file's own parser so signatures match the editor theme. Tooltips are
// direct children of the editor DOM, so the outer observer never fires on
// typing; the subtree observer lives only while a tooltip is mounted.
const hoverCodeHighlight = ViewPlugin.define((view) => {
  const seen = new WeakSet<HTMLElement>();
  const inner = new Map<Element, MutationObserver>();

  const scan = (root: Element) => {
    const blocks = root.querySelectorAll<HTMLElement>(
      ".documentation pre code",
    );
    for (const el of blocks) {
      if (seen.has(el)) continue;
      seen.add(el);
      highlightBlock(el, view);
    }
  };

  const outer = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (
          !(node instanceof Element) ||
          !node.classList.contains("cm-tooltip")
        ) {
          continue;
        }
        scan(node);
        const ob = new MutationObserver(() => scan(node));
        ob.observe(node, { childList: true, subtree: true });
        inner.set(node, ob);
      }
      for (const node of m.removedNodes) {
        if (!(node instanceof Element)) continue;
        inner.get(node)?.disconnect();
        inner.delete(node);
      }
    }
  });
  outer.observe(view.dom, { childList: true });

  return {
    destroy: () => {
      outer.disconnect();
      for (const ob of inner.values()) ob.disconnect();
      inner.clear();
    },
  };
});

const setLinkRange = StateEffect.define<{ from: number; to: number } | null>();
const linkMark = Decoration.mark({ class: "cm-lsp-link" });

const linkField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setLinkRange)) {
        return e.value
          ? Decoration.set([linkMark.range(e.value.from, e.value.to)])
          : Decoration.none;
      }
    }
    return tr.docChanged ? Decoration.none : deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function currentLink(view: EditorView): { from: number; to: number } | null {
  const iter = view.state.field(linkField).iter();
  return iter.value ? { from: iter.from, to: iter.to } : null;
}

function updateLink(view: EditorView, event: MouseEvent | null): void {
  const prev = currentLink(view);
  let next: { from: number; to: number } | null = null;
  if (event && (event.metaKey || event.ctrlKey)) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos != null) next = view.state.wordAt(pos);
  }
  if (prev?.from === next?.from && prev?.to === next?.to) return;
  view.dispatch({ effects: setLinkRange.of(next) });
}

// Cmd/Ctrl-hover underlines the symbol under the pointer, matching the
// mod-click go-to-definition affordance.
const linkHover: Extension = [
  linkField,
  EditorView.domEventHandlers({
    mousemove: (event, view) => updateLink(view, event),
    keyup: (event, view) => {
      if (event.key === "Meta" || event.key === "Control") {
        updateLink(view, null);
      }
    },
    mouseleave: (_e, view) => updateLink(view, null),
  }),
  EditorView.theme({
    ".cm-lsp-link": {
      textDecoration: "underline",
      textUnderlineOffset: "2.5px",
      color: "var(--primary)",
      cursor: "pointer",
    },
  }),
];

export function lspInteractions(opts: {
  client: TeraxLspClient;
  documentUri: string;
  rootPath: string;
  onExternal: (uri: string, line: number) => void;
}): Extension {
  const navigate = (view: EditorView, loc: LspLocation): void => {
    if (loc.uri === opts.documentUri) {
      const targetLine = Math.min(
        loc.range.start.line + 1,
        view.state.doc.lines,
      );
      const lineObj = view.state.doc.line(targetLine);
      const target = Math.min(
        lineObj.from + loc.range.start.character,
        lineObj.to,
      );
      view.dispatch({
        selection: { anchor: target },
        effects: EditorView.scrollIntoView(target, { y: "center" }),
      });
      view.focus();
    } else {
      opts.onExternal(loc.uri, loc.range.start.line + 1);
    }
  };

  const label = (loc: LspLocation): string => {
    const path = fileUriToPath(loc.uri) ?? loc.uri;
    const rel = path.startsWith(`${opts.rootPath}/`)
      ? path.slice(opts.rootPath.length + 1)
      : path;
    return `${rel}:${loc.range.start.line + 1}`;
  };

  const showResults = (
    view: EditorView,
    title: string,
    locs: LspLocation[],
  ): void => {
    if (locs.length === 0) return;
    if (locs.length === 1) {
      navigate(view, locs[0]);
      return;
    }
    const seen = new Set<string>();
    const items: LocationItem[] = [];
    for (const loc of locs) {
      const rawKey = `${loc.uri}:${loc.range.start.line}:${loc.range.start.character}`;
      if (seen.has(rawKey)) continue;
      seen.add(rawKey);
      items.push({
        uri: loc.uri,
        line: loc.range.start.line,
        character: loc.range.start.character,
        label: label(loc),
      });
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    openLocationsPanel(view, {
      title,
      items,
      onPick: (item) =>
        navigate(view, {
          uri: item.uri,
          range: { start: { line: item.line, character: item.character } },
        }),
    });
  };

  const positionAt = (view: EditorView, pos: number) => {
    const line = view.state.doc.lineAt(pos);
    return { line: line.number - 1, character: pos - line.from };
  };

  const gotoDefinition = async (
    view: EditorView,
    pos: number,
  ): Promise<void> => {
    let result: DefinitionResult;
    try {
      result = await opts.client.textDocumentDefinition({
        textDocument: { uri: opts.documentUri },
        position: positionAt(view, pos),
      });
    } catch {
      return;
    }
    showResults(view, "Definitions", normalizeLocations(result));
  };

  const gotoImplementation = async (
    view: EditorView,
    pos: number,
  ): Promise<void> => {
    let result: DefinitionResult;
    try {
      result = await opts.client.textDocumentImplementation({
        textDocument: { uri: opts.documentUri },
        position: positionAt(view, pos),
      });
    } catch {
      return;
    }
    showResults(view, "Implementations", normalizeLocations(result));
  };

  const gotoTypeDefinition = async (
    view: EditorView,
    pos: number,
  ): Promise<void> => {
    let result: DefinitionResult;
    try {
      result = await opts.client.textDocumentTypeDefinition({
        textDocument: { uri: opts.documentUri },
        position: positionAt(view, pos),
      });
    } catch {
      return;
    }
    showResults(view, "Type Definitions", normalizeLocations(result));
  };

  const findReferences = async (
    view: EditorView,
    pos: number,
  ): Promise<void> => {
    let result: LspLocation[] | null;
    try {
      result = await opts.client.textDocumentReferences({
        textDocument: { uri: opts.documentUri },
        position: positionAt(view, pos),
        context: { includeDeclaration: true },
      });
    } catch {
      return;
    }
    showResults(view, "References", result ?? []);
  };

  const gotoSymbol = async (view: EditorView): Promise<void> => {
    let result: (DocumentSymbol | SymbolInformation)[] | null;
    try {
      result = await opts.client.textDocumentDocumentSymbol({
        textDocument: { uri: opts.documentUri },
      });
    } catch (err) {
      console.error("[lsp] textDocumentDocumentSymbol failed:", err);
      toast.error("Symbol lookup failed", {
        description: String(err),
      });
      return;
    }
    if (!result || result.length === 0) {
      toast.info("No symbols found in this file");
      return;
    }
    const flat = flattenDocumentSymbols(result);
    if (flat.length === 0) {
      toast.info("No symbols found in this file");
      return;
    }

    const items: LocationItem[] = flat.map((s) => ({
      uri: opts.documentUri,
      line: s.line,
      character: s.character,
      label: s.label,
    }));

    openLocationsPanel(view, {
      title: "Symbols in File",
      items,
      onPick: (item) =>
        navigate(view, {
          uri: item.uri,
          range: { start: { line: item.line, character: item.character } },
        }),
    });
  };

  return [
    locationsPanel,
    hoverCodeHighlight,
    linkHover,
    signatureHelpExtension({
      client: opts.client,
      documentUri: opts.documentUri,
    }),
    keymap.of([
      {
        key: "F12",
        preventDefault: true,
        run: (view) => {
          void gotoDefinition(view, view.state.selection.main.head);
          return true;
        },
      },
      {
        key: "Mod-F12",
        preventDefault: true,
        run: (view) => {
          void gotoImplementation(view, view.state.selection.main.head);
          return true;
        },
      },
      {
        key: "Mod-Shift-b",
        preventDefault: true,
        run: (view) => {
          void gotoTypeDefinition(view, view.state.selection.main.head);
          return true;
        },
      },
      {
        key: "Shift-F12",
        preventDefault: true,
        run: (view) => {
          void findReferences(view, view.state.selection.main.head);
          return true;
        },
      },
      {
        key: "F2",
        preventDefault: true,
        run: renameSymbol,
      },
      {
        key: "Shift-Alt-f",
        preventDefault: true,
        run: (view) => {
          void formatDocumentAndWait(view);
          return true;
        },
      },
      {
        key: "Mod-Shift-o",
        preventDefault: true,
        run: (view) => {
          void gotoSymbol(view);
          return true;
        },
      },
      {
        key: "Mod-k Mod-i",
        preventDefault: true,
        run: (view) => {
          const pos = view.state.selection.main.head;
          activateHover(view, pos, 1);
          return true;
        },
      },
      {
        key: "Mod-h",
        preventDefault: true,
        run: (view) => {
          const pos = view.state.selection.main.head;
          activateHover(view, pos, 1);
          return true;
        },
      },
      {
        key: "Escape",
        run: (view) => {
          view.dispatch({ effects: closeHoverTooltips });
          return false;
        },
      },
    ]),
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        if (!(event.metaKey || event.ctrlKey) || event.button !== 0) {
          return false;
        }
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos == null) return false;
        void gotoDefinition(view, pos);
        return true;
      },
    }),
  ];
}

type RawRpc = {
  notify(method: string, params: unknown): Promise<void>;
  request(method: string, params: unknown, timeout: number): Promise<unknown>;
};

// The lib's notify/request maps omit didClose, didSave and the
// shutdown/exit handshake; servers need all three for correct lifecycle.
export class TeraxLspClient extends LanguageServerClient {
  static hostPid: number | null = null;

  // The lib omits the publishDiagnostics capability and servers like
  // typescript-language-server push no diagnostics without it. processId
  // enables the server-side parent watchdog.
  // Dynamic registration for completion and definition is disabled so servers
  // return direct static providers and trigger characters in the initialize response.
  protected override getInitializeParams() {
    const params = super.getInitializeParams();
    params.processId = TeraxLspClient.hostPid;
    params.capabilities.textDocument = {
      ...params.capabilities.textDocument,
      publishDiagnostics: { relatedInformation: true },
      references: { dynamicRegistration: false },
      definition: { dynamicRegistration: false },
      declaration: { dynamicRegistration: false },
      implementation: { dynamicRegistration: false },
      typeDefinition: { dynamicRegistration: false },
      synchronization: {
        ...(params.capabilities.textDocument?.synchronization ?? {}),
        dynamicRegistration: false,
      },
      completion: {
        ...(params.capabilities.textDocument?.completion ?? {}),
        dynamicRegistration: false,
        completionItem: {
          ...(params.capabilities.textDocument?.completion?.completionItem ?? {}),
          snippetSupport: true,
          commitCharactersSupport: true,
          documentationFormat: ["markdown", "plaintext"],
          resolveSupport: {
            properties: ["detail", "documentation"],
          },
        },
        contextSupport: true,
      },
      signatureHelp: {
        dynamicRegistration: false,
        signatureInformation: {
          documentationFormat: ["markdown", "plaintext"],
          parameterInformation: { labelOffsetSupport: true },
          activeParameterSupport: true,
        },
      },
    };
    return params;
  }

  textDocumentSignatureHelp(params: {
    textDocument: { uri: string };
    position: LspPos;
    context?: unknown;
  }): Promise<SignatureHelp | null> {
    return this.raw.request("textDocument/signatureHelp", params, 5_000) as
      Promise<SignatureHelp | null>;
  }

  textDocumentReferences(params: {
    textDocument: { uri: string };
    position: LspPos;
    context: { includeDeclaration: boolean };
  }): Promise<LspLocation[] | null> {
    return this.raw.request("textDocument/references", params, 10_000) as
      Promise<LspLocation[] | null>;
  }

  textDocumentImplementation(params: {
    textDocument: { uri: string };
    position: LspPos;
  }): Promise<DefinitionResult> {
    return this.raw.request("textDocument/implementation", params, 10_000) as
      Promise<DefinitionResult>;
  }

  override textDocumentTypeDefinition(
    params: any,
  ): Promise<any> {
    return this.raw.request("textDocument/typeDefinition", params, 10_000);
  }

  override textDocumentDeclaration(
    params: any,
  ): Promise<any> {
    return this.raw.request("textDocument/declaration", params, 10_000);
  }

  textDocumentDocumentSymbol(params: {
    textDocument: { uri: string };
  }): Promise<(DocumentSymbol | SymbolInformation)[] | null> {
    return this.raw.request("textDocument/documentSymbol", params, 10_000) as
      Promise<(DocumentSymbol | SymbolInformation)[] | null>;
  }

  textDocumentDidClose(uri: string): void {
    void this.raw.notify("textDocument/didClose", { textDocument: { uri } });
  }

  textDocumentDidSave(uri: string): void {
    void this.raw.notify("textDocument/didSave", { textDocument: { uri } });
  }

  async shutdownGracefully(timeoutMs = 2000): Promise<void> {
    try {
      await this.raw.request("shutdown", null, timeoutMs);
      await this.raw.notify("exit", null);
    } catch {
      // Server already dead or unresponsive; the transport kill follows.
    }
  }

  private get raw(): RawRpc {
    return this as unknown as RawRpc;
  }
}
