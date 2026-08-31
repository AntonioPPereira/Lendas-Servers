import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "../src/lib/cache.js";

/** Deixa o event loop rodar as promises pendentes sem avançar o relógio. */
const tick = () => new Promise((r) => setImmediate(r));

describe("TtlCache.getStaleWhileRevalidate", () => {
  it("primeira chamada espera de verdade: não há valor velho pra servir", async () => {
    const cache = new TtlCache<string>(1_000);
    const buscar = vi.fn().mockResolvedValue("a");

    expect(await cache.getStaleWhileRevalidate(buscar)).toBe("a");
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("dentro do prazo, devolve o valor sem tocar na fonte", async () => {
    const cache = new TtlCache<string>(1_000);
    const buscar = vi.fn().mockResolvedValue("a");

    await cache.getStaleWhileRevalidate(buscar);
    await cache.getStaleWhileRevalidate(buscar);

    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("vencido: devolve o velho NA HORA e atualiza por trás", async () => {
    // Só o relógio é falso: `setImmediate` precisa continuar real, senão a
    // atualização de fundo nunca roda e o teste trava esperando por ela.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const cache = new TtlCache<string>(1_000);
      let atual = "velho";
      const buscar = vi.fn(async () => atual);

      await cache.getStaleWhileRevalidate(buscar);
      vi.setSystemTime(Date.now() + 2_000);
      atual = "novo";

      // Este é o ponto: ninguém espera o SFTP. Recebe o valor anterior.
      expect(await cache.getStaleWhileRevalidate(buscar)).toBe("velho");

      // A busca foi disparada mesmo assim, e a próxima leitura já vê o novo.
      await tick();
      expect(buscar).toHaveBeenCalledTimes(2);
      expect(await cache.getStaleWhileRevalidate(buscar)).toBe("novo");
    } finally {
      vi.useRealTimers();
    }
  });

  it("várias chamadas com o cache vencido disparam UMA busca só", async () => {
    // Só o relógio é falso: `setImmediate` precisa continuar real, senão a
    // atualização de fundo nunca roda e o teste trava esperando por ela.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const cache = new TtlCache<string>(1_000);
      const buscar = vi.fn().mockResolvedValue("a");

      await cache.getStaleWhileRevalidate(buscar);
      vi.setSystemTime(Date.now() + 2_000);

      await Promise.all([
        cache.getStaleWhileRevalidate(buscar),
        cache.getStaleWhileRevalidate(buscar),
        cache.getStaleWhileRevalidate(buscar),
      ]);
      await tick();

      // 1 da carga inicial + 1 da atualização de fundo. Sem isso, três abas
      // abertas ao mesmo tempo abririam três conexões SFTP.
      expect(buscar).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falha na atualização de fundo não vaza rejeição nem derruba a leitura", async () => {
    // Só o relógio é falso: `setImmediate` precisa continuar real, senão a
    // atualização de fundo nunca roda e o teste trava esperando por ela.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const cache = new TtlCache<string>(1_000);
      const buscar = vi
        .fn()
        .mockResolvedValueOnce("velho")
        .mockRejectedValue(new Error("SFTP fora do ar"));
      const onError = vi.fn();

      await cache.getStaleWhileRevalidate(buscar, onError);
      vi.setSystemTime(Date.now() + 2_000);

      // Fonte caiu, mas quem está lendo continua recebendo o último valor bom.
      expect(await cache.getStaleWhileRevalidate(buscar, onError)).toBe("velho");
      await tick();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(await cache.getStaleWhileRevalidate(buscar, onError)).toBe("velho");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sem valor nenhum, a falha SOBE: a tela precisa dizer que falhou", async () => {
    const cache = new TtlCache<string>(1_000);
    const buscar = vi.fn().mockRejectedValue(new Error("SFTP fora do ar"));

    await expect(cache.getStaleWhileRevalidate(buscar)).rejects.toThrow("SFTP fora do ar");
  });
});
