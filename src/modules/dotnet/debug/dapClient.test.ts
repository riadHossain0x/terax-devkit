import { describe, expect, it, vi } from "vitest";
import { DapClient } from "./dapClient";
import type { TauriDapTransport } from "./dapTransport";

describe("DapClient", () => {
  function createMockTransport() {
    let msgCb: ((text: string) => void) | null = null;
    let closeCb: (() => void) | null = null;
    const sent: string[] = [];

    const mock: Partial<TauriDapTransport> = {
      send: vi.fn((text: string) => {
        sent.push(text);
      }),
      onMessage: vi.fn((cb) => {
        msgCb = cb;
      }),
      onClose: vi.fn((cb) => {
        closeCb = cb;
      }),
      close: vi.fn(() => {
        closeCb?.();
      }),
    };

    return {
      transport: mock as TauriDapTransport,
      sent,
      receive: (json: unknown) => msgCb?.(JSON.stringify(json)),
      close: () => closeCb?.(),
    };
  }

  it("sends initialize request with proper seq and correlates response", async () => {
    const mock = createMockTransport();
    const client = new DapClient(mock.transport);

    const initPromise = client.initialize("coreclr");
    expect(mock.sent.length).toBe(1);
    const sentReq = JSON.parse(mock.sent[0]);
    expect(sentReq.command).toBe("initialize");
    expect(sentReq.arguments.adapterID).toBe("coreclr");
    expect(sentReq.seq).toBe(1);

    mock.receive({
      seq: 1,
      type: "response",
      request_seq: sentReq.seq,
      success: true,
      command: "initialize",
      body: { supportsConfigurationDoneRequest: true },
    });

    const res = await initPromise;
    expect(res).toEqual({ supportsConfigurationDoneRequest: true });
  });

  it("handles stopped event from debugger", async () => {
    const mock = createMockTransport();
    const client = new DapClient(mock.transport);

    let stoppedEvt: unknown = null;
    client.onStopped = (evt) => {
      stoppedEvt = evt;
    };

    mock.receive({
      seq: 2,
      type: "event",
      event: "stopped",
      body: { reason: "breakpoint", threadId: 1 },
    });

    expect(stoppedEvt).toEqual({ reason: "breakpoint", threadId: 1 });
  });

  it("handles execution controls (next, stepIn, continue)", async () => {
    const mock = createMockTransport();
    const client = new DapClient(mock.transport);

    const nextPromise = client.next(1);
    const sentReq = JSON.parse(mock.sent[mock.sent.length - 1]);
    expect(sentReq.command).toBe("next");
    expect(sentReq.arguments).toEqual({ threadId: 1 });

    mock.receive({
      seq: 10,
      type: "response",
      request_seq: sentReq.seq,
      success: true,
      command: "next",
    });

    await expect(nextPromise).resolves.toBeUndefined();
  });
});
