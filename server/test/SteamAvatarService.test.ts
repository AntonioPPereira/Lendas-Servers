import { describe, expect, it, vi } from "vitest";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";

const ID_A = "76561198009634211";
const ID_B = "76561197960287930";

function fakeSteamResponse(players: Array<{ steamid: string; avatarfull?: string }>) {
  return { ok: true, status: 200, json: async () => ({ response: { players } }) };
}

describe("SteamAvatarService.resolve", () => {
  it("devolve mapa vazio sem chamar a rede quando não há API key configurada", async () => {
    const fetchImpl = vi.fn();
    const service = new SteamAvatarService("", 3_600_000, fetchImpl as never);
    const result = await service.resolve([ID_A]);
    expect(result.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("devolve mapa vazio sem chamar a rede quando a lista está vazia", async () => {
    const fetchImpl = vi.fn();
    const service = new SteamAvatarService("KEY", 3_600_000, fetchImpl as never);
    await service.resolve([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolve o avatar real de um jogador", async () => {
    const fetchImpl = vi.fn(async () => fakeSteamResponse([{ steamid: ID_A, avatarfull: "https://avatars.example/a.jpg" }]));
    const service = new SteamAvatarService("KEY", 3_600_000, fetchImpl as never);

    const result = await service.resolve([ID_A]);
    expect(result.get(ID_A)).toBe("https://avatars.example/a.jpg");
  });

  it("ignora jogador sem avatarfull na resposta (perfil sem avatar público)", async () => {
    const fetchImpl = vi.fn(async () => fakeSteamResponse([{ steamid: ID_A }]));
    const service = new SteamAvatarService("KEY", 3_600_000, fetchImpl as never);

    const result = await service.resolve([ID_A]);
    expect(result.has(ID_A)).toBe(false);
  });

  it("usa cache dentro do TTL: uma segunda chamada pro mesmo ID não bate na rede de novo", async () => {
    const fetchImpl = vi.fn(async () => fakeSteamResponse([{ steamid: ID_A, avatarfull: "https://avatars.example/a.jpg" }]));
    const service = new SteamAvatarService("KEY", 3_600_000, fetchImpl as never);

    await service.resolve([ID_A]);
    await service.resolve([ID_A]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("busca só os IDs que ainda não estão em cache", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeSteamResponse([{ steamid: ID_A, avatarfull: "https://avatars.example/a.jpg" }]))
      .mockResolvedValueOnce(fakeSteamResponse([{ steamid: ID_B, avatarfull: "https://avatars.example/b.jpg" }]));
    const service = new SteamAvatarService("KEY", 3_600_000, fetchImpl as never);

    await service.resolve([ID_A]);
    const result = await service.resolve([ID_A, ID_B]);

    expect(result.get(ID_A)).toBe("https://avatars.example/a.jpg");
    expect(result.get(ID_B)).toBe("https://avatars.example/b.jpg");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]![0]).toContain(ID_B);
    expect(fetchImpl.mock.calls[1]![0]).not.toContain(ID_A);
  });

  it("nunca lança em falha de rede — devolve o que conseguiu (nada, neste caso)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const service = new SteamAvatarService("KEY", 3_600_000, fetchImpl as never);

    await expect(service.resolve([ID_A])).resolves.toEqual(new Map());
  });

  it("nunca lança em HTTP não-2xx — devolve o que conseguiu", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    const service = new SteamAvatarService("KEY", 3_600_000, fetchImpl as never);

    await expect(service.resolve([ID_A])).resolves.toEqual(new Map());
  });
});
