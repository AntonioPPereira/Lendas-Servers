import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";

export type ResourceStatus = "loading" | "success" | "error";

export interface Resource<T> {
  data: T | null;
  status: ResourceStatus;
  error: Error | null;
  /** True while refetching with data already on screen. */
  refreshing: boolean;
  reload: () => void;
}

export interface ResourceOptions {
  /** Por quanto tempo o dado é considerado fresco — casa com o cache do backend. */
  staleTime?: number;
  /** Sondagem periódica. Nunca dispara com a aba escondida (ver queryClient). */
  refetchInterval?: number;
  /** `false` segura a busca até a tela ter o que precisa (ex.: mês escolhido nas demos). */
  enabled?: boolean;
  /** Mantém a página anterior na tela enquanto a próxima carrega, em vez de piscar esqueleto. */
  keepPrevious?: boolean;
}

/**
 * Camada fina sobre o TanStack Query, preservando a interface `Resource<T>`
 * que as telas já consomem — os quatro estados que a UI sempre precisa saber
 * renderizar: carregando, sucesso, vazio (decidido por quem chama) e erro.
 *
 * Antes isto era um `useState` + `useEffect` por componente, sem cache e sem
 * retry. Três problemas medidos com isso:
 *
 * - Nenhum cache entre telas: ir pro Ranking, sair e voltar refazia a busca
 *   toda vez, mesmo dois segundos depois.
 * - Nenhum retry: o backend roda em free tier que hiberna, então a primeira
 *   requisição depois de um tempo ocioso podia falhar e a tela ia direto pro
 *   estado de erro, esperando clique manual em "Tentar de novo".
 * - Buscas iguais em componentes diferentes eram requisições separadas.
 *
 * A `queryKey` resolve as três de uma vez: é a identidade do dado. Duas telas
 * pedindo a mesma chave compartilham cache e requisição automaticamente — é
 * por isso que a página de Servidores e a barra do topo agora usam a mesma.
 */
export function useResource<T>(
  key: QueryKey,
  loader: () => Promise<T>,
  options: ResourceOptions = {},
): Resource<T> {
  const query = useQuery({
    queryKey: key,
    queryFn: loader,
    staleTime: options.staleTime,
    refetchInterval: options.refetchInterval,
    enabled: options.enabled,
    // `keepPreviousData` é o helper da v5 pra isso: a página atual fica na
    // tela enquanto a próxima chega. Escrever a função à mão esbarra no
    // `NonFunctionGuard` — sem restringir T, o TypeScript não consegue provar
    // que o próprio T não é uma função.
    ...(options.keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });

  return {
    data: query.data ?? null,
    status: query.isError ? "error" : query.data === undefined ? "loading" : "success",
    error:
      query.error == null
        ? null
        : query.error instanceof Error
          ? query.error
          : new Error(String(query.error)),
    // Rebusca com dado já na tela — quem chama mostra um aviso discreto em vez
    // de trocar tudo por esqueleto.
    refreshing: query.isFetching && query.data !== undefined,
    reload: () => {
      void query.refetch();
    },
  };
}
