import { useEffect, type ReactNode } from "react";
import { config } from "@/lib/config";
import { liveStore } from "./store";
import { SseTransport, WebSocketTransport, type LiveTransport } from "./transport";

/**
 * O simulador entra por `import()` dinâmico, e não no topo do arquivo, de
 * propósito: ele carrega uma partida inteira de jogadores inventados
 * (`@/data/live`), e num import estático esse peso — junto com os nomes
 * falsos — ia para o pacote de produção mesmo com o modo mock desligado.
 * Assim ele só é baixado por quem realmente roda em mock.
 */
async function createTransport(): Promise<LiveTransport> {
  if (config.liveTransport === "websocket" && config.liveUrl) {
    return new WebSocketTransport(config.liveUrl);
  }
  if (config.liveTransport === "sse" && config.liveUrl) {
    return new SseTransport(config.liveUrl);
  }
  const { MockTransport } = await import("./simulator");
  return new MockTransport();
}

/**
 * Owns the feed lifecycle. Pausing while the tab is hidden is the single
 * biggest win for battery and CPU on a page that ticks every second.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let transport: LiveTransport | null = null;
    /**
     * A criação virou assíncrona (por causa do import dinâmico), então cada
     * conexão carrega um "ticket". Se a aba for escondida ou o componente
     * desmontar enquanto o módulo carrega, o transporte que chegar atrasado
     * é descartado em vez de conectar sozinho e vazar.
     */
    let ticket = 0;

    async function abrir() {
      const meu = ++ticket;
      const novo = await createTransport();
      if (meu !== ticket) {
        novo.disconnect();
        return;
      }
      transport = novo;
      novo.connect(liveStore.apply);
    }

    function fechar() {
      ticket++;
      transport?.disconnect();
      transport = null;
    }

    void abrir();

    const onVisibility = () => {
      if (document.hidden) {
        fechar();
        liveStore.apply({ type: "connection", payload: "offline" });
      } else if (!transport) {
        void abrir();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      fechar();
    };
  }, []);

  return children;
}
