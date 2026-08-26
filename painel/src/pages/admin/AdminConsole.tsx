import { useState } from "react";
import {
  Ban,
  FileVideo,
  KeyRound,
  LogOut,
  ScrollText,
  Settings,
  Siren,
  UserMinus,
} from "lucide-react";
import { usePageEnter } from "@/hooks/useGsap";
import { BANS } from "@/data/bans";
import { ADMINS } from "@/data/seed";
import { formatDateTime, timeAgo } from "@/lib/format";
import { SectionTitle, Panel, PanelHeader } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { SearchBar } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { PlayerAvatar } from "@/components/player/PlayerAvatar";

const CAPABILITIES = [
  { icon: Ban, label: "Banir jogador", detail: "POST /admin/bans" },
  { icon: KeyRound, label: "Remover banimento", detail: "DELETE /admin/bans/:id" },
  { icon: UserMinus, label: "Expulsar do servidor", detail: "POST /admin/kick" },
  { icon: Siren, label: "Fila de denuncias", detail: "GET /admin/reports" },
  { icon: FileVideo, label: "Gerenciar demos", detail: "PATCH /admin/demos/:id" },
  { icon: Settings, label: "Configuração do servidor", detail: "PUT /admin/servers/:id" },
  { icon: ScrollText, label: "Log de moderação", detail: "GET /admin/audit" },
];

export function AdminConsole({ onSignOut }: { onSignOut: () => void }) {
  const scope = usePageEnter<HTMLDivElement>();
  const [banOpen, setBanOpen] = useState(false);
  const [target, setTarget] = useState("");
  const toast = useToast();

  const recent = BANS.slice(0, 8);

  function submitBan() {
    if (!target.trim()) {
      toast.error("Informe um jogador", "Use o nickname ou o Steam ID completo");
      return;
    }
    setBanOpen(false);
    toast.success("Ação registrada no log", target.trim() + " · aguardando o backend");
    setTarget("");
  }

  return (
    <div ref={scope} className="space-y-5">
      <div data-enter>
        <SectionTitle
          eyebrow="Área restrita"
          title="Console de moderação"
          description="Interface separada do painel público. As ações abaixo já têm rota, estado e feedback definidos: falta apenas ligar o backend."
          actions={
            <>
              <Button variant="danger" icon={<Ban />} onClick={() => setBanOpen(true)}>
                Banir jogador
              </Button>
              <Button icon={<LogOut />} onClick={onSignOut}>
                Sair
              </Button>
            </>
          }
        />
      </div>

      <div data-enter className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CAPABILITIES.map((item) => (
          <div key={item.label} className="panel flex items-start gap-3 p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-xs border border-line-soft bg-panel-2 text-ink-3">
              <item.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] text-ink">{item.label}</p>
              <p className="t-num mt-1 truncate text-[10px] text-ink-4">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div data-enter>
        <Panel className="overflow-hidden">
          <PanelHeader
            label="Log de moderação"
            accent="danger"
            hint={recent.length + " ações recentes"}
          />
          <ul className="divide-y divide-line-soft">
            {recent.map((ban) => (
              <li key={ban.id} className="flex items-center gap-3 px-4 py-2.5">
                <PlayerAvatar seed={ban.target.avatarSeed} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-ink">
                    {ban.target.nickname}
                    <span className="text-ink-4"> — {ban.reason}</span>
                  </p>
                  <p className="t-num mt-0.5 text-[10px] text-ink-4">
                    {ban.admin} · {formatDateTime(ban.createdAt)} · {ban.serverName}
                  </p>
                </div>
                <Badge tone={ban.state === "expired" ? "neutral" : "danger"}>{ban.state}</Badge>
                <span className="t-num hidden w-20 text-right text-[10px] text-ink-4 sm:block">
                  {timeAgo(ban.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Modal
        open={banOpen}
        onClose={() => setBanOpen(false)}
        eyebrow="Moderação"
        title="Banir jogador"
        footer={
          <>
            <Button onClick={() => setBanOpen(false)}>Cancelar</Button>
            <Button variant="danger" icon={<Ban />} onClick={submitBan}>
              Aplicar banimento
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div data-modal-item>
            <p className="t-eyebrow mb-2">Jogador</p>
            <SearchBar
              value={target}
              onValueChange={setTarget}
              placeholder="Nickname ou STEAM_0:0:000000"
            />
          </div>
          <p data-modal-item className="text-[12px] leading-relaxed text-ink-3">
            Este formulário já emite a ação com validação, estado de erro e confirmação. Ao conectar
            o backend, troque a chamada por <span className="t-num text-ink-2">POST /admin/bans</span>{" "}
            sem alterar a interface.
          </p>
          <p data-modal-item className="t-num text-[11px] text-ink-4">
            Administradores cadastrados: {ADMINS.join(", ")}
          </p>
        </div>
      </Modal>
    </div>
  );
}
