/**
 * Erros tipados que cruzam a fronteira serviço → rota. A camada HTTP decide o
 * status a partir do TIPO do erro, nunca inspecionando a mensagem — assim a
 * mensagem pode ser livre (inclusive vinda de uma lib externa) sem virar
 * contrato acidental.
 */

/** ID de demo mal formado ou fora do padrão esperado — nunca chega a tocar o SFTP. */
export class InvalidDemoIdError extends Error {
  constructor(id: string) {
    super(`ID de demo inválido: "${id}"`);
    this.name = "InvalidDemoIdError";
  }
}

/** ID bem formado, mas o arquivo não existe no servidor. */
export class DemoNotFoundError extends Error {
  constructor(id: string) {
    super(`Demo não encontrada: "${id}"`);
    this.name = "DemoNotFoundError";
  }
}

/** Falha de autenticação SFTP — credenciais erradas. Nunca expor detalhe ao cliente. */
export class SftpAuthError extends Error {
  constructor(cause: unknown) {
    super("Falha de autenticação no servidor SFTP");
    this.name = "SftpAuthError";
    this.cause = cause;
  }
}

/** SFTP inalcançável: recusado, timeout, DNS, host fora do ar. */
export class SftpUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Servidor SFTP indisponível no momento");
    this.name = "SftpUnavailableError";
    this.cause = cause;
  }
}

/** HLstatsX não respondeu: rede, timeout, DNS, ou HTTP não-2xx. */
export class HLStatsUnavailableError extends Error {
  constructor(cause: unknown) {
    super("HLstatsX está temporariamente indisponível");
    this.name = "HLStatsUnavailableError";
    this.cause = cause;
  }
}

/**
 * HLstatsX respondeu, mas o HTML não tinha a estrutura esperada — o site
 * mudou o template, ou a página específica é conhecida por travar no meio
 * do carregamento (ex.: `mode=playerinfo` trunca pra qualquer jogador com
 * avatar real nesta instalação; só o bot SourceTV renderiza inteiro).
 */
export class HLStatsParseError extends Error {
  constructor(detail: string) {
    super(`HLstatsX: resposta em formato inesperado (${detail})`);
    this.name = "HLStatsParseError";
  }
}

/** 404 genérico — recurso bem identificado, mas que não existe na fonte. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Classifica um erro cru do ssh2-sftp-client num dos tipos acima. */
export function classifySftpError(cause: unknown): SftpAuthError | SftpUnavailableError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const code = (cause as { code?: string } | undefined)?.code;

  const authSignals = ["all configured authentication methods failed", "authentication failure"];
  if (authSignals.some((signal) => message.toLowerCase().includes(signal))) {
    return new SftpAuthError(cause);
  }

  const unreachableCodes = new Set(["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENOTFOUND", "ECONNRESET"]);
  if (code && unreachableCodes.has(code)) {
    return new SftpUnavailableError(cause);
  }

  // Timeout genérico da própria lib, sem .code padronizado.
  if (message.toLowerCase().includes("timeout") || message.toLowerCase().includes("timed out")) {
    return new SftpUnavailableError(cause);
  }

  return new SftpUnavailableError(cause);
}
