/**
 * Runtime wiring. Every value has a working default so the panel runs with
 * zero configuration; pointing it at a real deployment is env-only.
 */
const env = import.meta.env;

export const config = {
  brand: {
    name: "LENDAS",
    suffix: "NETWORK",
    tagline: "Counter-Strike: Source",
  },
  /** REST base for history, ranking, demos and bans. */
  apiBaseUrl: (env.VITE_API_URL as string | undefined) ?? "",
  /** Push endpoint for live match + activity. */
  liveUrl: (env.VITE_LIVE_URL as string | undefined) ?? "",
  liveTransport: (env.VITE_LIVE_TRANSPORT as "mock" | "websocket" | "sse" | undefined) ?? "mock",
  /** Simulated latency for the mock REST client, in ms. */
  mockLatency: 260,
} as const;

/** Placar ao vivo / atividade: independente do REST, tem seu próprio transporte. */
export const isMockLive = config.liveTransport === "mock" || config.liveUrl === "";

/**
 * REST (demos, ranking, jogadores, bans...): mock só enquanto não houver
 * VITE_API_URL configurada. Deliberadamente independente de `isMockLive` —
 * dá pra ligar demos reais sem precisar também ligar o placar ao vivo, e
 * vice-versa.
 */
export const isMockMode = config.apiBaseUrl === "";
