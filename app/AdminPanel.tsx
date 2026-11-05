"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type SetStat, SPORTS, matches } from "@/lib/checklist";

type Overview = { users: number; collectors: number; owned: number; sets: number; fetches_24h: number; fetch_cost_month: number; tradera_calls_24h: number };
type Job = { id: number; query: string; status: string; error: string | null; set_id: string | null; created_at: string; cost_usd: number };
type Wait = { id: string; name: string; email: string; invited_at: string | null; created_at: string };
type Fb = { id: string; email: string | null; kind: string; page: string | null; text: string; handled_at: string | null; created_at: string };
type ImportSet = {
  id: string;
  name: string;
  sport: string;
  source: string;
  source_urls: string[];
  notes: string;
  keywords: string;
  sections: { code: string; name: string; cards: { no: number; name: string; team: string; tags: string[] }[] }[];
  parallels?: { section_code: string; name: string; print_run: number | null; position: number }[];
};
type Sug = { id: string; email: string | null; query: string; status: "ny" | "klar" | "avvisad"; created_at: string };
type Th = { id: number; key: string; ctx: string; sold: number; median: number | null; from_cache: boolean; created_at: string };
type Admin = { email: string; role: "admin" | "superuser"; added_at: string };

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

export default function AdminPanel({
  supabase,
  role,
  sets,
  myEmail,
  onChanged,
  say,
}: {
  supabase: SupabaseClient;
  role: "admin" | "superuser";
  sets: SetStat[];
  myEmail: string;
  onChanged: () => Promise<void>;
  say: (m: string) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "superuser">("admin");

  // Tradera history: searches (no user information) and the sold auctions saved so far.
  const [th, setTh] = useState<{ rows: Th[]; searches: number; cached: number; auctions: number }>({ rows: [], searches: 0, cached: 0, auctions: 0 });
  // Set suggestions from users: new ones first.
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [showDone, setShowDone] = useState(false);
  const setSug = async (id: string, status: Sug["status"]) => {
    const { error } = await supabase.from("set_suggestions").update({ status, handled_at: status === "ny" ? null : new Date().toISOString() }).eq("id", id);
    if (error) return say("Kunde inte ändra förslaget.");
    await load();
  };
  const delSug = async (id: string) => {
    const { error } = await supabase.from("set_suggestions").delete().eq("id", id);
    if (error) return say("Kunde inte ta bort förslaget.");
    await load();
  };
  const sugNew = sugs.filter((x) => x.status === "ny");
  // Library to-do list (not verified) with bulk verification, and the archive of verified sets.
  const [libQ, setLibQ] = useState("");
  const [libSport, setLibSport] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const fits = (s: SetStat) => (!libSport || s.sport === libSport) && (!libQ.trim() || matches(s, libQ));
  const todo = sets.filter((s) => !s.verified && fits(s));
  const archive = sets.filter((s) => s.verified && fits(s));
  const todoTotal = sets.filter((s) => !s.verified).length;
  const SHOW_MAX = 150;
  const toggleSel = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const bulkSet = async (ids: string[], verified: boolean) => {
    if (!ids.length) return;
    setBulkBusy(true);
    let failed = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from("sets").update({ verified }).in("id", ids.slice(i, i + 100));
      if (error) failed += Math.min(100, ids.length - i);
    }
    setSel(new Set());
    setConfirmBulk(false);
    await onChanged();
    setBulkBusy(false);
    say(failed ? `${failed} set kunde inte ändras.` : verified ? `${ids.length} set verifierade och flyttade till arkivet` : `${ids.length} set flyttade tillbaka från arkivet`);
  };
  const [importMsg, setImportMsg] = useState("");
  const [importing, setImporting] = useState(false);

  // Imports a JSON file of sets (see Claude-hub/data): sets that already exist are left alone.
  const importFile = async (file: File) => {
    setImporting(true);
    try {
      const data = JSON.parse(await file.text()) as ImportSet[];
      if (!Array.isArray(data)) throw new Error("Filen har fel format.");
      const have = new Set((await supabase.from("sets").select("id")).data?.map((r: { id: string }) => r.id) ?? []);
      let done = 0;
      let skipped = 0;
      let failed = 0;
      let cards = 0;
      for (const s of data) {
        setImportMsg(`Importerar ${done + skipped + failed + 1} av ${data.length}: ${s.name}`);
        if (have.has(s.id)) {
          skipped++;
          continue;
        }
        const ins = await supabase.from("sets").insert({ id: s.id, name: s.name, keywords: s.keywords, source: s.source, source_urls: s.source_urls, notes: s.notes, sport: s.sport, verified: false, status: "ready" });
        if (ins.error) {
          failed++;
          continue;
        }
        const secs = await supabase.from("sections").insert(s.sections.map((x, i) => ({ set_id: s.id, code: x.code, name: x.name, position: i }))).select("id, code");
        if (secs.error || !secs.data) {
          await supabase.from("sets").delete().eq("id", s.id);
          failed++;
          continue;
        }
        const byCode = new Map<string, number>(secs.data.map((r: { id: number; code: string }): [string, number] => [r.code, r.id]));
        const rows = s.sections.flatMap((x) => x.cards.map((c) => ({ set_id: s.id, section_id: byCode.get(x.code), no: c.no, name: c.name, team: c.team, tags: c.tags })));
        let ok = true;
        for (let i = 0; i < rows.length && ok; i += 500) {
          const r = await supabase.from("cards").insert(rows.slice(i, i + 500));
          if (r.error) ok = false;
        }
        const pars = (s.parallels ?? []).map((p) => ({ set_id: s.id, section_id: byCode.get(p.section_code) ?? null, name: p.name, print_run: p.print_run, position: p.position }));
        for (let i = 0; i < pars.length && ok; i += 500) {
          const r = await supabase.from("parallels").insert(pars.slice(i, i + 500));
          if (r.error) ok = false;
        }
        if (!ok) {
          await supabase.from("sets").delete().eq("id", s.id);
          failed++;
          continue;
        }
        done++;
        cards += rows.length;
      }
      setImportMsg(`Klart: ${done} set importerade (${cards} kort), ${skipped} fanns redan, ${failed} misslyckades.`);
      await onChanged();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Importen misslyckades.");
    } finally {
      setImporting(false);
    }
  };
  const [news, setNews] = useState<{ id: string; title: string; created_at: string }[]>([]);
  const [nTitle, setNTitle] = useState("");
  const [nBody, setNBody] = useState("");
  const postNews = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("app_updates").insert({ title: nTitle.trim(), body: nBody.trim() });
    if (error) return say("Kunde inte publicera uppdateringen.");
    setNTitle("");
    setNBody("");
    await load();
    say("Uppdateringen är publicerad");
  };
  const delNews = async (id: string) => {
    const { error } = await supabase.from("app_updates").delete().eq("id", id);
    if (error) return say("Kunde inte ta bort.");
    await load();
  };
  const [wait, setWait] = useState<Wait[]>([]);
  const [fb, setFb] = useState<Fb[]>([]);

  const invite = async (w: Wait) => {
    const r = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: w.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return say(j.error || "Kunde inte bjuda in.");
    await load();
    say(`Inbjudan skickad till ${w.email}`);
  };
  const delWait = async (id: string) => {
    const { error } = await supabase.from("waitlist").delete().eq("id", id);
    if (error) return say("Kunde inte ta bort.");
    await load();
  };
  const handled = async (f: Fb) => {
    const { error } = await supabase.from("feedback").update({ handled_at: f.handled_at ? null : new Date().toISOString() }).eq("id", f.id);
    if (error) return say("Kunde inte ändra.");
    await load();
  };

  const load = useCallback(async () => {
    const [ts, tsAll, tsCached, tAuc] = await Promise.all([
      supabase.from("tradera_searches").select("id, key, ctx, sold, median, from_cache, created_at").order("created_at", { ascending: false }).limit(40),
      supabase.from("tradera_searches").select("id", { count: "exact", head: true }),
      supabase.from("tradera_searches").select("id", { count: "exact", head: true }).eq("from_cache", true),
      supabase.from("tradera_auctions").select("item_id", { count: "exact", head: true }),
    ]);
    setTh({ rows: (ts.data as Th[]) || [], searches: tsAll.count ?? 0, cached: tsCached.count ?? 0, auctions: tAuc.count ?? 0 });
    const sg = await supabase.from("set_suggestions").select("id, email, query, status, created_at").order("created_at", { ascending: false }).limit(200);
    setSugs((sg.data as Sug[]) || []);
    const nw = await supabase.from("app_updates").select("id, title, created_at").order("created_at", { ascending: false }).limit(20);
    setNews((nw.data as { id: string; title: string; created_at: string }[]) || []);
    const [w, f] = await Promise.all([
      supabase.from("waitlist").select("id, name, email, invited_at, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("feedback").select("id, email, kind, page, text, handled_at, created_at").order("created_at", { ascending: false }).limit(100),
    ]);
    setWait((w.data as Wait[]) || []);
    setFb((f.data as Fb[]) || []);
    const [o, j, a] = await Promise.all([
      supabase.rpc("admin_overview"),
      supabase.from("fetch_jobs").select("id, query, status, error, set_id, created_at, cost_usd").order("created_at", { ascending: false }).limit(30),
      supabase.from("admins").select("email, role, added_at").order("added_at"),
    ]);
    if (o.data) setOverview(o.data as Overview);
    setJobs((j.data as Job[]) || []);
    setAdmins((a.data as Admin[]) || []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const setVerified = async (s: SetStat, verified: boolean) => {
    const { error } = await supabase.from("sets").update({ verified }).eq("id", s.id);
    if (error) return say("Kunde inte ändra setet.");
    await onChanged();
    say(verified ? "Setet är markerat som verifierat" : "Verifieringen är borttagen");
  };
  const rename = async (s: SetStat, name: string) => {
    if (!name.trim() || name.trim() === s.name) return;
    const { error } = await supabase.from("sets").update({ name: name.trim() }).eq("id", s.id);
    if (error) return say("Kunde inte byta namn.");
    await onChanged();
    say("Namnet är ändrat");
  };
  const setSport = async (s: SetStat, sport: string) => {
    const { error } = await supabase.from("sets").update({ sport }).eq("id", s.id);
    if (error) return say("Kunde inte byta sport.");
    await onChanged();
    say("Sporten är ändrad");
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("sets").delete().eq("id", id);
    setConfirmId(null);
    if (error) return say("Kunde inte ta bort setet.");
    await Promise.all([onChanged(), load()]);
    say("Setet är borttaget");
  };
  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    const { error } = await supabase.from("admins").upsert({ email, role: newRole });
    if (error) return say("Kunde inte lägga till admin.");
    setNewEmail("");
    await load();
    say(`${email} är nu ${newRole === "superuser" ? "superuser" : "admin"}`);
  };
  const removeAdmin = async (email: string) => {
    const { error } = await supabase.from("admins").delete().eq("email", email);
    if (error) return say("Kunde inte ta bort admin.");
    await load();
    say(`${email} är inte längre admin`);
  };

  return (
    <section className="panel admin" aria-label="Administration">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Administration</h3>
        <span className="pill src">{role === "superuser" ? "Superuser" : "Admin"}</span>
      </div>

      {overview && (
        <div className="stats">
          <div><b className="mono">{overview.users}</b><span>konton</span></div>
          <div><b className="mono">{overview.collectors}</b><span>samlar aktivt</span></div>
          <div><b className="mono">{overview.owned}</b><span>avprickade kort</span></div>
          <div><b className="mono">{overview.sets}</b><span>set i biblioteket</span></div>
          <div><b className="mono">{overview.fetches_24h}</b><span>hämtningar senaste dygnet</span></div>
          <div><b className="mono">${Number(overview.fetch_cost_month).toFixed(2)}</b><span>hämtkostnad denna månad</span></div>
          <div><b className="mono">{overview.tradera_calls_24h}/5000</b><span>Tradera-anrop senaste dygnet</span></div>
        </div>
      )}

      <div className="label">Önskade set ({sugNew.length} nya)</div>
      {sugNew.length ? (
        <div className="admin-table">
          {sugNew.map((x) => (
            <div key={x.id} className="admin-row">
              <span className="mono note">{when(x.created_at)}</span>
              <span className="grow"><b>{x.query}</b>{x.email ? ` · ${x.email}` : ""}</span>
              <button className="btn small" type="button" onClick={() => setSug(x.id, "klar")}>Klart</button>
              <button className="btn small ghost" type="button" onClick={() => setSug(x.id, "avvisad")}>Avvisa</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="note">Inga nya förslag. Användarna föreslår set när de inte hittar det de söker.</div>
      )}
      {sugs.length > sugNew.length && (
        <>
          <button className="btn small ghost" type="button" onClick={() => setShowDone((v) => !v)}>{showDone ? "Dölj hanterade" : `Visa hanterade (${sugs.length - sugNew.length})`}</button>
          {showDone && (
            <div className="admin-table">
              {sugs.filter((x) => x.status !== "ny").map((x) => (
                <div key={x.id} className="admin-row">
                  <span className="mono note">{when(x.created_at)}</span>
                  <span className="grow">{x.query}{x.email ? ` · ${x.email}` : ""}</span>
                  <span className="pill">{x.status === "klar" ? "Klart" : "Avvisad"}</span>
                  <button className="btn small ghost" type="button" onClick={() => setSug(x.id, "ny")}>Öppna igen</button>
                  <button className="btn small ghost danger" type="button" onClick={() => delSug(x.id)}>Ta bort</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="label">Biblioteket · att granska ({todoTotal})</div>
      <div className="row">
        <input className="grow" type="search" placeholder="Sök set, till exempel Prizm eller Bundesliga" aria-label="Sök bland seten" value={libQ} onChange={(e) => setLibQ(e.target.value)} />
        <select aria-label="Sport" value={libSport} onChange={(e) => setLibSport(e.target.value)}>
          <option value="">Alla sporter</option>
          {SPORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </div>
      <div className="bulkbar">
        <label className="check">
          <input type="checkbox" checked={todo.length > 0 && todo.every((s) => sel.has(s.id))} onChange={(e) => setSel(e.target.checked ? new Set(todo.map((s) => s.id)) : new Set())} /> Markera alla ({todo.length})
        </label>
        {confirmBulk ? (
          <>
            <span>Verifiera {sel.size} set och flytta dem till arkivet?</span>
            <button className="btn small primary" type="button" disabled={bulkBusy} onClick={() => bulkSet([...sel], true)}>{bulkBusy ? "Verifierar …" : "Ja, verifiera"}</button>
            <button className="btn small ghost" type="button" onClick={() => setConfirmBulk(false)}>Avbryt</button>
          </>
        ) : (
          <button className="btn small primary" type="button" disabled={!sel.size || bulkBusy} onClick={() => setConfirmBulk(true)}>Verifiera markerade ({sel.size})</button>
        )}
      </div>
      <div className="admin-table">
        {todo.slice(0, SHOW_MAX).map((s) => (
          <div key={s.id} className="admin-row">
            <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggleSel(s.id)} aria-label={`Markera ${s.name}`} />
            <input aria-label={`Namn på ${s.name}`} defaultValue={s.name} onBlur={(e) => rename(s, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            <select aria-label={`Sport för ${s.name}`} value={s.sport} onChange={(e) => setSport(s, e.target.value)}>
              {SPORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <span className="note mono">{s.card_count} kort</span>
            <button className="btn small" type="button" onClick={() => setVerified(s, true)}>Verifiera</button>
            {confirmId === s.id ? (
              <span className="row">
                <button className="btn small danger" type="button" onClick={() => remove(s.id)}>Ta bort för gott</button>
                <button className="btn small ghost" type="button" onClick={() => setConfirmId(null)}>Avbryt</button>
              </span>
            ) : (
              <button className="btn small ghost danger" type="button" onClick={() => setConfirmId(s.id)}>Ta bort</button>
            )}
          </div>
        ))}
        {!todo.length && <div className="admin-row note">{todoTotal ? "Inga set matchar." : "Allt är verifierat. Snyggt!"}</div>}
      </div>
      {todo.length > SHOW_MAX && <div className="note">Visar {SHOW_MAX} av {todo.length}. Markera alla verifierar samtliga {todo.length}, även de som inte syns. Sök för att begränsa.</div>}

      <details className="archive">
        <summary>Arkivet: verifierade set ({sets.filter((s) => s.verified).length})</summary>
        <div className="note">Verifierade set är klara att använda. Ta ur arkivet om något behöver ses över igen.</div>
        <div className="admin-table">
          {archive.slice(0, SHOW_MAX).map((s) => (
            <div key={s.id} className="admin-row">
              <span className="grow">{s.name}</span>
              <span className="note mono">{s.card_count} kort</span>
              <button className="btn small ghost" type="button" onClick={() => bulkSet([s.id], false)}>Ta ur arkivet</button>
            </div>
          ))}
          {!archive.length && <div className="admin-row note">Inget i arkivet än.</div>}
        </div>
        {archive.length > SHOW_MAX && <div className="note">Visar {SHOW_MAX} av {archive.length}. Sök för att hitta fler.</div>}
      </details>

      <div className="label">Importera set från fil</div>
      <div className="row">
        <input type="file" accept="application/json,.json" disabled={importing} aria-label="Välj JSON-fil med set" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
      </div>
      {importMsg && <div className="note">{importMsg}</div>}

      <div className="label">Tradera-historik</div>
      <div className="stats">
        <div><b className="mono">{th.searches}</b><span>sökningar sparade</span></div>
        <div><b className="mono">{th.searches ? Math.round((th.cached / th.searches) * 100) : 0} %</b><span>besvarade ur sparat svar</span></div>
        <div><b className="mono">{th.auctions}</b><span>sålda auktioner sparade</span></div>
      </div>
      {th.rows.length ? (
        <div className="admin-table">
          {th.rows.map((r) => (
            <div key={r.id} className="admin-row">
              <span className="mono note">{when(r.created_at)}</span>
              <span className="grow"><b>{r.key.replace(/^sold:/, "")}</b>{r.ctx ? ` · ${r.ctx}` : ""}</span>
              <span className="note mono">{r.sold} sålda{r.median ? ` · median ${r.median} kr` : ""}</span>
              <span className={`pill ${r.from_cache ? "src" : ""}`}>{r.from_cache ? "Sparat" : "Tradera"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="note">Inga sökningar sparade än. Historiken fylls på när någon söker på Tradera. Ingen information om vem som söker sparas.</div>
      )}

      <div className="label">Senaste hämtningar</div>
      {jobs.length ? (
        <div className="admin-table">
          {jobs.map((j) => (
            <div key={j.id} className="admin-row">
              <span className="mono note">{when(j.created_at)}</span>
              <span className="grow">{j.query}</span>
              <span className={`pill ${j.status === "done" ? "src" : ""}`}>{{ done: "Klar", failed: "Misslyckad", running: "Pågår" }[j.status] || j.status}</span>
              {Number(j.cost_usd) > 0 && <span className="note mono">≈ ${Number(j.cost_usd).toFixed(2)}</span>}
              {j.error && <span className="note warn">{j.error}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="note">Inga hämtningar än.</div>
      )}

      <div className="label">Nytt i Setlistan</div>
      <form className="row" onSubmit={postNews}>
        <input className="grow" required maxLength={120} placeholder="Rubrik" aria-label="Rubrik" value={nTitle} onChange={(e) => setNTitle(e.target.value)} />
        <input className="grow" required maxLength={1000} placeholder="Vad är nytt?" aria-label="Text" value={nBody} onChange={(e) => setNBody(e.target.value)} />
        <button className="btn small primary" type="submit">Publicera</button>
      </form>
      {news.length > 0 && (
        <div className="admin-table">
          {news.map((n) => (
            <div key={n.id} className="admin-row">
              <span className="mono note">{when(n.created_at)}</span>
              <span className="grow">{n.title}</span>
              <button className="btn small ghost danger" type="button" onClick={() => delNews(n.id)}>Ta bort</button>
            </div>
          ))}
        </div>
      )}

      <div className="label">Väntelista ({wait.length})</div>
      {wait.length ? (
        <div className="admin-table">
          {wait.map((w) => (
            <div key={w.id} className="admin-row">
              <span className="mono note">{when(w.created_at)}</span>
              <span className="grow">{w.name} · {w.email}</span>
              {w.invited_at ? <span className="pill src">Inbjuden</span> : null}
              <button className="btn small" type="button" onClick={() => invite(w)}>{w.invited_at ? "Bjud in igen" : "Bjud in"}</button>
              <button className="btn small ghost danger" type="button" onClick={() => delWait(w.id)}>Ta bort</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="note">Ingen på väntelistan än.</div>
      )}

      <div className="label">Feedback ({fb.filter((f) => !f.handled_at).length} ohanterad)</div>
      {fb.length ? (
        <div className="admin-table">
          {fb.map((f) => (
            <div key={f.id} className="admin-row">
              <span className="mono note">{when(f.created_at)}</span>
              <span className="pill">{{ idea: "Idé", bug: "Fel", other: "Annat" }[f.kind] || f.kind}</span>
              <span className="grow" style={{ whiteSpace: "pre-wrap" }}>{f.text}{f.email ? ` — ${f.email}` : ""}</span>
              <button className="btn small ghost" type="button" onClick={() => handled(f)}>{f.handled_at ? "Öppna igen" : "Klar"}</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="note">Ingen feedback än.</div>
      )}

      <div className="label">Administratörer</div>
      <div className="admin-table">
        {admins.map((a) => (
          <div key={a.email} className="admin-row">
            <span className="grow">{a.email}</span>
            <span className="pill">{a.role === "superuser" ? "Superuser" : "Admin"}</span>
            {role === "superuser" && a.email !== myEmail && (
              <button className="btn small ghost danger" type="button" onClick={() => removeAdmin(a.email)}>Ta bort</button>
            )}
          </div>
        ))}
      </div>
      {role === "superuser" ? (
        <form className="row" onSubmit={addAdmin}>
          <input className="grow" type="email" required placeholder="namn@epost.se" aria-label="E-post för ny admin" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <select aria-label="Roll" value={newRole} onChange={(e) => setNewRole(e.target.value as "admin" | "superuser")}>
            <option value="admin">Admin</option>
            <option value="superuser">Superuser</option>
          </select>
          <button className="btn small primary" type="submit">Lägg till</button>
        </form>
      ) : (
        <div className="note">Bara en superuser kan lägga till eller ta bort administratörer.</div>
      )}
      <div className="note">Rollen gäller först när personen har loggat in med en bekräftad e-postadress.</div>
    </section>
  );
}
