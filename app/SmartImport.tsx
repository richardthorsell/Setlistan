"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { sampleForHint } from "@/lib/importhint";
import { useT } from "@/lib/i18n";
import {
  LIMITS, ImportError, type Field, type Mapping, type Row, type Source, type Table,
  decodeBytes, detectDelimiter, fingerprint, flagColumns, looksLikeHeader, mapColumns, parseDelimited, parsePasted, rowsFromTable, tableFromSheet,
} from "@/lib/smartimport";

type Step = "input" | "map" | "review" | "done" | "history" | "pending";
type Strategy = "add" | "replace" | "skip";
type DbRow = { row_no: number; norm: Record<string, string | number | null>; result: string | null; reason: string | null; candidates: { kind: string; id: string | number; label: string }[] | null; card_id: number | null; parallel_id: number | null; prev_qty: number | null };
type Job = { id: string; source: string; file_name: string | null; status: string; row_count: number; stats: Record<string, number>; created_at: string };
type Pending = { set_text: string | null; matched_set_id: string | null; set_title: string | null; subset_code: string | null; card_no: number | null; player: string | null; qty: number | null; result: string; reason: string | null };

const FIELDS: { id: Field; label: string }[] = [
  { id: "set", label: "Set" }, { id: "year", label: "År eller säsong" }, { id: "section", label: "Delserie (namn, t.ex. Typ)" }, { id: "code", label: "Delseriens kod" }, { id: "no", label: "Kortnummer" },
  { id: "name", label: "Spelare" }, { id: "team", label: "Lag" }, { id: "qty", label: "Antal" }, { id: "have", label: "Har kortet (ja/nej)" }, { id: "parallel", label: "Parallell" }, { id: "serial", label: "Serienummer" },
];
const MATCHED = ["exact_match", "high_confidence_match", "user_confirmed"];
const RESULT_LABEL: Record<string, string> = {
  exact_match: "Säker träff", high_confidence_match: "Trolig träff", user_confirmed: "Bekräftad av dig", ambiguous: "Osäker",
  unknown_card: "Kortet finns inte", unknown_set: "Setet finns inte", invalid_row: "Ogiltig rad",
};
const REASON_LABEL: Record<string, string> = {
  no_card_identity: "Saknar nummer och namn", no_set_text: "Saknar setnamn", set_not_found: "Setet hittades inte i katalogen", several_sets: "Flera set passar",
  card_not_in_set: "Numret finns inte i setet", name_not_unique_or_missing: "Namnet finns inte entydigt i setet", name_differs: "Numret finns men namnet skiljer sig",
  unknown_parallel: "Parallellen finns inte i setet", section_not_found: "Delserien hittades inte i setet", bad_quantity: "Antalet är inte giltigt", matched_by_name: "Matchad på namn",
};
const STATUS_LABEL: Record<string, string> = {
  review_required: "Väntar på granskning", committing: "Pågår", completed: "Klar", partially_completed: "Klar, med väntande rader", failed: "Misslyckades", cancelled: "Avbruten", undone: "Ångrad",
};

// Roles per column, from a mapping of fields to columns.
function rolesFrom(mapping: Mapping, width: number): string[] {
  const roles: string[] = Array.from({ length: Math.max(0, width) }, () => "");
  for (const [f, i] of Object.entries(mapping)) if (i !== undefined && i < roles.length) roles[i] = f;
  return roles;
}

