import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import {
  DemoNotFoundError,
  HLStatsParseError,
  HLStatsUnavailableError,
  InvalidDemoIdError,
  NotFoundError,
  SftpAuthError,
  SftpUnavailableError,
} from "../errors.js";

/**
 * Único lugar que decide status HTTP + corpo de erro. Decide pelo TIPO do
 * erro, nunca pela mensagem — e nunca ecoa `cause` pro cliente (pode conter
 * detalhe interno do ssh2, caminho, etc.). Detalhe completo só vai pro log.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof InvalidDemoIdError) {
    res.status(400).json({ error: "invalid_id", message: "ID de demo inválido." });
    return;
  }

  if (err instanceof DemoNotFoundError) {
    res.status(404).json({ error: "not_found", message: "Demo não encontrada." });
    return;
  }

  if (err instanceof NotFoundError) {
    res.status(404).json({ error: "not_found", message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "invalid_query",
      message: err.issues.map((issue) => issue.message).join("; "),
    });
    return;
  }

  if (err instanceof SftpAuthError) {
    console.error("[sftp] falha de autenticação:", err.cause ?? err);
    res.status(502).json({
      error: "sftp_auth_failed",
      // Mesma conexão SFTP serve demos e o feed de atividade — mensagem genérica de propósito.
      message: "O backend não conseguiu autenticar no servidor de arquivos (SFTP).",
    });
    return;
  }

  if (err instanceof SftpUnavailableError) {
    console.error("[sftp] indisponível:", err.cause ?? err);
    res.status(503).json({
      error: "sftp_unavailable",
      message: "O servidor de arquivos (SFTP) está temporariamente indisponível. Tente novamente em instantes.",
    });
    return;
  }

  if (err instanceof HLStatsUnavailableError) {
    console.error("[hlstats] indisponível:", err.cause ?? err);
    res.status(503).json({
      error: "upstream_unavailable",
      message: "O HLstatsX está temporariamente indisponível. Tente novamente em instantes.",
    });
    return;
  }

  if (err instanceof HLStatsParseError) {
    console.error("[hlstats] resposta inesperada:", err.message);
    res.status(502).json({
      error: "invalid_response",
      message: "O HLstatsX respondeu num formato inesperado.",
    });
    return;
  }

  console.error("[unhandled]", err);
  res.status(500).json({ error: "internal_error", message: "Erro interno." });
};
