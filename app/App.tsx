"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { type Card, type Section, type SetStat, label, matches, norm, parsePaste, quickIds, ranges, slug } from "@/lib/checklist";
import AuthBox from "./AuthBox";
import AdminPanel from "./AdminPanel";

type Filter = "all" | "missing" | "have";
type LogLine = { m: string; k?: string };
const PAGE = 1000;
const localKey = (setId: string) => `setlistan:owned:${setId}`;

function readLocal(setId: string): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(localKey(setId)) || "[]"));
  } catch {
    return new Set();
  }
}
function writeLocal(setId: string, ids: Set<number>) {
  try {
    localStorage.setItem(localKey(setId), JSON.stringify([...ids]));
  } catch {}
}

// PostgREST returns at most 1000 rows per request; page through bigger results.
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

const Tick = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5 10 17 19 7" />
  </svg>
);

export default function App() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [sets, setSets] = useState<SetStat[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [owned, setOwned] = useState<Set<number>>(new Set());
  const [loadingSet, setLoadingSet] = useState(false);
  const [q, setQ] = useState("");
  const [secIdx, setSecIdx] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [find, setFind] = useState("");
  const [team, setTeam] = useState("");
  const [quick, setQuick] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "superuser" | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [fetchLog, setFetchLog] = useState<LogLine[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchDone, setFetchDone] = useState<string | null>(null);
  const [paste, setPaste] = useState<{ name: string; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [copyText, setCopyText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const uid = user?.id ?? null;

  const say = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadSets = useCallback(async () => {
    const { data } = await supabase.from("set_stats").select("*").eq("status", "ready").order("verified", { ascending: false }).order("created_at", { ascending: false });
    setSets((data as SetStat[]) || []);
  }, [supabase]);

  const loadCounts = useCallback(
    async (u: User | null) => {
      if (u) {
        const { data } = await supabase.from("my_owned_counts").select("set_id, n");
        setCounts(Object.fromEntries((data || []).map((r: { set_id: string; n: number }) => [r.set_id, r.n])));
      } else {
        const c: Record<string, number> = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)!;
            if (k.startsWith("setlistan:owned:")) c[k.slice(16)] = JSON.parse(localStorage.getItem(k) || "[]").length;
          }
        } catch {}
        setCounts(c);
      }
    },
    [supabase],
  );

  // Ticks made before signing in move to the account on the first sign-in.
  const pushLocal = useCallback(async () => {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("setlistan:owned:")) keys.push(k);
      }
      for (const k of keys) {
        const setId = k.slice(16);
        const ids: number[] = JSON.parse(localStorage.getItem(k) || "[]");
        for (let i = 0; i < ids.length; i += 500) {
          const rows = ids.slice(i, i + 500).map((card_id) => ({ card_id, set_id: setId }));
          const { error } = await supabase.from("owned").upsert(rows, { onConflict: "user_id,card_id", ignoreDuplicates: true });
          if (error) throw error;
        }
        localStorage.removeItem(k);
      }
    } catch {}
  }, [supabase]);

  const loadRole = useCallback(
    async (u: User | null) => {
      if (!u) return setRole(null);
      const { data } = await supabase.rpc("admin_role");
      setRole(data === "admin" || data === "superuser" ? data : null);
    },
    [supabase],
  );

  useEffect(() => {
    loadSets();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      loadCounts(data.user);
      loadRole(data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (event === "SIGNED_IN" && u) {
        setShowAuth(false);
        await pushLocal();
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        loadRole(u);
        if (!u) setShowAdmin(false);
      }
      loadCounts(u);
    });
    const params = new URLSearchParams(location.search);
    if (params.get("inloggning") === "misslyckades") say("Inloggningslänken fungerade inte. Begär en ny.");
    if (params.size) history.replaceState(null, "", location.pathname + location.hash);
    return () => sub.subscription.unsubscribe();
  }, [supabase, loadSets, loadCounts, loadRole, pushLocal, say]);

  // Open the set from the address (#set-id) or the first verified one.
  useEffect(() => {
    if (openId || !sets.length) return;
    const fromHash = decodeURIComponent(location.hash.slice(1));
    setOpenId(sets.some((s) => s.id === fromHash) ? fromHash : sets[0].id);
  }, [sets, openId]);

  useEffect(() => {
    if (!openId) return;
    let stop = false;
    (async () => {
      setLoadingSet(true);
      try {
        const [secs, cards] = await Promise.all([
          supabase.from("sections").select("id, code, name, position").eq("set_id", openId).order("position"),
          fetchAll<Card>((a, b) => supabase.from("cards").select("id, section_id, no, name, team, tags").eq("set_id", openId).order("section_id").order("no").range(a, b)),
        ]);
        const bySec = new Map<number, Card[]>();
        for (const c of cards) (bySec.get(c.section_id) || bySec.set(c.section_id, []).get(c.section_id)!).push(c);
        const list = ((secs.data as Omit<Section, "cards">[]) || []).map((s) => ({ ...s, cards: bySec.get(s.id) || [] }));
        let mine: Set<number>;
        if (uid) {
          const rows = await fetchAll<{ card_id: number }>((a, b) => supabase.from("owned").select("card_id").eq("set_id", openId).range(a, b));
          mine = new Set(rows.map((r) => r.card_id));
        } else mine = readLocal(openId);
        if (stop) return;
        setSections(list);
        setOwned(mine);
      } catch {
        if (!stop) say("Kunde inte läsa setet just nu.");
      } finally {
        if (!stop) setLoadingSet(false);
      }
    })();
    return () => {
      stop = true;
    };
  }, [openId, uid, supabase, say]);

  const openSet = (id: string) => {
    setOpenId(id);
    setSecIdx(0);
    setFilter("all");
    setFind("");
    setTeam("");
    setQ("");
    setConfirmDel(false);
    setCopyText(null);
    history.replaceState(null, "", "#" + id);
    setTimeout(() => document.getElementById("set")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const current = sets.find((s) => s.id === openId) || null;
  const total = sections.reduce((n, s) => n + s.cards.length, 0);
  const have = sections.reduce((n, s) => n + s.cards.filter((c) => owned.has(c.id)).length, 0);
  const pct = total ? Math.round((have / total) * 100) : 0;

  const applyOwned = async (ids: number[], on: boolean) => {
    if (!openId || !ids.length) return;
    const next = new Set(owned);
    const changed = ids.filter((id) => (on ? !next.has(id) : next.has(id)));
    changed.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setOwned(next);
    setCounts((c) => ({ ...c, [openId]: [...next].length }));
    if (!user) {
      writeLocal(openId, next);
      return changed.length;
    }
    try {
      for (let i = 0; i < changed.length; i += 500) {
        const part = changed.slice(i, i + 500);
        const { error } = on
          ? await supabase.from("owned").upsert(part.map((card_id) => ({ card_id, set_id: openId })), { onConflict: "user_id,card_id", ignoreDuplicates: true })
          : await supabase.from("owned").delete().eq("set_id", openId).in("card_id", part);
        if (error) throw error;
      }
    } catch {
      say("Kunde inte spara. Ladda om sidan och försök igen.");
    }
    return changed.length;
  };

  const runQuick = async (on: boolean) => {
    const { ids, bad } = quickIds(sections, quick);
    const n = (await applyOwned(ids, on)) ?? 0;
    say(`${n} kort ${on ? "markerade" : "avmarkerade"}${bad.length ? ` · förstod inte: ${bad.join(", ")}` : ""}`);
  };

  const missingText = () => {
    const lines = [`${current?.name} — saknade kort`];
    for (const sec of sections) {
      const miss = sec.cards.filter((c) => !owned.has(c.id));
      if (miss.length) lines.push(`${sec.name}${sec.code ? ` (${sec.code})` : ""}, ${miss.length} st: ${ranges(miss.map((c) => c.no))}`);
    }
    return lines.length > 1 ? lines.join("\n") : `${current?.name}: komplett!`;
  };
  const copyMissing = async () => {
    const t = missingText();
    try {
      await navigator.clipboard.writeText(t);
      say("Saknade kort kopierade");
    } catch {
      setCopyText(t);
    }
  };
  const downloadCsv = (onlyMissing: boolean) => {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = ["Nummer,Delset,Spelare,Lag,RC,Har"];
    for (const sec of sections)
      for (const c of sec.cards) {
        const h = owned.has(c.id);
        if (onlyMissing && h) continue;
        rows.push([esc(label(sec, c)), esc(sec.name), esc(c.name), esc(c.team), c.tags.includes("RC") ? "RC" : "", h ? "Ja" : "Nej"].join(","));
      }
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(current?.name || "set")}-${onlyMissing ? "saknade" : "setlista"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const startFetch = async (query: string) => {
    if (!query.trim()) return;
    if (!user) {
      say("Logga in för att hämta nya set.");
      setShowAuth(true);
      return;
    }
    setPaste(null);
    setFetchDone(null);
    setFetching(true);
    setFetchLog([{ m: "Startar …" }]);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const res = await fetch("/api/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim() }), signal: ctl.signal });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setFetchLog((l) => [...(l || []), { m: j.error || `Fel ${res.status}`, k: "err" }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          setFetchLog((l) => [...(l || []), { m: ev.m, k: ev.t === "error" ? "err" : ev.k }]);
          if (ev.t === "done") {
            setFetchDone(ev.setId);
            await loadSets();
          }
        }
      }
    } catch {
      setFetchLog((l) => [...(l || []), { m: ctl.signal.aborted ? "Stoppad." : "Anslutningen bröts. Setet kan ändå ha sparats, ladda om sidan.", k: "err" }]);
    } finally {
      setFetching(false);
      abortRef.current = null;
    }
  };

  const createPasted = async () => {
    if (!paste || !user) return;
    const secs = parsePaste(paste.text);
    if (!secs.length) return say("Hittade inga rader med kortnummer.");
    const name = paste.name.trim() || "Mitt set";
    const id = `${slug(name)}-${Date.now().toString(36)}`;
    try {
      let r = await supabase.from("sets").insert({ id, name, keywords: name, source: "inklistrad" });
      if (r.error) throw r.error;
      for (const [i, s] of secs.entries()) {
        const { data, error } = await supabase.from("sections").insert({ set_id: id, code: s.code, name: s.name, position: i }).select("id").single();
        if (error || !data) throw error;
        r = await supabase.from("cards").insert(s.cards.map((c) => ({ ...c, set_id: id, section_id: data.id })));
        if (r.error) throw r.error;
      }
      setPaste(null);
      await loadSets();
      openSet(id);
    } catch {
      say("Kunde inte spara setet.");
    }
  };

  const deleteSet = async () => {
    if (!current) return;
    const { error } = await supabase.from("sets").delete().eq("id", current.id);
    if (error) return say("Kunde inte ta bort setet.");
    setOpenId(null);
    setConfirmDel(false);
    await loadSets();
    say("Setet är borttaget");
  };

  // ----- derived view -----
  const hits = q.trim() ? sets.filter((s) => matches(s, q)) : [];
  const showAll = secIdx >= sections.length;
  const teams = [...new Set(sections.flatMap((s) => s.cards.map((c) => c.team)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
  const f = norm(find);
  const items: { sec: Section; c: Card; pos: string }[] = [];
  (showAll ? sections : sections.slice(secIdx, secIdx + 1)).forEach((sec) =>
    sec.cards.forEach((c, i) => {
      const h = owned.has(c.id);
      if (filter === "missing" && h) return;
      if (filter === "have" && !h) return;
      if (team && c.team !== team) return;
      if (f && !norm(`${label(sec, c)} ${c.name} ${c.team} ${c.tags.join(" ")}`).includes(f)) return;
      items.push({ sec, c, pos: `s.${Math.floor(i / 9) + 1}·${(i % 9) + 1}` });
    }),
  );
  const tagEls = (c: Card) => c.tags.map((t) => <span key={t} className={`tag ${t === "RC" ? "rc" : "fs"}`}>{t}</span>);
  const mine = current && user && (role !== null || (current.created_by === user.id && !current.verified));

  return (
    <div className="wrap">
      <div className="topbar">
        <span className="label">Samlarkort · checklistor</span>
        <div className="account">
          {user ? (
            <>
              <span>Inloggad som {user.email}</span>
              {role && (
                <button className="btn small" type="button" aria-pressed={showAdmin} onClick={() => setShowAdmin((v) => !v)}>
                  {role === "superuser" ? "Superuser" : "Admin"}
                </button>
              )}
              <button className="btn small ghost" type="button" onClick={() => supabase.auth.signOut()}>Logga ut</button>
            </>
          ) : (
            <button className="btn small primary" type="button" onClick={() => setShowAuth((v) => !v)}>Logga in</button>
          )}
        </div>
      </div>

      {showAuth && !user && <AuthBox supabase={supabase} onClose={() => setShowAuth(false)} />}
      {showAdmin && role && user && (
        <AdminPanel supabase={supabase} role={role} sets={sets} myEmail={(user.email || "").toLowerCase()} onChanged={loadSets} say={say} />
      )}

      <header className="top">
        <div className="brand">
          <h1>Setlistan</h1>
          <p>Sök fram en checklista, pricka av korten du har och se direkt vilka som fattas.</p>
        </div>
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            id="q"
            type="search"
            placeholder="T.ex. Topps Premier League Flagship 26/27 eller en adress till en checklista"
            autoComplete="off"
            aria-label="Sök set"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") hits.length ? openSet(hits[0].id) : startFetch(q);
            }}
          />
          <button className="btn big" type="button" onClick={() => { setFetchLog(null); setPaste({ name: q.trim(), text: "" }); }}>Klistra in lista</button>
        </div>
        {q.trim() && (
          <div className="results">
            {hits.map((s) => (
              <button key={s.id} className="result" type="button" onClick={() => openSet(s.id)}>
                <div className="meta">
                  <strong>{s.name}</strong>
                  <span>{s.card_count} kort · {s.section_count} delset · {counts[s.id] || 0} avprickade</span>
                </div>
                <span className={`pill ${s.verified ? "src" : ""}`}>{s.verified ? "Verifierad lista" : "Hämtad"}</span>
              </button>
            ))}
            <div className="nomatch">
              <div>
                <strong>{hits.length ? "Inte rätt set?" : "Inget set i biblioteket matchar."}</strong> Claude kan leta upp checklistan på nätet och lägga in den i biblioteket. Du kan också klistra in en adress till en checklista i sökfältet.
              </div>
              <div className="row">
                <button className="btn primary" type="button" disabled={fetching} onClick={() => startFetch(q)}>Hämta “{q.trim()}” med Claude</button>
                {!user && <span className="note">Kräver inloggning, max 5 hämtningar per dygn.</span>}
              </div>
            </div>
          </div>
        )}
      </header>

      {fetchLog && (
        <section className="panel">
          <h3>Hämtar setlista</h3>
          <div className="log">{fetchLog.map((l, i) => <div key={i} className={l.k || ""}>{l.m}</div>)}</div>
          <div className="actions">
            {fetching && <button className="btn" type="button" onClick={() => abortRef.current?.abort()}>Stoppa</button>}
            {fetchDone && <button className="btn primary" type="button" onClick={() => { setFetchLog(null); openSet(fetchDone); }}>Öppna setet</button>}
            {!fetching && <button className="btn ghost" type="button" onClick={() => setFetchLog(null)}>Stäng</button>}
          </div>
        </section>
      )}

      {paste && (
        <section className="panel">
          <h3>Klistra in checklista</h3>
          {!user && <div className="note warn">Logga in för att spara inklistrade set i biblioteket.</div>}
          <input type="text" placeholder="Setets namn, t.ex. Topps Chrome Premier League 25/26" value={paste.name} onChange={(e) => setPaste({ ...paste, name: e.target.value })} />
          <textarea
            placeholder={"En rad per kort. Exempel:\n1 Max Dowman, Arsenal\n23 Jaden Dixon - Arsenal RC\nBM 1 | Max Dowman | Arsenal\n### Gold Lion\nGL 4 Morgan Rogers, Aston Villa"}
            value={paste.text}
            onChange={(e) => setPaste({ ...paste, text: e.target.value })}
          />
          <div className="note">
            {(() => {
              const s = parsePaste(paste.text);
              return s.length ? `Hittade ${s.reduce((n, x) => n + x.cards.length, 0)} kort i ${s.length} delset.` : "Nummerprefix (BM, GL …) blir egna delset. En rad som börjar med ### ger delsetet ett namn.";
            })()}
          </div>
          <div className="actions">
            <button className="btn primary" type="button" disabled={!user} onClick={createPasted}>Skapa set</button>
            <button className="btn ghost" type="button" onClick={() => setPaste(null)}>Avbryt</button>
          </div>
        </section>
      )}

      <section>
        <div className="label" style={{ marginBottom: 10 }}>Biblioteket</div>
        <div className="shelf">
          {sets.map((s) => {
            const n = counts[s.id] || 0;
            const p = s.card_count ? Math.round((n / s.card_count) * 100) : 0;
            return (
              <button key={s.id} className={`shelf-item ${s.id === openId ? "active" : ""}`} type="button" onClick={() => openSet(s.id)}>
                <span className={`pill ${s.verified ? "src" : ""}`}>{s.verified ? "Verifierad lista" : s.source === "inklistrad" ? "Inklistrad" : "Hämtad av Claude"}</span>
                <strong>{s.short_name || s.name}</strong>
                <div className="bar"><i style={{ width: `${p}%` }} /></div>
                <span className="sub mono">{n} / {s.card_count} · {p} %</span>
              </button>
            );
          })}
          {!sets.length && <div className="empty">Läser biblioteket …</div>}
        </div>
      </section>

      {current && (
        <section className="set" id="set">
          <div className="set-head">
            <div>
              <div className="label">{current.verified ? "Verifierad checklista" : current.source === "inklistrad" ? "Inklistrad checklista" : `Hämtad av Claude${current.source ? " från " + current.source.replace(/^https?:\/\//, "").split("/")[0] : ""}`}</div>
              <h2>{current.name}</h2>
              <div className="sub">{sections.length} delset · {total} kort{current.notes ? ` · ${current.notes}` : ""}</div>
            </div>
            <div className="tally">
              <div className="num mono">{have}<small> / {total}</small></div>
              <div className="label">{total - have} saknas · {pct} %</div>
            </div>
          </div>
          <div className="bar big-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="actions">
            <button className="btn" type="button" onClick={copyMissing}>Kopiera saknade</button>
            <button className="btn" type="button" onClick={() => downloadCsv(true)}>Ladda ner saknade (CSV)</button>
            <button className="btn" type="button" onClick={() => downloadCsv(false)}>Ladda ner hela setlistan</button>
            {mine && <button className="btn ghost danger" type="button" onClick={() => setConfirmDel(true)}>Ta bort set</button>}
          </div>
          {!user && <div className="note">Du är inte inloggad. Avprickningarna sparas i den här webbläsaren och flyttas till ditt konto när du loggar in.</div>}
          {confirmDel && (
            <div className="confirm">
              <span>Ta bort <b>{current.name}</b> ur biblioteket? Det tar också bort allas avprickningar för setet.</span>
              <button className="btn danger" type="button" onClick={deleteSet}>Ta bort</button>
              <button className="btn ghost" type="button" onClick={() => setConfirmDel(false)}>Behåll</button>
            </div>
          )}
          {copyText && (
            <div className="panel">
              <div className="note">Kopiera texten nedan:</div>
              <textarea readOnly value={copyText} onFocus={(e) => e.target.select()} autoFocus />
            </div>
          )}

          <div className="sections" role="toolbar" aria-label="Delset">
            {sections.map((s, i) => {
              const hs = s.cards.filter((c) => owned.has(c.id)).length;
              return (
                <button key={s.id} className={`sec ${hs === s.cards.length && hs ? "done" : ""}`} type="button" aria-pressed={i === secIdx} onClick={() => setSecIdx(i)}>
                  <b>{s.name}</b>
                  <small>{s.code ? `${s.code} · ` : ""}{hs}/{s.cards.length}</small>
                </button>
              );
            })}
            <button className="sec" type="button" aria-pressed={showAll} onClick={() => setSecIdx(sections.length)}>
              <b>Alla delset</b>
              <small>{have}/{total}</small>
            </button>
          </div>

          <div className="controls">
            <div className="seg" role="group" aria-label="Visa">
              {(["all", "missing", "have"] as Filter[]).map((k) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{{ all: "Alla", missing: "Saknas", have: "Har" }[k]}</button>
              ))}
            </div>
            <input type="search" placeholder="Spelare, lag eller nummer" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Sök i setet" />
            <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Lag">
              <option value="">Alla lag</option>
              {teams.map((t) => <option key={t}>{t}</option>)}
            </select>
            <div className="seg" role="group" aria-label="Vy">
              <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>Pärm</button>
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Lista</button>
            </div>
          </div>

          <div className="quick">
            <input type="text" placeholder="Snabbmarkera: 1-20, 45, BM 3, GL 1-5" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runQuick(true)} aria-label="Snabbmarkera kortnummer" />
            <button className="btn" type="button" onClick={() => runQuick(true)}>Markera som mina</button>
            <button className="btn ghost" type="button" onClick={() => runQuick(false)}>Avmarkera</button>
            <span className="hint">Siffror utan prefix gäller bas-setet. “s.3·5” på korten är pärmsida och fack med nio kort per sida.</span>
          </div>

          {loadingSet && !sections.length ? (
            <div className="empty">Läser korten …</div>
          ) : !items.length ? (
            <div className="empty">{filter === "missing" ? "Inga saknade kort här. Snyggt!" : filter === "have" ? "Du har inte prickat av några kort här än. Klicka på ett kort för att markera det." : "Inga kort matchar sökningen."}</div>
          ) : view === "grid" ? (
            <div className="grid">
              {items.map(({ sec, c, pos }) => (
                <button key={c.id} className="card" type="button" aria-pressed={owned.has(c.id)} onClick={() => applyOwned([c.id], !owned.has(c.id))}>
                  <span className="no">{label(sec, c)}</span>
                  <span className="pos" title="Pärmsida · fack">{pos}</span>
                  <span className="name">{c.name}</span>
                  <span className="team">{c.team}</span>
                  <span className="tags">{tagEls(c)}</span>
                  <span className="tick"><Tick /></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="list">
              {items.map(({ sec, c }) => (
                <button key={c.id} className="lrow" type="button" aria-pressed={owned.has(c.id)} onClick={() => applyOwned([c.id], !owned.has(c.id))}>
                  <span className="box">{owned.has(c.id) && <Tick />}</span>
                  <span className="n">{label(sec, c)}</span>
                  <span className="nm">{c.name} {tagEls(c)}</span>
                  <span className="tm">{c.team}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <footer>Checklistorna kommer från öppna källor som anges på varje set. Hämtade listor kan innehålla fel.</footer>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
