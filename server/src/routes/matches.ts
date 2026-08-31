import { Router } from "express";
import { z } from "zod";
import type { MatchesService, MatchRow } from "../services/MatchesService.js";
import type { SftpDemoService } from "../services/SftpDemoService.js";
import { NotFoundError } from "../errors.js";
import { paginate } from "../lib/paginate.js";
import { parseDemoId } from "../lib/demoId.js";

/**
 * Partidas e gravações no mesmo lugar.
 *
 * O vínculo é o ID: o plugin `lendas_matches` carimba a partida com
 * `AAAAMMDD-HHMM-mapa` (o horário do início do mapa), e o `lendas_demos`
 * nomeia a gravação exatamente igual. O backend prefixa a porta do servidor
 * nos dois, então uma comparação de string basta — nenhum dos dois lados
 * precisa conhecer o outro.
 *
 * As duas fontes são independentes de propósito, e a lista mostra os três
 * casos que existem de verdade:
 *
 * - partida com gravação — o caso completo;
 * - partida sem gravação — o SourceTV pode ter falhado, ou a demo foi
 *   apagada. O placar continua valendo;
 * - gravação sem partida — as 587 demos anteriores ao plugin, e qualquer
 *   mapa jogado com o plugin fora do ar. Some da lista se a gente filtrasse
 *   só por partida, e são 27 GB de história.
 */

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  map: z.string().max(64).optional(),
  /** Recorte do arquivo de demos: "2026-08". Ausente = mês corrente. */
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

interface DemoResumo {
  id: string;
  filename: string;
  size: number;
}

/**
 * Quantos minutos de folga entre o começo da partida e o começo da gravação
 * ainda contam como a mesma coisa.
 *
 * O casamento por ID exato NÃO basta, e isso apareceu na primeira partida
 * real: o plugin gravou `20260831-1738-de_dust2` e a demo se chamava
 * `20260831-1737-de_dust2`. Um minuto de diferença, e o placar não
 * encontrava a gravação.
 *
 * É estrutural, não acidente: o `lendas_demos` espera ~12s pelo bot do
 * SourceTV antes de carimbar o nome, enquanto o `lendas_matches` carimba no
 * `OnMapStart`. Sempre que esses segundos cruzarem a virada do minuto, os
 * dois nomes divergem.
 *
 * 5 minutos é folga larga o bastante pro atraso do SourceTV e curta o
 * bastante pra não colar a partida na gravação do mapa ANTERIOR — o mapa
 * mais curto que existe aqui dura bem mais que isso.
 */
const TOLERANCIA_MINUTOS = 5;

/** Minutos desde a época, a partir do horário LOCAL embutido no id. */
function minutosDoId(id: string): number | null {
  const parsed = parseDemoId(id);
  if (!parsed) return null;
  const t = new Date(parsed.recordedAtLocal).getTime();
  return Number.isNaN(t) ? null : Math.round(t / 60_000);
}

/**
 * A gravação desta partida: id igual primeiro, e só então a mais próxima no
 * tempo, no MESMO servidor e MESMO mapa.
 *
 * Compara pelo horário local embutido nos dois ids, nunca pelo `startedAt`
 * do DTO: aquele já virou UTC, enquanto o nome do arquivo de demo é hora
 * local sem fuso. Comparar os dois daria três horas de diferença e nenhum
 * casamento jamais.
 */
function acharDemo<T extends { id: string; map: string }>(
  matchId: string,
  matchMap: string,
  demoPorId: Map<string, T>,
  demos: readonly T[],
): T | undefined {
  const exata = demoPorId.get(matchId);
  if (exata) return exata;

  const alvo = minutosDoId(matchId);
  const porta = parseDemoId(matchId)?.port;
  if (alvo === null || !porta) return undefined;

  let melhor: { demo: T; distancia: number } | undefined;
  for (const demo of demos) {
    if (demo.map !== matchMap) continue;
    const info = parseDemoId(demo.id);
    if (!info || info.port !== porta) continue;
    const quando = minutosDoId(demo.id);
    if (quando === null) continue;
    const distancia = Math.abs(quando - alvo);
    if (distancia > TOLERANCIA_MINUTOS) continue;
    if (!melhor || distancia < melhor.distancia) melhor = { demo, distancia };
  }
  return melhor?.demo;
}

function toMatchDto(match: MatchRow, demo: DemoResumo | undefined) {
  return {
    id: match.id,
    kind: "match" as const,
    map: match.map,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    ctScore: match.ctScore,
    tScore: match.tScore,
    roundCount: match.rounds.length,
    playerCount: match.players.length,
    demo: demo ?? null,
  };
}

/**
 * Gravação órfã entra na mesma lista, declarando o que NÃO tem. Sem placar
 * inventado, sem zero fingindo empate — o frontend precisa saber que aqui
 * só existe o arquivo.
 */
function toDemoOnlyDto(demo: { id: string; filename: string; map: string; recordedAt: string; sizeBytes: number }) {
  return {
    id: demo.id,
    kind: "demo" as const,
    map: demo.map,
    startedAt: demo.recordedAt,
    endedAt: null,
    ctScore: null,
    tScore: null,
    roundCount: null,
    playerCount: null,
    demo: { id: demo.id, filename: demo.filename, size: demo.sizeBytes },
  };
}

