"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListeningPanel } from "@/components/ListeningPanel";
import { NavDropdown } from "@/components/ModeToggle";
import { ThemeFilters } from "@/components/ThemeFilters";
import { getSupabaseClient, isClientSupabaseConfigured } from "@/lib/supabaseClient";
import { getBrowseThemesForCategory, getTraceTheme, isTraceReply, type ThemeKey, type Trace, type TraceCategory, normalizeTrace } from "@/lib/traces";

export function AdminApp() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
  const [adminListenCategory, setAdminListenCategory] = useState<TraceCategory>("emotion");
  const [enabledThemes, setEnabledThemes] = useState<Set<ThemeKey>>(() => new Set(getBrowseThemesForCategory("emotion").map((theme) => theme.key)));
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token ?? null;
      setToken(accessToken);
      if (accessToken) {
        void loadTraces(accessToken);
      }
    });
  }, [supabase]);

  async function login() {
    if (!supabase) {
      setMessage("Add Supabase environment variables before using admin.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session?.access_token) {
      setMessage(error?.message ?? "Could not sign in.");
      return;
    }

    setToken(data.session.access_token);
    setMessage("");
    await loadTraces(data.session.access_token);
  }

  async function loadTraces(accessToken: string) {
    const response = await fetch("/api/admin/traces", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      setMessage("This login is not allowed to review traces.");
      return;
    }
    const data = (await response.json()) as { traces: Record<string, unknown>[] };
    const normalized = data.traces.map((row) => normalizeTrace(row));
    setTraces(normalized);
    setSelectedTrace(null);
  }

  async function reviewTrace(trace: Trace, status: "approved" | "rejected") {
    if (!token) {
      return;
    }

    const response = await fetch(`/api/admin/traces/${trace.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setMessage("Could not update this trace.");
      return;
    }

    await loadTraces(token);
  }

  const adminThemes = useMemo(() => getBrowseThemesForCategory(adminListenCategory), [adminListenCategory]);
  const filteredTraces = useMemo(
    () => traces.filter((trace) => trace.category === adminListenCategory && enabledThemes.has(trace.theme)),
    [adminListenCategory, enabledThemes, traces],
  );

  useEffect(() => {
    if (!selectedTrace || !filteredTraces.some((trace) => trace.id === selectedTrace.id)) {
      setSelectedTrace(filteredTraces.find((trace) => trace.status === "pending") ?? filteredTraces[0] ?? null);
    }
  }, [filteredTraces, selectedTrace]);

  function changeAdminCategory(category: TraceCategory) {
    setAdminListenCategory(category);
    setEnabledThemes(new Set(getBrowseThemesForCategory(category).map((theme) => theme.key)));
    setSelectedTrace(null);
  }

  return (
    <main className="app-frame admin-frame">
      <header className="site-header">
        <div>
          <h1>_TRACES</h1>
          <p>Admin listening room.</p>
        </div>
        <Link className="admin-back" href="/">
          Map
        </Link>
      </header>

      {!isClientSupabaseConfigured() || !token ? (
        <section className="admin-login">
          <h2>Admin</h2>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
          <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
          <button className="primary-action" onClick={login}>
            Unlock
          </button>
          <p>{message || "Only allowlisted Supabase users can approve public traces."}</p>
        </section>
      ) : (
        <section className="admin-console">
          <div className="admin-filter-row">
          <NavDropdown
            label="Listen To:"
            value={adminListenCategory}
            onChange={changeAdminCategory}
            options={[
              { value: "emotion", label: "Emotions" },
              { value: "confession", label: "Confessions" },
              { value: "soundscape", label: "Soundscapes" },
            ]}
          />
          <ThemeFilters
            themes={adminThemes}
            enabledThemes={enabledThemes}
            animationKey={adminListenCategory}
            onToggle={(theme) => {
              setEnabledThemes((current) => {
                const next = new Set(current);
                if (next.has(theme)) {
                  next.delete(theme);
                } else {
                  next.add(theme);
                }
                return next;
              });
            }}
          />
          </div>

          <div className="admin-layout">
            <div className="review-list">
              {filteredTraces.map((trace) => (
                <button
                  key={trace.id}
                  className={selectedTrace?.id === trace.id ? "is-selected" : ""}
                  onClick={() => setSelectedTrace(trace)}
                >
                  <span>
                    {isTraceReply(trace)
                      ? `response / ${getTraceTheme(trace.theme).label}`
                      : trace.category === "soundscape"
                        ? `soundscape / ${getTraceTheme(trace.theme).label}`
                        : `${trace.category} / ${getTraceTheme(trace.theme).label}`}
                  </span>
                  <strong>{trace.displayName}</strong>
                  <em>{trace.status}</em>
                </button>
              ))}
            </div>

            <div className="review-detail">
              {selectedTrace ? (
                <>
                  {selectedTrace.flagReasonLabel || selectedTrace.flagDetails ? (
                    <div className="flag-review-note">
                      <strong>Flagged for manual moderation</strong>
                      {selectedTrace.flagReasonLabel ? <span>Reason: {selectedTrace.flagReasonLabel}</span> : null}
                      {selectedTrace.flagDetails ? <p>{selectedTrace.flagDetails}</p> : null}
                    </div>
                  ) : null}
                  <ListeningPanel trace={selectedTrace} token={token} />
                  <div className="review-actions">
                    <button onClick={() => reviewTrace(selectedTrace, "approved")}>Approve</button>
                    <button onClick={() => reviewTrace(selectedTrace, "rejected")}>Reject</button>
                  </div>
                </>
              ) : (
                <p>No traces to review.</p>
              )}
              {message ? <p className="flow-message">{message}</p> : null}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
