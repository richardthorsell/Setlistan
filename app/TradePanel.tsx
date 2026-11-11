"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import "./panels.css";
import { useT } from "@/lib/i18n";

type Me = { joined: boolean; my_ref: string | null; my_alias: string | null; my_contact: string | null };
type Card = { card_id: number; set_key: string; set: string; code: string; no: number; name: string };
type Match = { partner_ref: string; partner_alias: string; give_n: number; receive_n: number; mutual: number; give_cards: Card[]; receive_cards: Card[]; has_open_request: boolean };
type Req = { request_id: number; direction: "in" | "out"; partner_alias: string; status: "pending" | "accepted" | "declined" | "withdrawn"; message: string; created_at: string; partner_contact: string | null };

const label = (c: Card) => (c.code ? `${c.code} ${c.no}` : String(c.no));

// Trade partners. Opt-in only; matches are anonymous labels with the cards that could change hands, and a contact line is shared
// only after both sides agree. Leaving deletes the profile and every request. All data goes through database functions.
export default function TradePanel({ supabase, onClose, onOpenSet }: { supabase: SupabaseClient; onClose: () => void; onOpenSet: (id: string) => void }) {
  const t = useT();
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<"matches" | "requests" | "profile">("matches");
  const [matches, setMatches] = useState<Match[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [contact, setContact] = useState("");
  const [agree, setAgree] = useState(false);
  const [msgTo, setMsgTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const fail = (e: { message: string }) => {
    setMsg(/there is already/.test(e.message) ? t("Det finns redan en öppen förfrågan med den här samlaren.") : /too many/.test(e.message) ? t("Du har skickat fem förfrågningar idag. Försök igen i morgon.") : /bad contact/.test(e.message) ? t("Skriv en kontaktuppgift på 3–200 tecken.") : t("Något gick fel. Försök igen."));
  };

  const loadMe = useCallback(async () => {
    const { data, error } = await supabase.rpc("trade_me");
    if (error) return setMsg(t("Funktionen är inte tillgänglig just nu."));
    const m = (data as Me[])?.[0] || null;
    setMe(m);
    if (m?.my_contact) setContact(m.my_contact);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);
  const loadMatches = useCallback(async () => {
    const { data, error } = await supabase.rpc("trade_matches", { p_limit: 20 });
    if (error) return setMsg(t("Kunde inte hämta matchningar."));
    setMatches((data as Match[]) || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);
  const loadReqs = useCallback(async () => {
    const { data, error } = await supabase.rpc("trade_inbox");
    if (error) return setMsg(t("Kunde inte hämta förfrågningar."));
    setReqs((data as Req[]) || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);
  useEffect(() => {
    if (!me?.joined) return;
    loadMatches();
    loadReqs();
  }, [me?.joined, loadMatches, loadReqs]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const join = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("trade_join", { p_contact: contact });
    setBusy(false);
    if (error) return fail(error);
    await loadMe();
  };
  const leave = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("trade_leave");
    setBusy(false);
    setConfirmLeave(false);
    if (error) return fail(error);
    setMatches([]);
    setReqs([]);
    setAgree(false);
    setMsg(t("Du har lämnat bytesfunktionen. Din profil och alla förfrågningar är borttagna."));
    await loadMe();
  };
  const send = async (ref: string) => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc("trade_request", { p_ref: ref, p_message: text });
    setBusy(false);
    if (error) return fail(error);
    setMsgTo(null);
    setText("");
    setMsg(t("Förfrågan är skickad. Din kontaktuppgift delas först om den andra godkänner."));
    loadMatches();
    loadReqs();
  };
  const respond = async (id: number, accept: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("trade_respond", { p_request_id: id, p_accept: accept });
    setBusy(false);
    if (error) return fail(error);
    loadReqs();
  };
  const withdraw = async (id: number) => {
    setBusy(true);
    const { error } = await supabase.rpc("trade_withdraw", { p_request_id: id });
    setBusy(false);
    if (error) return fail(error);
    loadReqs();
    loadMatches();
  };

  const cardList = (cards: Card[]) =>
    cards.map((c) => (
      <div key={c.card_id} className="par-row">
        <span className="mono note">{label(c)}</span>
        <span className="grow"><b>{c.name}</b></span>
        <button className="btn small ghost" type="button" onClick={() => onOpenSet(c.set_key)}>{c.set}</button>
      </div>
    ));

  const pendingIn = reqs.filter((r) => r.direction === "in" && r.status === "pending").length;

  return (
    <div className="t-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel tradera" role="dialog" aria-modal="true" aria-label={t("Bytespartners")}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3>{t("Bytespartners")}</h3>
          <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
        </div>
        {msg && <div className="note" role="status">{msg}</div>}

        {me && !me.joined && (
          <div className="wish-box">
            <b>{t("Vill du hitta bytespartners?")}</b>
            <div className="note">{t("Du väljer själv att vara med. Andra som är med ser bara en anonym etikett (till exempel “Samlare 4F2A”) och vilka av dina dubbletter som de saknar. Dina favoritkort erbjuds aldrig. Din kontaktuppgift delas först om du skickar eller godkänner en förfrågan och den andra också godkänner. Du kan lämna när som helst, då tas allt bort.")}</div>
            <input className="t-input" style={{ width: "100%" }} maxLength={200} placeholder={t("Hur vill du bli kontaktad? Till exempel en e-postadress eller ett Instagram-namn")} aria-label={t("Kontaktuppgift")} value={contact} onChange={(e) => setContact(e.target.value)} />
            <label className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="note">{t("Jag förstår att mina dubbletter då syns anonymt för andra som är med, och att kontaktuppgiften delas först när båda godkänner.")}</span>
            </label>
            <div className="row"><button className="btn primary" type="button" disabled={busy || !agree || contact.trim().length < 3} onClick={join}>{t("Gå med")}</button></div>
          </div>
        )}

        {me?.joined && (
          <>
            <div className="seg" role="group" aria-label={t("Bytespartners")}>
              <button type="button" aria-pressed={tab === "matches"} onClick={() => setTab("matches")}>{t("Matchningar")}</button>
              <button type="button" aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>{t("Förfrågningar")}{pendingIn ? ` ${pendingIn}` : ""}</button>
              <button type="button" aria-pressed={tab === "profile"} onClick={() => setTab("profile")}>{t("Min profil")}</button>
            </div>

            {tab === "matches" && (
              <>
                <div className="note">{t("Visar dubbletter som kan bytas i set där ni båda samlar, och kort på önskelistor. Bara baskort.")}</div>
                {!matches.length && <div className="note">{t("Inga matchningar än. Det kommer fler när fler samlare är med och har dubbletter.")}</div>}
                {matches.map((m) => (
                  <div key={m.partner_ref} className="wish-box">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>{m.partner_alias}</b>
                      <span className="note mono">{m.mutual > 0 ? `${t("tvåvägsbyte")} · ` : ""}{t("du kan ge")} {m.give_n} · {t("du kan få")} {m.receive_n}</span>
                    </div>
                    {m.give_cards.length > 0 && (<><div className="label">{t("Du kan ge")}</div>{cardList(m.give_cards)}</>)}
                    {m.receive_cards.length > 0 && (<><div className="label">{t("Du kan få")}</div>{cardList(m.receive_cards)}</>)}
                    {m.has_open_request ? (
                      <div className="note">{t("Det finns redan en förfrågan med den här samlaren. Se fliken Förfrågningar.")}</div>
                    ) : msgTo === m.partner_ref ? (
                      <div className="row">
                        <input className="t-input grow" maxLength={200} placeholder={t("Valfritt meddelande, till exempel vilka kort du vill byta")} aria-label={t("Meddelande")} value={text} onChange={(e) => setText(e.target.value)} />
                        <button className="btn primary small" type="button" disabled={busy} onClick={() => send(m.partner_ref)}>{t("Skicka förfrågan")}</button>
                        <button className="btn ghost small" type="button" onClick={() => setMsgTo(null)}>{t("Avbryt")}</button>
                      </div>
                    ) : (
                      <div className="row"><button className="btn small" type="button" onClick={() => { setMsgTo(m.partner_ref); setText(""); }}>{t("Fråga om byte")}</button></div>
                    )}
                  </div>
                ))}
              </>
            )}

            {tab === "requests" && (
              <>
                {!reqs.length && <div className="note">{t("Inga förfrågningar.")}</div>}
                {reqs.map((r) => (
                  <div key={r.request_id} className="wish-box">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>{r.partner_alias}</b>
                      <span className="note">{r.direction === "in" ? t("till dig") : t("från dig")} · {r.status === "pending" ? t("väntar") : r.status === "accepted" ? t("godkänd") : t("avböjd")}</span>
                    </div>
                    {r.message && <div className="note">“{r.message}”</div>}
                    {r.status === "accepted" && <div><b>{t("Kontakt")}:</b> {r.partner_contact}</div>}
                    {r.status === "pending" && r.direction === "in" && (
                      <>
                        <div className="note">{t("Om du godkänner delas din kontaktuppgift med den här samlaren, och du får deras.")}</div>
                        <div className="row">
                          <button className="btn primary small" type="button" disabled={busy} onClick={() => respond(r.request_id, true)}>{t("Godkänn")}</button>
                          <button className="btn ghost small" type="button" disabled={busy} onClick={() => respond(r.request_id, false)}>{t("Avböj")}</button>
                        </div>
                      </>
                    )}
                    {r.status === "pending" && r.direction === "out" && (
                      <div className="row"><button className="btn ghost small" type="button" disabled={busy} onClick={() => withdraw(r.request_id)}>{t("Dra tillbaka")}</button></div>
                    )}
                  </div>
                ))}
              </>
            )}

            {tab === "profile" && (
              <div className="wish-box">
                <div><b>{t("Din etikett")}:</b> {me.my_alias}</div>
                <div className="label">{t("Din kontaktuppgift (delas bara efter godkännande)")}</div>
                <input className="t-input" style={{ width: "100%" }} maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} aria-label={t("Kontaktuppgift")} />
                <div className="row">
                  <button className="btn small" type="button" disabled={busy || contact.trim().length < 3 || contact === me.my_contact} onClick={join}>{t("Spara")}</button>
                </div>
                {confirmLeave ? (
                  <div className="confirm">
                    <span>{t("Lämna och ta bort din profil och alla förfrågningar? Det går inte att ångra.")}</span>
                    <button className="btn danger small" type="button" disabled={busy} onClick={leave}>{t("Lämna")}</button>
                    <button className="btn ghost small" type="button" onClick={() => setConfirmLeave(false)}>{t("Behåll")}</button>
                  </div>
                ) : (
                  <div className="row"><button className="btn ghost danger small" type="button" onClick={() => setConfirmLeave(true)}>{t("Lämna bytesfunktionen")}</button></div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
