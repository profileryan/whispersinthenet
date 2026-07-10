"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlagTraceFlow } from "@/components/FlagTraceFlow";
import { LeaveTraceFlow } from "@/components/LeaveTraceFlow";
import { ListeningPanel } from "@/components/ListeningPanel";
import { ModeToggle, NavDropdown } from "@/components/ModeToggle";
import { ReplyTraceFlow } from "@/components/ReplyTraceFlow";
import { SoundToggle } from "@/components/SoundToggle";
import { ThemeFilters } from "@/components/ThemeFilters";
import { TraceMap } from "@/components/TraceMap";
import { TraceWorld } from "@/components/TraceWorld";
import { getAmbientSound } from "@/lib/ambientSound";
import type { FlagReasonKey } from "@/lib/flagging";
import { prefersReducedMotion } from "@/lib/motion";
import {
  DEMO_TRACES,
  buildTraceThreads,
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
const SITE_HEADER_COPY = "Explore your city through human thoughts, stories and feelings. Stay awhile and listen. Then, leave a trace of your own.";

export function TracesApp() {
  const [mode, setMode] = useState<ViewMode>("map");
  const [listenMode, setListenMode] = useState<ListenMode>("everything");
  const [enabledThemes, setEnabledThemes] = useState<Set<ThemeKey>>(() => new Set());
  const [traces, setTraces] = useState<Trace[]>(DEMO_TRACES);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [panelTrace, setPanelTrace] = useState<Trace | null>(null);
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [isLeavingTrace, setIsLeavingTrace] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [replyTargetTrace, setReplyTargetTrace] = useState<Trace | null>(null);
  const [flagTargetTrace, setFlagTargetTrace] = useState<Trace | null>(null);
  const [loadState, setLoadState] = useState<"demo" | "live" | "error">("demo");
  const [notice, setNotice] = useState("");
  const [hiddenFlaggedTraceIds, setHiddenFlaggedTraceIds] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => new Date());
  const panelDismissTimer = useRef<number | null>(null);
  const panelRevealTimer = useRef<number | null>(null);
  const aboutButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedTraceRef = useRef<Trace | null>(null);
  const lastCueAtRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    function updateVisualViewportVars() {
      const viewport = window.visualViewport;
      const bottomInset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      const height = viewport?.height ?? window.innerHeight;
      root.style.setProperty("--visual-viewport-bottom", `${Math.round(bottomInset)}px`);
      root.style.setProperty("--visual-viewport-height", `${Math.round(height)}px`);
    }

    updateVisualViewportVars();
    window.visualViewport?.addEventListener("resize", updateVisualViewportVars);
    window.visualViewport?.addEventListener("scroll", updateVisualViewportVars);
    window.addEventListener("resize", updateVisualViewportVars);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateVisualViewportVars);
      window.visualViewport?.removeEventListener("scroll", updateVisualViewportVars);
      window.removeEventListener("resize", updateVisualViewportVars);
      root.style.removeProperty("--visual-viewport-bottom");
      root.style.removeProperty("--visual-viewport-height");
    };
  }, []);

  const loadApprovedTraces = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return false;
    }

    const { data, error } = await supabase
      .from("traces")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error || !data?.length) {
      setLoadState(error ? "error" : "demo");
      return false;
    }

    setTraces(supplementTracesWithDemoFallback(data.map((row) => normalizeTrace(row))));
    setLoadState("live");
    return true;
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    void loadApprovedTraces().then((loaded) => {
      if (!active || loaded) {
        return;
      }
      setTraces(DEMO_TRACES);
    });

    const refreshApprovedTraces = () => {
      void loadApprovedTraces().then((loaded) => {
        if (active && !loaded) {
          setTraces(DEMO_TRACES);
        }
      });
    };

    const channel = supabase
      .channel("public-approved-traces")
      .on("postgres_changes", { event: "*", schema: "public", table: "traces" }, refreshApprovedTraces)
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [loadApprovedTraces]);

  const browseThemes = useMemo(() => (listenMode === "everything" ? [] : getBrowseThemesForCategory(listenMode)), [listenMode]);

  const visibleTraces = useMemo(() => traces.filter((trace) => !hiddenFlaggedTraceIds.has(trace.id)), [hiddenFlaggedTraceIds, traces]);
  const filteredTraces = useMemo(
    () =>
      listenMode === "everything"
        ? visibleTraces
        : visibleTraces.filter((trace) => trace.category === listenMode && enabledThemes.has(trace.theme)),
    [enabledThemes, listenMode, visibleTraces],
  );
  const traceThreads = useMemo(() => buildTraceThreads(filteredTraces), [filteredTraces]);
  const rootTraces = useMemo(() => traceThreads.map((thread) => thread.root), [traceThreads]);
  const threadByRootId = useMemo(() => new Map(traceThreads.map((thread) => [thread.root.id, thread])), [traceThreads]);
  const replyCountByTraceId = useMemo(
    () => new Map(traceThreads.map((thread) => [thread.root.id, thread.replyCount])),
    [traceThreads],
  );
  const hasUnavailableAudio = useMemo(
    () => visibleTraces.some((trace) => !trace.audioPath && !trace.audioUrl),
    [visibleTraces],
  );

  function playCue(cue: "select" | "affirm" | "choice") {
    const nowMs = window.performance.now();
    if (nowMs - lastCueAtRef.current < 120) {
      return;
    }
    lastCueAtRef.current = nowMs;
    getAmbientSound().playCue(cue);
  }

  useEffect(() => {
    const buttonCueSelectors = [
      ".leave-trace-button",
      ".primary-action",
      ".secondary-action",
      ".record-button",
      ".different-question-button",
      ".type-choice-grid button",
      ".prompt-grid button",
      ".duration-picker-trigger",
      ".duration-picker-list button",
      ".nav-dropdown-trigger",
      ".nav-dropdown-menu button",
      ".theme-filters button",
      ".about-project-button",
      ".about-drawer-close",
      ".reply-trace-button",
      ".flag-trace-button",
      ".flag-reason-grid button",
      ".play-button",
    ].join(",");

    function playHoverCue(event: Event) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const marker = target.closest(".map-trace-marker");
      const previousTarget = event instanceof PointerEvent ? event.relatedTarget : null;
      if (!marker || (previousTarget instanceof Node && marker.contains(previousTarget))) {
        return;
      }
      getAmbientSound().playTraceCue(marker instanceof HTMLElement ? marker.dataset.theme : null);
    }

    function playButtonCue(event: Event) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(buttonCueSelectors)) {
        return;
      }
      const button = target.closest(buttonCueSelectors);
      const label = button?.textContent?.trim().toLowerCase() ?? "";
      playCue(label === "done" ? "affirm" : "choice");
    }

    document.addEventListener("pointerover", playHoverCue, true);
    document.addEventListener("click", playButtonCue, true);
    return () => {
      document.removeEventListener("pointerover", playHoverCue, true);
      document.removeEventListener("click", playButtonCue, true);
    };
  }, []);

  function changeListenMode(mode: ListenMode) {
    setListenMode(mode);
    setEnabledThemes(mode === "everything" ? new Set() : new Set(getBrowseThemesForCategory(mode).map((theme) => theme.key)));
    setSelectedTrace(null);
    setPanelTrace(null);
    setReplyTargetTrace(null);
    setFlagTargetTrace(null);
  }

  useEffect(() => {
    selectedTraceRef.current = selectedTrace;
  }, [selectedTrace]);

  useEffect(() => {
    if (selectedTrace && !rootTraces.some((trace) => trace.id === selectedTrace.id)) {
      setSelectedTrace(null);
      setPanelTrace(null);
      setReplyTargetTrace(null);
      setFlagTargetTrace(null);
    }
  }, [rootTraces, selectedTrace]);

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
    playCue("select");
    panelRevealTimer.current = window.setTimeout(() => {
      revealPanelForTrace(trace);
      panelRevealTimer.current = null;
    }, prefersReducedMotion() ? 0 : 900);
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

  function beginFlagTrace(traceId: string) {
    const flaggedTrace = traces.find((trace) => trace.id === traceId);
    if (!flaggedTrace || hiddenFlaggedTraceIds.has(traceId)) {
      return;
    }

    setReplyTargetTrace(null);
    setFlagTargetTrace(flaggedTrace);
  }

  async function submitFlagTrace(traceId: string, reason: FlagReasonKey | "", details: string) {
    const flaggedTrace = traces.find((trace) => trace.id === traceId);
    if (!flaggedTrace || hiddenFlaggedTraceIds.has(traceId)) {
      return;
    }

    const isRootTrace = !flaggedTrace.rootTraceId && !flaggedTrace.parentTraceId;
    const idsToHide = isRootTrace ? getIdsHiddenByFlag(traceId, traces) : new Set([traceId]);

    setHiddenFlaggedTraceIds((current) => {
      const next = new Set(current);
      idsToHide.forEach((id) => next.add(id));
      return next;
    });
    setNotice("");

    if (isRootTrace) {
      setSelectedTrace(null);
      setPanelTrace(null);
      setReplyTargetTrace((current) => (current?.id === traceId ? null : current));
      setIsPanelClosing(false);
      if (panelRevealTimer.current) {
        window.clearTimeout(panelRevealTimer.current);
        panelRevealTimer.current = null;
      }
      if (panelDismissTimer.current) {
        window.clearTimeout(panelDismissTimer.current);
        panelDismissTimer.current = null;
      }
    }

    if (!isUuidTraceId(traceId)) {
      return;
    }

    try {
      const response = await fetch("/api/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: traceId, reason, details }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "We could not flag that trace. Please try again.");
      }

      await loadApprovedTraces();
    } catch {
      setHiddenFlaggedTraceIds((current) => {
        const next = new Set(current);
        idsToHide.forEach((id) => next.delete(id));
        return next;
      });
      if (isRootTrace) {
        setSelectedTrace(flaggedTrace);
        setPanelTrace(flaggedTrace);
      }
      throw new Error("We could not flag that trace. Please try again.");
    }
  }

  function isUuidTraceId(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function getIdsHiddenByFlag(traceId: string, traceList: Trace[]) {
    return new Set(
      traceList
        .filter((trace) => trace.id === traceId || trace.rootTraceId === traceId || trace.parentTraceId === traceId)
        .map((trace) => trace.id),
    );
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

  function closeAboutDrawer() {
    setIsAboutOpen(false);
    window.requestAnimationFrame(() => aboutButtonRef.current?.focus());
  }

  return (
    <main className={`app-frame ${isLeavingTrace || replyTargetTrace || flagTargetTrace ? "" : "browse-frame"}`}>
      {isLeavingTrace ? (
        <>
          <SiteHeader />
          <LeaveTraceFlow
            onClose={() => setIsLeavingTrace(false)}
            onComplete={() => {
              setSelectedTrace(null);
              setPanelTrace(null);
              setIsLeavingTrace(false);
              setNotice("Your trace is now visible on the map.");
              void loadApprovedTraces();
            }}
          />
        </>
      ) : replyTargetTrace ? (
        <>
          <SiteHeader />
          <ReplyTraceFlow
            trace={replyTargetTrace}
            onClose={() => setReplyTargetTrace(null)}
            onComplete={() => {
              setReplyTargetTrace(null);
              setNotice("Your response is now visible in the thread.");
              void loadApprovedTraces();
            }}
          />
        </>
      ) : flagTargetTrace ? (
        <>
          <SiteHeader />
          <FlagTraceFlow
            trace={flagTargetTrace}
            onClose={() => setFlagTargetTrace(null)}
            onSubmit={(reason, details) => submitFlagTrace(flagTargetTrace.id, reason, details)}
          />
        </>
      ) : (
        <section
          className={`browse-shell ${isAboutOpen ? "has-about-open" : ""} ${selectedTrace ? "has-trace-selected" : ""}`}
          aria-label="Browse voice traces"
        >
          <div className="browse-content">
            <div className="view-stage" data-trace-selected={selectedTrace ? "true" : undefined}>
            {mode === "map" ? (
              <TraceMap
                traces={rootTraces}
                selectedTrace={selectedTrace}
                now={now}
                replyCountByTraceId={replyCountByTraceId}
                onSelectTrace={selectTrace}
                onClearSelection={dismissSelectedTrace}
                onTraceFocusComplete={revealPanelForTrace}
              />
            ) : (
              <TraceWorld
                traces={rootTraces}
                selectedTrace={selectedTrace}
                now={now}
                onSelectTrace={selectTrace}
                onClearSelection={dismissSelectedTrace}
              />
            )}

            {panelTrace ? (
              <ListeningPanel
                trace={panelTrace}
                replies={threadByRootId.get(panelTrace.id)?.replies ?? []}
                now={now}
                isClosing={isPanelClosing}
                onDismiss={dismissSelectedTrace}
                onReply={() => setReplyTargetTrace(panelTrace)}
                onFlag={beginFlagTrace}
              />
            ) : null}

            <button className="leave-trace-button" onClick={() => setIsLeavingTrace(true)}>
              Leave A Trace
            </button>
            </div>

            <div className="browse-gradient" aria-hidden="true" />
            <SiteHeader variant="browse" />
            <div className="top-controls">
              <ModeToggle mode={mode} onChange={setMode} />
              <NavDropdown
                label="Listen To:"
                value={listenMode}
                onChange={changeListenMode}
                options={[
                  { value: "everything", label: "Everything" },
                  { value: "emotion", label: "Emotions" },
                  { value: "confession", label: "Confessions" },
                  { value: "soundscape", label: "Soundscapes" },
                ]}
              />
              {listenMode === "everything" ? null : (
                <ThemeFilters themes={browseThemes} enabledThemes={enabledThemes} onToggle={toggleTheme} animationKey={listenMode} />
              )}
            </div>

            <footer className="site-footer browse-footer">
              <button
                ref={aboutButtonRef}
                className="about-project-button"
                type="button"
                aria-expanded={isAboutOpen}
                onClick={() => setIsAboutOpen(true)}
              >
                About This Project
              </button>
              <SoundToggle className="footer-sound-toggle" />
            </footer>

          </div>

          {notice ? <p className="submission-notice">{notice}</p> : null}
          {hasUnavailableAudio ? <p className="audio-unavailable-note">Audio previews are available after Supabase storage is connected.</p> : null}
          <p className="runtime-note" data-state={loadState}>
            {loadState === "live" ? "Live traces loaded." : "Demo traces shown until Supabase is configured."}
          </p>
          {isAboutOpen ? <AboutDrawer onClose={closeAboutDrawer} /> : null}
        </section>
      )}
    </main>
  );
}

function SiteHeader({ variant = "default" }: { variant?: "default" | "browse" }) {
  return (
    <header className={`site-header ${variant === "browse" ? "browse-header" : ""}`}>
      <div>
        <h1>TRACES</h1>
        <p>{SITE_HEADER_COPY}</p>
      </div>
    </header>
  );
}

function AboutDrawer({ onClose }: { onClose: () => void }) {
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    drawerRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === drawerRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === drawerRef.current)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <>
      <button className="about-backdrop" type="button" aria-label="Close about panel" tabIndex={-1} onClick={onClose} />
      <aside ref={drawerRef} className="about-drawer" role="dialog" aria-modal="true" aria-labelledby="about-drawer-title" tabIndex={-1}>
        <button className="about-drawer-close" type="button" aria-label="Close about panel" onClick={onClose}>
          ×
        </button>
        <div className="about-drawer-copy">
          <h2 id="about-drawer-title">About Traces</h2>
          <p>Traces exists to suggest a different way to navigate, explore and experience urban environments: not by infrastructure, but by the traces of human life and the sound of our lived-experiences within them.</p>
          <p>Music, birdsong, construction and even traffic can tell stories about places in time. Feelings of love, anxiety, anger, sadness, hope and longing linger long after our built environments change.</p>
          <p>In a time of profound noise, we hope this map gives you a reason to slow down, to linger, and to listen once more to your fellow humans. Then, should you feel compelled, to provide you a safe space to share and be listened to in turn.</p>
          <p>
            Traces is an experiment designed by{" "}
            <a href="https://www.futureswithryan.com/" target="_blank" rel="noreferrer">
              @slinkiestyew
            </a>{" "}
            and <span className="about-inline-link">Emotional Technologies Lab</span> - in collaboration with <span className="about-inline-link">@Metakovan</span>.
          </p>
        </div>
      </aside>
    </>
  );
}
