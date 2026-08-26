import { useCallback, useSyncExternalStore } from "react";
import type { ActivityEvent, GameServer, LiveMatch } from "@/data/types";
import type { ConnectionState, LiveEvent } from "./transport";

export interface LiveState {
  connection: ConnectionState;
  match: LiveMatch;
  servers: GameServer[];
  activity: ActivityEvent[];
  /** Bumped on every applied frame; components use it as a cheap change key. */
  revision: number;
}

/** Keeping the feed bounded is what keeps the DOM bounded. */
const ACTIVITY_LIMIT = 60;

/**
 * Estado honesto de "nada chegou ainda" — nunca dado mock. `MockTransport`
 * substitui isto pelo próprio snapshot fake segundos depois de conectar;
 * `SseTransport`/`WebSocketTransport` reais só substituem quando o backend
 * realmente reportar algo. Usar `INITIAL_MATCH` (o gerador de partida falsa
 * do mock) aqui faria uma conexão real, sem nenhum evento ainda recebido,
 * mostrar placar/jogadores inventados como se fossem ao vivo.
 */
const EMPTY_MATCH: LiveMatch = {
  serverId: "",
  hostname: "",
  map: "",
  phase: "warmup",
  round: 0,
  maxRounds: 0,
  ctScore: 0,
  tScore: 0,
  clock: 0,
  bombPlanted: false,
  rounds: [],
  players: [],
  startedAt: new Date(0).toISOString(),
};

const initialState: LiveState = {
  connection: "connecting",
  match: EMPTY_MATCH,
  servers: [],
  activity: [],
  revision: 0,
};

class LiveStore {
  private state: LiveState = initialState;
  private readonly listeners = new Set<() => void>();

  getState = (): LiveState => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private commit(next: LiveState) {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  apply = (event: LiveEvent) => {
    const state = this.state;
    switch (event.type) {
      case "connection":
        if (state.connection === event.payload) return;
        this.commit({ ...state, connection: event.payload });
        return;
      case "snapshot":
        this.commit({
          ...state,
          match: event.payload.match,
          servers: event.payload.servers,
          activity: event.payload.activity.slice(0, ACTIVITY_LIMIT),
          revision: state.revision + 1,
        });
        return;
      case "match":
        this.commit({ ...state, match: event.payload, revision: state.revision + 1 });
        return;
      case "servers":
        this.commit({ ...state, servers: event.payload, revision: state.revision + 1 });
        return;
      case "activity":
        this.commit({
          ...state,
          activity: [...event.payload].reverse().concat(state.activity).slice(0, ACTIVITY_LIMIT),
          revision: state.revision + 1,
        });
        return;
    }
  };
}

export const liveStore = new LiveStore();

export function useLiveSelector<T>(selector: (state: LiveState) => T): T {
  const getSnapshot = useCallback(() => selector(liveStore.getState()), [selector]);
  return useSyncExternalStore(liveStore.subscribe, getSnapshot, getSnapshot);
}

const selectMatch = (s: LiveState) => s.match;
const selectServers = (s: LiveState) => s.servers;
const selectActivity = (s: LiveState) => s.activity;
const selectConnection = (s: LiveState) => s.connection;

export const useLiveMatch = () => useLiveSelector(selectMatch);
export const useLiveServers = () => useLiveSelector(selectServers);
export const useLiveActivity = () => useLiveSelector(selectActivity);
export const useConnection = () => useLiveSelector(selectConnection);
