import { currentWorkspaceEnv } from "@/modules/workspace";
import { Channel, invoke } from "@tauri-apps/api/core";

export type DapSpawnConfig = {
  command: string;
  args: string[];
  root: string;
  env?: Record<string, string>;
};

export type DapExitInfo = {
  code: number | null;
  stderrTail: string;
  reason: string | null;
};

export class TauriDapTransport {
  private sessionId: number | null = null;
  private closed = false;
  private onMsg: ((message: string) => void) | null = null;
  private onCloseCb: (() => void) | null = null;
  private onErrorCb: ((error: Error) => void) | null = null;
  private backlog: string[] = [];
  exitInfo: DapExitInfo | null = null;

  async start(config: DapSpawnConfig): Promise<void> {
    const decoder = new TextDecoder();
    const onMessage = new Channel<ArrayBuffer>();
    onMessage.onmessage = (buf) => {
      const text = decoder.decode(buf);
      if (this.onMsg) {
        this.onMsg(text);
      } else {
        this.backlog.push(text);
      }
    };

    const onExit = new Channel<DapExitInfo>();
    onExit.onmessage = (info) => {
      this.exitInfo = info;
      this.closed = true;
      this.onCloseCb?.();
    };

    this.sessionId = await invoke<number>("dap_spawn", {
      command: config.command,
      args: config.args,
      env: config.env ?? null,
      root: config.root,
      workspace: currentWorkspaceEnv(),
      onMessage,
      onExit,
    });
  }

  send(message: string): void {
    if (this.sessionId == null || this.closed) return;
    void invoke("dap_send", { id: this.sessionId, message }).catch((e) => {
      this.onErrorCb?.(new Error(String(e)));
    });
  }

  onMessage(callback: (message: string) => void): void {
    this.onMsg = callback;
    if (this.backlog.length > 0) {
      const queued = this.backlog;
      this.backlog = [];
      for (const m of queued) callback(m);
    }
  }

  onClose(callback: () => void): void {
    this.onCloseCb = callback;
    if (this.closed) callback();
  }

  onError(callback: (error: Error) => void): void {
    this.onErrorCb = callback;
  }

  close(): void {
    if (this.closed) {
      this.sessionId = null;
      return;
    }
    this.closed = true;
    if (this.sessionId != null) {
      void invoke("dap_kill", { id: this.sessionId }).catch(() => {});
      this.sessionId = null;
    }
  }
}
