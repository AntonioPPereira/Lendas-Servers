import { describe, expect, it } from "vitest";
import { NicknameDirectory } from "../src/live/nicknameDirectory.js";

const ID_A = "76561198009634211";
const ID_B = "76561197960287930";

describe("NicknameDirectory", () => {
  it("undefined pra nickname nunca visto", () => {
    const dir = new NicknameDirectory();
    expect(dir.lookup("ninguem")).toBeUndefined();
  });

  it("associa o SteamID64 registrado ao nickname exato", () => {
    const dir = new NicknameDirectory();
    dir.record("tiro", ID_A);
    expect(dir.lookup("tiro")).toBe(ID_A);
  });

  it("é sensível a maiúsculas/minúsculas — não junta nicknames parecidos", () => {
    const dir = new NicknameDirectory();
    dir.record("Tiro", ID_A);
    expect(dir.lookup("tiro")).toBeUndefined();
  });

  it("ignora nickname vazio ou só espaço", () => {
    const dir = new NicknameDirectory();
    dir.record("   ", ID_A);
    expect(dir.lookup("")).toBeUndefined();
  });

  it("o mesmo SteamID64 com nickname novo atualiza o lookup e limpa o nickname antigo", () => {
    const dir = new NicknameDirectory();
    dir.record("tiro", ID_A);
    dir.record("tiro-novo", ID_A);

    expect(dir.lookup("tiro-novo")).toBe(ID_A);
    expect(dir.lookup("tiro")).toBeUndefined();
  });

  it("dois SteamID64 diferentes usando o mesmo nickname: o mais recente vence (risco aceito)", () => {
    const dir = new NicknameDirectory();
    dir.record("tiro", ID_A);
    dir.record("tiro", ID_B);

    expect(dir.lookup("tiro")).toBe(ID_B);
  });
});
