import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Comprimentos diferentes já vazam informação por timing se comparados direto — checa primeiro,
  // fora do timingSafeEqual (que exige buffers do mesmo tamanho pra não lançar).
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Autentica `POST /api/live/events`: token fixo no header
 * `Authorization: Bearer <token>`, comparado em tempo constante.
 *
 * Token vazio na config = a rota inteira responde "não configurado" — nunca
 * aceita eventos sem um token real definido (fail closed, não fail open,
 * ao contrário do `lendas_steamfilter`: lá, deixar o jogador entrar é a
 * escolha mais segura pro MIX; aqui, aceitar telemetria sem autenticação
 * não tem justificativa equivalente).
 */
export function createLiveAuth(expectedToken: string): RequestHandler {
  return (req, res, next) => {
    if (!expectedToken) {
      res.status(503).json({
        error: "live_ingest_not_configured",
        message: "Ingestão ao vivo não está configurada neste backend.",
      });
      return;
    }

    const header = req.get("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token || !safeEqual(token.trim(), expectedToken)) {
      res.status(401).json({ error: "unauthorized", message: "Token inválido." });
      return;
    }

    next();
  };
}
