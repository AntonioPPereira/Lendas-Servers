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
const DemoDetail = lazy(() => import("@/pages/DemoDetail"));
const Matches = lazy(() => import("@/pages/Matches"));
const MatchDetail = lazy(() => import("@/pages/MatchDetail"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const Activity = lazy(() => import("@/pages/Activity"));
const Bans = lazy(() => import("@/pages/Bans"));
const Stats = lazy(() => import("@/pages/Stats"));
const NotFound = lazy(() => import("@/pages/NotFound"));

/**
 * Partidas saiu da obra em 2026-08-31 e absorveu Demos: a lista de
 * gravações virou parte do arquivo de partidas, no mesmo lugar, porque
 * quem procura uma partida quer o placar E a demo dela. A fonte é o plugin
 * `lendas_matches` (placar, rodadas e Tab, gravados no fim de cada mapa) —
 * ver server/src/services/MatchesService.ts.
 *
 * `/demos` continua respondendo, redirecionando pra `/partidas`, pra não
 * quebrar link antigo. `DemoDetail` segue de pé: é o destino das gravações
 * que não têm partida registrada, e são a maioria do acervo.
 *
 * `pages/Stats` continua no repositório com a mesma lógica de antes.
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
              <Route path="/demos/:id" element={<DemoDetail />} />
              <Route path="/jogadores" element={<Players />} />
              <Route path="/jogadores/:id" element={<PlayerProfile />} />
              <Route path="/atividade" element={<Activity />} />

              <Route path="/banimentos" element={<Bans />} />
              <Route path="/partidas" element={<Matches />} />
              <Route path="/partidas/:id" element={<MatchDetail />} />
              {/* Demos e Partidas viraram um lugar só. A lista mora em
                  /partidas; /demos continua existindo pra não quebrar link
                  antigo nem favorito, e manda pra lá. A página de UMA demo
                  segue de pé: é o destino das gravações sem partida. */}
              <Route path="/demos" element={<Navigate to="/partidas" replace />} />
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
