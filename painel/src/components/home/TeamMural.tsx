import { ExternalLink } from "lucide-react";

/**
 * Mural de quem toca a rede.
 *
 * A ORDEM foi pedida explicitamente — desenvolvedor, dono, admin master — e
 * é o que dá sentido ao bloco. Não reordenar por alfabeto ou "importância".
 *
 * Os SteamID64 vieram do índice real do servidor (`lendas_players`), não de
 * digitação: são as mesmas contas que jogam ali, então o link do perfil
 * sempre bate com quem entra no servidor. Kai e Artriom são a mesma conta.
 *
 * As fotos são arquivos locais, não avatar da Steam: são retratos escolhidos
 * a dedo, e um avatar mudaria sozinho no dia em que a pessoa trocasse o
 * dela. Duas delas são 184×184, então o quadro é propositalmente pequeno —
 * ampliar mais borraria.
 */
interface Membro {
  role: string;
  name: string;
  steamId64: string;
  photo: string;
}

const TIME: readonly Membro[] = [
  { role: "Desenvolvedor", name: "Kai", steamId64: "76561198008899939", photo: "/team/kai.jpg" },
  { role: "Dono", name: "Kangaçeiroz", steamId64: "76561199043273451", photo: "/team/kanga.jpg" },
  { role: "Admin Master", name: "EzE", steamId64: "76561197970780396", photo: "/team/eze.jpg" },
];

export function TeamMural() {
  return (
    <section className="mural relative overflow-hidden rounded-md border border-line-soft bg-panel">
      {/* Faixas finas em cima e embaixo: o enquadramento de tela de cinema. */}
      <span aria-hidden className="mural-bar mural-bar-top" />
      <span aria-hidden className="mural-bar mural-bar-bottom" />
      {/* Luz que atravessa devagar, uma vez a cada ciclo longo. */}
      <span aria-hidden className="mural-sweep" />

      <div className="relative px-5 py-6 sm:px-7 sm:py-8">
        <header className="mb-6 flex items-baseline gap-3">
          <h2 className="t-display text-[15px] tracking-[0.14em] text-ink">A CASA</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
          <p className="t-eyebrow text-[9px] text-ink-4">Lendas Network</p>
        </header>

        {/* Lado a lado, como tríptico: as divisórias verticais fecham o
            espaço que sobrava à direita de cada nome e amarram os três num
            bloco só. Só empilha no celular, onde três colunas ficariam
            ilegíveis — e aí as divisórias somem. */}
        <ul className="grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line-soft">
          {TIME.map((m, i) => (
            <li
              key={m.steamId64}
              className="mural-item sm:px-5"
              style={{ animationDelay: i * 140 + "ms" }}
            >
              <a
                href={"https://steamcommunity.com/profiles/" + m.steamId64}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center gap-4 outline-none sm:justify-center"
              >
                <span className="mural-frame relative shrink-0">
                  <img
                    src={m.photo}
                    alt={m.name}
                    width={84}
                    height={84}
                    loading="lazy"
                    className="mural-photo size-[84px] object-cover"
                  />
                </span>

                <span className="min-w-0">
                  <span className="t-eyebrow block text-[9px] text-brass">{m.role}</span>
                  <span className="t-display mt-1 block truncate text-[19px] leading-none text-ink transition-colors group-hover:text-brass">
                    {m.name}
                  </span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] text-ink-4 transition-colors group-hover:text-ink-3">
                    Perfil Steam
                    <ExternalLink className="size-3" />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
