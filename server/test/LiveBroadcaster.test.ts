import { describe, expect, it, vi } from "vitest";
import { LiveBroadcaster } from "../src/live/broadcaster.js";

function fakeResponse() {
  return { write: vi.fn() } as unknown as import("express").Response;
}

describe("LiveBroadcaster", () => {
  it("manda o frame formatado (data: <json>\\n\\n) pra todo assinante", () => {
    const broadcaster = new LiveBroadcaster();
    const a = fakeResponse();
    const b = fakeResponse();
    broadcaster.subscribe(a);
    broadcaster.subscribe(b);

    broadcaster.broadcast({ type: "match", payload: { ok: true } });

    const expected = 'data: {"type":"match","payload":{"ok":true}}\n\n';
    expect(a.write).toHaveBeenCalledWith(expected);
    expect(b.write).toHaveBeenCalledWith(expected);
  });

  it("unsubscribe para de receber", () => {
    const broadcaster = new LiveBroadcaster();
    const a = fakeResponse();
    const unsubscribe = broadcaster.subscribe(a);

    unsubscribe();
    broadcaster.broadcast({ type: "match", payload: {} });

    expect(a.write).not.toHaveBeenCalled();
  });

  it("remove sozinho um assinante cujo write lança (pipe quebrado) sem afetar os outros", () => {
    const broadcaster = new LiveBroadcaster();
    const broken = { write: vi.fn(() => { throw new Error("EPIPE"); }) } as unknown as import("express").Response;
    const healthy = fakeResponse();
    broadcaster.subscribe(broken);
    broadcaster.subscribe(healthy);

    expect(() => broadcaster.broadcast({ type: "match", payload: {} })).not.toThrow();
    expect(healthy.write).toHaveBeenCalledTimes(1);
    expect(broadcaster.subscriberCount).toBe(1);
  });
});