export function createMatchesRouter(matches: MatchesService, demos: SftpDemoService): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);

      /**
       * Qual mês mostrar: o mais recente que TEM gravação, não o mês do
       * calendário. Virou setembro e ninguém jogou ainda? O acervo de
       * agosto continua sendo o que existe — assumir o mês corrente
       * apresentaria um arquivo vazio como se fosse a verdade.
       */


      /**
       * As duas fontes falham de jeitos DIFERENTES, e a página precisa
       * distinguir:
       *
       * - partidas indisponíveis é situação normal — o plugin pode nem
       *   estar instalado, e aí de fato não existe partida nenhuma;
       * - gravações indisponíveis é ERRO. São a maior parte do acervo, e
       *   engolir essa falha faz a tela dizer "nada no arquivo" quando o
       *   certo é "não consegui ler". Já aconteceu, e é pior que mostrar
       *   erro: afirma como fato algo que ninguém verificou.
       */
      /**
       * UMA conexão SFTP POR VEZ, nunca em paralelo.
       *
       * Isto era um `Promise.all` e parecia uma otimização óbvia. Na
       * prática derrubou a rota em produção: `/api/matches` respondia
       * `sftp_unavailable` enquanto `/api/demos` — mesma fonte, mas uma
       * conexão só — funcionava normalmente. O host recusa conexões
       * simultâneas da mesma origem.
       *
       * Serializar custa alguns segundos A MAIS por busca, mas quem lê não
       * sente: o `getStaleWhileRevalidate` devolve o valor anterior na hora
       * e esta função roda em segundo plano. Rápido e quebrado é pior que
       * lento e correto.
       */
      const linhas = await matches.getMatches().catch(() => [] as MatchRow[]);
      const acervo = await demos.listArchive(query.period);
      const periodos = acervo.periods;
      const periodo = acervo.period || mesCorrente();
      const arquivos = acervo.demos;

      const demoPorId = new Map(arquivos.map((d) => [d.id, d]));
      const usadas = new Set<string>();

      const itens: Array<ReturnType<typeof toMatchDto> | ReturnType<typeof toDemoOnlyDto>> = [];
      // Partida entra no mesmo recorte de mês das gravações: misturar agosto
      // com setembro na mesma tela faria a paginação mentir sobre o total.
      for (const linha of linhas.filter((l) => l.startedAt.startsWith(periodo))) {
        const demo = acharDemo(linha.id, linha.map, demoPorId, arquivos);
        if (demo) usadas.add(demo.id);
        itens.push(
          toMatchDto(
            linha,
            demo ? { id: demo.id, filename: demo.filename, size: demo.sizeBytes } : undefined,
          ),
        );
      }
      for (const demo of arquivos) {
        if (!usadas.has(demo.id)) itens.push(toDemoOnlyDto(demo));
      }

      let visiveis = itens;
      if (query.map && query.map !== "all") {
        visiveis = visiveis.filter((item) => item.map === query.map);
      }
      visiveis.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

      res.json({
        ...paginate(visiveis, query.page, query.pageSize),
        /** Quantas da página inteira têm placar — o painel usa pra explicar a mistura. */
        withScore: visiveis.filter((i) => i.kind === "match").length,
        /** Qual mês está sendo mostrado e quais existem — o painel monta o seletor com isso. */
        period: periodo,
        periods: periodos,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Mapas que de fato aparecem no acervo — nada de lista fixa inventada. */
  router.get("/maps", async (_req, res, next) => {
    try {
      // Em série pelo mesmo motivo do handler acima: o host recusa
      // conexões SFTP simultâneas.
      const linhas = await matches.getMatches().catch(() => [] as MatchRow[]);
      const acervo = await demos
        .listArchive()
        .catch(() => ({ periods: [] as string[], period: "", demos: [] }));
      const mapas = new Set<string>();
      linhas.forEach((l) => mapas.add(l.map));
      acervo.demos.forEach((d) => mapas.add(d.map));
      res.json({ items: [...mapas].sort((a, b) => a.localeCompare(b)) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = req.params.id as string;
      const linhas = await matches.getMatches();
      const partida = linhas.find((m) => m.id === id);
      if (!partida) throw new NotFoundError(`Partida não encontrada: "${id}"`);

      /**
       * Aqui a busca é pelo acervo do mês, não por `getDemo(id)`: o id da
       * gravação pode diferir do da partida em alguns minutos (ver
       * `TOLERANCIA_MINUTOS`), e uma busca por id exato devolveria nada
       * justamente nos casos que a lista já sabe casar.
       */
      const mes = partida.startedAt.slice(0, 7);
      const acervo = await demos.listArchive(mes).catch(() => ({ periods: [], period: "", demos: [] }));
      const demo = acharDemo(
        partida.id,
        partida.map,
        new Map(acervo.demos.map((d) => [d.id, d])),
        acervo.demos,
      );

      res.json({
        ...toMatchDto(
          partida,
          demo ? { id: demo.id, filename: demo.filename, size: demo.sizeBytes } : undefined,
        ),
        rounds: partida.rounds,
        // Placar já ordenado: mais abates primeiro, empate desempatado por
        // menos mortes e depois pelo nick, pra a ordem não dançar entre
        // dois carregamentos com os mesmos números.
        players: [...partida.players].sort(
          (a, b) =>
            b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name, "pt-BR"),
        ),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/** Último recurso: nenhum período conhecido (SFTP mudo). */
function mesCorrente(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}
