import type { Ban } from "@/data/types";

/**
 * O que resta de uma punição, em texto.
 *
 * Mora em `lib/` e não em `data/bans.ts` por dois motivos. O primeiro é de
 * empacotamento: `data/bans.ts` é o gerador de banimentos falsos, e a tela
 * de Banimentos importava esta função de lá — arrastando a lista inteira de
 * nomes inventados pro pacote de quem abre a página.
 *
 * O segundo era um bug: a versão antiga media o tempo a partir de `NOW`,
 * uma data FIXA do arquivo de mock. O contador não andava; mostrava o que
 * faltava no instante em que o mock foi semeado, não agora.
 *
 * E ignorava o estado. Um ban revogado por admin continua com data de
 * expiração no futuro, então a tela dizia "EXPIRADO" no selo e
 * "20h restantes" logo abaixo, no mesmo registro. Duas afirmações opostas
 * sobre a mesma punição.
 */
export function banTimeLeft(ban: Ban, agora: Date = new Date()): string {
  /**
   * Fora de vigor: nada "resta". Dá pra separar os dois jeitos de chegar
   * aqui porque a única forma de estar expirado com a data de expiração
   * ainda no futuro é alguém ter revogado antes do prazo — o backend só
   * marca "expired" quando o prazo passou OU quando há registro de remoção
   * (ver `deriveBanState` em server/src/lib/sourceBans.ts).
   */
  if (ban.state === "expired") {
    const prazoNoFuturo =
      ban.expiresAt !== null && new Date(ban.expiresAt).getTime() > agora.getTime();
    return prazoNoFuturo ? "Revogada antes do prazo" : "Prazo cumprido";
  }

  if (ban.state === "permanent" || ban.expiresAt === null) return "Permanente";

  const ms = new Date(ban.expiresAt).getTime() - agora.getTime();
  // Ainda marcada como ativa mas com o prazo vencido: o estado vem de um
  // instantâneo do servidor, que pode ter alguns minutos de atraso.
  if (ms <= 0) return "Vencendo agora";

  const horas = Math.floor(ms / 3_600_000);
  if (horas >= 48) return `${Math.floor(horas / 24)}d restantes`;
  if (horas >= 1) return `${horas}h restantes`;
  return `${Math.max(1, Math.floor(ms / 60_000))}min restantes`;
}
