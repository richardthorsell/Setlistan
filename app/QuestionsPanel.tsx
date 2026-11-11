"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";
import type { Question } from "./QuestionPrompt";

type Aud = "all" | "new" | "existing";
type Q = Question & { active: boolean; created_at: string; audience?: Aud };

// Ready-made questions to start from; the text is shown to the users as written.
const SUGGESTIONS: { q: string; kind: "choice" | "text"; opts: string }[] = [
  { q: "Vad samlar du mest?", kind: "choice", opts: "Fotboll, Ishockey, Basket, Baseboll, Annat" },
  { q: "Hur många kort har du ungefär?", kind: "choice", opts: "Under 100, 100–500, 500–2000, Över 2000" },
  { q: "Samlar du på paralleller?", kind: "choice", opts: "Ja, Nej, Ibland" },
  { q: "Skulle du vilja ha Setlistan som app i mobilen?", kind: "choice", opts: "Ja, Nej, Vet inte" },
  { q: "Hur hittade du Setlistan?", kind: "choice", opts: "Tips från en vän, Sökning, Sociala medier, Annat" },
  { q: "Vad saknar du mest i Setlistan?", kind: "text", opts: "" },
];
type Res = { question_id: number; answer: string; n: number };

// Superuser: ask users simple questions, see the answers as counts (no names), pause or delete questions.
export default function QuestionsPanel({ supabase, onClose }: { supabase: SupabaseClient; onClose: () => void }) {
  const t = useT();
  const [qs, setQs] = useState<Q[]>([]);
  const [res, setRes] = useState<Res[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"choice" | "text">("choice");
  const [opts, setOpts] = useState("Ja, Nej");
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState<number | null>(null);
  const [aud, setAud] = useState<Aud>("all");
  const audLabel = (a?: string) => (a === "new" ? t("Nya användare") : a === "existing" ? t("Redan inloggade") : t("Alla användare"));

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([supabase.from("questions").select("*").order("id", { ascending: false }), supabase.rpc("admin_question_results")]);
    if (a.error || b.error) return setMsg(t("Kunde inte läsa frågorna."));
    setQs((a.data as Q[]) || []);
    setRes(((b.data as Res[]) || []).map((r) => ({ ...r, n: Number(r.n) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = opts.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = text.trim().length >= 3 && (kind === "text" || options.length >= 2);
  const add = async () => {
    if (!valid) return;
    const { error } = await supabase.from("questions").insert({ text: text.trim(), kind, options: kind === "choice" ? options : [], active: true, ...(aud === "all" ? {} : { audience: aud }) });
    if (error) return setMsg(t("Kunde inte spara frågan."));
    setText("");
    setMsg(aud === "new" ? t("Frågan visas nu för nya användare som inte svarat än.") : aud === "existing" ? t("Frågan visas nu för redan inloggade som inte svarat än.") : t("Frågan visas nu för alla som loggar in och inte svarat än."));
    load();
  };
  const toggle = async (q: Q) => {
    const { error } = await supabase.from("questions").update({ active: !q.active }).eq("id", q.id);
    if (error) return setMsg(t("Kunde inte spara."));
    load();
  };
  const remove = async (id: number) => {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    setDel(null);
    if (error) return setMsg(t("Kunde inte spara."));
    load();
  };

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Frågor")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Frågor till användarna")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        <div className="note">{t("Varje inloggad användare får frågan en gång, tills den är besvarad. Svaren visas bara som antal, utan namn.")}</div>
        {msg && <div className="note">{msg}</div>}

        <div className="label">{t("Förslag på frågor")}</div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button key={s.q} className="btn small ghost" type="button" onClick={() => { setText(s.q); setKind(s.kind); if (s.kind === "choice") setOpts(s.opts); }}>{s.q}</button>
          ))}
        </div>
        <input className="t-input" style={{ width: "100%" }} maxLength={300} placeholder={t("Din fråga")} aria-label={t("Din fråga")} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div className="seg" role="group" aria-label={t("Svarstyp")}>
            <button type="button" aria-pressed={kind === "choice"} onClick={() => setKind("choice")}>{t("Knappar")}</button>
            <button type="button" aria-pressed={kind === "text"} onClick={() => setKind("text")}>{t("Fritext")}</button>
          </div>
          {kind === "choice" && <input className="t-input grow" value={opts} onChange={(e) => setOpts(e.target.value)} aria-label={t("Svarsalternativ, separerade med komma")} placeholder={t("Svarsalternativ, separerade med komma")} />}
          <button className="btn primary" type="button" disabled={!valid} onClick={add}>{t("Ställ frågan")}</button>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <span className="label">{t("Mottagare")}</span>
          <div className="seg" role="group" aria-label={t("Mottagare")}>
            {(["all", "new", "existing"] as Aud[]).map((a) => (
              <button key={a} type="button" aria-pressed={aud === a} onClick={() => setAud(a)}>{audLabel(a)}</button>
            ))}
          </div>
        </div>
        <div className="note">{t("Nya användare är konton som skapas efter att frågan ställts. Redan inloggade är konton som redan finns.")}</div>

        {qs.map((q) => {
          const rows = res.filter((r) => r.question_id === q.id);
          const total = rows.reduce((n, r) => n + r.n, 0);
          return (
            <div key={q.id} className="wish-box">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <b>{q.text}</b>
                <span className="note">{q.active ? t("Aktiv") : t("Pausad")} · {audLabel(q.audience)} · {total} {t("svar")}</span>
              </div>
              {rows.slice(0, 12).map((r) => (
                <div key={r.answer} className="par-row">
                  <span className="grow">{r.answer}</span>
                  <b className="mono">{r.n}{total ? ` · ${Math.round((r.n / total) * 100)} %` : ""}</b>
                </div>
              ))}
              <div className="row">
                <button className="btn small" type="button" onClick={() => toggle(q)}>{q.active ? t("Pausa") : t("Aktivera")}</button>
                {del === q.id ? (
                  <>
                    <span className="note">{t("Tar också bort alla svar.")}</span>
                    <button className="btn small danger" type="button" onClick={() => remove(q.id)}>{t("Ta bort")}</button>
                    <button className="btn small ghost" type="button" onClick={() => setDel(null)}>{t("Behåll")}</button>
                  </>
                ) : (
                  <button className="btn small ghost danger" type="button" onClick={() => setDel(q.id)}>{t("Ta bort")}</button>
                )}
              </div>
            </div>
          );
        })}
        {!qs.length && <div className="note">{t("Inga frågor än.")}</div>}
      </section>
    </div>
  );
}
