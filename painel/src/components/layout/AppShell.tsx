import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, type Location } from "react-router-dom";
import { cn } from "@/lib/cn";
import { gsap, prefersReducedMotion } from "@/lib/motion";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useConnection } from "@/realtime/store";
import { Sidebar } from "./Sidebar";
import { SignalBar } from "./SignalBar";
import { GlobalSearch } from "./GlobalSearch";
import { OfflineNotice } from "@/components/ui/States";

interface AppShellProps {
  /** Receives the deferred location so the outgoing page can finish leaving. */
  children: (location: Location) => ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const [display, setDisplay] = useState(location);
  const [collapsed, setCollapsed] = useLocalStorage("lendas:rail", false);
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const connection = useConnection();
  const stage = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const drawerPanel = useRef<HTMLDivElement>(null);

  // Exit: the current page leaves before the next one is mounted.
  useLayoutEffect(() => {
    if (location.pathname === display.pathname) return;
    if (prefersReducedMotion()) {
      setDisplay(location);
      return;
    }
    const tween = gsap.to(stage.current, {
      opacity: 0,
      y: -8,
      duration: 0.15,
      ease: "power2.in",
      onComplete: () => setDisplay(location),
    });
    return () => {
      tween.kill();
    };
  }, [location, display.pathname]);

  // Enter: the shell fades the stage back in, each page staggers its own blocks.
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    if (prefersReducedMotion()) {
      gsap.set(stage.current, { opacity: 1, y: 0 });
      return;
    }
    const tween = gsap.fromTo(
      stage.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.3, ease: "power2.out", clearProps: "transform" },
    );
    return () => {
      tween.kill();
    };
  }, [display.pathname]);

  // Mobile drawer.
  useEffect(() => {
    if (!drawer) return;
    document.body.style.overflow = "hidden";
    const ctx = gsap.context(() => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        drawerPanel.current,
        { xPercent: -100 },
        { xPercent: 0, duration: 0.32, ease: "power3.out" },
      );
    });
    return () => {
      document.body.style.overflow = "";
      ctx.revert();
    };
  }, [drawer]);

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative z-10 flex h-dvh overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((value) => !value)}
        className={cn(
          "hidden shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex",
          collapsed ? "w-[68px]" : "w-[244px]",
        )}
      />

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-void/75 backdrop-blur-[2px]"
            onClick={() => setDrawer(false)}
            aria-hidden="true"
          />
          <div ref={drawerPanel} className="absolute inset-y-0 left-0 w-[264px]">
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => undefined}
              onNavigate={() => setDrawer(false)}
              className="h-full bg-panel"
            />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <SignalBar onOpenMenu={() => setDrawer(true)} onOpenSearch={() => setSearchOpen(true)} />

        {connection === "offline" ? <OfflineNotice className="mx-4 mt-3 sm:mx-6" /> : null}

        <main id="app-scroller" ref={scroller} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div ref={stage} className="mx-auto w-full max-w-[1560px] px-3 py-4 sm:px-5 sm:py-6">
            {children(display)}
          </div>
          <footer className="mx-auto w-full max-w-[1560px] px-3 pb-8 pt-4 sm:px-5">
            <div className="hairline mb-4" />
            <p className="t-num text-[10.5px] leading-relaxed text-ink-4">
              Lendas Network · painel da comunidade · dados do servidor atualizados em tempo real
            </p>
          </footer>
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
