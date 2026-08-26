import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { DemoFile, SftpDemoService } from "../services/SftpDemoService.js";
import { paginate } from "../lib/paginate.js";
import { DemoNotFoundError } from "../errors.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  map: z.string().trim().max(64).optional(),
  server: z.string().trim().max(32).optional(),
  q: z.string().trim().max(120).optional(),
});

/** Formato de resposta pro frontend — deliberadamente menor que o modelo
 *  interno `DemoFile`: só expõe o que a listagem de arquivo realmente prova. */
function toDto(demo: DemoFile) {
  return {
    id: demo.id,
    filename: demo.filename,
    map: demo.map,
    date: demo.date,
    time: demo.time,
    recordedAt: demo.recordedAt,
    size: demo.sizeBytes,
    server: demo.server,
  };
}

// O download é o endpoint caro (transfere o arquivo inteiro); limite mais
// apertado que o resto da API pra não virar um jeito barato de saturar o link.
const downloadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createDemosRouter(service: SftpDemoService): Router {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      let demos = await service.listDemos();

      if (query.map) {
        demos = demos.filter((demo) => demo.map === query.map);
      }
      if (query.server) {
        demos = demos.filter((demo) => demo.server === query.server);
      }
      if (query.q) {
        const needle = query.q.toLowerCase();
        demos = demos.filter(
          (demo) =>
            demo.filename.toLowerCase().includes(needle) || demo.map.toLowerCase().includes(needle),
        );
      }

      const page = paginate(demos, query.page, query.pageSize);
      res.json({ ...page, items: page.items.map(toDto) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const demo = await service.getDemo(req.params.id as string);
      if (!demo) throw new DemoNotFoundError(req.params.id as string);
      res.json(toDto(demo));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/download", downloadLimiter, async (req, res, next) => {
    const id = req.params.id as string;
    try {
      const demo = await service.getDemo(id);
      if (!demo) throw new DemoNotFoundError(id);

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${demo.filename}"`);
      res.setHeader("Content-Length", String(demo.sizeBytes));

      await service.streamDemo(id, res);
    } catch (err) {
      // Se o streaming já começou e caiu no meio, os headers já foram
      // enviados — não dá pra responder um JSON de erro em cima disso.
      if (res.headersSent) {
        res.destroy();
        return;
      }
      next(err);
    }
  });

  return router;
}
