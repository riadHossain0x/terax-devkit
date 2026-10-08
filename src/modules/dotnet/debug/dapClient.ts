import {
  Breakpoint,
  DapOutputEvent,
  DapStoppedEvent,
  Scope,
  SourceBreakpoint,
  StackFrame,
  Thread,
  Variable,
} from "./types";
import { TauriDapTransport } from "./dapTransport";

type DapRequest = {
  seq: number;
  type: "request";
  command: string;
  arguments?: unknown;
};

type DapResponse = {
  seq: number;
  type: "response";
  request_seq: number;
  success: boolean;
  command: string;
  message?: string;
  body?: unknown;
};

type DapEvent = {
  seq: number;
  type: "event";
  event: string;
  body?: unknown;
};

type DapMessage = DapResponse | DapEvent;

export class DapClient {
  private seq = 1;
  private transport: TauriDapTransport;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
    }
  >();

  // Event handlers
  onStopped?: (evt: DapStoppedEvent) => void;
  onContinued?: () => void;
  onOutput?: (evt: DapOutputEvent) => void;
  onTerminated?: () => void;
  onExited?: (code: number) => void;

  constructor(transport: TauriDapTransport) {
    this.transport = transport;
    this.transport.onMessage((text) => this.handleMessage(text));
    this.transport.onClose(() => {
      this.onTerminated?.();
    });
  }

  private handleMessage(text: string) {
    let msg: DapMessage;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.type === "response") {
      const waiter = this.pending.get(msg.request_seq);
      if (waiter) {
        this.pending.delete(msg.request_seq);
        if (msg.success) {
          waiter.resolve(msg.body);
        } else {
          waiter.reject(new Error(msg.message || `DAP request ${msg.command} failed`));
        }
      }
    } else if (msg.type === "event") {
      this.handleEvent(msg as DapEvent);
    }
  }

  private handleEvent(evt: DapEvent) {
    switch (evt.event) {
      case "stopped":
        this.onStopped?.((evt.body as DapStoppedEvent) || { reason: "unknown" });
        break;
      case "continued":
        this.onContinued?.();
        break;
      case "output":
        if (evt.body) this.onOutput?.(evt.body as DapOutputEvent);
        break;
      case "terminated":
        this.onTerminated?.();
        break;
      case "exited":
        const body = evt.body as { exitCode: number } | undefined;
        this.onExited?.(body?.exitCode ?? 0);
        break;
    }
  }

  async sendRequest<T = unknown>(command: string, args?: unknown): Promise<T> {
    const currentSeq = this.seq++;
    const req: DapRequest = {
      seq: currentSeq,
      type: "request",
      command,
      arguments: args,
    };

    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(currentSeq, {
        resolve: resolve as (val: unknown) => void,
        reject,
      });
    });

    this.transport.send(JSON.stringify(req));
    return promise;
  }

  async initialize(adapterID = "coreclr"): Promise<unknown> {
    return this.sendRequest("initialize", {
      clientID: "terax-devkit",
      clientName: "Terax DevKit",
      adapterID,
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: "path",
      supportsVariableType: true,
      supportsVariablePaging: false,
      supportsRunInTerminalRequest: false,
    });
  }

  async launch(program: string, cwd: string, args: string[] = []): Promise<void> {
    await this.sendRequest("launch", {
      name: ".NET Core Launch",
      type: "coreclr",
      request: "launch",
      program,
      args,
      cwd,
      stopAtEntry: false,
      console: "internalConsole",
    });
  }

  async setBreakpoints(
    sourcePath: string,
    breakpoints: SourceBreakpoint[],
  ): Promise<{ breakpoints: Breakpoint[] }> {
    return this.sendRequest("setBreakpoints", {
      source: { path: sourcePath },
      breakpoints,
    });
  }

  async configurationDone(): Promise<void> {
    try {
      await this.sendRequest("configurationDone");
    } catch {
      // Some adapters don't strictly require configurationDone
    }
  }

  async threads(): Promise<{ threads: Thread[] }> {
    return this.sendRequest("threads");
  }

  async stackTrace(
    threadId: number,
    startFrame = 0,
    levels = 20,
  ): Promise<{ stackFrames: StackFrame[]; totalFrames?: number }> {
    return this.sendRequest("stackTrace", {
      threadId,
      startFrame,
      levels,
    });
  }

  async scopes(frameId: number): Promise<{ scopes: Scope[] }> {
    return this.sendRequest("scopes", { frameId });
  }

  async variables(
    variablesReference: number,
  ): Promise<{ variables: Variable[] }> {
    return this.sendRequest("variables", { variablesReference });
  }

  async continue(threadId = 1): Promise<void> {
    await this.sendRequest("continue", { threadId });
  }

  async next(threadId = 1): Promise<void> {
    await this.sendRequest("next", { threadId });
  }

  async stepIn(threadId = 1): Promise<void> {
    await this.sendRequest("stepIn", { threadId });
  }

  async stepOut(threadId = 1): Promise<void> {
    await this.sendRequest("stepOut", { threadId });
  }

  async pause(threadId = 1): Promise<void> {
    await this.sendRequest("pause", { threadId });
  }

  async disconnect(restart = false): Promise<void> {
    try {
      await this.sendRequest("disconnect", { restart, terminateDebuggee: true });
    } catch {
      // Ignore disconnect error if process is already dead
    }
    this.transport.close();
  }
}
