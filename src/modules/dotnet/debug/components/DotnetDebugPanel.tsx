import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Bug01Icon,
  CheckmarkSquare02Icon,
  Cancel01Icon,
  FileCodeIcon,
  ArrowRight01Icon,
  Download01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDotnetDebugStore } from "../useDotnetDebugStore";
import { getLspNavigator } from "@/modules/lsp/lib/navigator";
import { getNetcoredbgDownloadUrl } from "../netcoredbgInstaller";

export function DotnetDebugPanel() {
  const {
    status,
    activeProject,
    breakpoints,
    callStack,
    activeFrame,
    scopes,
    variables,
    logs,
    clearLogs,
    netcoredbgPath,
    checkNetcoredbg,
    removeBreakpoint,
    setBreakpointEnabled,
    selectFrame,
  } = useDotnetDebugStore();

  useEffect(() => {
    void checkNetcoredbg();
  }, [checkNetcoredbg]);

  const [activeTab, setActiveTab] = useState<"variables" | "callstack" | "breakpoints" | "console">("console");
  const downloadInfo = getNetcoredbgDownloadUrl();

  const totalBreakpoints = Object.values(breakpoints).reduce(
    (acc, list) => acc + list.length,
    0,
  );

  return (
    <div className="flex h-full flex-col text-xs text-foreground select-none">
      {/* Active Status Banner */}
      {status !== "idle" && status !== "stopped" && (
        <div className="flex items-center justify-between border-b border-border/40 bg-foreground/[0.03] px-2.5 py-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                status === "paused"
                  ? "bg-amber-500 animate-pulse"
                  : status === "building"
                    ? "bg-blue-500 animate-ping"
                    : status === "starting"
                      ? "bg-amber-400"
                      : "bg-emerald-500",
              )}
            />
            <span className="truncate font-medium text-[11px] text-foreground">
              {status === "building" && `Building ${activeProject?.name ?? "project"}...`}
              {status === "starting" && "Launching netcoredbg adapter..."}
              {status === "running" && `Debugging ${activeProject?.name ?? "application"} (Running)`}
              {status === "paused" && `Paused at ${activeFrame?.name ?? "breakpoint"}`}
            </span>
          </div>
          <span className="rounded bg-foreground/[0.08] px-1.5 py-0.5 text-[9px] uppercase font-mono text-muted-foreground">
            {status}
          </span>
        </div>
      )}

      {/* Missing netcoredbg warning banner */}
      {!netcoredbgPath && (
        <div className="m-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-200">
          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
            <HugeiconsIcon icon={Bug01Icon} size={14} />
            <span>Debugger Engine Required</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-300/80 leading-relaxed">
            netcoredbg is not in homebrew core. Run this 1-line command in terminal to set it up automatically:
          </p>
          <div className="mt-1.5 rounded bg-black/60 px-2 py-1.5 font-mono text-[10px] text-zinc-300 break-all select-all">
            mkdir -p ~/.terax/bin && curl -L https://github.com/Samsung/netcoredbg/releases/download/3.2.0-1092/netcoredbg-osx-arm64.zip -o /tmp/netcoredbg.zip && unzip -q -o /tmp/netcoredbg.zip -d ~/.terax/bin/ && chmod +x ~/.terax/bin/netcoredbg/netcoredbg
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void checkNetcoredbg()}
              className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline"
            >
              Check Again
            </button>
            {downloadInfo && (
              <a
                href={downloadInfo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
              >
                <HugeiconsIcon icon={Download01Icon} size={12} />
                <span>Manual Download</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Tabs Header */}
      <div className="flex items-center border-b border-border/60 bg-foreground/[0.02] px-2 py-1 text-[11px]">
        <button
          type="button"
          onClick={() => setActiveTab("console")}
          className={cn(
            "px-2 py-1 font-medium rounded transition-colors relative",
            activeTab === "console"
              ? "bg-foreground/[0.08] text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Console
          {logs.length > 0 && (
            <span className="ml-1 text-[10px] text-blue-400 font-mono">
              ({logs.length})
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("variables")}
          className={cn(
            "px-2 py-1 font-medium rounded transition-colors",
            activeTab === "variables"
              ? "bg-foreground/[0.08] text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Variables
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("callstack")}
          className={cn(
            "px-2 py-1 font-medium rounded transition-colors relative",
            activeTab === "callstack"
              ? "bg-foreground/[0.08] text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Call Stack
          {callStack.length > 0 && (
            <span className="ml-1 text-[10px] text-amber-400 font-mono">
              ({callStack.length})
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("breakpoints")}
          className={cn(
            "px-2 py-1 font-medium rounded transition-colors relative",
            activeTab === "breakpoints"
              ? "bg-foreground/[0.08] text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Breakpoints
          {totalBreakpoints > 0 && (
            <span className="ml-1 text-[10px] text-rose-400 font-mono">
              ({totalBreakpoints})
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {/* Console view */}
        {activeTab === "console" && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-border/30">
              <span className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                Debug Output
              </span>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={clearLogs}
                  className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            {logs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-[11px]">
                No debug output yet. Click Debug on a project to start.
              </div>
            ) : (
              <div className="space-y-1 font-mono text-[10.5px] leading-relaxed">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className={cn(
                      "flex items-start gap-1.5 break-all",
                      log.level === "build" && "text-zinc-400",
                      log.level === "info" && "text-blue-400 font-medium",
                      log.level === "stdout" && "text-foreground",
                      log.level === "stderr" && "text-amber-400",
                      log.level === "error" && "text-rose-400 font-semibold",
                    )}
                  >
                    <span className="text-[9px] text-muted-foreground/50 shrink-0 select-none">
                      {log.timestamp}
                    </span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Variables view */}
        {activeTab === "variables" && (
          <div className="space-y-3">
            {scopes.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-[11px]">
                {status === "paused"
                  ? "No variables in scope."
                  : "Pause or hit a breakpoint to inspect variables."}
              </div>
            ) : (
              scopes.map((scope) => {
                const vars = variables[scope.variablesReference] || [];
                return (
                  <div key={scope.name} className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {scope.name}
                    </div>
                    {vars.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground italic pl-2">
                        Empty
                      </div>
                    ) : (
                      <div className="divide-y divide-border/20 rounded border border-border/40 bg-foreground/[0.015]">
                        {vars.map((v) => (
                          <div
                            key={v.name}
                            className="flex items-baseline justify-between px-2 py-1 text-[11px] font-mono hover:bg-foreground/[0.04]"
                          >
                            <span className="text-blue-400 font-medium">
                              {v.name}
                              {v.type && (
                                <span className="text-muted-foreground/60 text-[10px] ml-1">
                                  ({v.type})
                                </span>
                              )}
                            </span>
                            <span className="text-emerald-400 font-normal max-w-[140px] truncate">
                              {v.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Call Stack view */}
        {activeTab === "callstack" && (
          <div className="space-y-1">
            {callStack.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-[11px]">
                No active execution stack.
              </div>
            ) : (
              callStack.map((frame) => {
                const isSelected = activeFrame?.id === frame.id;
                const fileName = frame.source?.path
                  ? frame.source.path.split(/[\\/]/).pop()
                  : frame.source?.name;
                return (
                  <button
                    key={frame.id}
                    type="button"
                    onClick={() => void selectFrame(frame)}
                    className={cn(
                      "w-full text-left flex items-start gap-1.5 px-2 py-1.5 rounded transition-colors",
                      isSelected
                        ? "bg-amber-500/15 text-foreground border border-amber-500/30"
                        : "hover:bg-foreground/[0.04] text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={13}
                      className={cn(
                        "mt-0.5 shrink-0",
                        isSelected ? "text-amber-400" : "text-transparent",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-[11px] font-medium truncate">
                        {frame.name}
                      </div>
                      {fileName && (
                        <div className="text-[10px] text-muted-foreground/80 truncate">
                          {fileName}:{frame.line}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Breakpoints view */}
        {activeTab === "breakpoints" && (
          <div className="space-y-3">
            {totalBreakpoints === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-[11px]">
                No breakpoints set. Click the editor gutter beside line numbers or press F9.
              </div>
            ) : (
              Object.entries(breakpoints).map(([filePath, list]) => {
                if (list.length === 0) return null;
                const fileName = filePath.split(/[\\/]/).pop() || filePath;
                return (
                  <div key={filePath} className="space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-[11px] text-foreground">
                      <HugeiconsIcon icon={FileCodeIcon} size={13} className="text-muted-foreground" />
                      <span className="truncate" title={filePath}>
                        {fileName}
                      </span>
                    </div>
                    <div className="space-y-0.5 pl-2">
                      {list.map((bp) => (
                        <div
                          key={bp.line}
                          className="flex items-center justify-between group px-1.5 py-1 rounded hover:bg-foreground/[0.04] transition-colors"
                        >
                          <div
                            className="flex items-center gap-1.5 cursor-pointer flex-1"
                            onClick={() => {
                              getLspNavigator()?.openFile(filePath, bp.line);
                            }}
                          >
                            <span
                              className={cn(
                                "w-2.5 h-2.5 rounded-full shrink-0",
                                bp.enabled ? "bg-rose-500" : "bg-zinc-500",
                              )}
                            />
                            <span className="font-mono text-[11px]">
                              Line {bp.line}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              title={bp.enabled ? "Disable" : "Enable"}
                              onClick={() =>
                                setBreakpointEnabled(filePath, bp.line, !bp.enabled)
                              }
                              className="p-1 hover:text-foreground text-muted-foreground"
                            >
                              <HugeiconsIcon
                                icon={CheckmarkSquare02Icon}
                                size={12}
                                className={bp.enabled ? "text-emerald-400" : "text-muted-foreground"}
                              />
                            </button>
                            <button
                              type="button"
                              title="Remove"
                              onClick={() => removeBreakpoint(filePath, bp.line)}
                              className="p-1 hover:text-rose-400 text-muted-foreground"
                            >
                              <HugeiconsIcon icon={Cancel01Icon} size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
