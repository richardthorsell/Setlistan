"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

export type Question = { id: number; text: string; kind: "choice" | "text"; options: string[] };

const SKIP_KEY = "q_skipped";
const readSkipped = (): number[] => {
  try {
    return JSON.parse(sessionStorage.getItem(SKIP_KEY) || "[]") as number[];
  } catch {
    return [];
  }
};

// One simple question at a time for a signed-in user, until every active question is answered.
// "Inte nu" hides it for this visit only.
export default function QuestionPrompt({ supabase }: { supabase: SupabaseClient }) {
  const t = useT();
  const [queue, setQueue] = useState<Question[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [qs, mine] = await Promise.all([
        supabase.from("questions").select("id, text, kind, options").eq("active", true).order("id"),
        supabase.from("question_answers").select("question_id"),
      ]);
      if (!live || qs.error || mine.error) return;
      const done = new Set(((mine.data as { question_id: number }[]) || []).map((r) => r.question_id));
      const skipped = new Set(readSkipped());
      setQueue(((qs.data as Question[]) || []).filter((q) => !done.has(q.id) && !skipped.has(q.id)));
    })();
    return () => {
      live = false;
    };
  }, [supabase]);

  const q = queue[0];
  useEffect(() => {
    if (!thanks) return;
    const h = setTimeout(() => setThanks(false), 2500);
    return () => clearTimeout(h);
  }, [thanks]);

  if (!q && !thanks) return null;
  if (!q) return <div className="toast" role="status">{t("Tack för svaret!")}</div>;

  const next = () => setQueue((p) => p.slice(1));
  const skip = () => {
    try {
      sessionStorage.setItem(SKIP_KEY, JSON.stringify([...readSkipped(), q.id]));
    } catch {}
    setText("");
    next();
  };
  const answer = async (a: string) => {
    const v = a.trim();
    if (!v || busy) return;
    setBusy(true);
    setErr(false);
    const { error } = await supabase.from("question_answers").insert({ question_id: q.id, answer: v.slice(0, 500) });
    setBusy(false);
    if (error) return setErr(true);
    setText("");
    setThanks(true);
    next();
  };

  return (
    <div
      role="dialog"
      aria-label={t("Fråga från Setlistan")}
      style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 60, maxWidth: 520, margin: "0 auto", padding: 16, border: "1.5px solid var(--line)", borderRadius: 14, background: "var(--surface)", boxShadow: "0 10px 30px rgba(10, 11, 24, .22)", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="label">{t("En snabb fråga")}</div>
      <b>{q.text}</b>
      {q.kind === "choice" ? (
        <div className="row" style={{ flexWrap: "wrap" }}>
          {q.options.map((o) => (
            <button key={o} className="btn" type="button" disabled={busy} onClick={() => answer(o)}>{o}</button>
          ))}
        </div>
      ) : (
        <div className="row">
          <input className="t-input grow" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && answer(text)} aria-label={t("Ditt svar")} placeholder={t("Ditt svar")} />
          <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={() => answer(text)}>{t("Skicka")}</button>
        </div>
      )}
      {err && <div className="note warn">{t("Kunde inte spara svaret just nu.")}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn small ghost" type="button" onClick={skip}>{t("Inte nu")}</button>
      </div>
    </div>
  );
}
