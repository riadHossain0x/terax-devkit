import { endpointIdFromCompatModel } from "@/modules/ai/config";
import { getCustomEndpointKey, getKey } from "@/modules/ai/lib/keyring";
import {
  lspFindReferences,
  lspFormatDocument,
  lspGotoDefinition,
  lspGotoImplementation,
  lspGotoTypeDefinition,
  lspOpenDocumentSymbols,
  useLspExtension,
} from "@/modules/lsp";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { onKeysChanged } from "@/modules/settings/store";
import {
  acceptCompletion,
  autocompletion,
  startCompletion,
} from "@codemirror/autocomplete";
import { redo, undo } from "@codemirror/commands";
import {
  findNext,
  findPrevious,
  gotoLine,
  openSearchPanel,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { Prec, StateEffect } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { renameSymbol } from "codemirror-languageserver";
import { vim } from "@replit/codemirror-vim";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { convertFileSrc } from "@tauri-apps/api/core";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  inlineCompletion,
  triggerInlineCompletion,
} from "./lib/autocomplete/inlineExtension";
import { diagnosticsReporter } from "./lib/diagnosticsReporter";
import { useDiagnosticsStore } from "./lib/diagnosticsStore";
import {
  breakpointCompartment,
  buildSharedExtensions,
  debugActiveLineCompartment,
  DEFAULT_INDENT,
  indentCompartment,
  indentExtension,
  languageCompartment,
  lspCompartment,
  snippetCompartment,
  vimCompartment,
  wordWrapExtension,
  wrapCompartment,
} from "./lib/extensions";
import {
  breakpointGutterExtension,
  setBreakpointsEffect,
} from "./lib/breakpointGutter";
import {
  debugActiveLineExtension,
  setActiveDebugLineEffect,
} from "./lib/debugActiveLine";
import { useDotnetDebugStore } from "@/modules/dotnet/debug/useDotnetDebugStore";
import {
  applyFormattedContent,
  readFileText,
  resolveFormatter,
  runExternalFormatter,
} from "./lib/externalFormat";
import { detectIndentUnit } from "./lib/indent";
import { type LanguageResult, resolveLanguage } from "./lib/languageResolver";
import { csharpSnippetCompletionSource } from "./lib/snippets/csharpSnippets";
import { FORCE_READ_LIMIT, useDocument } from "./lib/useDocument";
import { useEditorThemeExt } from "./lib/useEditorThemeExt";
import { initVimGlobals, vimHandlersExtension } from "./lib/vim";

initVimGlobals();

export type EditorPaneHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
  /** Open CodeMirror's find/replace panel. */
  openSearch: () => void;
  focus: () => void;
  getSelection: () => string | null;
  getPath: () => string;
  /** Re-read the file from disk. Skips silently if the buffer is dirty. */
  reload: () => boolean;
  /** Move the cursor to a 1-based line and center it, once content is ready. */
  gotoLine: (line: number, options?: { focus?: boolean }) => void;
  /** Apply CodeMirror's undo/redo commands. */
  undo: () => void;
  redo: () => void;
  /** Persist the buffer (format-on-save + write), same as Mod+S / :w. */
  save: () => Promise<void>;
  /** Request an AI ghost suggestion at the cursor. */
  triggerAiComplete: () => void;
  /** Open CodeMirror's completion popup. */
  triggerCodeComplete: () => void;
  /** Open symbols in file outline navigator. */
  gotoSymbol: () => Promise<void>;
  /** Navigate to declaration/definition at cursor. */
  gotoDefinition: () => Promise<void>;
  /** Navigate to implementation at cursor. */
  gotoImplementation: () => Promise<void>;
  /** Navigate to type definition at cursor. */
  gotoTypeDefinition: () => Promise<void>;
  /** Find references / usages at cursor. */
  findReferences: () => Promise<void>;
  /** Format document with LSP or configured formatter. */
  formatDocument: () => Promise<void>;
  /** Rename symbol at cursor. */
  renameSymbol: () => void;
};

type Props = {
  path: string;
  overrideLanguage?: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onClose?: () => void;
};

