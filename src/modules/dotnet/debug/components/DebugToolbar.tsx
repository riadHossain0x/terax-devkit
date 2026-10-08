import { cn } from "@/lib/utils";
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useDotnetDebugStore } from "../useDotnetDebugStore";

export function DebugToolbar() {
  const {
    status,
    activeProject,
    continue: doContinue,
    pause: doPause,
    stepOver: doStepOver,
    stepInto: doStepInto,
    stepOut: doStepOut,
    restart: doRestart,
    stop: doStop,
  } = useDotnetDebugStore();

  if (status === "idle" || status === "stopped") {
    return null;
  }

  const isPaused = status === "paused";
  const isStarting = status === "starting" || status === "building";

  return (
    <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border/80 bg-background/95 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-border/60">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            isPaused
              ? "bg-amber-500 animate-pulse"
              : isStarting
                ? "bg-blue-500 animate-ping"
                : "bg-emerald-500",
          )}
        />
        <span className="text-[11px] font-medium text-foreground max-w-[120px] truncate">
          {activeProject?.name ?? "Debugging"}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
          ({status})
        </span>
      </div>

      {/* Continue or Pause */}
      {isPaused ? (
        <button
          type="button"
          title="Continue (F5)"
          onClick={() => void doContinue()}
          className="p-1.5 rounded hover:bg-foreground/[0.08] text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          <HugeiconsIcon icon={PlayIcon} size={15} />
        </button>
      ) : (
        <button
          type="button"
          title="Pause (F6)"
          onClick={() => void doPause()}
          className="p-1.5 rounded hover:bg-foreground/[0.08] text-amber-500 hover:text-amber-400 transition-colors"
        >
          <HugeiconsIcon icon={PauseIcon} size={15} />
        </button>
      )}

      {/* Step Over */}
      <button
        type="button"
        title="Step Over (F10)"
        disabled={!isPaused}
        onClick={() => void doStepOver()}
        className={cn(
          "p-1.5 rounded transition-colors",
          isPaused
            ? "hover:bg-foreground/[0.08] text-foreground"
            : "text-muted-foreground/40 cursor-not-allowed",
        )}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
      </button>

      {/* Step Into */}
      <button
        type="button"
        title="Step Into (F11)"
        disabled={!isPaused}
        onClick={() => void doStepInto()}
        className={cn(
          "p-1.5 rounded transition-colors",
          isPaused
            ? "hover:bg-foreground/[0.08] text-foreground"
            : "text-muted-foreground/40 cursor-not-allowed",
        )}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={15} />
      </button>

      {/* Step Out */}
      <button
        type="button"
        title="Step Out (Shift+F11)"
        disabled={!isPaused}
        onClick={() => void doStepOut()}
        className={cn(
          "p-1.5 rounded transition-colors",
          isPaused
            ? "hover:bg-foreground/[0.08] text-foreground"
            : "text-muted-foreground/40 cursor-not-allowed",
        )}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} size={15} />
      </button>

      {/* Restart */}
      <button
        type="button"
        title="Restart"
        onClick={() => void doRestart()}
        className="p-1.5 rounded hover:bg-foreground/[0.08] text-foreground transition-colors"
      >
        <HugeiconsIcon icon={RefreshIcon} size={15} />
      </button>

      {/* Stop */}
      <button
        type="button"
        title="Stop Debugging (Shift+F5)"
        onClick={() => void doStop()}
        className="p-1.5 rounded hover:bg-rose-500/10 text-rose-500 hover:text-rose-400 transition-colors ml-0.5"
      >
        <HugeiconsIcon icon={StopIcon} size={15} />
      </button>
    </div>
  );
}
