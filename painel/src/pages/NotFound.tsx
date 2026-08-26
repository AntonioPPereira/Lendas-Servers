import { Link } from "react-router-dom";
import { usePageEnter } from "@/hooks/useGsap";
import { LinkButton } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

export default function NotFound() {
  const scope = usePageEnter<HTMLDivElement>();

  return (
    <div ref={scope} className="flex min-h-[60vh] items-center justify-center">
      <Panel data-enter className="max-w-[460px] p-8 text-center">
        <p className="t-eyebrow text-brass">Erro 404</p>
        <h1 className="t-display mt-3 text-[30px] text-ink">Rota fora do mapa</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
          Esta página não existe no painel. Volte para a visão geral ou procure um jogador pelo
          nickname.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <LinkButton to="/" variant="primary">
            Ir para a visão geral
          </LinkButton>
          <Link
            to="/jogadores"
            className="t-eyebrow px-3 py-2 text-[9px] text-ink-3 transition-colors hover:text-brass"
          >
            Buscar jogadores
          </Link>
        </div>
      </Panel>
    </div>
  );
}
