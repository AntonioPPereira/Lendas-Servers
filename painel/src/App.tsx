import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LiveProvider } from "@/realtime/LiveProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui/States";
import Overview from "@/pages/Overview";

// Route-level splitting: the overview ships in the entry chunk because it is
// the landing page; everything else loads on demand.
const Servers = lazy(() => import("@/pages/Servers"));
const Ranking = lazy(() => import("@/pages/Ranking"));
const Demos = lazy(() => import("@/pages/Demos"));
const DemoDetail = lazy(() => import("@/pages/DemoDetail"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const Activity = lazy(() => import("@/pages/Activity"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Maintenance = lazy(() => import("@/pages/Maintenance"));

/**
 * Partidas, Banimentos e Estatísticas apontam pra Maintenance: foram feitas
 * antes de existir fonte real e seguiam exibindo dados gerados, destoando do
 * resto do painel. Os módulos `pages/Matches`, `pages/MatchDetail`,
 * `pages/Bans` e `pages/Stats` continuam no repositório de propósito — a
 * obra é temporária, e apagá-los agora só daria trabalho de reescrever a
 * casca quando a fonte existir. Pra religar, é trocar o element da rota de
 * volta.
 */
const AdminApp = lazy(() => import("@/pages/admin/AdminApp"));

function PublicApp() {
  return (
    <LiveProvider>
      <AppShell>
        {(location) => (
          <Suspense fallback={<LoadingState label="Carregando modulo" />}>
            <Routes location={location}>
              <Route path="/" element={<Overview />} />
              <Route path="/servidores" element={<Servers />} />
              <Route path="/ranking" element={<Ranking />} />
              <Route path="/demos" element={<Demos />} />
              <Route path="/demos/:id" element={<DemoDetail />} />
              <Route path="/jogadores" element={<Players />} />
              <Route path="/jogadores/:id" element={<PlayerProfile />} />
              <Route path="/atividade" element={<Activity />} />

              <Route
                path="/banimentos"
                element={
                  <Maintenance
                    eyebrow="Moderação"
                    title="Banimentos"
                    reason="A lista de banimentos ainda não tem fonte real ligada — o registro do SourceBans desta rede não é exposto pelo painel hoje."
                  />
                }
              />
              <Route
                path="/partidas/*"
                element={
                  <Maintenance
                    eyebrow="Arquivo"
                    title="Partidas"
                    reason="O histórico de partidas depende de uma fonte que ainda não existe: o HLstatsX desta instalação não expõe partida por partida."
                  />
                }
              />
              <Route
                path="/estatisticas"
                element={
                  <Maintenance
                    eyebrow="Arquivo"
                    title="Estatísticas"
                    reason="Os agregados desta tela dependem do histórico de partidas, que ainda não tem fonte real ligada."
                  />
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        )}
      </AppShell>
    </LiveProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<LoadingState label="Abrindo console" />}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route path="/*" element={<PublicApp />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
