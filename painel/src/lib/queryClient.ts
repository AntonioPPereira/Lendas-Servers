import { QueryClient } from "@tanstack/react-query";

/**
 * Frescor por fonte, casado com o cache do BACKEND — pedir mais rápido que
 * ele revalida não traz dado novo, só gasta requisição. Ver server/.env.example.
 */
export const STALE = {
  /** SERVERS_CACHE_TTL_MS = 10s no backend. */
  servers: 15_000,
  /** ACTIVITY_CACHE_TTL_MS = 10s, e cada busca abre conexão SFTP no servidor de jogo. */
  activity: 10_000,
  /** RANKING_CACHE_TTL_MS = 45s. Vale pro ranking, jogadores e perfil. */
  ranking: 45_000,
  /** Demo é arquivo em disco: muda quando uma partida acaba, não a toda hora. */
  demos: 60_000,
  /**
   * O arquivo de partidas só muda quando um MAPA TERMINA — o plugin grava
   * no `OnMapEnd`. Rebuscar durante a partida em andamento não traz nada
   * novo e paga a ida ao SFTP de novo, que é a leitura mais cara do
   * backend. 5 minutos, igual ao cache do servidor.
   */
  arquivo: 5 * 60_000,
  /** Agregados do HLstatsX: somas de anos, não mudam de minuto a minuto. */
  serverStats: 5 * 60_000,
  /** Pódios: o plugin exporta a cada 2 min, então reler antes disso não traz nada. */
  leaderboards: 2 * 60_000,
} as const;

/**
 * Quanto tempo o dado fica guardado depois de sair da tela.
 *
 * O padrão do TanStack (5 min) faz a tela de Estatísticas recarregar do zero
 * a cada ida e volta um pouco mais demorada — e ali cada carga significa
 * raspar três páginas do HLstatsX e abrir uma conexão SFTP. Meia hora de
 * cache troca isso por retorno instantâneo, ao custo de alguns KB em
 * memória.
 */
export const GC = {
  caro: 30 * 60_000,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,

      /**
       * O backend roda em free tier que hiberna: a primeira requisição depois
       * de um tempo ocioso pode demorar ou falhar enquanto a instância sobe.
       * Antes isso jogava a tela direto pro estado de erro e exigia clique
       * manual em "Tentar de novo" — agora ela se recupera sozinha.
       *
       * 404 não se resolve tentando de novo (demo ou jogador que não existe),
       * então só erro de rede/servidor é repetido.
       */
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        if (status !== undefined && status >= 400 && status < 500) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),

      /**
       * Voltou pra aba: revalida o que está velho. `focusThrottleInterval` no
       * QueryClient da v5 não existe mais — quem segura a rajada ao alternar
       * de aba rápido é o próprio `staleTime`, que só deixa rebuscar o que já
       * passou da idade.
       */
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,

      /**
       * A correção que mais importa aqui: sondagem periódica NÃO corre com a
       * aba escondida. Cada tique é uma raspagem do HLstatsX ou uma conexão
       * SFTP de verdade — uma aba esquecida em segundo plano gastava centenas
       * de requisições sem ninguém olhando.
       */
      refetchIntervalInBackground: false,
    },
  },
});
