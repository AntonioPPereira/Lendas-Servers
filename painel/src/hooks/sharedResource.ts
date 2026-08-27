import { useEffect, useSyncExternalStore } from "react";
import type { Resource } from "./useResource";

interface SharedState<T> {
  data: T | null;
  status: "loading" | "success" | "error";
  error: Error | null;
}

/**
 * Recurso periódico COMPARTILHADO entre todos os componentes que o consomem.
 *
 * `useResource` cria um estado (e um timer) por componente. Isso é o certo
 * pra dado de uma tela só, mas errado pra dado global: `useRealServers` vive
 * na Sidebar E na SignalBar, as duas presentes em toda página, então o mesmo
 * `/api/servers` era buscado em paralelo, uma vez por componente, a cada
 * sondagem — medido em produção local: 4 requisições por tique onde deveria
 * haver 1.
 *
 * Aqui existe um único estado, um único timer e uma única requisição em voo:
 * quem chega depois se inscreve no mesmo resultado. O timer só corre
 * enquanto houver alguém inscrito, e nunca com a aba escondida — cada
 * sondagem é uma raspagem do HLstatsX ou uma conexão SFTP de verdade.
 */
export function createSharedResource<T>(loader: () => Promise<T>, intervalMs: number) {
  let state: SharedState<T> = { data: null, status: "loading", error: null };
  const listeners = new Set<() => void>();
  let inFlight: Promise<void> | null = null;
  let timer: number | null = null;
  let lastRun = 0;
  let subscribers = 0;

  function publish(next: SharedState<T>) {
    state = next;
    for (const listener of listeners) listener();
  }

  function run(): Promise<void> {
    // Requisição já em voo: quem pediu agora aproveita a mesma.
    if (inFlight) return inFlight;

    lastRun = Date.now();
    publish({ ...state, status: "loading" });

    inFlight = loader()
      .then((data) => {
        publish({ data, status: "success", error: null });
      })
      .catch((cause: unknown) => {
        publish({
          ...state,
          status: "error",
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  function tick() {
    if (document.hidden) return;
    void run();
  }

  function restartTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = window.setInterval(tick, intervalMs);
  }

  function onVisibility() {
    if (document.hidden) return;
    // Voltou pra aba: atualiza só se o dado já passou da idade do intervalo.
    // Sem isso, alternar de aba rápido viraria rajada de requisições.
    if (Date.now() - lastRun < intervalMs) return;

    tick();
    // O intervalo seguiu correndo em vazio enquanto a aba estava escondida,
    // então a próxima borda dele pode estar a milissegundos daqui e emendar
    // uma segunda requisição logo após esta. Reinicia a contagem a partir
    // de agora — medido: era isso que fazia o retorno gastar 2 em vez de 1.
    restartTimer();
  }

  function acquire(): () => void {
    subscribers += 1;
    if (subscribers === 1) {
      void run();
      restartTimer();
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      subscribers -= 1;
      if (subscribers > 0) return;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }

  return {
    acquire,
    reload: () => void run(),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Referência estável de propósito: `useSyncExternalStore` entra em laço
    // infinito se o snapshot for um objeto novo a cada chamada.
    getSnapshot: () => state,
  };
}

export type SharedResource<T> = ReturnType<typeof createSharedResource<T>>;

export function useSharedResource<T>(resource: SharedResource<T>): Resource<T> {
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );

  useEffect(() => resource.acquire(), [resource]);

  return {
    data: state.data,
    status: state.status,
    error: state.error,
    refreshing: state.status === "loading" && state.data !== null,
    reload: resource.reload,
  };
}
