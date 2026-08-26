import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldHalf } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { config } from "@/lib/config";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { SearchBar } from "@/components/ui/Field";
import { BrandMark } from "@/components/layout/BrandMark";
import { AdminConsole } from "./AdminConsole";

/**
 * The admin area runs in its own shell: different chrome, its own gate, and no
 * live feed. Nothing here shares state with the public panel.
 */
export default function AdminApp() {
  const [signedIn, setSignedIn] = useLocalStorage("lendas:admin", false);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col bg-base">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-danger/25 bg-panel/90 px-4 backdrop-blur-md">
        <BrandMark className="size-8" />
        <div className="min-w-0">
          <p className="t-display text-[13px] leading-none text-ink">{config.brand.name}</p>
          <p className="t-eyebrow mt-1 text-[8.5px] text-danger">Modo administração</p>
        </div>
        <Link
          to="/"
          className="t-eyebrow ml-auto flex items-center gap-1.5 text-[9px] text-ink-3 transition-colors hover:text-brass"
        >
          <ArrowLeft className="size-3.5" />
          Voltar ao painel público
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1560px] flex-1 px-3 py-6 sm:px-5">
        {signedIn ? (
          <AdminConsole onSignOut={() => setSignedIn(false)} />
        ) : (
          <SignInGate onSignIn={() => setSignedIn(true)} />
        )}
      </main>
    </div>
  );
}

function SignInGate({ onSignIn }: { onSignIn: () => void }) {
  const [key, setKey] = useState("");

  return (
    <div className="mx-auto flex max-w-[420px] flex-col justify-center pt-[8vh]">
      <Panel className="p-6">
        <span className="grid size-10 place-items-center rounded-xs border border-danger/30 bg-danger/10 text-danger">
          <ShieldHalf className="size-5" />
        </span>
        <h1 className="t-display mt-4 text-[22px] text-ink">Acesso restrito</h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          Esta área é separada do painel público. Informe a chave de administrador emitida pelo
          SourceMod para continuar.
        </p>

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSignIn();
          }}
        >
          <SearchBar
            value={key}
            onValueChange={setKey}
            placeholder="Chave de administrador"
            aria-label="Chave de administrador"
          />
          <Button type="submit" variant="primary" size="lg" block>
            Entrar no console
          </Button>
        </form>

        <p className="t-num mt-4 text-[10.5px] leading-relaxed text-ink-4">
          Protótipo: a autenticação real usa Steam OpenID e as permissões do SourceBans. Qualquer
          valor abre o console de demonstração.
        </p>
      </Panel>
    </div>
  );
}
