/**
 * O HLstatsX não expõe um "ID de servidor" amigável — só o nome de exibição
 * e o `server_id` interno (usado só pros gráficos, instável o bastante pra
 * não virar chave pública). Os nomes reais seguem o padrão "... SERVIDOR N",
 * então derivamos um slug estável disso; se o padrão não bater (nome mudou,
 * servidor novo sem essa convenção), caímos num slug a partir de host:porta
 * — nunca quebramos, nunca inventamos um número.
 */
export function deriveServerId(name: string, host: string, port: number): string {
  const match = /SERVIDOR\s+(\d+)/i.exec(name);
  if (match) return `lendas-${match[1]!.padStart(2, "0")}`;
  return `${host.replace(/\./g, "-")}-${port}`;
}
