import { create } from "zustand";
import {
  DebugLogEntry,
  DebugStatus,
  LogLevel,
  Scope,
  StackFrame,
  Thread,
  UserBreakpoint,
  Variable,
} from "./types";
import { DapClient } from "./dapClient";
import { TauriDapTransport } from "./dapTransport";
import { detectNetcoredbg } from "./netcoredbgInstaller";
import { resolveProjectAssemblyPath } from "./dotnetTargetResolver";
import type { DotnetProject } from "../lib/solutionParser";
import { getLspNavigator } from "@/modules/lsp/lib/navigator";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";

type DotnetDebugState = {
  status: DebugStatus;
  activeProject: DotnetProject | null;
  netcoredbgPath: string | null;
  client: DapClient | null;
  breakpoints: Record<string, UserBreakpoint[]>;
  threads: Thread[];
  activeThreadId: number | null;
  callStack: StackFrame[];
  activeFrame: StackFrame | null;
  scopes: Scope[];
  variables: Record<number, Variable[]>;
  consoleOutput: string[];
  logs: DebugLogEntry[];

  // Actions
  toggleBreakpoint: (filePath: string, line: number) => void;
  removeBreakpoint: (filePath: string, line: number) => void;
  setBreakpointEnabled: (filePath: string, line: number, enabled: boolean) => void;
  checkNetcoredbg: () => Promise<string | null>;
  addLog: (level: LogLevel, text: string) => void;
  clearLogs: () => void;
  startDebugging: (project: DotnetProject, workspaceRoot: string) => Promise<void>;
  selectFrame: (frame: StackFrame) => Promise<void>;
  continue: () => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  stepOut: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
};

