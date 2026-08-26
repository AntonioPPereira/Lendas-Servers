import { useEffect, type ReactNode } from "react";
import { config } from "@/lib/config";
import { liveStore } from "./store";
import { MockTransport } from "./simulator";
import { SseTransport, WebSocketTransport, type LiveTransport } from "./transport";

function createTransport(): LiveTransport {
  if (config.liveTransport === "websocket" && config.liveUrl) {
    return new WebSocketTransport(config.liveUrl);
  }
  if (config.liveTransport === "sse" && config.liveUrl) {
    return new SseTransport(config.liveUrl);
  }
  return new MockTransport();
}

/**
 * Owns the feed lifecycle. Pausing while the tab is hidden is the single
 * biggest win for battery and CPU on a page that ticks every second.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let transport: LiveTransport | null = createTransport();
    transport.connect(liveStore.apply);

    const onVisibility = () => {
      if (document.hidden) {
        transport?.disconnect();
        transport = null;
        liveStore.apply({ type: "connection", payload: "offline" });
      } else if (!transport) {
        transport = createTransport();
        transport.connect(liveStore.apply);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      transport?.disconnect();
    };
  }, []);

  return children;
}
