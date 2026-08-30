import { describe, expect, it } from "vitest";
import { resolveAvatarsByNickname } from "../src/lib/avatarResolver.js";
import { NicknameDirectory } from "../src/live/nicknameDirectory.js";
import { SteamAvatarService } from "../src/services/SteamAvatarService.js";
import { PlayerDirectoryService } from "../src/services/PlayerDirectoryService.js";
import { BASE, SERVER_DIRS, makeFakeSourceBansClient } from "./helpers/fakeSourceBansClient.js";

const CONN = { host: "x", port: 22, username: "u", password: "p", base: BASE };

/** Índice como o plugin `lendas_players` grava. */
function indice(players: Record<string, string>) {
  return JSON.stringify({ generatedAt: 1, players });
}

function directoryCom(players: Record<string, string>) {
  // Reusa o SFTP falso dos bans, mas servindo o arquivo do índice.
  const files = { [SERVER_DIRS[0]!]: indice(players) };
  return new PlayerDirectoryService(CONN, 0, () => {
    const base = makeFakeSourceBansClient().client;
    return {
      ...base,
      async get(remotePath: string) {
        for (const dir of Object.keys(files)) {
          if (remotePath === `${BASE}/${dir}/cstrike/addons/sourcemod/data/lendas_players.json`) {
            return Buffer.from(files[dir]!, "utf-8");
          }
        }
        throw new Error("no such file");
      },
    };
  });
}

/** Steam falsa: devolve avatar só pros IDs que existem no mapa. */
function avatarsCom(disponiveis: Record<string, string>) {
  return new SteamAvatarService("chave-de-teste", 60_000, async (url: string) => ({
    ok: true,
    status: 200,
    async json() {
      const ids = new URL(url).searchParams.get("steamids")!.split(",");
      return {
        response: {
          players: ids
            .filter((id) => disponiveis[id])
            .map((id) => ({ steamid: id, avatarfull: disponiveis[id] })),
        },
      };
    },
  }));
}

describe("resolveAvatarsByNickname", () => {
  it("resolve pelo índice histórico do servidor de jogo", async () => {
    const mapa = await resolveAvatarsByNickname(
      ["kRYSTAL"],
      new NicknameDirectory(),
      directoryCom({ kRYSTAL: "76561198147547050" }),
      avatarsCom({ "76561198147547050": "https://steam/kRYSTAL.jpg" }),
    );
    expect(mapa.get("kRYSTAL")).toBe("https://steam/kRYSTAL.jpg");
  });

  it("quem está jogando agora tem prioridade sobre o índice histórico", async () => {
    // Mesmo nick, contas diferentes: vale o vínculo mais recente.
    const live = new NicknameDirectory();
    live.record("Ninja", "76561198000000002");

    const mapa = await resolveAvatarsByNickname(
      ["Ninja"],
      live,
      directoryCom({ Ninja: "76561198000000001" }),
      avatarsCom({
        "76561198000000001": "https://steam/antigo.jpg",
        "76561198000000002": "https://steam/atual.jpg",
      }),
    );
    expect(mapa.get("Ninja")).toBe("https://steam/atual.jpg");
  });

  it("nick desconhecido simplesmente não aparece — nunca uma foto de outra pessoa", async () => {
    const mapa = await resolveAvatarsByNickname(
      ["NuncaJogou"],
      new NicknameDirectory(),
      directoryCom({ Outro: "76561198147547050" }),
      avatarsCom({ "76561198147547050": "https://steam/outro.jpg" }),
    );
    expect(mapa.has("NuncaJogou")).toBe(false);
  });

  it("conta sem avatar público não entra no resultado", async () => {
    const mapa = await resolveAvatarsByNickname(
      ["Sem"],
      new NicknameDirectory(),
      directoryCom({ Sem: "76561198000000009" }),
      avatarsCom({}), // a Steam não devolve esse id
    );
    expect(mapa.size).toBe(0);
  });

  it("índice fora do ar não derruba a página, só não resolve nada", async () => {
    const quebrado = new PlayerDirectoryService(CONN, 0, () => {
      throw new Error("sftp fora do ar");
    });
    const mapa = await resolveAvatarsByNickname(
      ["Alguem"],
      new NicknameDirectory(),
      quebrado,
      avatarsCom({}),
    );
    expect(mapa.size).toBe(0);
  });

  it("ignora id malformado no índice em vez de consultar a Steam com lixo", async () => {
    const mapa = await resolveAvatarsByNickname(
      ["Torto"],
      new NicknameDirectory(),
      directoryCom({ Torto: "123" }), // SteamID64 tem 17 dígitos
      avatarsCom({ "123": "https://steam/naodeveria.jpg" }),
    );
    expect(mapa.size).toBe(0);
  });

  it("uma página inteira custa uma única consulta à Steam", async () => {
    let chamadas = 0;
    const avatars = new SteamAvatarService("k", 60_000, async (url: string) => {
      chamadas++;
      const ids = new URL(url).searchParams.get("steamids")!.split(",");
      return {
        ok: true,
        status: 200,
        async json() {
          return { response: { players: ids.map((id) => ({ steamid: id, avatarfull: `u/${id}` })) } };
        },
      };
    });

    const players: Record<string, string> = {};
    const nicks: string[] = [];
    for (let i = 0; i < 40; i++) {
      const nick = `p${i}`;
      players[nick] = String(76561198000000000n + BigInt(i));
      nicks.push(nick);
    }

    const mapa = await resolveAvatarsByNickname(
      nicks,
      new NicknameDirectory(),
      directoryCom(players),
      avatars,
    );
    expect(mapa.size).toBe(40);
    expect(chamadas).toBe(1);
  });
});