export const useDotnetDebugStore = create<DotnetDebugState>((set, get) => ({
  status: "idle",
  activeProject: null,
  netcoredbgPath: null,
  client: null,
  breakpoints: {},
  threads: [],
  activeThreadId: null,
  callStack: [],
  activeFrame: null,
  scopes: [],
  variables: {},
  consoleOutput: [],
  logs: [],

  toggleBreakpoint: (filePath: string, line: number) => {
    const bps = { ...get().breakpoints };
    const fileBps = bps[filePath] ? [...bps[filePath]] : [];
    const idx = fileBps.findIndex((b) => b.line === line);
    if (idx >= 0) {
      fileBps.splice(idx, 1);
    } else {
      fileBps.push({ line, enabled: true });
    }
    fileBps.sort((a, b) => a.line - b.line);
    bps[filePath] = fileBps;
    set({ breakpoints: bps });

    // If client is active, synchronize breakpoints immediately
    const client = get().client;
    if (client) {
      const activeLines = fileBps
        .filter((b) => b.enabled)
        .map((b) => ({ line: b.line }));
      void client.setBreakpoints(filePath, activeLines);
    }
  },

  removeBreakpoint: (filePath: string, line: number) => {
    const bps = { ...get().breakpoints };
    const fileBps = (bps[filePath] || []).filter((b) => b.line !== line);
    bps[filePath] = fileBps;
    set({ breakpoints: bps });

    const client = get().client;
    if (client) {
      const activeLines = fileBps
        .filter((b) => b.enabled)
        .map((b) => ({ line: b.line }));
      void client.setBreakpoints(filePath, activeLines);
    }
  },

  setBreakpointEnabled: (filePath: string, line: number, enabled: boolean) => {
    const bps = { ...get().breakpoints };
    const fileBps = (bps[filePath] || []).map((b) =>
      b.line === line ? { ...b, enabled } : b,
    );
    bps[filePath] = fileBps;
    set({ breakpoints: bps });

    const client = get().client;
    if (client) {
      const activeLines = fileBps
        .filter((b) => b.enabled)
        .map((b) => ({ line: b.line }));
      void client.setBreakpoints(filePath, activeLines);
    }
  },

  checkNetcoredbg: async () => {
    const path = await detectNetcoredbg();
    set({ netcoredbgPath: path });
    return path;
  },

  addLog: (level: LogLevel, text: string) => {
    const entry: DebugLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      text,
    };
    set((state) => ({
      logs: [...state.logs.slice(-1000), entry],
    }));
  },

  clearLogs: () => {
    set({ logs: [] });
  },

  startDebugging: async (project: DotnetProject, workspaceRoot: string) => {
    let debuggerPath = get().netcoredbgPath;
    if (!debuggerPath) {
      debuggerPath = await get().checkNetcoredbg();
    }
    if (!debuggerPath) {
      toast.error("netcoredbg not found", {
        description:
          "Please install netcoredbg (e.g. via brew install netcoredbg or manual download) to debug .NET applications.",
      });
      return;
    }

    set({
      status: "building",
      activeProject: project,
      consoleOutput: [],
      logs: [],
      callStack: [],
      activeFrame: null,
      scopes: [],
      variables: {},
    });

    get().addLog("info", `Initiating debug session for ${project.name}...`);
    get().addLog("build", `$ dotnet build "${project.path}"`);

    // Step 1: Compile project with dotnet build
    try {
      const buildRes = await invoke<{
        stdout: string;
        stderr: string;
        exit_code: number | null;
        timed_out: boolean;
      }>("shell_run_command", {
        command: `dotnet build "${project.path}"`,
        cwd: project.directory,
        timeoutSecs: 60,
      });

      if (buildRes.stdout) {
        for (const line of buildRes.stdout.split("\n")) {
          if (line.trim()) get().addLog("build", line);
        }
      }
      if (buildRes.stderr) {
        for (const line of buildRes.stderr.split("\n")) {
          if (line.trim()) get().addLog("stderr", line);
        }
      }

      if (buildRes.exit_code !== 0) {
        get().addLog("error", `Build failed with exit code ${buildRes.exit_code}. Debugger aborted.`);
        set({ status: "stopped" });
        toast.error("Build failed", {
          description: "See Debug Console for compilation errors.",
        });
        return;
      }
      get().addLog("info", "Build succeeded.");
    } catch (buildErr) {
      get().addLog("error", `Build execution failed: ${String(buildErr)}`);
      set({ status: "stopped" });
      toast.error("Build failed", {
        description: String(buildErr),
      });
      return;
    }

    // Step 2: Launch netcoredbg and attach
    set({ status: "starting" });
    const programPath = resolveProjectAssemblyPath(project);
    get().addLog("info", `Target assembly resolved: ${programPath}`);
    get().addLog("info", `Launching netcoredbg adapter...`);

    try {
      const transport = new TauriDapTransport();
      await transport.start({
        command: debuggerPath,
        args: ["--interpreter=vscode"],
        root: workspaceRoot,
      });

      const client = new DapClient(transport);

      client.onStopped = async (evt) => {
        set({ status: "paused" });
        const threadId = evt.threadId ?? 1;
        set({ activeThreadId: threadId });
        get().addLog("info", `Execution paused (reason: ${evt.reason}, thread: ${threadId})`);

        try {
          const stack = await client.stackTrace(threadId, 0, 20);
          set({ callStack: stack.stackFrames });
          if (stack.stackFrames.length > 0) {
            const topFrame = stack.stackFrames[0];
            get().addLog(
              "info",
              `Paused at ${topFrame.name} (${topFrame.source?.name ?? "unknown"}:${topFrame.line})`,
            );
            await get().selectFrame(topFrame);
          }
        } catch (e) {
          console.error("Failed to fetch stack trace:", e);
        }
      };

      client.onContinued = () => {
        set({ status: "running", activeFrame: null });
        get().addLog("info", "Execution resumed.");
      };

      client.onOutput = (evt) => {
        get().addLog(
          evt.category === "stderr" ? "stderr" : "stdout",
          evt.output.trimEnd(),
        );
        set((state) => ({
          consoleOutput: [...state.consoleOutput.slice(-500), evt.output],
        }));
      };

      client.onTerminated = () => {
        set({
          status: "stopped",
          client: null,
          activeFrame: null,
          callStack: [],
        });
        get().addLog("info", "Debug session terminated.");
        toast.info("Debug session ended");
      };

      set({ client });

      get().addLog("info", "Initializing DAP protocol...");
      await client.initialize("coreclr");

      // Send all existing breakpoints
      const currentBps = get().breakpoints;
      let bpCount = 0;
      for (const [sourcePath, bps] of Object.entries(currentBps)) {
        const activeLines = bps.filter((b) => b.enabled).map((b) => ({ line: b.line }));
        if (activeLines.length > 0) {
          bpCount += activeLines.length;
          await client.setBreakpoints(sourcePath, activeLines);
        }
      }
      get().addLog("info", `Synchronized ${bpCount} breakpoint(s).`);

      get().addLog("info", `Launching debuggee process...`);
      await client.launch(programPath, project.directory, []);
      await client.configurationDone();

      set({ status: "running" });
      get().addLog("info", "Application is running with debugger attached.");
      toast.success("Debugging started", {
        description: `${project.name} is now running.`,
      });
    } catch (err) {
      get().addLog("error", `Debugger error: ${String(err)}`);
      set({ status: "stopped", client: null });
      toast.error("Debugger failed to start", {
        description: String(err),
      });
    }
  },

  selectFrame: async (frame: StackFrame) => {
    set({ activeFrame: frame });
    if (frame.source?.path) {
      getLspNavigator()?.openFile(frame.source.path, frame.line);
    }

    const client = get().client;
    if (client) {
      try {
        const scopesRes = await client.scopes(frame.id);
        set({ scopes: scopesRes.scopes });

        // Fetch variables for each scope
        const newVars: Record<number, Variable[]> = {};
        for (const scope of scopesRes.scopes) {
          if (scope.variablesReference > 0) {
            const varsRes = await client.variables(scope.variablesReference);
            newVars[scope.variablesReference] = varsRes.variables;
          }
        }
        set({ variables: newVars });
      } catch (e) {
        console.error("Failed to load scopes/variables:", e);
      }
    }
  },

  continue: async () => {
    const { client, activeThreadId } = get();
    if (!client) return;
    await client.continue(activeThreadId ?? 1);
    set({ status: "running", activeFrame: null });
  },

  stepOver: async () => {
    const { client, activeThreadId } = get();
    if (!client) return;
    await client.next(activeThreadId ?? 1);
  },

  stepInto: async () => {
    const { client, activeThreadId } = get();
    if (!client) return;
    await client.stepIn(activeThreadId ?? 1);
  },

  stepOut: async () => {
    const { client, activeThreadId } = get();
    if (!client) return;
    await client.stepOut(activeThreadId ?? 1);
  },

  pause: async () => {
    const { client, activeThreadId } = get();
    if (!client) return;
    await client.pause(activeThreadId ?? 1);
  },

  stop: async () => {
    const { client } = get();
    if (client) {
      await client.disconnect(false);
    }
    set({
      status: "stopped",
      client: null,
      activeFrame: null,
      callStack: [],
      scopes: [],
      variables: {},
    });
  },

  restart: async () => {
    const { activeProject } = get();
    await get().stop();
    if (activeProject) {
      await get().startDebugging(activeProject, activeProject.directory);
    }
  },
}));