// Above this, syntax highlighting and LSP are disabled: a multi-MB lezer
// parse tree and a didOpen of that size cost far more than they give.
const SYNTAX_MAX_BYTES = 4 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// memo: EditorStack passes identity-stable props, so background editors
// skip re-rendering entirely when App re-renders (terminal events, tab churn).
export const EditorPane = memo(
  forwardRef<EditorPaneHandle, Props>(function EditorPane(props, ref) {
    const { path, overrideLanguage, onDirtyChange, onSaved, onClose } = props;

    const { doc, onChange, save, reload, adoptDiskText, openAnyway } =
      useDocument({
        path,
        onDirtyChange,
      });
    const reloadRef = useRef(reload);
    reloadRef.current = reload;
    const adoptDiskTextRef = useRef(adoptDiskText);
    adoptDiskTextRef.current = adoptDiskText;
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const themeExt = useEditorThemeExt();
    const vimMode = usePreferencesStore((s) => s.vimMode);
    const wordWrapColumn = usePreferencesStore((s) =>
      s.editorWordWrap ? s.editorWordWrapColumn : null,
    );
    const languageRef = useRef<string | null>(null);
    const [langId, setLangId] = useState<string | null>(null);
    const apiKeyRef = useRef<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      const refresh = async () => {
        const s = usePreferencesStore.getState();
        const provider = s.autocompleteProvider;
        if (
          provider === "lmstudio" ||
          provider === "mlx" ||
          provider === "ollama"
        ) {
          apiKeyRef.current = null;
          return;
        }
        // OpenAI-compatible keys live in a per-endpoint keyring slot.
        if (provider === "openai-compatible") {
          const eid = endpointIdFromCompatModel(s.autocompleteModelId);
          const k = eid ? await getCustomEndpointKey(eid) : null;
          if (!cancelled) apiKeyRef.current = k;
          return;
        }
        const k = await getKey(provider);
        if (!cancelled) apiKeyRef.current = k;
      };
      void refresh();
      let unlistenKeys: (() => void) | undefined;
      void onKeysChanged(() => void refresh()).then((un) => {
        if (cancelled) un();
        else unlistenKeys = un;
      });
      const unsubPrefs = usePreferencesStore.subscribe((state, prev) => {
        if (
          state.autocompleteProvider !== prev.autocompleteProvider ||
          state.autocompleteModelId !== prev.autocompleteModelId
        ) {
          void refresh();
        }
      });
      return () => {
        cancelled = true;
        unlistenKeys?.();
        unsubPrefs();
      };
    }, []);
    // Stabilize save + onSaved via refs so the extensions array never changes
    // identity — a new identity makes @uiw/react-codemirror reconfigure the
    // whole state, wiping the language compartment.
    const saveRef = useRef(save);
    saveRef.current = save;
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const lspActiveRef = useRef(false);
    const warnedNoLspRef = useRef(false);
    const warnedNoFormatRef = useRef(false);

    const performSave = useCallback(async () => {
      const view = cmRef.current?.view;
      const prefs = usePreferencesStore.getState();
      const formatter = resolveFormatter(languageRef.current, prefs);
      if (prefs.editorFormatOnSave && formatter === "lsp" && view) {
        if (lspActiveRef.current) {
          let res: "done" | "unsupported" = "done";
          try {
            res = await lspFormatDocument(view);
          } catch (e) {
            toast.error("Language server format failed", {
              description: String(e),
            });
          }
          if (res === "unsupported" && !warnedNoFormatRef.current) {
            warnedNoFormatRef.current = true;
            toast.warning("Format on save skipped", {
              description:
                "The active language server has no formatter. Pick an external one in Settings (Ruff for Python, Prettier, rustfmt, ...).",
            });
          }
        } else if (!warnedNoLspRef.current) {
          warnedNoLspRef.current = true;
          toast.warning("Format on save skipped", {
            description:
              "No active language server for this file. Enable one in the statusbar, or pick an external formatter in Settings.",
          });
        }
      }
      // Snapshot before save: edits typed during the formatter round-trip
      // must not be clobbered by the disk read-back.
      const docAtSave = view?.state.doc;
      const saved = await saveRef.current();
      if (!saved) return;
      if (prefs.editorFormatOnSave && formatter !== "lsp") {
        const error = await runExternalFormatter(
          formatter,
          pathRef.current,
          prefs.editorCustomFormatCommand,
        );
        if (error) {
          toast.error(`${formatter} format failed`, { description: error });
        } else {
          const readBack = await readFileText(pathRef.current);
          if (readBack !== null && view && view.state.doc === docAtSave) {
            applyFormattedContent(
              view,
              adoptDiskTextRef.current(readBack.text, readBack.mtime),
            );
          }
        }
      }
      onSavedRef.current?.();
    }, []);
    const performSaveRef = useRef(performSave);
    performSaveRef.current = performSave;

    const pathRef = useRef(path);
    pathRef.current = path;

    const pendingLineRef = useRef<{
      path: string;
      line: number;
      focus: boolean;
    } | null>(null);
    const pendingFocusRef = useRef<string | null>(null);
    const statusRef = useRef(doc.status);
    useLayoutEffect(() => {
      statusRef.current = doc.status;
    }, [doc.status]);

    useEffect(() => {
      if (pendingLineRef.current?.path !== path) {
        pendingLineRef.current = null;
      }
      if (pendingFocusRef.current !== path) {
        pendingFocusRef.current = null;
      }
    }, [path]);

    const focusWhenRendered = useCallback(
      (view: EditorView, targetPath: string) => {
        requestAnimationFrame(() => {
          if (cmRef.current?.view === view && pathRef.current === targetPath) {
            view.focus();
          }
        });
      },
      [],
    );

    const applyPendingGoto = useCallback(() => {
      const view = cmRef.current?.view;
      const pending = pendingLineRef.current;
      if (!view || pending == null || statusRef.current !== "ready") return;
      if (pending.path !== path) {
        pendingLineRef.current = null;
        return;
      }
      const target = Math.max(1, Math.min(pending.line, view.state.doc.lines));
      const at = view.state.doc.line(target).from;
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: "center" }),
      });
      if (pending.focus) focusWhenRendered(view, pending.path);
      pendingLineRef.current = null;
    }, [focusWhenRendered, path]);

    const applyPendingFocus = useCallback(() => {
      const view = cmRef.current?.view;
      const pendingPath = pendingFocusRef.current;
      if (!view || pendingPath === null || statusRef.current !== "ready")
        return;
      pendingFocusRef.current = null;
      if (pendingPath === path) focusWhenRendered(view, pendingPath);
    }, [focusWhenRendered, path]);

    useEffect(() => {
      if (doc.status !== "ready") return;
      applyPendingGoto();
      applyPendingFocus();
    }, [doc.status, applyPendingFocus, applyPendingGoto]);

    const extensions = useMemo(
      () => [
        // basicSetup is added before user extensions by @uiw/react-codemirror,
        // so we must elevate vim's precedence to win the keymap.
        vimCompartment.of(
          usePreferencesStore.getState().vimMode ? Prec.highest(vim()) : [],
        ),
        wrapCompartment.of(
          wordWrapExtension(
            usePreferencesStore.getState().editorWordWrap
              ? usePreferencesStore.getState().editorWordWrapColumn
              : null,
          ),
        ),
        vimHandlersExtension(() => ({
          save: () => {
            void performSaveRef.current();
          },
          close: () => onCloseRef.current?.(),
        })),
        ...buildSharedExtensions(),
        indentCompartment.of(DEFAULT_INDENT),
        languageCompartment.of([]),
        lspCompartment.of([]),
        snippetCompartment.of([]),
        breakpointCompartment.of(breakpointGutterExtension(() => pathRef.current)),
        debugActiveLineCompartment.of(debugActiveLineExtension()),
        diagnosticsReporter(() => pathRef.current),
        // Before inlineCompletion so an open popup wins Tab over the ghost.
        Prec.highest(keymap.of([{ key: "Tab", run: acceptCompletion }])),
        inlineCompletion({
          getPrefs: () => {
            const s = usePreferencesStore.getState();
            const p = s.autocompleteProvider;
            // autocompleteModelId holds the compat- id of the chosen endpoint.
            const compatEp =
              p === "openai-compatible"
                ? s.customEndpoints.find(
                    (e) =>
                      e.id === endpointIdFromCompatModel(s.autocompleteModelId),
                  )
                : undefined;
            const modelId =
              p === "lmstudio"
                ? s.lmstudioModelId
                : p === "mlx"
                  ? s.mlxModelId
                  : p === "ollama"
                    ? s.ollamaModelId
                    : p === "openai-compatible"
                      ? (compatEp?.modelId ?? "")
                      : p === "openrouter"
                        ? s.openrouterModelId
                        : s.autocompleteModelId;
            return {
              enabled: s.autocompleteEnabled,
              trigger: s.autocompleteTrigger,
              provider: p,
              modelId,
              apiKey: apiKeyRef.current,
              lmstudioBaseURL: s.lmstudioBaseURL,
              mlxBaseURL: s.mlxBaseURL,
              ollamaBaseURL: s.ollamaBaseURL,
              openaiCompatibleBaseURL:
                compatEp?.baseURL ?? s.openaiCompatibleBaseURL,
            };
          },
          getPath: () => pathRef.current,
          getLanguage: () => languageRef.current,
        }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void performSaveRef.current();
              return true;
            },
          },
          { key: "Ctrl-g", run: gotoLine },
          {
            key: "F9",
            run: (view) => {
              const head = view.state.selection.main.head;
              const lineNum = view.state.doc.lineAt(head).number;
              const curPath = pathRef.current;
              if (curPath) {
                useDotnetDebugStore.getState().toggleBreakpoint(curPath, lineNum);
              }
              return true;
            },
          },
        ]),
      ],
      [],
    );

    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: vimCompartment.reconfigure(vimMode ? Prec.highest(vim()) : []),
      });
    }, [vimMode]);

    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: wrapCompartment.reconfigure(wordWrapExtension(wordWrapColumn)),
      });
    }, [wordWrapColumn]);

    useEffect(() => {
      if (doc.status !== "ready") return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: indentCompartment.reconfigure(
          indentExtension(detectIndentUnit(doc.content)),
        ),
      });
    }, [doc]);

    const lspExt = useLspExtension(path, langId, doc.status === "ready");
    useEffect(() => {
      lspActiveRef.current = lspExt !== null;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: [
          lspCompartment.reconfigure(lspExt ?? []),
          ...(lspExt !== null ? [snippetCompartment.reconfigure([])] : []),
        ],
      });
    }, [lspExt]);

    useEffect(
      () => () => useDiagnosticsStore.getState().report(pathRef.current, null),
      [],
    );

    // Sync breakpoints into CodeMirror gutter
    const breakpoints = useDotnetDebugStore((s) => s.breakpoints[path]);
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view || doc.status !== "ready") return;
      view.dispatch({
        effects: setBreakpointsEffect.of(breakpoints || []),
      });
    }, [breakpoints, doc.status]);

    // Sync active debug paused line
    const activeFrame = useDotnetDebugStore((s) => s.activeFrame);
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view || doc.status !== "ready") return;
      const isTargetFile =
        activeFrame?.source?.path &&
        (activeFrame.source.path === path ||
          activeFrame.source.path.endsWith(path) ||
          path.endsWith(activeFrame.source.path));

      const targetLine = isTargetFile ? activeFrame.line : null;
      const effects: StateEffect<unknown>[] = [
        setActiveDebugLineEffect.of(targetLine),
      ];

      if (targetLine && targetLine <= view.state.doc.lines) {
        const line = view.state.doc.line(targetLine);
        effects.push(EditorView.scrollIntoView(line.from, { y: "center" }));
      }

      view.dispatch({ effects });
    }, [activeFrame, doc.status, path]);

    // Warm the language chunk while the file is still being read; the
    // ready-gated effect below then resolves from cache.
    useEffect(() => {
      const resolvePath = overrideLanguage ? `dummy.${overrideLanguage}` : path;
      void resolveLanguage(resolvePath).catch(() => {});
    }, [path, overrideLanguage]);

    useEffect(() => {
      const ext =
        overrideLanguage || (path.split(".").pop()?.toLowerCase() ?? null);
      languageRef.current = ext;
      if (doc.status !== "ready") return;
      if (doc.size > SYNTAX_MAX_BYTES) {
        setLangId(null);
        const view = cmRef.current?.view;
        view?.dispatch({ effects: languageCompartment.reconfigure([]) });
        return;
      }
      let cancelled = false;
      const resolve = async (): Promise<LanguageResult> => {
        const resolvePath = overrideLanguage
          ? `dummy.${overrideLanguage}`
          : path;
        return (
          (await resolveLanguage(resolvePath)) ?? { ext: [], name: "", id: "" }
        );
      };
      void resolve().then((result) => {
        if (cancelled) return;
        if (result.id) languageRef.current = result.id;
        setLangId(result.id || ext);
        const resolvedId = (result.id || ext || "").toLowerCase();
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: [
            languageCompartment.reconfigure(result.ext),
            snippetCompartment.reconfigure(
              !lspActiveRef.current &&
                (resolvedId === "cs" || resolvedId === "csharp")
                ? autocompletion({ override: [csharpSnippetCompletionSource] })
                : [],
            ),
          ],
        });
      });
      return () => {
        cancelled = true;
      };
    }, [path, doc.status, overrideLanguage]);

    useImperativeHandle(
      ref,
      () => ({
        setQuery: (q: string) => {
          const view = cmRef.current?.view;
          if (!view) return;
          view.dispatch({
            effects: setSearchQuery.of(
              new SearchQuery({ search: q, caseSensitive: false }),
            ),
          });
          if (q) findNext(view);
        },
        findNext: () => {
          const view = cmRef.current?.view;
          if (view) findNext(view);
        },
        findPrevious: () => {
          const view = cmRef.current?.view;
          if (view) findPrevious(view);
        },
        clearQuery: () => {
          const view = cmRef.current?.view;
          if (!view) return;
          view.dispatch({
            effects: setSearchQuery.of(new SearchQuery({ search: "" })),
          });
        },
        openSearch: () => {
          const view = cmRef.current?.view;
          if (view) openSearchPanel(view);
        },
        focus: () => {
          pendingFocusRef.current = path;
          applyPendingFocus();
        },
        getSelection: () => {
          const view = cmRef.current?.view;
          if (!view) return null;
          const { from, to } = view.state.selection.main;
          if (from === to) return null;
          return view.state.sliceDoc(from, to);
        },
        getPath: () => path,
        reload: () => reloadRef.current(),
        gotoLine: (line: number, options) => {
          pendingLineRef.current = {
            path,
            line,
            focus: options?.focus ?? true,
          };
          applyPendingGoto();
        },
        undo: () => {
          const view = cmRef.current?.view;
          if (view) undo(view);
        },
        redo: () => {
          const view = cmRef.current?.view;
          if (view) redo(view);
        },
        save: () => performSaveRef.current(),
        triggerAiComplete: () => {
          const view = cmRef.current?.view;
          if (view) triggerInlineCompletion(view);
        },
        triggerCodeComplete: () => {
          const view = cmRef.current?.view;
          if (!view) return;
          view.focus();
          startCompletion(view);
        },
        gotoSymbol: async () => {
          const view = cmRef.current?.view;
          if (!view) return;
          const res = await lspOpenDocumentSymbols(view);
          if (res === "unsupported") {
            toast.info("No symbols available", {
              description:
                "Language server is not running or file has no document symbols.",
            });
          }
        },
        gotoDefinition: async () => {
          const view = cmRef.current?.view;
          if (!view) return;
          const res = await lspGotoDefinition(view);
          if (res === "unsupported") {
            toast.info("No definition found", {
              description: "Language server is not running or symbol has no definition.",
            });
          }
        },
        gotoImplementation: async () => {
          const view = cmRef.current?.view;
          if (!view) return;
          const res = await lspGotoImplementation(view);
          if (res === "unsupported") {
            toast.info("No implementation found", {
              description: "Language server does not provide implementations for this symbol.",
            });
          }
        },
        gotoTypeDefinition: async () => {
          const view = cmRef.current?.view;
          if (!view) return;
          const res = await lspGotoTypeDefinition(view);
          if (res === "unsupported") {
            toast.info("No type definition found", {
              description: "Language server does not provide type definitions for this symbol.",
            });
          }
        },
        findReferences: async () => {
          const view = cmRef.current?.view;
          if (!view) return;
          const res = await lspFindReferences(view);
          if (res === "unsupported") {
            toast.info("No usages found", {
              description: "Language server is not running or symbol has no references.",
            });
          }
        },
        formatDocument: async () => {
          const view = cmRef.current?.view;
          if (!view) return;
          const res = await lspFormatDocument(view);
          if (res === "unsupported") {
            toast.info("Formatting unsupported", {
              description: "Language server does not support formatting for this file.",
            });
          }
        },
        renameSymbol: () => {
          const view = cmRef.current?.view;
          if (view) renameSymbol(view);
        },
      }),
      [path, applyPendingFocus, applyPendingGoto],
    );

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
      const view = cmRef.current?.view;
      if (!view) return;
      // If there is no selection, move cursor to the right-clicked position
      const { from, to } = view.state.selection.main;
      if (from === to) {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos != null) {
          view.dispatch({ selection: { anchor: pos } });
        }
      }
    }, []);

    const handleGotoDefinition = useCallback(() => {
      const view = cmRef.current?.view;
      if (view) void lspGotoDefinition(view);
    }, []);

    const handleGotoImplementation = useCallback(() => {
      const view = cmRef.current?.view;
      if (view) void lspGotoImplementation(view);
    }, []);

    const handleGotoTypeDefinition = useCallback(() => {
      const view = cmRef.current?.view;
      if (view) void lspGotoTypeDefinition(view);
    }, []);

    const handleFindReferences = useCallback(() => {
      const view = cmRef.current?.view;
      if (view) void lspFindReferences(view);
    }, []);

    const handleGotoSymbol = useCallback(() => {
      const view = cmRef.current?.view;
      if (view) void lspOpenDocumentSymbols(view);
    }, []);

    const handleFormat = useCallback(() => {
      const view = cmRef.current?.view;
      if (view) void lspFormatDocument(view);
    }, []);

    const handleRename = useCallback(() => {
      const view = cmRef.current?.view;
      if (view) renameSymbol(view);
    }, []);

    if (doc.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      );
    }
    if (doc.status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
          {doc.message}
        </div>
      );
    }
    if (doc.status === "binary" || doc.status === "toolarge") {
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const isImage = [
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "svg",
        "ico",
      ].includes(ext);
      const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
      const isAudio = ["mp3", "wav", "flac", "aac", "m4a"].includes(ext);
      const isPdf = ext === "pdf";

      if (isImage || isVideo || isAudio || isPdf) {
        const assetUrl = convertFileSrc(path);
        return (
          <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background p-4 overflow-auto">
            {isImage && (
              <img
                src={assetUrl}
                loading="lazy"
                decoding="async"
                className="max-w-full max-h-full object-contain rounded-md border border-border shadow-sm"
                style={{
                  backgroundImage:
                    "conic-gradient(var(--muted) 0.25turn, transparent 0.25turn 0.5turn, var(--muted) 0.5turn 0.75turn, transparent 0.75turn)",
                  backgroundSize: "20px 20px",
                }}
                alt={path.split("/").pop()}
              />
            )}
            {isVideo && (
              // biome-ignore lint/a11y/useMediaCaption: local media preview opens arbitrary files with no caption track
              <video
                controls
                preload="metadata"
                className="max-w-full max-h-full"
                src={assetUrl}
              />
            )}
            {isAudio && (
              // biome-ignore lint/a11y/useMediaCaption: local media preview opens arbitrary files with no caption track
              <audio
                controls
                preload="metadata"
                className="w-full max-w-md"
                src={assetUrl}
              />
            )}
            {isPdf && (
              <iframe
                src={assetUrl}
                className="w-full h-full border-none"
                title={path.split("/").pop()}
              />
            )}
          </div>
        );
      }

      const canForce = doc.status === "toolarge" && doc.size <= FORCE_READ_LIMIT;
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
          <div className="text-sm text-foreground">
            {doc.status === "binary" ? "Binary file" : "File too large"}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} ·{" "}
            {canForce ? "syntax features disabled" : "preview not supported"}
          </div>
          {canForce && (
            <button
              type="button"
              onClick={openAnyway}
              className="mt-2 rounded-md border border-border bg-muted/60 px-3 py-1 text-xs text-foreground hover:bg-accent"
            >
              Open anyway
            </button>
          )}
        </div>
      );
    }

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="flex h-full min-h-0 flex-col zoom-exempt"
            onContextMenu={handleContextMenu}
          >
            <CodeMirror
              ref={cmRef}
              value={doc.content}
              onChange={onChange}
              theme={themeExt}
              extensions={extensions}
              height="100%"
              className="terax-code-editor flex-1 min-h-0 overflow-hidden"
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                foldGutter: true,
                bracketMatching: true,
                closeBrackets: true,
                autocompletion: true,
                highlightActiveLine: true,
                highlightSelectionMatches: true,
                searchKeymap: true,
              }}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuSub>
            <ContextMenuSubTrigger>Go to</ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56">
              <ContextMenuItem onClick={handleGotoDefinition}>
                <span>Declaration or Usages</span>
                <ContextMenuShortcut>F12</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={handleGotoImplementation}>
                <span>Implementation</span>
                <ContextMenuShortcut>⌘F12</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onClick={handleGotoTypeDefinition}>
                <span>Type Definition</span>
                <ContextMenuShortcut>⇧⌘B</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleGotoSymbol}>
                <span>File Member / Symbol...</span>
                <ContextMenuShortcut>⇧⌘O</ContextMenuShortcut>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={handleFindReferences}>
            <span>Find Usages</span>
            <ContextMenuShortcut>⇧F12</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleRename}>
            <span>Rename Symbol</span>
            <ContextMenuShortcut>F2</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={handleFormat}>
            <span>Format Document</span>
            <ContextMenuShortcut>⇧⌥F</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }),
);
