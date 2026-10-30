import type { CSSProperties } from "react";
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
 * dela.
 *
 * O QUADRO É 128px POR UM MOTIVO: as fotos do Kai e do Kanga têm 184×184 de
 * origem. A 128px elas ainda ficam nítidas; acima disso começam a borrar em
 * tela de alta densidade, porque não há pixel de sobra. Para aumentar mais,
 * é preciso trocar os arquivos por versões maiores — esticar o que existe
 * só deixaria embaçado.
 */
interface Membro {
  role: string;
  name: string;
  steamId64: string;
  photo: string;
}

/**
 * Os cargos seguem o formato de crédito de filme: a função em cima, em
 * caixa alta pequena, e o nome embaixo em destaque. "Dono" e "Admin Master"
 * viraram "Proprietário" e "Administrador-chefe" — mesmo significado, sem o
 * tom de conversa de jogo, que destoava do resto do painel.
 */
const TIME: readonly Membro[] = [
  { role: "Desenvolvimento", name: "Kai", steamId64: "76561198008899939", photo: "/team/kai.jpg" },
  { role: "Proprietário", name: "Kangaçeiroz", steamId64: "76561199043273451", photo: "/team/kanga.jpg" },
  { role: "Administrador-chefe", name: "EzE", steamId64: "76561197970780396", photo: "/team/eze.jpg" },
];

export function TeamMural() {
  return (
    /* A caixa acompanha o conteúdo, não a página: esticada até a largura
       total sobrava vazio nas laterais e o bloco lia como buraco. Centrada
       e contida, a sobra vira respiro da própria página. */
    <section className="mural relative mx-auto max-w-4xl overflow-hidden rounded-md border border-line-soft bg-panel">
      {/* Faixas finas em cima e embaixo: o enquadramento de tela de cinema. */}
      <span aria-hidden className="mural-bar mural-bar-top" />
      <span aria-hidden className="mural-bar mural-bar-bottom" />
      {/* Luz que atravessa devagar, uma vez a cada ciclo longo. */}
      <span aria-hidden className="mural-sweep" />

      <div className="relative px-5 py-7 sm:px-8 sm:py-9">
        {/* Cabeçalho centralizado: o bloco inteiro é simétrico, e um título
            encostado na esquerda brigaria com isso. */}
        <header className="mb-8 text-center">
          <h2 className="t-display text-[21px] tracking-[0.2em] text-ink">COMANDO</h2>
          <p className="t-eyebrow mt-2 text-[10px] text-ink-3">Quem mantém a rede no ar</p>
          <span className="mx-auto mt-4 block h-px w-24 bg-gradient-to-r from-transparent via-brass/70 to-transparent" />
        </header>

        {/* Lado a lado, como tríptico: as divisórias verticais fecham o
            espaço que sobrava à direita de cada nome e amarram os três num
            bloco só. Só empilha no celular, onde três colunas ficariam
            ilegíveis — e aí as divisórias somem. */}
        <ul className="grid gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line-soft">
          {TIME.map((m, i) => (
            <li
              key={m.steamId64}
              className="mural-item sm:px-6"
              style={
                {
                  animationDelay: i * 140 + "ms",
                  // Cada moldura pulsa fora de compasso das outras.
                  "--neon-delay": i * 0.9 + "s",
                } as CSSProperties
              }
            >
              {/* Retrato em cima, texto centralizado embaixo — o empilhamento
                  aqui é DENTRO de cada coluna; as três pessoas seguem lado a
                  lado, que é o que o mural pede. */}
              <a
                href={"https://steamcommunity.com/profiles/" + m.steamId64}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex flex-col items-center gap-4 text-center outline-none"
              >
                <span className="mural-frame relative shrink-0">
                  <img
                    src={m.photo}
                    alt={m.name}
                    width={128}
                    height={128}
                    loading="lazy"
                    className="mural-photo size-[128px] object-cover"
                  />
                </span>

                <span className="w-full min-w-0">
                  <span className="t-eyebrow block text-[10px] tracking-[0.18em] text-brass">{m.role}</span>
                  <span className="t-display mt-2 block text-[24px] leading-tight text-ink transition-colors group-hover:text-brass">
                    {m.name}
                  </span>
                  <span className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] text-ink-4 transition-colors group-hover:text-brass">
                    Perfil Steam
                    <ExternalLink className="size-3.5" />
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
