"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

type Hit = { player_key: string; display_name: string; cards: number; sets: number };
type Alias = { alias_key: string; canonical_key: string };
type Merged = { id: string; name: string; merged_into: string | null };

// Superuser: say that two spellings are the same player (alias), or hide a duplicate set. Nothing is deleted, and both can be undone.
export default function MergePanel({ supabase, sets, onChanged, say, onClose }: { supabase: SupabaseClient; sets: { id: string; name: string }[]; onChanged: () => void; say: (m: string) => void; onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<"players" | "sets">("players");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [keepP, setKeepP] = useState<Hit | null>(null);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [keepS, setKeepS] = useState<{ id: string; name: string } | null>(null);
  const [merged, setMerged] = useState<Merged[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loadLists = useCallback(async () => {
    const [a, m] = await Promise.all([supabase.from("player_aliases").select("alias_key, canonical_key").order("created_at", { ascending: false }), supabase.from("sets").select("id, name, merged_into").eq("status", "merged").order("name")]);
    setAliases((a.data as Alias[]) || []);
    setMerged((m.data as Merged[]) || []);
  }, [supabase]);
  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const searchPlayers = useCallback(async () => {
    if (q.trim().length < 3 || tab !== "players") return setHits([]);
    const { data } = await supabase.rpc("search_players", { q: q.trim() });
    setHits(((data as Hit[]) || []).map((h) => ({ ...h, cards: Number(h.cards), sets: Number(h.sets) })));
  }, [supabase, q, tab]);
  useEffect(() => {
    const h = setTimeout(searchPlayers, 300);
    return () => clearTimeout(h);
  }, [searchPlayers]);

  const mergePlayers = async (dup: Hit) => {
    if (!keepP) return;
    if (!window.confirm(`${t("Räkna")} "${dup.display_name}" ${t("som samma spelare som")} "${keepP.display_name}"? ${t("Kortens namn ändras inte och det går att ångra.")}`)) return;
    const { error } = await supabase.rpc("admin_merge_players", { p_alias: dup.player_key, p_canonical: keepP.player_key });
    if (error) return say(t("Kunde inte slå ihop."));
    say(t("Spelarna räknas nu som samma."));
    setKeepP(null);
    await searchPlayers();
    loadLists();
  };
  const unmergePlayer = async (alias: string) => {
    const { error } = await supabase.rpc("admin_unmerge_player", { p_alias: alias });
    if (error) return say(t("Kunde inte ångra."));
    loadLists();
    searchPlayers();
  };
  const mergeSets = async (dup: { id: string; name: string }) => {
    if (!keepS) return;
    if (!window.confirm(`${t("Dölj")} "${dup.name}" ${t("som dubblett av")} "${keepS.name}"? ${t("Inget raderas och det går att ångra, men avprickningar i det dolda setet syns inte längre.")}`)) return;
    const { error } = await supabase.rpc("admin_merge_sets", { p_dup: dup.id, p_keep: keepS.id });
    if (error) return say(t("Kunde inte slå ihop."));
    say(t("Setet är dolt som dubblett."));
    setKeepS(null);
    onChanged();
    loadLists();
  };
  const unmergeSet = async (id: string) => {
    const { error } = await supabase.rpc("admin_unmerge_set", { p_id: id });
    if (error) return say(t("Kunde inte ångra."));
    onChanged();
    loadLists();
  };

  const ql = q.trim().toLowerCase();
  const setHitsList = tab === "sets" && ql.length >= 2 ? sets.filter((s) => s.name.toLowerCase().includes(ql)).slice(0, 30) : [];
  const nameOf = (key: string) => key;

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera pl" role="dialog" aria-modal="true" aria-label={t("Slå ihop")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Slå ihop spelare och set")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        <div className="seg" role="group" aria-label={t("Typ")}>
          <button type="button" aria-pressed={tab === "players"} onClick={() => { setTab("players"); setQ(""); }}>{t("Spelare")}</button>
          <button type="button" aria-pressed={tab === "sets"} onClick={() => { setTab("sets"); setQ(""); }}>{t("Set")}</button>
        </div>
        <div className="note">
          {tab === "players"
            ? t("Sök spelaren. Välj den stavning som ska gälla med Behåll, och tryck sedan Slå ihop på den andra stavningen.")
            : t("Sök setet. Välj det som ska gälla med Behåll, och tryck sedan Dölj på dubbletten.")}
        </div>
        <input className="t-input" style={{ width: "100%" }} placeholder={tab === "players" ? t("Sök spelare") : t("Sök set")} aria-label={tab === "players" ? t("Sök spelare") : t("Sök set")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />

        {tab === "players" && (
          <>
            {keepP && <div className="note"><b>{t("Behåll")}:</b> {keepP.display_name} <button className="btn small ghost" type="button" onClick={() => setKeepP(null)}>{t("Ångra val")}</button></div>}
            <div className="pl-list">
              {hits.map((h) => (
                <div key={h.player_key} className="row" style={{ justifyContent: "space-between" }}>
                  <span><b>{h.display_name}</b> <span className="note">{h.cards} {t("kort")} · {h.sets} {t("set")}</span></span>
                  {keepP && keepP.player_key !== h.player_key ? (
                    <button className="btn small primary" type="button" onClick={() => mergePlayers(h)}>{t("Slå ihop")}</button>
                  ) : (
                    <button className="btn small" type="button" aria-pressed={keepP?.player_key === h.player_key} onClick={() => setKeepP(h)}>{t("Behåll")}</button>
                  )}
                </div>
              ))}
            </div>
            {aliases.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 6 }}>{t("Sammanslagna stavningar")}</div>
                <div className="pl-list">
                  {aliases.map((a) => (
                    <div key={a.alias_key} className="row" style={{ justifyContent: "space-between" }}>
                      <span>{nameOf(a.alias_key)} → <b>{nameOf(a.canonical_key)}</b></span>
                      <button className="btn small ghost" type="button" onClick={() => unmergePlayer(a.alias_key)}>{t("Ångra")}</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "sets" && (
          <>
            {keepS && <div className="note"><b>{t("Behåll")}:</b> {keepS.name} <button className="btn small ghost" type="button" onClick={() => setKeepS(null)}>{t("Ångra val")}</button></div>}
            <div className="pl-list">
              {setHitsList.map((s) => (
                <div key={s.id} className="row" style={{ justifyContent: "space-between" }}>
                  <b>{s.name}</b>
                  {keepS && keepS.id !== s.id ? (
                    <button className="btn small primary" type="button" onClick={() => mergeSets(s)}>{t("Dölj")}</button>
                  ) : (
                    <button className="btn small" type="button" aria-pressed={keepS?.id === s.id} onClick={() => setKeepS(s)}>{t("Behåll")}</button>
                  )}
                </div>
              ))}
            </div>
            {merged.length > 0 && (
              <>
                <div className="label" style={{ marginTop: 6 }}>{t("Dolda dubbletter")}</div>
                <div className="pl-list">
                  {merged.map((m) => (
                    <div key={m.id} className="row" style={{ justifyContent: "space-between" }}>
                      <span>{m.name}{m.merged_into ? ` → ${sets.find((s) => s.id === m.merged_into)?.name ?? m.merged_into}` : ""}</span>
                      <button className="btn small ghost" type="button" onClick={() => unmergeSet(m.id)}>{t("Återställ")}</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
