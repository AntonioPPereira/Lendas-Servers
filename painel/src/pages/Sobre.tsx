import { usePageEnter } from "@/hooks/useGsap";
import { SectionTitle, Panel } from "@/components/ui/Panel";

export default function Sobre() {
  const scope = usePageEnter<HTMLDivElement>();

  return (
    <div ref={scope} className="space-y-6 p-4 md:p-6">
      <SectionTitle title="Sobre" description="Conheça a história da comunidade" />

      <Panel>
        <div className="space-y-8 p-5 md:p-7">

          {/* Título principal */}
          <div className="text-center">
            <h1 className="t-display text-[22px] text-ink md:text-[26px]">
              LEGION — Uma nova identidade.{" "}
              <span className="text-brass">Uma história que continua.</span>
            </h1>
          </div>

          <div className="h-px bg-line-soft" />

          {/* Bloco principal */}
          <div className="space-y-5 text-[14px] leading-relaxed text-ink-2">
            <p>
              O <strong className="text-ink">LEGION</strong> nasce como a continuação de uma
              jornada que marcou a história de muitos jogadores: o LENDASCSS.
            </p>

            <p>
              Ao longo dos anos, o LENDAS foi muito mais do que um servidor de Counter-Strike:
              Source. Foi um ponto de encontro, palco de grandes partidas, amizades, rivalidades
              saudáveis e momentos que permanecerão na memória de todos que fizeram parte dessa
              comunidade.
            </p>

            <p>
              Reconhecemos e respeitamos profundamente{" "}
              <strong className="text-ink">Kanga, criador do LENDAS</strong>, assim como todos
              aqueles que contribuíram para construir essa história. Sabemos que nenhum projeto
              nasce do nada e que existe dedicação, tempo e paixão por trás de tudo o que foi
              construído.
            </p>

            <p>
              Com o encerramento oficial do LENDASCSS, entendemos que era o momento de iniciar uma
              nova fase, com uma identidade própria, preservando os laços criados ao longo dessa
              trajetória.
            </p>
          </div>

          {/* Destaque central */}
          <div className="rounded border border-brass-lo bg-brass-dim px-6 py-5 text-center">
            <p className="t-display text-[18px] text-brass-hi">Assim nasce o LEGION.</p>
          </div>

          <div className="space-y-5 text-[14px] leading-relaxed text-ink-2">
            <p>
              Não com a intenção de apagar o passado, substituir a história original ou desmerecer
              o trabalho de quem veio antes, mas com o propósito de dar continuidade à comunidade,
              às amizades e ao espírito que nos manteve unidos durante tantos anos.
            </p>

            <p>
              A mudança de nome representa também uma escolha consciente de respeito à decisão do
              criador do LENDAS. Seguimos por um novo caminho, com nossa própria identidade,
              reconhecendo sempre as origens e a importância de todos que fizeram parte dessa
              história.
            </p>

            <p>
              O nosso compromisso permanece: construir um ambiente divertido, justo e acolhedor,
              onde cada jogador tenha espaço para competir, fazer amizades e criar novas memórias.
            </p>
          </div>

          {/* Slogan principal */}
          <div className="rounded border border-line-soft bg-panel-2/60 px-6 py-8 text-center">
            <p className="t-display text-[20px] leading-snug text-ink md:text-[24px]">
              O LENDAS faz parte da nossa história.
            </p>
            <p className="t-display mt-1 text-[20px] leading-snug md:text-[24px]">
              <span className="brass-text">O LEGION é o próximo capítulo.</span>
            </p>
          </div>

          <div className="h-px bg-line-soft" />

          {/* Encerramento */}
          <div className="space-y-3 text-center">
            <p className="text-[15px] font-medium text-ink">Sejam bem-vindos ao LEGION.</p>
            <p className="text-[13px] italic text-ink-3">
              Uma nova identidade. A mesma paixão pelo jogo. Uma nova história para construir
              juntos.
            </p>
          </div>

        </div>
      </Panel>
    </div>
  );
}
