"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Draft = { id: string; title: string; body: string; flag_key: string | null; status: string; created_at: string };
type Flag = { key: string; label: string; mode: "off" | "superuser" | "on" };
const MODE: Record<string, string> = { off: "Av", superuser: "Bara jag", on: "På för alla" };

// Suggestions for what to tell the users. Edit the text if you like, then publish it as news, or dismiss it.
export default function NewsDraftsPanel({ supabase, say }: { supabase: SupabaseClient; say: (m: string) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [edits, setEdits] = useState<Record<string, { title: string; body: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, f] = await Promise.all([
      supabase.from("news_drafts").select("id, title, body, flag_key, status, created_at").eq("status", "ny").order("created_at", { ascending: false }),
      supabase.from("feature_flags").select("key, label, mode"),
    ]);
    setDrafts((d.data as Draft[]) || []);
    setFlags((f.data as Flag[]) || []);
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);

  const val = (d: Draft) => edits[d.id] || { title: d.title, body: d.body };
  const publish = async (d: Draft) => {
    const v = val(d);
    setBusy(d.id);
    const { error } = await supabase.rpc("admin_publish_draft", { p_id: d.id, p_title: v.title, p_body: v.body });
    setBusy(null);
    if (error) return say("Kunde inte publicera nyheten.");
    say("Nyheten är publicerad");
    load();
  };
  const dismiss = async (d: Draft) => {
    setBusy(d.id);
    const { error } = await supabase.rpc("admin_dismiss_draft", { p_id: d.id });
    setBusy(null);
    if (error) return say("Kunde inte avfärda förslaget.");
    load();
  };

  return (
    <section className="panel tradera">
      <h3>Nyhetsförslag</h3>
      <div className="note">Förslag på nyheter att visa för användarna. Ändra texten om du vill och tryck Publicera. En nyhet för en funktion som inte är påslagen för alla bör vänta tills den är det.</div>
      {drafts.map((d) => {
        const f = d.flag_key ? flags.find((x) => x.key === d.flag_key) : null;
        const v = val(d);
        const notReady = f && f.mode !== "on";
        return (
          <div key={d.id} className="wish-box">
            <input className="t-input" style={{ width: "100%", fontWeight: 700 }} maxLength={120} value={v.title} aria-label="Rubrik" onChange={(e) => setEdits((m) => ({ ...m, [d.id]: { ...v, title: e.target.value } }))} />
            <textarea rows={3} maxLength={1000} style={{ width: "100%" }} value={v.body} aria-label="Text" onChange={(e) => setEdits((m) => ({ ...m, [d.id]: { ...v, body: e.target.value } }))} />
            {f && <div className={`note ${notReady ? "warn" : ""}`}>Gäller {f.label}: just nu {MODE[f.mode].toLowerCase()}.{notReady ? " Användarna ser den inte än." : ""}</div>}
            <div className="row">
              <button className="btn small primary" type="button" disabled={busy === d.id} onClick={() => publish(d)}>Publicera</button>
              <button className="btn small ghost" type="button" disabled={busy === d.id} onClick={() => dismiss(d)}>Avfärda</button>
            </div>
          </div>
        );
      })}
      {!drafts.length && <div className="note">Inga förslag just nu. Nya kommer när något nytt har byggts.</div>}
    </section>
  );
}
