"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SetStat } from "@/lib/checklist";
import AdminPanel from "../AdminPanel";
import QuestionsPanel from "../QuestionsPanel";
import MergePanel from "../MergePanel";
import NamesPanel from "../NamesPanel";
import CardAliasPanel from "../CardAliasPanel";
import FeaturesPanel from "../FeaturesPanel";
import UsagePanel from "../UsagePanel";
import EventsPanel from "../EventsPanel";
import NewsDraftsPanel from "../NewsDraftsPanel";
import "../panels.css";
import "./admin.css";

type Role = "admin" | "superuser";
type Section = "overview" | "questions" | "merge" | "names" | "cards" | "features" | "usage" | "handelser" | "newsdrafts";

const SECTIONS: { id: Section; label: string; superOnly?: boolean }[] = [
  { id: "overview", label: "Översikt och drift" },
  { id: "handelser", label: "Händelser" },
  { id: "newsdrafts", label: "Nyhetsförslag", superOnly: true },
  { id: "usage", label: "Användning", superOnly: true },
  { id: "questions", label: "Frågor", superOnly: true },
  { id: "merge", label: "Slå ihop", superOnly: true },
  { id: "names", label: "Rätta namn", superOnly: true },
  { id: "cards", label: "Kortnamn", superOnly: true },
  { id: "features", label: "Funktioner", superOnly: true },
];

const PAGE = 1000;
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

// The administration, in one place with a side menu. The panels are the same ones that used to sit in the service's menu.
export default function AdminApp({ role, email }: { role: Role; email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState<Section>("overview");
  const [sets, setSets] = useState<SetStat[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const items = SECTIONS.filter((s) => !s.superOnly || role === "superuser");

  // The section is kept in the address (#frågor and so on), so a reload or a bookmark lands in the same place.
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (items.some((s) => s.id === h)) setSection(h as Section);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (s: Section) => {
    setSection(s);
    window.history.replaceState(null, "", `#${s}`);
    window.scrollTo({ top: 0 });
  };

  const say = useCallback((m: string) => {
    setToast(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadSets = useCallback(async () => {
    try {
      setSets(await fetchAll<SetStat>((a, b) => supabase.from("set_stats").select("*").eq("status", "ready").order("verified", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b)));
    } catch {
      setSets([]);
    }
  }, [supabase]);
  useEffect(() => {
    loadSets();
  }, [loadSets]);

  const back = () => go("overview");

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-brand">
          <b>Setlistan Admin</b>
          <span className="pill">{role === "superuser" ? "Superuser" : "Admin"}</span>
        </div>
        <nav className="admin-nav" aria-label="Administration">
          {items.map((s) => (
            <button key={s.id} type="button" aria-current={section === s.id ? "page" : undefined} onClick={() => go(s.id)}>{s.label}</button>
          ))}
        </nav>
        <div className="admin-foot">
          <a href="/">Till Setlistan</a>
          <button type="button" onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>Logga ut</button>
        </div>
      </aside>
      <main className="admin-main admin-embed">
        {section === "overview" && <AdminPanel supabase={supabase} role={role} sets={sets} myEmail={email.toLowerCase()} onChanged={loadSets} say={say} />}
        {section === "handelser" && <EventsPanel supabase={supabase} role={role} />}
        {section === "newsdrafts" && role === "superuser" && <NewsDraftsPanel supabase={supabase} say={say} />}
        {section === "usage" && role === "superuser" && <UsagePanel supabase={supabase} />}
        {section === "questions" && role === "superuser" && <QuestionsPanel supabase={supabase} onClose={back} />}
        {section === "merge" && role === "superuser" && <MergePanel supabase={supabase} sets={sets} onChanged={loadSets} say={say} onClose={back} />}
        {section === "names" && role === "superuser" && <NamesPanel supabase={supabase} onClose={back} />}
        {section === "cards" && role === "superuser" && <CardAliasPanel supabase={supabase} onClose={back} />}
        {section === "features" && role === "superuser" && <FeaturesPanel supabase={supabase} onClose={back} onChanged={() => {}} />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
