/**
 * Cache TTL de uma entrada, com deduplicação de chamadas concorrentes: se
 * duas requisições chegam enquanto o cache está expirado, só uma dispara o
 * refresh real (SFTP) — a outra espera a mesma promise. Evita "stampede" de
 * conexões simultâneas quando várias abas do painel atualizam ao mesmo tempo.
 */
export class TtlCache<T> {
  private value: T | null = null;
  private expiresAt = 0;
  private pending: Promise<T> | null = null;

  constructor(private readonly ttlMs: number) {}

  async get(refresh: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (this.value !== null && now < this.expiresAt) {
      return this.value;
    }
    if (this.pending) {
      return this.pending;
    }

    this.pending = refresh()
      .then((result) => {
        this.value = result;
        this.expiresAt = Date.now() + this.ttlMs;
        return result;
      })
      .finally(() => {
        this.pending = null;
      });

    return this.pending;
  }

  /**
   * Valor vencido AGORA, atualização por trás.
   *
   * A diferença pro `get` é quem espera: no `get`, o primeiro visitante
   * depois do vencimento paga a ida ao SFTP inteira — e do Render isso são
   * dezenas de segundos. Aqui ele recebe na hora o último valor bom e a
   * busca acontece em segundo plano, então só quem chega antes de existir
   * QUALQUER valor (logo após um restart) espera de fato.
   *
   * Vale porque estes dados mudam quando um mapa termina, não a cada
   * segundo: alguns minutos de atraso são invisíveis, dezenas de segundos
   * de espera não são.
   *
   * `onError` recebe a falha da atualização de fundo. Sem ele, uma rejeição
   * sem dono derrubaria o processo — o valor velho continua servindo, mas
   * o erro precisa aparecer em algum lugar.
   */
  async getStaleWhileRevalidate(
    refresh: () => Promise<T>,
    onError?: (cause: unknown) => void,
  ): Promise<T> {
    const fresco = this.peekFresh();
    if (fresco !== null) return fresco;

    const velho = this.value;
    if (velho === null) return this.get(refresh);

    if (!this.pending) {
      // `get` cuida da deduplicação e de gravar o resultado; aqui só
      // garantimos que a rejeição tenha dono.
      void this.get(refresh).catch((cause) => onError?.(cause));
    }
    return velho;
  }

  /** Último valor bom conhecido, mesmo vencido — usado como fallback quando a fonte está fora do ar. */
  peekStale(): T | null {
    return this.value;
  }

  /** Valor ainda DENTRO do prazo, ou `null`. Serve pra decidir se vale a pena abrir I/O. */
  peekFresh(): T | null {
    return this.value !== null && Date.now() < this.expiresAt ? this.value : null;
  }

  /**
   * Guarda um valor obtido POR FORA do `get` — quando uma chamada já trouxe
   * de carona o que este cache guardaria. Evita que a próxima leitura abra
   * uma conexão pra buscar algo que já está em memória.
   */
  seed(value: T): void {
    this.value = value;
    this.expiresAt = Date.now() + this.ttlMs;
  }

  invalidate(): void {
    this.value = null;
    this.expiresAt = 0;
  }
}
