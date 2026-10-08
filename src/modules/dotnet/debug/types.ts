export type DebugStatus =
  | "idle"
  | "building"
  | "starting"
  | "running"
  | "paused"
  | "stopped";

export type Breakpoint = {
  id?: number;
  verified: boolean;
  line: number;
  column?: number;
  message?: string;
  source?: { path?: string; name?: string };
};

export type SourceBreakpoint = {
  line: number;
  column?: number;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
};

export type StackFrame = {
  id: number;
  name: string;
  source?: {
    path?: string;
    name?: string;
  };
  line: number;
  column: number;
};

export type Thread = {
  id: number;
  name: string;
};

export type Scope = {
  name: string;
  variablesReference: number;
  expensive?: boolean;
};

export type Variable = {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
};

export type DapStoppedEvent = {
  reason: "breakpoint" | "step" | "pause" | "exception" | string;
  threadId?: number;
  description?: string;
  text?: string;
  allThreadsStopped?: boolean;
};

export type DapOutputEvent = {
  category?: "console" | "stdout" | "stderr" | "telemetry";
  output: string;
};

export type UserBreakpoint = {
  line: number;
  enabled: boolean;
};

export type LogLevel = "info" | "build" | "stdout" | "stderr" | "error";

export type DebugLogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  text: string;
};