type SecOpt = { section_id: number; set_id: string; set_name: string; code: string; section_name: string };
// Search for a set, then choose the subset that a text from the file means.
function SectionFix({ supabase, text, n, start, onPick, t }: { supabase: SupabaseClient; text: string; n: number; start: string; onPick: (id: number) => void; t: (s: string) => string }) {
  const [q, setQ] = useState(start);
  const [opts, setOpts] = useState<SecOpt[] | null>(null);
  const search = async () => {
    const { data } = await supabase.rpc("import_find_sections", { p_q: q });
    setOpts((data as SecOpt[]) || []);
  };
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <span className="grow"><b>{text}</b> <span className="note">· {n} {t("rader")}</span></span>
      <input className="t-input" style={{ width: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Sök set")} aria-label={`${t("Sök set för")} ${text}`} />
      <button className="btn small" type="button" disabled={q.trim().length < 2} onClick={search}>{t("Sök")}</button>
      {opts && (
        <select defaultValue="" onChange={(e) => e.target.value && onPick(Number(e.target.value))} aria-label={`${t("Välj delserie för")} ${text}`}>
          <option value="">{opts.length ? t("Välj delserie …") : t("Inga träffar")}</option>
          {opts.map((o) => (<option key={o.section_id} value={o.section_id}>{o.set_name} · {o.code || "–"} {o.section_name}</option>))}
        </select>
      )}
    </div>
  );
}

// Smart Import: read a collection from a file or pasted text (in the browser), check how it matches the catalogue, and only after your approval
// add it to your collection. Rows that do not match are kept privately as pending. Everything can be undone while it is unchanged.
export default function SmartImport({ supabase, onClose, onChanged, ai }: { supabase: SupabaseClient; onClose: () => void; onChanged: () => void; ai?: boolean }) {
  const t = useT();
  const [step, setStep] = useState<Step>("input");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [text, setText] = useState("");
  const [defaultSet, setDefaultSet] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [table, setTable] = useState<Table>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [unresolved, setUnresolved] = useState<{ section_text: string; n: number }[]>([]);
  const lock = useRef(false);
  const [hasHeader, setHasHeader] = useState(true);
  const [listRows, setListRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<Source>("paste");
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<string>("all");
  const [rows, setRows] = useState<DbRow[]>([]);
  const [page, setPage] = useState(0);
  const [strategy, setStrategy] = useState<Strategy>("add");
  const [overrides, setOverrides] = useState<Record<string, Strategy>>({});
  const [existing, setExisting] = useState(0);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [undoId, setUndoId] = useState<string | null>(null);
  const PAGE = 50;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const errText = (e: unknown) => {
    if (e instanceof ImportError) return e.message === "too_many_rows" ? t("Filen har för många rader. Högst 20 000 rader åt gången.") : t("Filen är för stor. Högst 5 MB.");
    const m = (e as { message?: string })?.message || "";
    if (/already imported/.test(m)) return t("Den här importen är redan gjord (samma innehåll). Ångra den först om du vill göra om den.");
    if (/import in progress/.test(m)) return t("Importen pågår redan. Vänta några sekunder.");
    if (/too many imports/.test(m)) return t("Du har gjort många importer idag. Försök igen i morgon.");
    if (/feature off/.test(m)) return t("Funktionen är inte påslagen.");
    return t("Något gick fel. Försök igen.");
  };

  // ---------- step 1: read ----------
  const pickFile = async (f: File | null) => {
    setFile(f);
    setSheets([]);
    setChosen([]);
    setMsg(null);
    if (!f) return;
    if (f.size > LIMITS.bytes) return setMsg(t("Filen är för stor. Högst 5 MB."));
    if (/\.xlsx$/i.test(f.name)) {
      try {
        const mod = (await import("read-excel-file")) as unknown as { readSheetNames: (f: File) => Promise<string[]> };
        const names = (await mod.readSheetNames(f)).slice(0, LIMITS.sheets);
        setSheets(names);
        setChosen(names.slice(0, 1));
      } catch {
        setMsg(t("Det gick inte att läsa Excel-filen. Kontrollera att den är en .xlsx-fil."));
      }
    }
  };

  const applyTable = (tbl: Table, src: Source) => {
    if (!tbl.length) return setMsg(t("Hittade inga rader."));
    const head = looksLikeHeader(tbl[0]);
    setTable(tbl);
    setHasHeader(head);
    setRoles(rolesFrom(head ? mapColumns(tbl[0]) : tbl[0].length >= 4 ? { set: 0, no: 1, name: 2, qty: 3 } : tbl[0].length === 3 ? { no: 0, name: 1, qty: 2 } : { no: 0, name: 1 }, Math.max(...tbl.slice(0, 50).map((r) => r.length))));
    setListRows(null);
    setSource(src);
    setStep("map");
  };

  const read = async () => {
    setMsg(null);
    setBusy(t("Läser …"));
    try {
      if (mode === "paste") {
        const p = parsePasted(text, { defaultSet });
        if (p.kind === "table") applyTable(p.table, "paste");
        else if (!p.result.rows.length) setMsg(t("Hittade inga kortrader i texten."));
        else {
          setListRows(p.result.rows);
          setWarn(p.result.formulaCells ? `${p.result.formulaCells} ${t("celler började som formler. De behandlas som vanlig text.")}` : null);
          setSource("list");
          await review(p.result.rows, "list", null);
        }
      } else if (file) {
        if (/\.xlsx$/i.test(file.name)) {
          const mod = (await import("read-excel-file")) as unknown as { default: (f: File, o?: { sheet?: string | number }) => Promise<unknown[][]> };
          let all: Table = [];
          for (const [i, name] of chosen.entries()) {
            const tbl = tableFromSheet(await mod.default(file, { sheet: name }));
            all = i === 0 || !tbl.length ? all.concat(tbl) : all.concat(looksLikeHeader(tbl[0]) ? tbl.slice(1) : tbl);
          }
          applyTable(all, "xlsx");
        } else {
          const txt = decodeBytes(await file.arrayBuffer());
          applyTable(parseDelimited(txt, /\.tsv$/i.test(file.name) ? "\t" : detectDelimiter(txt)), /\.tsv$/i.test(file.name) ? "tsv" : "csv");
        }
      }
    } catch (e) {
      setMsg(errText(e));
    }
    setBusy(null);
  };

  // ---------- step 2: map -> rows ----------
  const mapping = useMemo(() => {
    const m: Mapping = {};
    roles.forEach((r, i) => {
      if (r && r !== "flag" && m[r as Field] === undefined) m[r as Field] = i;
    });
    return m;
  }, [roles]);
  const flagCols = useMemo(() => roles.flatMap((r, i) => (r === "flag" ? [i] : [])), [roles]);
  const looksYesNo = useMemo(() => (step === "map" ? flagColumns(table, hasHeader) : []), [step, table, hasHeader]);
  const parsed = useMemo(() => {
    if (step !== "map") return null;
    try {
      return rowsFromTable(table, mapping, { defaultSet, hasHeader, flagCols });
    } catch {
      return null;
    }
  }, [step, table, mapping, flagCols, defaultSet, hasHeader]);

  // ---------- step 3: save for review and match ----------
  const loadRows = useCallback(async (id: string, f: string, p: number) => {
    let q = supabase.from("import_rows").select("row_no, norm, result, reason, candidates, card_id, parallel_id, prev_qty").eq("job_id", id).order("row_no").range(p * PAGE, p * PAGE + PAGE - 1);
    if (f === "matched") q = q.in("result", MATCHED);
    else if (f !== "all") q = q.eq("result", f);
    const { data } = await q;
    setRows((data as DbRow[]) || []);
    const ex = await supabase.from("import_rows").select("row_no", { count: "exact", head: true }).eq("job_id", id).in("result", MATCHED).not("prev_qty", "is", null);
    setExisting(ex.count || 0);
  }, [supabase]);

  const review = async (src: Row[], srcKind: Source, fileName: string | null) => {
    // a double click must not start two imports at once
    if (lock.current) return;
    lock.current = true;
    setBusy(t("Sparar förhandsgranskningen …"));
    setMsg(null);
    try {
      const fp = await fingerprint(src);
      const created = await supabase.rpc("import_create", { p_source: srcKind, p_file_name: fileName, p_fingerprint: fp, p_row_count: src.length });
      if (created.error) throw created.error;
      const id = created.data as string;
      for (let i = 0; i < src.length; i += 500) {
        setBusy(`${t("Sparar förhandsgranskningen …")} ${Math.min(i + 500, src.length)} / ${src.length}`);
        const { error } = await supabase.rpc("import_add_rows", { p_job: id, p_rows: src.slice(i, i + 500).map((r) => ({ n: r.n, r: r.r, o: r.o })) });
        if (error) throw error;
      }
      setBusy(t("Matchar mot katalogen …"));
      const m = await supabase.rpc("import_match", { p_job: id });
      if (m.error) throw m.error;
      setJobId(id);
      setCounts((m.data as Record<string, number>) || {});
      setFilter("all");
      setPage(0);
      setOverrides({});
      await loadRows(id, "all", 0);
      await loadUnresolved(id);
      setStep("review");
    } catch (e) {
      setMsg(errText(e));
    }
    lock.current = false;
    setBusy(null);
  };

  const loadUnresolved = useCallback(async (id: string) => {
    const { data } = await supabase.rpc("import_unresolved_sections", { p_job: id });
    setUnresolved(((data as { section_text: string; n: number }[]) || []).map((x) => ({ section_text: x.section_text, n: Number(x.n) })));
  }, [supabase]);

  const refresh = async (f = filter, p = page) => {
    if (!jobId) return;
    const c = await supabase.rpc("import_counts", { p_job: jobId });
    setCounts((c.data as Record<string, number>) || {});
    await loadRows(jobId, f, p);
    await loadUnresolved(jobId);
  };

  const setSectionFor = async (text: string, sectionId: number) => {
    if (!jobId) return;
    setBusy(t("Matchar om …"));
    const { error } = await supabase.rpc("import_section_map", { p_job: jobId, p_text: text, p_section_id: sectionId });
    setBusy(null);
    if (error) return setMsg(errText(error));
    refresh();
  };

  const setSetFor = async (setText: string, setId: string) => {
    if (!jobId) return;
    setBusy(t("Matchar om …"));
    const { error } = await supabase.rpc("import_set_map", { p_job: jobId, p_text: setText, p_set_id: setId });
    setBusy(null);
    if (error) return setMsg(errText(error));
    refresh();
  };
  const pick = async (r: DbRow, cardId: number) => {
    if (!jobId) return;
    const { error } = await supabase.rpc("import_pick_card", { p_job: jobId, p_row_no: r.row_no, p_card_id: cardId });
    if (error) return setMsg(errText(error));
    refresh();
  };

  // ---------- step 4: commit ----------
  const commit = async () => {
    if (!jobId) return;
    setBusy(t("Lägger till i din samling …"));
    setMsg(null);
    const { data, error } = await supabase.rpc("import_commit", { p_job: jobId, p_strategy: strategy, p_overrides: overrides });
    setBusy(null);
    if (error) return setMsg(errText(error));
    setResult(data as Record<string, number>);
    setStep("done");
    onChanged();
  };
  const cancel = async () => {
    if (jobId) await supabase.rpc("import_cancel", { p_job: jobId });
    setJobId(null);
    setStep("input");
  };

  // ---------- history and pending ----------
  const loadJobs = async () => {
    const { data } = await supabase.from("import_jobs").select("id, source, file_name, status, row_count, stats, created_at").order("created_at", { ascending: false }).limit(30);
    setJobs((data as Job[]) || []);
  };
  const loadPending = async () => {
    const { data } = await supabase.rpc("import_pending", { p_limit: 200, p_offset: 0 });
    setPending((data as Pending[]) || []);
  };
  useEffect(() => {
    if (step === "history") loadJobs();
    if (step === "pending") loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Intelligent Import: the headings and a few cut-short rows are sent only when the user presses the button; the answer fills in the roles, which can still be changed
  const suggest = async () => {
    setBusy(t("AI föreslår roller …"));
    setMsg(null);
    try {
      const r = await fetch("/api/import-hint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sampleForHint(table, hasHeader)) });
      const j = (await r.json()) as { roles?: string[]; error?: string };
      if (!r.ok || !j.roles) throw new Error(j.error || "");
      setRoles((old) => old.map((_, i) => j.roles![i] ?? ""));
      setMsg(t("Rollerna är föreslagna av AI. Kontrollera dem och ändra det som är fel."));
    } catch (e) {
      setMsg((e as Error).message || t("Något gick fel. Försök igen."));
    }
    setBusy(null);
  };

  // match the pending rows again against the catalogue as it is now; the result is an ordinary import that is reviewed and approved
  const resume = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(t("Matchar om väntande rader …"));
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc("import_resume");
      if (error) throw error;
      const r = data as { job: string; counts: Record<string, number> };
      setJobId(r.job);
      setCounts(r.counts || {});
      setFilter("all");
      setPage(0);
      setOverrides({});
      setWarn(null);
      await loadRows(r.job, "all", 0);
      await loadUnresolved(r.job);
      setStep("review");
    } catch (e) {
      setMsg(/nothing pending/.test((e as { message?: string })?.message || "") ? t("Inget väntar som kan matchas.") : errText(e));
    }
    lock.current = false;
    setBusy(null);
  };

  const undo = async (id: string) => {
    setBusy(t("Ångrar …"));
    const { data, error } = await supabase.rpc("import_undo", { p_job: id });
    setBusy(null);
    setUndoId(null);
    if (error) return setMsg(errText(error));
    const r = data as { restored: number; conflicts: unknown[] };
    setMsg(r.conflicts.length ? `${t("Ångrade")} ${r.restored} ${t("kort. Du har ändrat")} ${r.conflicts.length} ${t("kort sedan importen, så de lämnades orörda.")}` : `${t("Importen är ångrad.")} ${r.restored} ${t("kort återställdes.")}`);
    onChanged();
    loadJobs();
  };

  // ---------- view ----------
  const matched = MATCHED.reduce((n, k) => n + (counts[k] || 0), 0);
  const unsure = counts.ambiguous || 0;
  const missing = (counts.unknown_card || 0) + (counts.unknown_set || 0);
  const invalid = counts.invalid_row || 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const ambiguousSets = useMemo(() => {
    const m = new Map<string, DbRow>();
    for (const r of rows) if (r.result === "ambiguous" && r.reason === "several_sets") m.set(String(r.norm.set || ""), r);
    return [...m.entries()];
  }, [rows]);
  const newQty = (r: DbRow) => {
    const q = Number(r.norm.qty) || 0;
    const key = `${r.card_id}${r.parallel_id ? ":" + r.parallel_id : ""}`;
    const s = overrides[key] || strategy;
    if (r.prev_qty == null) return Math.min(q, 999);
    return s === "add" ? Math.min(r.prev_qty + q, 999) : s === "replace" ? Math.min(q, 999) : r.prev_qty;
  };

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Importera samling")} style={{ maxWidth: 900 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Importera samling")}</h3>
          <button className="btn small ghost" type="button" disabled={!!busy} onClick={onClose}>{t("Stäng")}</button>
        </div>
        <div className="seg" role="group" aria-label={t("Importera samling")}>
          <button type="button" aria-pressed={["input", "map", "review", "done"].includes(step)} onClick={() => setStep("input")}>{t("Ny import")}</button>
          <button type="button" aria-pressed={step === "history"} onClick={() => setStep("history")}>{t("Historik")}</button>
          <button type="button" aria-pressed={step === "pending"} onClick={() => setStep("pending")}>{t("Väntande")}</button>
        </div>
        {msg && <div className="note" role="status">{msg}</div>}
        {busy && <div className="note" role="status">{busy}</div>}

        {step === "input" && (
          <>
            <div className="note">{t("Importera från Excel (.xlsx), CSV, TSV eller klistrad text. Filen läses i din webbläsare och lämnar inte din enhet. Inget läggs till i din samling förrän du har granskat och godkänt. Kort som inte finns i katalogen sparas privat som väntande.")}</div>
            <div className="seg" role="group" aria-label={t("Källa")}>
              <button type="button" aria-pressed={mode === "file"} onClick={() => setMode("file")}>{t("Fil")}</button>
              <button type="button" aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>{t("Klistra in")}</button>
            </div>
            {mode === "file" ? (
              <>
                <input type="file" accept=".xlsx,.csv,.tsv,.txt" aria-label={t("Välj fil")} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
                {sheets.length > 1 && (
                  <div className="wish-box">
                    <div className="label">{t("Välj blad att importera")}</div>
                    {sheets.map((s) => (
                      <label key={s} className="row" style={{ gap: 8 }}>
                        <input type="checkbox" checked={chosen.includes(s)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s] : c.filter((x) => x !== s)))} />
                        <span>{s}</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <textarea rows={9} placeholder={t("Klistra in en tabell från Excel eller Sheets, eller en lista som:\n1993-94 Parkhurst\n#12 Håkan Loob x2\n#13 Mats Sundin")} aria-label={t("Klistra in text")} value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%" }} />
            )}
            <input className="t-input" style={{ width: "100%" }} placeholder={t("Om listan inte anger något set: skriv setets namn, till exempel 1993-94 Parkhurst")} aria-label={t("Standardset")} value={defaultSet} onChange={(e) => setDefaultSet(e.target.value)} />
            <div className="row">
              <button className="btn primary" type="button" disabled={!!busy || (mode === "file" ? !file || (sheets.length > 0 && !chosen.length) : text.trim().length < 3)} onClick={read}>{t("Läs in")}</button>
            </div>
          </>
        )}

        {step === "map" && (
          <>
            <div className="note">{t("Kontrollera vilka kolumner som är vilka. Jag har gissat utifrån rubrikerna.")}</div>
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={hasHeader} onChange={(e) => { setHasHeader(e.target.checked); if (e.target.checked) setRoles(rolesFrom(mapColumns(table[0] || []), Math.max(...table.slice(0, 50).map((r) => r.length)))); }} />
              <span>{t("Första raden är rubriker")}</span>
            </label>
            <div className="note">{t("Välj en roll för varje kolumn som du vill använda. Kolumner du inte förstår eller inte behöver låter du stå som (ignorera). Ja/nej-kolumner kan vara parallellvarianter: då är kolumnrubriken parallellens namn.")}</div>
            {ai && (
              <div className="row">
                <button className="btn small" type="button" disabled={!!busy} onClick={suggest}>{t("Föreslå roller med AI")}</button>
                <span className="note">{t("Rubrikerna och några exempelrader skickas till en AI-tjänst, bara när du trycker på knappen.")}</span>
              </div>
            )}
            {looksYesNo.some((k) => !roles[k]) && (
              <div className="row">
                <button className="btn small" type="button" onClick={() => setRoles((rs) => rs.map((r, i) => (!r && looksYesNo.includes(i) ? "flag" : r)))}>{t("Använd alla ja/nej-kolumner som parallellvarianter")}</button>
              </div>
            )}
            {mapping.set === undefined && (!roles.includes("set")) && (
              <input className="t-input" style={{ width: "100%" }} placeholder={t("Setets namn (om kolumn saknas), till exempel 1993-94 Parkhurst")} aria-label={t("Standardset")} value={defaultSet} onChange={(e) => setDefaultSet(e.target.value)} />
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="mono" style={{ fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {Array.from({ length: roles.length }, (_, k) => (
                      <th key={k} style={{ padding: "2px 4px", textAlign: "left" }}>
                        <select value={roles[k] || ""} onChange={(e) => setRoles((rs) => rs.map((x, i) => (i === k ? e.target.value : x)))} aria-label={`${t("Roll för kolumn")} ${k + 1}`} style={{ maxWidth: 170 }}>
                          <option value="">{t("(ignorera)")}</option>
                          {FIELDS.map((f) => (<option key={f.id} value={f.id}>{t(f.label)}</option>))}
                          <option value="flag">{t("Parallell (rubriken är namnet)")}</option>
                        </select>
                        {looksYesNo.includes(k) && <div className="note" style={{ fontWeight: 400 }}>{t("ser ut som ja/nej")}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.slice(0, 8).map((r, i) => (
                    <tr key={i} style={{ fontWeight: i === 0 && hasHeader ? 700 : 400 }}>{r.map((c, k) => (<td key={k} style={{ padding: "2px 8px", borderBottom: "1px solid var(--line)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</td>))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mapping.have === undefined && !flagCols.length && <div className="note warn">{t("Ingen kolumn är vald som Har kortet. Då importeras alla rader som kort du äger. Om listan är en checklista över ett helt set, välj kolumnen som visar vilka kort du har.")}</div>}
            <div className="note">{parsed ? `${parsed.rows.length.toLocaleString("sv-SE")} ${t("rader hittades")}${parsed.notOwned ? ` · ${parsed.notOwned.toLocaleString("sv-SE")} ${t("rader hoppades över eftersom kortet inte är markerat som ägt")}` : ""}${parsed.skipped ? ` · ${parsed.skipped} ${t("tomma rader hoppades över")}` : ""}${parsed.formulaCells ? ` · ${parsed.formulaCells} ${t("celler började som formler och behandlas som vanlig text")}` : ""}.` : t("Kunde inte läsa raderna.")}</div>
            <div className="row">
              <button className="btn primary" type="button" disabled={!!busy || !parsed || !parsed.rows.length} onClick={() => parsed && review(parsed.rows, source, file?.name ?? null)}>{t("Förhandsgranska")}</button>
              <button className="btn ghost" type="button" onClick={() => setStep("input")}>{t("Tillbaka")}</button>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            {warn && <div className="note warn">{warn}</div>}
            <div className="row" style={{ flexWrap: "wrap" }}>
              {[["matched", `${t("Matchade")} ${matched}`], ["ambiguous", `${t("Osäkra")} ${unsure}`], ["unknown_card", `${t("Kortet finns inte")} ${counts.unknown_card || 0}`], ["unknown_set", `${t("Setet finns inte")} ${counts.unknown_set || 0}`], ["invalid_row", `${t("Ogiltiga")} ${invalid}`], ["all", `${t("Alla")} ${total}`]].map(([k, l]) => (
                <button key={k} className="btn small" type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setPage(0); refresh(k, 0); }} style={filter === k ? { borderColor: "var(--accent)" } : undefined}>{l}</button>
              ))}
            </div>
            <div className="note">{t("Det som inte matchar sparas privat som väntande och räknas inte som dina kort förrän det finns i katalogen.")}</div>

            <div className="wish-box">
              <div className="label">{t("Om du redan har kortet")}{existing ? ` · ${existing} ${t("av de matchade finns redan hos dig")}` : ""}</div>
              <div className="seg" role="group" aria-label={t("Hantering av antal")}>
                {([["add", "Lägg till"], ["replace", "Ersätt"], ["skip", "Hoppa över"]] as [Strategy, string][]).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={strategy === k} onClick={() => setStrategy(k)}>{t(l)}</button>
                ))}
              </div>
              <div className="note">{strategy === "add" ? t("Antalet i filen läggs till ditt nuvarande antal.") : strategy === "replace" ? t("Antalet i filen ersätter ditt nuvarande antal.") : t("Ditt nuvarande antal lämnas som det är. Nya kort läggs till.")}</div>
            </div>

            {unresolved.length > 0 && (
              <div className="wish-box">
                <div className="label">{t("Delserier som inte hittades. Peka ut vilken delserie de betyder.")}</div>
                {unresolved.map((u) => (<SectionFix key={u.section_text} supabase={supabase} text={u.section_text} n={u.n} start={defaultSet} onPick={(id) => setSectionFor(u.section_text, id)} t={t} />))}
              </div>
            )}

            {ambiguousSets.length > 0 && (
              <div className="wish-box">
                <div className="label">{t("Flera set passar. Välj rätt.")}</div>
                {ambiguousSets.map(([setText, r]) => (
                  <div key={setText} className="row">
                    <span className="grow">{setText}</span>
                    <select defaultValue="" onChange={(e) => e.target.value && setSetFor(setText, e.target.value)} aria-label={`${t("Välj set för")} ${setText}`}>
                      <option value="">{t("Välj set …")}</option>
                      {(r.candidates || []).map((c) => (<option key={String(c.id)} value={String(c.id)}>{c.label}</option>))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {rows.map((r) => {
              const key = `${r.card_id}${r.parallel_id ? ":" + r.parallel_id : ""}`;
              const ok = r.result ? MATCHED.includes(r.result) : false;
              return (
                <div key={r.row_no} className="par-row" style={{ flexWrap: "wrap" }}>
                  <span className="mono note">#{r.row_no}</span>
                  <span className="grow">
                    <b>{String(r.norm.name || "") || "–"}</b>
                    <span className="note"> · {String(r.norm.set || t("(inget set)"))}{r.norm.section ? ` · ${r.norm.section}` : ""}{r.norm.code ? ` · ${r.norm.code}` : ""}{r.norm.no != null ? ` ${r.norm.no}` : ""}{r.norm.parallel ? ` · ${r.norm.parallel}` : ""} · ×{String(r.norm.qty ?? "?")}</span>
                  </span>
                  <span className="note">{t(RESULT_LABEL[r.result || ""] || "–")}{r.reason && REASON_LABEL[r.reason] ? ` (${t(REASON_LABEL[r.reason])})` : ""}</span>
                  {ok && r.prev_qty != null && (
                    <>
                      <span className="note mono">{t("har")} {r.prev_qty} → {newQty(r)}</span>
                      <select value={overrides[key] || ""} onChange={(e) => setOverrides((o) => { const n = { ...o }; if (!e.target.value) delete n[key]; else n[key] = e.target.value as Strategy; return n; })} aria-label={t("Hantering för den här raden")}>
                        <option value="">{t("Som ovan")}</option>
                        <option value="add">{t("Lägg till")}</option>
                        <option value="replace">{t("Ersätt")}</option>
                        <option value="skip">{t("Hoppa över")}</option>
                      </select>
                    </>
                  )}
                  {r.result === "ambiguous" && r.reason === "name_differs" && r.candidates?.[0] && (
                    <button className="btn small" type="button" onClick={() => pick(r, Number(r.candidates![0].id))}>{t("Det är kortet")} “{r.candidates[0].label}”</button>
                  )}
                </div>
              );
            })}
            {!rows.length && <div className="note">{t("Inga rader här.")}</div>}
            <div className="row">
              <button className="btn small ghost" type="button" disabled={page === 0} onClick={() => { setPage(page - 1); refresh(filter, page - 1); }}>{t("Föregående")}</button>
              <span className="note">{t("Sida")} {page + 1}</span>
              <button className="btn small ghost" type="button" disabled={rows.length < PAGE} onClick={() => { setPage(page + 1); refresh(filter, page + 1); }}>{t("Nästa")}</button>
            </div>

            <div className="row">
              <button className="btn primary" type="button" disabled={!!busy || matched === 0} onClick={commit}>{t("Bekräfta och lägg till")} {matched ? `(${matched})` : ""}</button>
              <button className="btn ghost" type="button" disabled={!!busy} onClick={cancel}>{t("Avbryt")}</button>
            </div>
            {matched === 0 && <div className="note">{t("Inga rader matchade katalogen. Du kan ändå avbryta här, eller välja set ovan om flera passar.")}</div>}
          </>
        )}

        {step === "done" && result && (
          <>
            <div className="wish-box">
              <b>{t("Importen är klar")}</b>
              <div>{result.created} {t("nya kort")} · {result.changed} {t("ändrade antal")} · {result.kept} {t("lämnades som de var")}</div>
              {(result.pending > 0 || result.invalid > 0) && <div className="note">{result.pending} {t("rader sparades som väntande")}{result.invalid ? ` · ${result.invalid} ${t("var ogiltiga")}` : ""}.</div>}
            </div>
            <div className="row">
              <button className="btn" type="button" onClick={() => setStep("history")}>{t("Visa historik")}</button>
              <button className="btn" type="button" onClick={() => setStep("pending")}>{t("Visa väntande")}</button>
              <button className="btn ghost" type="button" onClick={() => { setStep("input"); setText(""); setFile(null); }}>{t("Ny import")}</button>
            </div>
          </>
        )}

        {step === "history" && (
          <>
            {!jobs.length && <div className="note">{t("Inga importer än.")}</div>}
            {jobs.map((j) => (
              <div key={j.id} className="wish-box">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{new Date(j.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })} · {j.file_name || t(j.source === "paste" || j.source === "list" ? "Inklistrad text" : "Fil")}</b>
                  <span className="note">{t(STATUS_LABEL[j.status] || j.status)}</span>
                </div>
                <div className="note">{j.row_count} {t("rader")}{j.stats?.created != null ? ` · ${j.stats.created} ${t("nya")} · ${j.stats.changed} ${t("ändrade")} · ${j.stats.pending} ${t("väntande")}` : ""}</div>
                {["completed", "partially_completed"].includes(j.status) && (undoId === j.id ? (
                  <div className="row">
                    <span className="note">{t("Återställer bara det som inte ändrats sedan importen.")}</span>
                    <button className="btn small danger" type="button" disabled={!!busy} onClick={() => undo(j.id)}>{t("Ångra nu")}</button>
                    <button className="btn small ghost" type="button" onClick={() => setUndoId(null)}>{t("Behåll")}</button>
                  </div>
                ) : (
                  <div className="row"><button className="btn small ghost" type="button" onClick={() => setUndoId(j.id)}>{t("Ångra importen")}</button></div>
                ))}
              </div>
            ))}
          </>
        )}

        {step === "pending" && (
          <>
            <div className="note">{t("Det här är rader från dina importer som inte finns i katalogen (eller som var osäkra). De är privata, räknas inte som dina kort och sparas åt dig tills katalogen har dem.")}</div>
            {!pending.length && <div className="note">{t("Inget väntar.")}</div>}
            {pending.length > 0 && (
              <div className="row">
                <button className="btn small primary" type="button" disabled={!!busy} onClick={resume}>{t("Matcha väntande rader igen")}</button>
                <span className="note">{t("Använd den när ett set har lagts in i katalogen. Du granskar och godkänner innan något läggs till.")}</span>
              </div>
            )}
            {pending.map((p, i) => (
              <div key={i} className="par-row">
                <span className="mono note">{p.subset_code ? `${p.subset_code} ` : ""}{p.card_no ?? ""}</span>
                <span className="grow"><b>{p.player || "–"}</b><span className="note"> · {p.set_title || p.set_text || t("(inget set)")} · ×{p.qty ?? "?"}</span></span>
                <span className="note">{t(RESULT_LABEL[p.result] || p.result)}{p.reason && REASON_LABEL[p.reason] ? ` (${t(REASON_LABEL[p.reason])})` : ""}</span>
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
