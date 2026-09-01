import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
const Bans = lazy(() => import("@/pages/Bans"));
const Stats = lazy(() => import("@/pages/Stats"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/**
 * Demos voltou a ser uma aba própria em 2026-09-01. A tentativa de fundi-la
 * com Partidas (placar, rodadas e Tab por partida) foi desfeita a pedido: o
 * placar não se sustentou na prática e a fusão desorganizou a área. O
 * backend continua registrando as partidas — se um dia valer a pena, o dado
 * estará lá; a casca do frontend está no histórico do git.
 *
 * Banimentos saiu da obra em 2026-08-30: passou a ler os bans reais do
 * SourceBans++ via `GET /api/bans` (o servidor de jogo exporta um JSON que o
 * backend lê por SFTP — ver server/src/services/SourceBansService.ts).
 *
 * Estatísticas saiu junto: agora mostra os agregados reais do servidor
 * (`GET /api/stats`, HLstatsX mode=weapons/actions/maps). Note que ela NÃO
 * tem recorte por jogador — o `mode=playerinfo` desta instalação trava, e
 * isso está explicado na própria tela em vez de virar uma ausência sem
 * explicação.
 */

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

              <Route path="/banimentos" element={<Bans />} />
              {/* Partidas foi desfeita em 2026-09-01: o placar por partida
                  não se sustentou na prática e a fusão bagunçou a área.
                  `/partidas` redireciona pra não quebrar link de quem
                  navegou por lá enquanto existiu. */}
              <Route path="/partidas/*" element={<Navigate to="/demos" replace />} />
              <Route path="/estatisticas" element={<Stats />} />
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
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
        <Routes>
          <Route path="/*" element={<PublicApp />} />
        </Routes>
        </ToastProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}
