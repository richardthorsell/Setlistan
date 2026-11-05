"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type SetStat, SPORTS } from "@/lib/checklist";

type Overview = { users: number; collectors: number; owned: number; sets: number; fetches_24h: number; fetch_cost_month: number; tradera_calls_24h: number };
type Job = { id: number; query: string; status: string; error: string | null; set_id: string | null; created_at: string; cost_usd: number };
type Wait = { id: string; name: string; email: string; invited_at: string | null; created_at: string };
type Fb = { id: string; email: string | null; kind: string; page: string | null; text: string; handled_at: string | null; created_at: string };
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

      <div className="label">Biblioteket</div>
      <div className="admin-table">
        {sets.map((s) => (
          <div key={s.id} className="admin-row">
            <input aria-label={`Namn på ${s.name}`} defaultValue={s.name} onBlur={(e) => rename(s, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            <select aria-label={`Sport för ${s.name}`} value={s.sport} onChange={(e) => setSport(s, e.target.value)}>
              {SPORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <span className="note mono">{s.card_count} kort</span>
            <label className="check">
              <input type="checkbox" checked={s.verified} onChange={(e) => setVerified(s, e.target.checked)} /> Verifierad
            </label>
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
      </div>

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
