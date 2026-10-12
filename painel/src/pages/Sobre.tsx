import { usePageEnter } from "@/hooks/useGsap";
import { SectionTitle, Panel } from "@/components/ui/Panel";

export default function Sobre() {
  const scope = usePageEnter<HTMLDivElement>();

  return (
    <div ref={scope} className="space-y-6 p-4 md:p-6">
      <SectionTitle title="Sobre" description="Conheça a história da comunidade" />

      <Panel>
        <div className="space-y-6 p-5">
          <div>
            <h2 className="t-display text-[18px] text-ink">O que é a LEGION?</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
              A LEGION Community é uma comunidade brasileira de Counter-Strike: Source focada em partidas competitivas e eventos com premiação.
            </p>
          </div>

          <div className="h-px bg-line-soft" />

          <div>
            <h2 className="t-display text-[18px] text-ink">Nossa história</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
              A LEGION é a continuação de um projeto mais antigo chamado{" "}
              <span className="text-ink font-medium">L.E.N.D.A.S</span>, que reuniu jogadores e
              construiu uma base sólida ao longo dos anos. Com o tempo, o projeto evoluiu e ganhou
              uma nova identidade — mantendo o mesmo espírito competitivo e a mesma comunidade,
              agora sob o nome LEGION.
            </p>
          </div>

          <div className="h-px bg-line-soft" />

          <div>
            <h2 className="t-display text-[18px] text-ink">O servidor</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
              Contamos com um servidor de MIX dedicado, onde acontecem partidas organizadas,
              eventos com premiação em dinheiro e um sistema de ranking para acompanhar a evolução
              dos jogadores.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
