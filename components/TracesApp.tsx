"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LeaveTraceFlow } from "@/components/LeaveTraceFlow";
import { ListeningPanel } from "@/components/ListeningPanel";
import { ModeToggle, NavDropdown } from "@/components/ModeToggle";
import { ThemeFilters } from "@/components/ThemeFilters";
import { TraceMap } from "@/components/TraceMap";
import { TraceWorld } from "@/components/TraceWorld";
import {
  DEMO_TRACES,
  getBrowseThemesForCategory,
  type ThemeKey,
  type Trace,
  type TraceCategory,
  type ViewMode,
  normalizeTrace,
  supplementTracesWithDemoFallback,
} from "@/lib/traces";
import { getSupabaseClient } from "@/lib/supabaseClient";

type ListenMode = TraceCategory | "everything";

export function TracesApp() {
  const [mode, setMode] = useState<ViewMode>("map");
  const [listenMode, setListenMode] = useState<ListenMode>("everything");
  const [enabledThemes, setEnabledThemes] = useState<Set<ThemeKey>>(() => new Set());
  const [traces, setTraces] = useState<Trace[]>(DEMO_TRACES);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [panelTrace, setPanelTrace] = useState<Trace | null>(null);
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [isLeavingTrace, setIsLeavingTrace] = useState(false);
  const [loadState, setLoadState] = useState<"demo" | "live" | "error">("demo");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const panelDismissTimer = useRef<number | null>(null);
  const panelRevealTimer = useRef<number | null>(null);
  const selectedTraceRef = useRef<Trace | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    supabase
      .from("traces")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) {
          return;
        }

        if (error || !data?.length) {
          setLoadState(error ? "error" : "demo");
          return;
        }

        const liveTraces = supplementTracesWithDemoFallback(data.map((row) => normalizeTrace(row)));
        setTraces(liveTraces);
        setLoadState("live");
      });

    const channel = supabase
      .channel("public-approved-traces")
      .on("postgres_changes", { event: "*", schema: "public", table: "traces" }, () => {
        supabase
          .from("traces")
          .select("*")
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .then(({ data }) => {
            if (active && data?.length) {
              setTraces(supplementTracesWithDemoFallback(data.map((row) => normalizeTrace(row))));
            }
          });
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  const browseThemes = useMemo(() => (listenMode === "everything" ? [] : getBrowseThemesForCategory(listenMode)), [listenMode]);

  const filteredTraces = useMemo(
    () => (listenMode === "everything" ? traces : traces.filter((trace) => trace.category === listenMode && enabledThemes.has(trace.theme))),
    [enabledThemes, listenMode, traces],
  );

  function changeListenMode(mode: ListenMode) {
    setListenMode(mode);
    setEnabledThemes(mode === "everything" ? new Set() : new Set(getBrowseThemesForCategory(mode).map((theme) => theme.key)));
    setSelectedTrace(null);
    setPanelTrace(null);
  }

  useEffect(() => {
    selectedTraceRef.current = selectedTrace;
  }, [selectedTrace]);

  useEffect(() => {
    if (selectedTrace && !filteredTraces.some((trace) => trace.id === selectedTrace.id)) {
      setSelectedTrace(null);
      setPanelTrace(null);
    }
  }, [filteredTraces, selectedTrace]);

  useEffect(() => {
    return () => {
      if (panelDismissTimer.current) {
        window.clearTimeout(panelDismissTimer.current);
      }
      if (panelRevealTimer.current) {
        window.clearTimeout(panelRevealTimer.current);
      }
    };
  }, []);

  function selectTrace(trace: Trace) {
    if (panelDismissTimer.current) {
      window.clearTimeout(panelDismissTimer.current);
      panelDismissTimer.current = null;
    }
    if (panelRevealTimer.current) {
      window.clearTimeout(panelRevealTimer.current);
      panelRevealTimer.current = null;
    }
    setIsPanelClosing(false);
    setSelectedTrace(trace);
    setPanelTrace(null);
    panelRevealTimer.current = window.setTimeout(() => {
      revealPanelForTrace(trace);
      panelRevealTimer.current = null;
    }, 900);
  }

  function revealPanelForTrace(trace: Trace) {
    if (selectedTraceRef.current?.id === trace.id) {
      setPanelTrace(trace);
    }
  }

  function dismissSelectedTrace() {
    if (!selectedTrace || isPanelClosing) {
      return;
    }
    if (panelRevealTimer.current) {
      window.clearTimeout(panelRevealTimer.current);
      panelRevealTimer.current = null;
    }
    if (!panelTrace) {
      setSelectedTrace(null);
      return;
    }
    setIsPanelClosing(true);
    panelDismissTimer.current = window.setTimeout(() => {
      setSelectedTrace(null);
      setPanelTrace(null);
      setIsPanelClosing(false);
      panelDismissTimer.current = null;
    }, 220);
  }

  function toggleTheme(theme: ThemeKey) {
    setEnabledThemes((current) => {
      const next = new Set(current);
      if (next.has(theme)) {
        next.delete(theme);
      } else {
        next.add(theme);
      }
      return next;
    });
  }

  return (
    <main className="app-frame">
      <SiteHeader />

      {isLeavingTrace ? (
        <LeaveTraceFlow
          onClose={() => setIsLeavingTrace(false)}
          onComplete={() => {
            setSelectedTrace(null);
            setPanelTrace(null);
            setIsLeavingTrace(false);
            setNotice("Your trace is waiting for review.");
          }}
        />
      ) : (
        <section className="browse-shell" aria-label="Browse voice traces">
          <div className="top-controls">
            <ModeToggle mode={mode} onChange={setMode} />
            <NavDropdown
              label="Listen To"
              value={listenMode}
              onChange={changeListenMode}
              options={[
                { value: "everything", label: "Everything" },
                { value: "emotion", label: "Emotions" },
                { value: "confession", label: "Confessions" },
              ]}
            />
            {listenMode === "everything" ? null : (
              <ThemeFilters themes={browseThemes} enabledThemes={enabledThemes} onToggle={toggleTheme} animationKey={listenMode} />
            )}
          </div>

          <div className="view-stage" data-trace-selected={selectedTrace ? "true" : undefined}>
            {mode === "map" ? (
              <TraceMap
                traces={filteredTraces}
                selectedTrace={selectedTrace}
                now={now}
                onSelectTrace={selectTrace}
                onClearSelection={dismissSelectedTrace}
                onTraceFocusComplete={revealPanelForTrace}
              />
            ) : (
              <TraceWorld
                traces={filteredTraces}
                selectedTrace={selectedTrace}
                now={now}
                onSelectTrace={selectTrace}
                onClearSelection={dismissSelectedTrace}
              />
            )}

            {panelTrace ? (
              <ListeningPanel trace={panelTrace} now={now} isClosing={isPanelClosing} onDismiss={dismissSelectedTrace} />
            ) : null}

            <button className="leave-trace-button" onClick={() => setIsLeavingTrace(true)}>
              Leave A Trace
            </button>
          </div>

          {notice ? <p className="submission-notice">{notice}</p> : null}
          <p className="runtime-note" data-state={loadState}>
            {loadState === "live" ? "Live traces loaded." : "Demo traces shown until Supabase is configured."}
          </p>
        </section>
      )}

      <SiteFooter />
    </main>
  );
}

function SiteHeader() {
  return (
    <header className="site-header">
      <div>
        <h1>_TRACES</h1>
        <p>
          This is a map of fleeting human voices, stories and feelings in the city.
          <br />
          Stay awhile and listen. Then, leave a trace of your own.
        </p>
      </div>
      <div className="logo-slot" aria-label="Logo image slot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.gif"
          alt="Traces logo"
          onError={(event) => {
            event.currentTarget.hidden = true;
            const fallback = event.currentTarget.nextElementSibling;
            if (fallback instanceof HTMLElement) {
              fallback.hidden = false;
            }
          }}
        />
        <span hidden />
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="site-credit">
        AN EXPERIMENT BY{" "}
        <a href="https://www.futureswithryan.com/" target="_blank" rel="noreferrer">
          @SLINKIESTYEW
        </a>
        ,{" "}
        <a href="https://www.lekker.sg/" target="_blank" rel="noreferrer">
          EMOTIONAL TECHNOLOGIES LAB
        </a>
        ,{" "}
        <a href="https://padimai.net/" target="_blank" rel="noreferrer">
          PADIMAI GALLERY
        </a>
      </span>
      <a href="/admin" aria-label="Open admin area">
        Admin
      </a>
    </footer>
  );
}
