import { Router } from "express";
import { z } from "zod";
import type { MatchesService, MatchRow } from "../services/MatchesService.js";
import type { SftpDemoService } from "../services/SftpDemoService.js";
import { NotFoundError } from "../errors.js";
import { paginate } from "../lib/paginate.js";

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

      // Nenhuma das duas fontes pode derrubar a página: se o plugin de
      // partidas ainda não subiu, a lista continua mostrando as gravações;
      // se o SFTP de demos falhar, as partidas continuam aparecendo.
      const [linhas, arquivos] = await Promise.all([
        matches.getMatches().catch(() => [] as MatchRow[]),
        demos.listDemos(query.period ?? mesCorrente()).catch(() => []),
      ]);

      const demoPorId = new Map(arquivos.map((d) => [d.id, d]));
      const usadas = new Set<string>();

      const itens: Array<ReturnType<typeof toMatchDto> | ReturnType<typeof toDemoOnlyDto>> = [];
      for (const linha of linhas) {
        const demo = demoPorId.get(linha.id);
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
      });
    } catch (err) {
      next(err);
    }
  });

  /** Mapas que de fato aparecem no acervo — nada de lista fixa inventada. */
  router.get("/maps", async (_req, res, next) => {
    try {
      const linhas = await matches.getMatches().catch(() => [] as MatchRow[]);
      const arquivos = await demos.listDemos(mesCorrente()).catch(() => []);
      const mapas = new Set<string>();
      linhas.forEach((l) => mapas.add(l.map));
      arquivos.forEach((d) => mapas.add(d.map));
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

      const demo = await demos.getDemo(id).catch(() => null);

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

function mesCorrente(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}
