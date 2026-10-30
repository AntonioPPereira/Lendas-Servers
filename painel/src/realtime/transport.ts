import type { ActivityEvent, GameServer, LiveMatch } from "@/data/types";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "offline";

export interface LiveSnapshot {
  match: LiveMatch;
  servers: GameServer[];
  activity: ActivityEvent[];
}

export type LiveEvent =
  | { type: "snapshot"; payload: LiveSnapshot }
  | { type: "match"; payload: LiveMatch }
  | { type: "servers"; payload: GameServer[] }
  | { type: "activity"; payload: ActivityEvent[] }
  | { type: "connection"; payload: ConnectionState };

export type LiveHandler = (event: LiveEvent) => void;

/**
 * The single seam between the UI and the server feed.
 *
 * The panel ships with `MockTransport` so the prototype runs standalone; a
 * deployment swaps in `WebSocketTransport` (SourceMod bridge) or
 * `SseTransport` without touching a component.
 */
export interface LiveTransport {
  readonly kind: "mock" | "websocket" | "sse";
  connect(handler: LiveHandler): void;
  disconnect(): void;
}

/** Reads `wss://…` push frames emitted by the server-side bridge. */
export class WebSocketTransport implements LiveTransport {
  readonly kind = "websocket" as const;
  private socket: WebSocket | null = null;
  private retry = 0;
  private retryTimer: number | null = null;
  private handler: LiveHandler | null = null;
  private closed = false;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(handler: LiveHandler) {
    this.handler = handler;
    this.closed = false;
    this.open();
  }

  private open() {
    this.handler?.({ type: "connection", payload: this.retry ? "reconnecting" : "connecting" });
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.retry = 0;
      this.handler?.({ type: "connection", payload: "live" });
    };

    socket.onmessage = (message) => {
      try {
        this.handler?.(JSON.parse(message.data as string) as LiveEvent);
      } catch {
        // A malformed frame must never take the panel down.
      }
    };

    socket.onclose = () => {
      if (this.closed) return;
      this.handler?.({ type: "connection", payload: "reconnecting" });
      this.scheduleRetry();
    };

    socket.onerror = () => socket.close();
  }

  private scheduleRetry() {
    this.retry += 1;
    const delay = Math.min(15_000, 800 * 2 ** this.retry);
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }

  disconnect() {
    this.closed = true;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
  }
}

/**
 * Fallback for hosts that terminate long-lived upgrades.
 *
 * Reconecta por conta própria, e isso NÃO é redundante com o `EventSource`.
 * O navegador só reabre sozinho em erro de rede: se a resposta vier com
 * status fora de 2xx — um 502/503 do backend reiniciando, ou um 429 de
 * limite de taxa — a especificação manda ele desistir de vez, deixando
 * `readyState` em CLOSED e sem nunca mais tentar.
 *
 * Na prática era isto: o painel ficava minutos sem dado e só voltava quando
 * algo recriava o transporte por fora (trocar de aba e voltar, ou recarregar
 * a página). Confirmado em produção 2026-08-27, com o backend de pé o tempo
 * todo — não era o servidor caindo, era a conexão que não se reerguia.
 */
export class SseTransport implements LiveTransport {
  readonly kind = "sse" as const;
  private source: EventSource | null = null;
  private handler: LiveHandler | null = null;
  private retry = 0;
  private retryTimer: number | null = null;
  private closed = false;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  connect(handler: LiveHandler) {
    this.handler = handler;
    this.closed = false;
    this.retry = 0;
    this.open();
  }

  private open() {
    if (this.closed) return;

    this.handler?.({ type: "connection", payload: this.retry ? "reconnecting" : "connecting" });

    const source = new EventSource(this.url, { withCredentials: false });
    this.source = source;

    source.onopen = () => {
      this.retry = 0;
      this.handler?.({ type: "connection", payload: "live" });
    };

    source.onmessage = (message) => {
      try {
        this.handler?.(JSON.parse(message.data as string) as LiveEvent);
      } catch {
        /* ignore malformed frame */
      }
    };

    source.onerror = () => {
      if (this.closed) return;
      this.handler?.({ type: "connection", payload: "reconnecting" });

      // CLOSED = o navegador desistiu e não vai tentar de novo sozinho.
      // Qualquer outro estado é ele já se reconectando; entrar no meio só
      // criaria uma segunda conexão concorrendo com a primeira.
      if (source.readyState === EventSource.CLOSED) {
        source.close();
        this.scheduleRetry();
      }
    };
  }

  private scheduleRetry() {
    this.retry += 1;
    const delay = Math.min(15_000, 800 * 2 ** this.retry);
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }

  disconnect() {
    this.closed = true;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.source?.close();
    this.source = null;
  }
}
