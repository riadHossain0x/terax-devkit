import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDiagnosticsStore } from "@/modules/editor";
import { getLspNavigator } from "@/modules/lsp/lib/navigator";
import { Alert02Icon, CancelCircleIcon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

type Props = {
  filePath: string | null;
};

export function DiagnosticsBadge({ filePath }: Props) {
  const [open, setOpen] = useState(false);
  const data = useDiagnosticsStore((s) =>
    filePath ? s.byPath[filePath] : undefined,
  );

  if (!data || (data.errors === 0 && data.warnings === 0)) return null;

  const items = data.items ?? [];

  const handlePickLine = (line: number) => {
    if (filePath) {
      getLspNavigator()?.openFile(filePath, line);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Click to view file errors and warnings"
          className="terax-pill-in flex shrink-0 cursor-pointer items-center gap-2 text-[10.5px] font-medium tabular-nums rounded px-1.5 py-0.5 transition-colors hover:bg-accent/70"
        >
          {data.errors > 0 ? (
            <span className="flex items-center gap-0.5 text-destructive">
              <HugeiconsIcon icon={CancelCircleIcon} size={11} strokeWidth={2} />
              {data.errors}
            </span>
          ) : null}
          {data.warnings > 0 ? (
            <span className="flex items-center gap-0.5 text-amber-700 dark:text-amber-400">
              <HugeiconsIcon icon={Alert02Icon} size={11} strokeWidth={2} />
              {data.warnings}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-[380px] p-0 font-mono text-[11px] shadow-lg border border-border bg-popover"
      >
        <div className="flex items-center justify-between border-b border-border/80 px-3 py-2 bg-muted/30">
          <span className="font-semibold text-foreground">
            Problems ({items.length || data.errors + data.warnings})
          </span>
          <div className="flex items-center gap-2 text-[10px]">
            {data.errors > 0 ? (
              <span className="flex items-center gap-1 text-destructive font-medium">
                <HugeiconsIcon icon={CancelCircleIcon} size={10} strokeWidth={2} />
                {data.errors} {data.errors === 1 ? "Error" : "Errors"}
              </span>
            ) : null}
            {data.warnings > 0 ? (
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                <HugeiconsIcon icon={Alert02Icon} size={10} strokeWidth={2} />
                {data.warnings} {data.warnings === 1 ? "Warning" : "Warnings"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="max-h-[260px] overflow-y-auto divide-y divide-border/40 py-0.5">
          {items.map((it, idx) => {
            const isErr = it.severity === "error";
            const isWarn = it.severity === "warning";

            return (
              <button
                key={`${it.line}-${it.col}-${idx}`}
                type="button"
                onClick={() => handlePickLine(it.line)}
                className="group flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent/50 cursor-pointer"
              >
                <span className="mt-0.5 shrink-0">
                  {isErr ? (
                    <HugeiconsIcon
                      icon={CancelCircleIcon}
                      size={12}
                      strokeWidth={2}
                      className="text-destructive"
                    />
                  ) : isWarn ? (
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      size={12}
                      strokeWidth={2}
                      className="text-amber-700 dark:text-amber-400"
                    />
                  ) : (
                    <HugeiconsIcon
                      icon={InformationCircleIcon}
                      size={12}
                      strokeWidth={2}
                      className="text-sky-500"
                    />
                  )}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="text-foreground font-sans text-xs leading-snug break-words">
                    {it.message}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono bg-muted/60 px-1 py-0.2 rounded text-[9.5px]">
                      Ln {it.line}, Col {it.col}
                    </span>
                    {it.source ? (
                      <span className="truncate opacity-80">[{it.source}]</span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
