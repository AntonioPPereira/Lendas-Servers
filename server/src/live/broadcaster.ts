import type { Response } from "express";

/**
 * Registro de conexões SSE abertas (`GET /api/live/stream`). `broadcast`
 * nunca lança: um cliente com o pipe já fechado não pode derrubar a entrega
 * pros outros — só é removido da lista.
 */
export class LiveBroadcaster {
  private readonly subscribers = new Set<Response>();

  subscribe(res: Response): () => void {
    this.subscribers.add(res);
    return () => {
      this.subscribers.delete(res);
    };
  }

  /** Manda um `LiveEvent` (mesmo shape que `MockTransport` já emite) pra todo cliente conectado. */
  broadcast(event: unknown): void {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.subscribers) {
      try {
        res.write(frame);
      } catch {
        this.subscribers.delete(res);
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}
