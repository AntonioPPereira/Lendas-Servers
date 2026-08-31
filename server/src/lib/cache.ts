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
