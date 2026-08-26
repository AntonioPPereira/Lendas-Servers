import { Wrench } from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { SectionTitle, Panel } from "@/components/ui/Panel";
import { LinkButton } from "@/components/ui/Button";

/**
 * Página parada em manutenção.
 *
 * Partidas, Banimentos e Estatísticas foram construídas antes de existir
 * fonte real pra elas e seguiam mostrando dados gerados — o que destoava do
 * resto do painel, onde tudo vem do HLstatsX, do SFTP ou do plugin ao vivo.
 * Em vez de deixar número inventado no ar, a rota assume que está em obra.
 * Os módulos originais continuam no repositório, prontos pra voltar quando
 * a fonte existir; ver comentário em App.tsx.
 */
export default function Maintenance({
  title,
  eyebrow,
  reason,
}: {
  title: string;
  eyebrow: string;
  reason: string;
}) {
  const scope = usePageEnter<HTMLDivElement>();

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle eyebrow={eyebrow} title={title} description={reason} />
      </div>

      <div data-enter>
        <Panel hud className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <span className="grid size-12 place-items-center rounded-sm border border-warn/30 bg-warn/10 text-warn [&_svg]:size-5">
            <Wrench />
          </span>

          <div>
            <p className="t-title text-[14px] text-ink">Em manutenção</p>
            <p className="mt-2 max-w-[52ch] text-[12.5px] text-ink-3">
              Esta seção está fora do ar enquanto é reconstruída sobre dados reais. Enquanto
              isso, o que já vem do servidor de verdade continua no ar.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <LinkButton to="/" size="sm">
              Voltar pra Visão geral
            </LinkButton>
            <LinkButton to="/ranking" size="sm" variant="ghost">
              Ver o Ranking
            </LinkButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
