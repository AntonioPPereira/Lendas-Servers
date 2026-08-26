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
const Bans = lazy(() => import("@/pages/Bans"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const Activity = lazy(() => import("@/pages/Activity"));
const Matches = lazy(() => import("@/pages/Matches"));
const MatchDetail = lazy(() => import("@/pages/MatchDetail"));
const Stats = lazy(() => import("@/pages/Stats"));
const NotFound = lazy(() => import("@/pages/NotFound"));
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
              <Route path="/banimentos" element={<Bans />} />
              <Route path="/jogadores" element={<Players />} />
              <Route path="/jogadores/:id" element={<PlayerProfile />} />
              <Route path="/atividade" element={<Activity />} />
              <Route path="/partidas" element={<Matches />} />
              <Route path="/partidas/:id" element={<MatchDetail />} />
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
