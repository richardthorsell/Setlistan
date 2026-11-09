"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { type Card, type Parallel, type Section, type SetStat, type Sport, SPORTS, label, matches, norm, parallelLabel, parsePaste, quickIds, ranges, slug, sportLabel } from "@/lib/checklist";
import TraderaPanel, { type TraderaScope } from "./TraderaPanel";
import EbayPanel from "./EbayPanel";
import WishPanel from "./WishPanel";
import PlayerPanel from "./PlayerPanel";
import SellPanel from "./SellPanel";
import type { Wish, Trade } from "./CardPar";
import AuthBox from "./AuthBox";
import AdminPanel from "./AdminPanel";
import { FeedbackBox, WaitlistBox } from "./BetaPanels";
import Landing from "./Landing";
import SetPicker from "./SetPicker";
import AccountPanel from "./AccountPanel";
import CardPar from "./CardPar";
import { SiteFooter } from "./LegalPage";
import { WhatsNew, Welcome, type Update } from "./Onboarding";
import { LangSwitch, useNote, useT } from "@/lib/i18n";

type Filter = "all" | "missing" | "have" | "fav" | "dups" | "wish" | "sale" | "incoming";
const NO_TRADE: Trade = { for_sale: 0, buy_price: null, sell_price: null, incoming: false, note: null };
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

// Owned parallels are kept as "cardId:parallelId" -> serial number (or null) when not signed in.
function readLocalPar(setId: string): Map<string, string | null> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(`setlistan:par:${setId}`) || "{}")));
  } catch {
    return new Map();
  }
}
function writeLocalPar(setId: string, m: Map<string, string | null>) {
  try {
    localStorage.setItem(`setlistan:par:${setId}`, JSON.stringify(Object.fromEntries(m)));
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
  const t = useT();
  const note = useNote();
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
  const [view, setView] = useState<"grid" | "list">("list");
  const [find, setFind] = useState("");
  const [team, setTeam] = useState("");
  const [quick, setQuick] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "superuser" | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showWait, setShowWait] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [parCard, setParCard] = useState<{ card: Card; sec: Section } | null>(null);
  const [ready, setReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [newsSince, setNewsSince] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [fetchLog, setFetchLog] = useState<LogLine[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchDone, setFetchDone] = useState<string | null>(null);
  const [paste, setPaste] = useState<{ name: string; text: string; sport: Sport } | null>(null);
  const [sport, setSport] = useState<Sport | "">("");
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [parallels, setParallels] = useState<Parallel[]>([]);
  const [ownedPar, setOwnedPar] = useState<Map<string, string | null>>(new Map());
  const [favCards, setFavCards] = useState<Set<number>>(new Set());
  const [suggested, setSuggested] = useState<Set<string>>(new Set());
  const [parSel, setParSel] = useState<number | null>(null);
  const [tradera, setTradera] = useState<TraderaScope | null>(null);
  const [ebay, setEbay] = useState<TraderaScope | null>(null);
  // Copies per card ("b:<card>" for the base card, "<card>:<parallel>" for a parallel); only counts above one are stored.
  const [qty, setQty] = useState<Map<string, number>>(new Map());
  const [wishes, setWishes] = useState<Map<number, Wish>>(new Map());
  const [trades, setTrades] = useState<Map<number, Trade>>(new Map());
  const [showWish, setShowWish] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [heroQ, setHeroQ] = useState("");
  const [playerQ, setPlayerQ] = useState("");
  const [playerSel, setPlayerSel] = useState<{ player_key: string; display_name: string } | null>(null);
  const [followed, setFollowed] = useState<{ player_key: string; display_name: string; have?: number; total?: number }[]>([]);

  // Followed players for the start page, with how many of their cards you have. Reloaded when the player panel closes.
  useEffect(() => {
    if (!user || showPlayers) return;
    let live = true;
    (async () => {
      const { data } = await supabase.from("favorite_players").select("player_key, display_name").order("created_at", { ascending: false });
      if (!live) return;
      const list = ((data as { player_key: string; display_name: string }[]) || []).slice(0, 12);
      setFollowed(list);
      for (const f of list) {
        const { data: cs } = await supabase.rpc("player_cards", { p_key: f.player_key }).range(0, 999);
        if (!live) return;
        const rows = (cs as { qty: number | null }[]) || [];
        setFollowed((p) => p.map((x) => (x.player_key === f.player_key ? { ...x, have: rows.filter((c) => c.qty !== null).length, total: rows.length } : x)));
      }
    })();
    return () => {
      live = false;
    };
  }, [user, showPlayers, supabase]);
  const [wishCount, setWishCount] = useState(0);
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
    // The library has more than 1000 sets, so page through it (PostgREST caps one request at 1000 rows).
    try {
      const rows = await fetchAll<SetStat>((a, b) => supabase.from("set_stats").select("*").eq("status", "ready").order("verified", { ascending: false }).order("created_at", { ascending: false }).order("id").range(a, b));
      setSets(rows);
    } catch {
      setSets([]);
    }
  }, [supabase]);

  const loadCounts = useCallback(
    async (u: User | null) => {
      if (u) {
        const { data } = await supabase.from("my_owned_counts").select("set_id, n");
        setCounts(Object.fromEntries((data || []).map((r: { set_id: string; n: number }) => [r.set_id, r.n])));
        const w = await supabase.from("wishlist").select("card_id", { count: "exact", head: true });
        setWishCount(w.count ?? 0);
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
      const parKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith("setlistan:par:")) parKeys.push(k);
      }
      for (const k of parKeys) {
        const setId = k.slice(14);
        const rows = Object.entries(JSON.parse(localStorage.getItem(k) || "{}") as Record<string, string | null>).map(([key, serial]) => {
          const [card_id, parallel_id] = key.split(":").map(Number);
          return { card_id, parallel_id, set_id: setId, serial };
        });
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabase.from("owned_parallels").upsert(rows.slice(i, i + 500), { onConflict: "user_id,card_id,parallel_id", ignoreDuplicates: true });
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

  // Onboarding state and the "what's new" feed for the signed-in user.
  const loadState = useCallback(
    async (u: User | null) => {
      if (!u) {
        setShowWelcome(false);
        setShowNews(false);
        setUpdates([]);
        setSeenAt(null);
        setFavs(new Set());
        return;
      }
      const [s, n, f] = await Promise.all([
        supabase.from("user_state").select("onboarded_at, updates_seen_at").maybeSingle(),
        supabase.from("app_updates").select("id, title, body, created_at").order("created_at", { ascending: false }).limit(20),
        supabase.from("favorites").select("set_id"),
      ]);
      setFavs(new Set(((f.data as { set_id: string }[]) || []).map((r) => r.set_id)));
      setUpdates((n.data as Update[]) || []);
      setSeenAt(s.data?.updates_seen_at ?? null);
      if (!s.error && !s.data?.onboarded_at) setShowWelcome(true);
      // Signed-in users who have already seen the welcome get "what's new" at once when something has been added since last time.
      if (!s.error && s.data?.onboarded_at) {
        const seen = s.data?.updates_seen_at ?? null;
        const fresh = ((n.data as Update[]) || []).some((x) => seen === null || x.created_at > seen);
        if (fresh) {
          setNewsSince(seen);
          setShowNews(true);
          const now = new Date().toISOString();
          await supabase.from("user_state").upsert({ user_id: u.id, updates_seen_at: now });
          setSeenAt(now);
        }
      }
    },
    [supabase],
  );
  // Favourite albums: updated at once, saved in the background and rolled back if saving fails.
  const toggleFav = useCallback(
    async (id: string) => {
      const was = favs.has(id);
      setFavs((prev) => {
        const next = new Set(prev);
        if (was) next.delete(id);
        else next.add(id);
        return next;
      });
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const r = was ? await supabase.from("favorites").delete().eq("set_id", id) : await supabase.from("favorites").insert({ set_id: id });
      if (r.error) {
        setFavs((prev) => {
          const next = new Set(prev);
          if (was) next.add(id);
          else next.delete(id);
          return next;
        });
        say(t("Kunde inte spara favoriten."));
      }
    },
    [supabase, favs, say],
  );
  const markSeen = useCallback(
    async (welcome: boolean) => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const now = new Date().toISOString();
      await supabase.from("user_state").upsert({ user_id: data.user.id, ...(welcome ? { onboarded_at: now } : {}), updates_seen_at: now });
      setSeenAt(now);
    },
    [supabase],
  );
  const unseen = seenAt === null ? 0 : updates.filter((u) => u.created_at > seenAt).length;

  useEffect(() => {
    loadSets();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setReady(true);
      loadCounts(data.user);
      loadRole(data.user);
      loadState(data.user);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setReady(true);
      if (event === "SIGNED_IN" && u) {
        setShowAuth(false);
        await pushLocal();
        loadSets();
      }
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        loadRole(u);
        loadState(u);
        if (!u) setShowAdmin(false);
      }
      loadCounts(u);
    });
    const params = new URLSearchParams(location.search);
    if (params.get("inloggning") === "misslyckades") say(t("Inloggningslänken fungerade inte. Begär en ny."));
    if (params.get("konto") === "borttaget") say(t("Ditt konto och dina uppgifter är borttagna."));
    if (params.size) history.replaceState(null, "", location.pathname + location.hash);
    return () => sub.subscription.unsubscribe();
  }, [supabase, loadSets, loadCounts, loadRole, loadState, pushLocal, say]);

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
        const mineQty = new Map<string, number>();
        if (uid) {
          const rows = await fetchAll<{ card_id: number; qty: number }>((a, b) => supabase.from("owned").select("card_id, qty").eq("set_id", openId).order("card_id").range(a, b));
          mine = new Set(rows.map((r) => r.card_id));
          for (const r of rows) if (r.qty > 1) mineQty.set("b:" + r.card_id, r.qty);
        } else mine = readLocal(openId);
        const pars = await supabase.from("parallels").select("id, section_id, name, print_run, position").eq("set_id", openId).order("position");
        let minePar = new Map<string, string | null>();
        if (uid) {
          const rows = await fetchAll<{ card_id: number; parallel_id: number; serial: string | null; qty: number }>((a, b) =>
            supabase.from("owned_parallels").select("card_id, parallel_id, serial, qty").eq("set_id", openId).order("card_id").order("parallel_id").range(a, b),
          );
          minePar = new Map(rows.map((r) => [`${r.card_id}:${r.parallel_id}`, r.serial]));
          for (const r of rows) if (r.qty > 1) mineQty.set(`${r.card_id}:${r.parallel_id}`, r.qty);
        } else minePar = readLocalPar(openId);
        let mineFav = new Set<number>();
        const mineWish = new Map<number, Wish>();
        const mineTrade = new Map<number, Trade>();
        if (uid) {
          const tr = await fetchAll<{ card_id: number } & Trade>((a, b) => supabase.from("card_trade").select("card_id, for_sale, buy_price, sell_price, incoming, note").eq("set_id", openId).order("card_id").range(a, b));
          for (const r of tr) mineTrade.set(r.card_id, { for_sale: r.for_sale, buy_price: r.buy_price, sell_price: r.sell_price, incoming: r.incoming, note: r.note });
          const rows = await fetchAll<{ card_id: number }>((a, b) => supabase.from("favorite_cards").select("card_id").eq("set_id", openId).range(a, b));
          mineFav = new Set(rows.map((r) => r.card_id));
          const w = await fetchAll<{ card_id: number; priority: number; max_price: number | null; note: string | null }>((a, b) => supabase.from("wishlist").select("card_id, priority, max_price, note").eq("set_id", openId).order("card_id").range(a, b));
          for (const r of w) mineWish.set(r.card_id, { priority: r.priority, max_price: r.max_price, note: r.note });
        }
        if (stop) return;
        setSections(list);
        setOwned(mine);
        setParallels((pars.data as Parallel[]) || []);
        setOwnedPar(minePar);
        setFavCards(mineFav);
        setQty(mineQty);
        setWishes(mineWish);
        setTrades(mineTrade);
      } catch {
        if (!stop) say(t("Kunde inte läsa setet just nu."));
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
    setParSel(null);
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
  // With a parallel selected only the subsets it belongs to are shown and counted.
  const selPar = parallels.find((p) => p.id === parSel) || null;
  const scoped = selPar ? sections.filter((s) => selPar.section_id === null || s.id === selPar.section_id) : sections;
  const has = (c: Card) => (selPar ? ownedPar.has(`${c.id}:${selPar.id}`) : owned.has(c.id));
  const serialOf = (c: Card) => (selPar ? ownedPar.get(`${c.id}:${selPar.id}`) || "" : "");
  const parCount = (p: Parallel) => {
    const n = sections.filter((s) => p.section_id === null || s.id === p.section_id).reduce((a, s) => a + s.cards.length, 0);
    let h = 0;
    for (const k of ownedPar.keys()) if (k.endsWith(":" + p.id)) h++;
    return `${h}/${n}`;
  };
  // The parallel list only offers what fits: with one subset open, that subset's parallels; with t("Alla delset"), grouped by subset.
  const activeSec = secIdx >= scoped.length ? null : scoped[secIdx] ?? null;
  const parOptions = parallels.filter((p) => p.section_id === null || !activeSec || p.section_id === activeSec.id);
  const parOpt = (p: Parallel) => (
    <option key={p.id} value={p.id}>
      {parallelLabel(p)} · {parCount(p)}
    </option>
  );
  const total = scoped.reduce((n, s) => n + s.cards.length, 0);
  const have =scoped.reduce((n, s) => n + s.cards.filter(has).length, 0);
  const pct = total ? Math.round((have / total) * 100) : 0;

  const applyParallel = async (ids: number[], on: boolean) => {
    if (!openId || !selPar) return 0;
    const pid = selPar.id;
    const next = new Map(ownedPar);
    const changed = ids.filter((id) => on !== next.has(`${id}:${pid}`));
    changed.forEach((id) => (on ? next.set(`${id}:${pid}`, null) : next.delete(`${id}:${pid}`)));
    if (!on) setQty((q) => { const n = new Map(q); changed.forEach((id) => n.delete(`${id}:${pid}`)); return n; });
    setOwnedPar(next);
    if (!user) {
      writeLocalPar(openId, next);
      return changed.length;
    }
    try {
      for (let i = 0; i < changed.length; i += 500) {
        const part = changed.slice(i, i + 500);
        const { error } = on
          ? await supabase.from("owned_parallels").upsert(part.map((card_id) => ({ card_id, parallel_id: pid, set_id: openId })), { onConflict: "user_id,card_id,parallel_id", ignoreDuplicates: true })
          : await supabase.from("owned_parallels").delete().eq("parallel_id", pid).in("card_id", part);
        if (error) throw error;
      }
    } catch {
      say(t("Kunde inte spara. Ladda om sidan och försök igen."));
    }
    return changed.length;
  };

  const saveSerial = async (cardId: number, value: string) => {
    if (!openId || !selPar) return;
    const key = `${cardId}:${selPar.id}`;
    const serial = value.trim() || null;
    if (!ownedPar.has(key) || ownedPar.get(key) === serial) return;
    const next = new Map(ownedPar);
    next.set(key, serial);
    setOwnedPar(next);
    if (!user) return writeLocalPar(openId, next);
    const { error } = await supabase.from("owned_parallels").update({ serial }).eq("card_id", cardId).eq("parallel_id", selPar.id);
    if (error) say(t("Kunde inte spara serienumret."));
  };

  const applyOwned = async (ids: number[], on: boolean) => {
    if (!openId || !ids.length) return;
    if (selPar) return applyParallel(ids, on);
    const next = new Set(owned);
    const changed = ids.filter((id) => (on ? !next.has(id) : next.has(id)));
    changed.forEach((id) => (on ? next.add(id) : next.delete(id)));
    if (!on) setQty((q) => { const n = new Map(q); changed.forEach((id) => n.delete("b:" + id)); return n; });
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
      say(t("Kunde inte spara. Ladda om sidan och försök igen."));
    }
    return changed.length;
  };

  const runQuick = async (on: boolean) => {
    const { ids, bad } = quickIds(scoped, quick);
    const n = (await applyOwned(ids, on)) ?? 0;
    say(`${n} ${t("kort")} ${on ? t("markerade") : t("avmarkerade")}${bad.length ? ` · ${t("förstod inte")}: ${bad.join(", ")}` : ""}`);
  };

  const missingText = () => {
    const lines = [`${current?.name}${selPar ? " — " + parallelLabel(selPar) : ""} — ${t("saknade kort")}`];
    for (const sec of scoped) {
      const miss = sec.cards.filter((c) => !has(c));
      if (miss.length) lines.push(`${sec.name}${sec.code ? ` (${sec.code})` : ""}, ${miss.length} ${t("st")}: ${ranges(miss.map((c) => c.no))}`);
    }
    return lines.length > 1 ? lines.join("\n") : `${current?.name}: ${t("komplett!")}`;
  };
  const copyMissing = async () => {
    const t = missingText();
    try {
      await navigator.clipboard.writeText(t);
      say(t("Saknade kort kopierade"));
    } catch {
      setCopyText(t);
    }
  };
  const downloadCsv = (onlyMissing: boolean) => {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [t("Nummer,Delset,Parallell,Spelare,Lag,RC,Har,Serienummer")];
    for (const sec of scoped)
      for (const c of sec.cards) {
        const h = has(c);
        if (onlyMissing && h) continue;
        rows.push([esc(label(sec, c)), esc(sec.name), esc(selPar ? parallelLabel(selPar) : t("Bas")), esc(c.name), esc(c.team), c.tags.includes("RC") ? "RC" : "", h ? t("Ja") : t("Nej"), esc(serialOf(c))].join(","));
      }
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(current?.name || "set")}${selPar ? "-" + slug(parallelLabel(selPar)) : ""}-${onlyMissing ? "saknade" : "setlista"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const startFetch = async (query: string) => {
    if (!query.trim()) return;
    if (!user) {
      say(t("Logga in för att hämta nya set."));
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
      const res = await fetch("/api/fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: query.trim(), sport: sport || undefined }), signal: ctl.signal });
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
    if (!secs.length) return say(t("Hittade inga rader med kortnummer."));
    const name = paste.name.trim() || t("Mitt set");
    const id = `${slug(name)}-${Date.now().toString(36)}`;
    try {
      let r = await supabase.from("sets").insert({ id, name, keywords: name, source: "inklistrad", sport: paste.sport });
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
      // Do not leave a half-saved set in the shared library (sections and cards cascade).
      await supabase.from("sets").delete().eq("id", id);
      say(t("Kunde inte spara setet."));
    }
  };

  const deleteSet = async () => {
    if (!current) return;
    const { error } = await supabase.from("sets").delete().eq("id", current.id);
    if (error) return say(t("Kunde inte ta bort setet."));
    setOpenId(null);
    setConfirmDel(false);
    await loadSets();
    say(t("Setet är borttaget"));
  };

  // A favourite card: a player that is extra valuable to you. Saved per user, rolled back if saving fails.
  const toggleFavCard = async (cardId: number) => {
    if (!user || !openId) return say(t("Logga in för att markera favoriter."));
    const was = favCards.has(cardId);
    const flip = (on: boolean) =>
      setFavCards((prev) => {
        const next = new Set(prev);
        if (on) next.add(cardId);
        else next.delete(cardId);
        return next;
      });
    flip(!was);
    const r = was ? await supabase.from("favorite_cards").delete().eq("card_id", cardId) : await supabase.from("favorite_cards").insert({ card_id: cardId, set_id: openId });
    if (r.error) {
      flip(was);
      say(t("Kunde inte spara favoriten."));
    }
  };

  // Parallels picked directly on a card: set-wide ones plus the ones that belong to the card's own subset.
  const parBySec = new Map<number | null, Parallel[]>();
  for (const p of parallels) (parBySec.get(p.section_id) || parBySec.set(p.section_id, []).get(p.section_id)!).push(p);
  const cardPars = (c: Card) => [...(parBySec.get(null) || []), ...(parBySec.get(c.section_id) || [])];
  const ownedParsOf = (c: Card) => cardPars(c).filter((p) => ownedPar.has(`${c.id}:${p.id}`));
  const parChips = (c: Card) =>
    ownedParsOf(c).map((p) => {
      const sn = ownedPar.get(`${c.id}:${p.id}`);
      return (
        <span key={p.id} className="parchip" title={parallelLabel(p)}>
          {p.print_run ? (sn ? `${sn}/${p.print_run}` : `/${p.print_run}`) : p.name}
        </span>
      );
    });
  const toggleCardPar = async (cardId: number, pid: number, on: boolean) => {
    if (!openId) return;
    const key = `${cardId}:${pid}`;
    const next = new Map(ownedPar);
    if (on) next.set(key, next.get(key) ?? null);
    else next.delete(key);
    setOwnedPar(next);
    if (!user) return writeLocalPar(openId, next);
    const { error } = on
      ? await supabase.from("owned_parallels").upsert({ card_id: cardId, parallel_id: pid, set_id: openId }, { onConflict: "user_id,card_id,parallel_id", ignoreDuplicates: true })
      : await supabase.from("owned_parallels").delete().eq("parallel_id", pid).eq("card_id", cardId);
    if (error) say(t("Kunde inte spara. Ladda om sidan och försök igen."));
  };
  const saveCardSerial = async (cardId: number, pid: number, value: string) => {
    if (!openId) return;
    const key = `${cardId}:${pid}`;
    const serial = value.trim() || null;
    if (!ownedPar.has(key) || ownedPar.get(key) === serial) return;
    const next = new Map(ownedPar);
    next.set(key, serial);
    setOwnedPar(next);
    if (!user) return writeLocalPar(openId, next);
    const { error } = await supabase.from("owned_parallels").update({ serial }).eq("card_id", cardId).eq("parallel_id", pid);
    if (error) say(t("Kunde inte spara serienumret."));
  };

  // Copies. Zero removes the card from the collection; more than one makes duplicates.
  const baseQtyOf = (cardId: number) => (owned.has(cardId) ? qty.get("b:" + cardId) ?? 1 : 0);

  // Copies for sale, values and "on its way". A row exists only while a card has any of this.
  const tradeOf = (cardId: number) => trades.get(cardId) ?? NO_TRADE;
  const forSaleOf = (cardId: number) => Math.min(tradeOf(cardId).for_sale, baseQtyOf(cardId));
  const setTrade = async (cardId: number, patch: Partial<Trade>) => {
    if (!openId) return;
    if (!user) return say(t("Logga in för att spara det här."));
    const prev = trades.get(cardId) ?? null;
    const next: Trade = { ...(prev ?? NO_TRADE), ...patch };
    const empty = next.for_sale === 0 && next.buy_price === null && next.sell_price === null && !next.incoming && !next.note;
    const apply = (v: Trade | null) =>
      setTrades((m) => {
        const n = new Map(m);
        if (v) n.set(cardId, v);
        else n.delete(cardId);
        return n;
      });
    apply(empty ? null : next);
    const r = empty
      ? await supabase.from("card_trade").delete().eq("card_id", cardId)
      : await supabase.from("card_trade").upsert({ card_id: cardId, set_id: openId, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id,card_id" });
    if (r.error) {
      apply(prev);
      say(t("Kunde inte spara. Ladda om sidan och försök igen."));
    }
  };
  // Sold one copy: one copy fewer, and one fewer for sale.
  const sellOne = async (cardId: number) => {
    const q = baseQtyOf(cardId);
    if (q < 1) return;
    const ft = forSaleOf(cardId);
    await setBaseQty(cardId, q - 1);
    if (ft > 0 && q - 1 >= ft) setTrade(cardId, { for_sale: ft - 1 });
  };
  const arrived = async (cardId: number) => {
    await setBaseQty(cardId, 1);
    setTrade(cardId, { incoming: false, note: null });
  };

  const setBaseQty = async (cardId: number, n: number) => {
    if (!openId) return;
    if (!user) return say(t("Logga in för att ange antal."));
    if ((trades.get(cardId)?.for_sale ?? 0) > Math.max(n, 0)) setTrade(cardId, { for_sale: Math.max(n, 0) });
    const nextOwned = new Set(owned);
    const nextQty = new Map(qty);
    if (n <= 0) {
      nextOwned.delete(cardId);
      nextQty.delete("b:" + cardId);
    } else {
      nextOwned.add(cardId);
      if (n > 1) nextQty.set("b:" + cardId, n);
      else nextQty.delete("b:" + cardId);
    }
    setOwned(nextOwned);
    setQty(nextQty);
    setCounts((c) => ({ ...c, [openId]: nextOwned.size }));
    const r = n <= 0 ? await supabase.from("owned").delete().eq("card_id", cardId) : await supabase.from("owned").upsert({ card_id: cardId, set_id: openId, qty: n }, { onConflict: "user_id,card_id" });
    if (r.error) say(t("Kunde inte spara. Ladda om sidan och försök igen."));
  };
  const setParQty = async (cardId: number, pid: number, n: number) => {
    if (!user || n < 1) return;
    const key = `${cardId}:${pid}`;
    const next = new Map(qty);
    if (n > 1) next.set(key, n);
    else next.delete(key);
    setQty(next);
    const { error } = await supabase.from("owned_parallels").update({ qty: n }).eq("card_id", cardId).eq("parallel_id", pid);
    if (error) say(t("Kunde inte spara. Ladda om sidan och försök igen."));
  };
  const isDup = (c: Card) => baseQtyOf(c.id) - 1 - forSaleOf(c.id) > 0 || cardPars(c).some((p) => (qty.get(`${c.id}:${p.id}`) ?? 1) > 1 && ownedPar.has(`${c.id}:${p.id}`));
  const dupExtra = (c: Card) => Math.max(0, baseQtyOf(c.id) - 1 - forSaleOf(c.id)) + cardPars(c).reduce((n, p) => n + (ownedPar.has(`${c.id}:${p.id}`) ? Math.max(0, (qty.get(`${c.id}:${p.id}`) ?? 1) - 1) : 0), 0);
  const dupCount = sections.reduce((n, sec) => n + sec.cards.filter(isDup).length, 0);
  const saleCount = sections.reduce((n, sec) => n + sec.cards.filter((c) => forSaleOf(c.id) > 0).length, 0);
  const incomingCount = [...trades.values()].filter((x) => x.incoming).length;

  // Wishlist: a card you are chasing, with priority, maximum price and a note.
  const setWish = async (cardId: number, w: Wish | null) => {
    if (!openId) return;
    if (!user) return say(t("Logga in för att använda önskelistan."));
    const prev = wishes.get(cardId) ?? null;
    const apply = (v: Wish | null) =>
      setWishes((m) => {
        const n = new Map(m);
        if (v) n.set(cardId, v);
        else n.delete(cardId);
        return n;
      });
    apply(w);
    setWishCount((c) => Math.max(0, c + (w && !prev ? 1 : !w && prev ? -1 : 0)));
    const r = w
      ? await supabase.from("wishlist").upsert({ card_id: cardId, set_id: openId, priority: w.priority, max_price: w.max_price, note: w.note }, { onConflict: "user_id,card_id" })
      : await supabase.from("wishlist").delete().eq("card_id", cardId);
    if (r.error) {
      apply(prev);
      setWishCount((c) => Math.max(0, c + (w && !prev ? -1 : !w && prev ? 1 : 0)));
      say(t("Kunde inte spara önskelistan."));
    }
  };

  // A link anyone can open that shows this set's missing cards or duplicates. It carries no name or e-mail and can be switched off.
  const shareList = async (kind: "missing" | "dups") => {
    if (!user || !openId) return say(t("Logga in för att dela listor."));
    const sel = await supabase.from("shared_lists").select("token").eq("set_id", openId).eq("kind", kind).maybeSingle();
    let token = sel.data?.token as string | undefined;
    if (!token) {
      const ins = await supabase.from("shared_lists").insert({ set_id: openId, kind }).select("token").single();
      token = ins.data?.token as string | undefined;
    }
    if (!token) return say(t("Kunde inte skapa länken."));
    const url = `${location.origin}/l/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      say(t("Länken är kopierad. Den visar bara kortlistan, ingen personinfo."));
    } catch {
      setCopyText(url);
    }
  };
  const unshareLists = async () => {
    if (!user || !openId) return;
    const { error } = await supabase.from("shared_lists").delete().eq("set_id", openId);
    say(error ? t("Kunde inte stänga av länkarna.") : t("Delningslänkarna för setet är avstängda."));
  };

  // Suggest a checklist to add. The administrators see the suggestions in the admin panel.
  const suggest = async (query: string) => {
    const text = query.trim().slice(0, 200);
    if (!user) return say(t("Logga in för att föreslå ett set."));
    if (text.length < 3) return say(t("Skriv minst tre tecken."));
    const { error } = await supabase.from("set_suggestions").insert({ query: text, email: user.email ?? null });
    if (error) return say(t("Kunde inte skicka förslaget just nu. Du kan skicka högst tio per dygn."));
    setSuggested((prev) => new Set(prev).add(text.toLowerCase()));
    say(t("Tack! Vi har tagit emot ditt förslag."));
  };

  // ----- derived view -----
  const hits = q.trim() ? sets.filter((s) => matches(s, q)) : [];
  const showAll = secIdx >= scoped.length;
  const teams = [...new Set(scoped.flatMap((s) => s.cards.map((c) => c.team)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
  const f = norm(find);
  const items: { sec: Section; c: Card; pos: string }[] = [];
  (showAll ? scoped : scoped.slice(secIdx, secIdx + 1)).forEach((sec) =>
    sec.cards.forEach((c, i) => {
      const h = has(c);
      if (filter === "missing" && h) return;
      if (filter === "have" && !h) return;
      if (filter === "fav" && !favCards.has(c.id)) return;
      if (filter === "dups" && !isDup(c)) return;
      if (filter === "wish" && !wishes.has(c.id)) return;
      if (filter === "sale" && forSaleOf(c.id) < 1) return;
      if (filter === "incoming" && !tradeOf(c.id).incoming) return;
      if (team && c.team !== team) return;
      if (f && !norm(`${label(sec, c)} ${c.name} ${c.team} ${c.tags.join(" ")}`).includes(f)) return;
      items.push({ sec, c, pos: `s.${Math.floor(i / 9) + 1}·${(i % 9) + 1}` });
    }),
  );
  const tagEls = (c: Card) => c.tags.map((t) => <span key={t} className={`tag ${t === "RC" ? "rc" : "fs"}`}>{t}</span>);
  const dupChip = (c: Card) => (
    <>
      {isDup(c) ? <span className="tag dup" title={`${dupExtra(c)} ${t("Dubbletter").toLowerCase()}`}>⧉ +{dupExtra(c)}</span> : null}
      {forSaleOf(c.id) > 0 && <span className="tag sale">{t("Till salu")} ×{forSaleOf(c.id)}</span>}
      {tradeOf(c.id).incoming && <span className="tag inc">{t("På väg")}</span>}
    </>
  );
  const mine = current && user && (role !== null || (current.created_by === user.id && !current.verified));
  const origin = (s: SetStat) => (s.verified ? t("Verifierad lista") : s.source === "inklistrad" ? t("Inklistrad") : t("Hämtad"));
  // What a Tradera search is about. t("Detta set") searches on the player, the brand and the set's own words
  // (e.g. "Max Dowman Topps Flagship"); t("Alla set") only on the player and the brand.
  const traderaScope = (c?: Card, sec?: Section): TraderaScope => {
    const setName = current?.short_name || current?.name || "";
    const words = setName.split(" ").filter(Boolean);
    const brand = words[0] || "";
    const rest = words.slice(1).filter((w) => w.length >= 3 && !/^[\d/.-]+$/.test(w));
    return {
      set: setName,
      card: c && sec ? `${label(sec, c)} · ${c.name}` : null,
      narrow: [c?.name, brand, ...rest].filter(Boolean).join(" "),
      broad: [c?.name, brand].filter(Boolean).join(" "),
    };
  };

  if (!ready) return <div className="wrap" aria-busy="true" />;
  if (!user) return <Landing supabase={supabase} message={toast} />;

  return (
    <div className="wrap">
      <div className="topbar">
        <span className="label">{t("Samlarkort · checklistor")}</span>
        <div className="account">
          <LangSwitch />
          {user ? (
            <>
              <nav className="mainnav" aria-label={t("Meny")}>
                <button className="navbtn" type="button" aria-pressed={showPlayers} onClick={() => { setPlayerQ(""); setPlayerSel(null); setShowPlayers((v) => !v); }}>{t("Spelare")}</button>
                <button className="navbtn" type="button" aria-pressed={showWish} onClick={() => setShowWish((v) => !v)}>{t("Önskelista")}{wishCount ? ` ${wishCount}` : ""}</button>
                <button className="navbtn" type="button" aria-pressed={showSell} onClick={() => setShowSell((v) => !v)}>{t("Sälj")}</button>
              </nav>
              <details className="menu" onClick={(e) => { if ((e.target as HTMLElement).closest(".menu-pop button")) e.currentTarget.removeAttribute("open"); }}>
                <summary className="btn small">
                  {t("Meny")}
                  {unseen > 0 && <span className="badge">{unseen}</span>}
                </summary>
                <div className="menu-pop">
                  <div className="menu-who">{t("Inloggad som")}{" "}{user.email}</div>
                  <button type="button" onClick={() => setShowAccount((v) => !v)}>{t("Konto")}</button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewsSince(seenAt);
                      setShowNews(true);
                      markSeen(false);
                    }}
                  >{t("Nytt")}{unseen > 0 && <span className="badge">{unseen}</span>}</button>
                  <button type="button" onClick={() => setShowWelcome(true)}>{t("Guide")}</button>
                  <button type="button" onClick={() => setShowFeedback((v) => !v)}>{t("Feedback")}</button>
                  {role && (
                    <button type="button" onClick={() => setShowAdmin((v) => !v)}>{role === "superuser" ? t("Superuser") : t("Admin")}</button>
                  )}
                  <button type="button" onClick={() => supabase.auth.signOut()}>{t("Logga ut")}</button>
                </div>
              </details>
            </>
          ) : (
            <>
              <button className="btn small" type="button" onClick={() => setShowWait((v) => !v)}>{t("Väntelista")}</button>
              <button className="btn small primary" type="button" onClick={() => setShowAuth((v) => !v)}>{t("Logga in")}</button>
            </>
          )}
        </div>
      </div>

      {showWait && !user && <WaitlistBox onClose={() => setShowWait(false)} />}
      {showFeedback && user && <FeedbackBox onClose={() => setShowFeedback(false)} say={say} />}
      {showAccount && user && <AccountPanel supabase={supabase} email={user.email || ""} isAdmin={role !== null} onClose={() => setShowAccount(false)} say={say} />}
      {showWelcome && user && (
        <Welcome
          onDone={() => {
            setShowWelcome(false);
            markSeen(true);
          }}
        />
      )}
      {showNews && user && <WhatsNew updates={updates} since={newsSince} onClose={() => setShowNews(false)} />}
      {showAuth && !user && <AuthBox supabase={supabase} onClose={() => setShowAuth(false)} />}
      {showAdmin && role && user && (
        <AdminPanel supabase={supabase} role={role} sets={sets} myEmail={(user.email || "").toLowerCase()} onChanged={loadSets} say={say} />
      )}
      {parCard && (
        <CardPar
          cardId={parCard.card.id}
          title={`${label(parCard.sec, parCard.card)} · ${parCard.card.name}`}
          options={cardPars(parCard.card)}
          owned={ownedPar}
          qty={qty}
          baseQty={baseQtyOf(parCard.card.id)}
          wish={wishes.get(parCard.card.id) ?? null}
          trade={trades.get(parCard.card.id) ?? null}
          onTrade={(p) => setTrade(parCard.card.id, p.incoming === false ? { ...p, note: null } : p)}
          onSellOne={() => sellOne(parCard.card.id)}
          onArrived={() => arrived(parCard.card.id)}
          onBaseQty={(n) => setBaseQty(parCard.card.id, n)}
          onQty={(pid, n) => setParQty(parCard.card.id, pid, n)}
          onWish={(w) => setWish(parCard.card.id, w)}
          onToggle={(pid, on) => toggleCardPar(parCard.card.id, pid, on)}
          onSerial={(pid, v) => saveCardSerial(parCard.card.id, pid, v)}
          onClose={() => setParCard(null)}
        />
      )}
      {showPlayers && user && <PlayerPanel supabase={supabase} initialQ={playerQ} initialSel={playerSel} onClose={() => setShowPlayers(false)} onOpenSet={(id) => openSet(id)} />}
      {showSell && user && <SellPanel supabase={supabase} onClose={() => setShowSell(false)} />}
      {showWish && user && <WishPanel supabase={supabase} onClose={() => setShowWish(false)} onChanged={(n) => setWishCount(n)} />}
      {ebay && <EbayPanel key={ebay.narrow + "|" + ebay.broad} scope={ebay} signedIn={!!user} onClose={() => setEbay(null)} />}
      {tradera && <TraderaPanel key={tradera.narrow + "|" + tradera.broad} scope={tradera} signedIn={!!user} onClose={() => setTradera(null)} />}

      <header className="top hero">
        <div className="brand">
          <h1>Setlistan</h1>
          <p>{t("Sök fram en checklista, pricka av korten du har och se direkt vilka som fattas.")}</p>
        </div>
        <form
          className="hero-search"
          onSubmit={(e) => {
            e.preventDefault();
            setPlayerQ(heroQ.trim());
            setPlayerSel(null);
            setShowPlayers(true);
          }}
        >
          <input type="search" className="hero-input" placeholder={t("Sök spelare, till exempel Mats Sundin")} aria-label={t("Sök spelare")} value={heroQ} onChange={(e) => setHeroQ(e.target.value)} />
          <button className="btn primary big" type="submit">{t("Sök spelare")}</button>
        </form>
        <p className="hero-sub">{t("Hitta alla en spelares kort i alla set, eller välj ett set här under.")}</p>
        {followed.length > 0 && (
          <div className="hero-follow">
            <div className="label fav-head">{t("Spelare du följer")}</div>
            <div className="shelf">
              {followed.map((f) => {
                const pct = f.total ? Math.round(((f.have || 0) / f.total) * 100) : 0;
                return (
                  <div key={f.player_key} className="shelf-item fav-card">
                    <button className="fav-open" type="button" onClick={() => { setPlayerQ(""); setPlayerSel({ player_key: f.player_key, display_name: f.display_name }); setShowPlayers(true); }}>
                      <strong>{f.display_name}</strong>
                      {f.total !== undefined && (
                        <>
                          <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                          <span className="sub mono">{f.have || 0} / {f.total}{f.total >= 1000 ? "+" : ""} · {pct} %</span>
                        </>
                      )}
                    </button>
                    <span className="star on" aria-hidden="true">★</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {paste && (
        <section className="panel">
          <h3>{t("Klistra in checklista")}</h3>
          {!user && <div className="note warn">{t("Logga in för att spara inklistrade set i biblioteket.")}</div>}
          <div className="row">
            <input type="text" className="grow" placeholder={t("Setets namn, t.ex. Topps Chrome Premier League 25/26")} value={paste.name} onChange={(e) => setPaste({ ...paste, name: e.target.value })} />
            <select className="sport-select" aria-label={t("Sport")} value={paste.sport} onChange={(e) => setPaste({ ...paste, sport: e.target.value as Sport })}>
              {SPORTS.map((s) => <option key={s.id} value={s.id}>{t(s.label)}</option>)}
            </select>
          </div>
          <textarea
            placeholder={"En rad per kort. Exempel:\n1 Max Dowman, Arsenal\n23 Jaden Dixon - Arsenal RC\nBM 1 | Max Dowman | Arsenal\n### Gold Lion\nGL 4 Morgan Rogers, Aston Villa"}
            value={paste.text}
            onChange={(e) => setPaste({ ...paste, text: e.target.value })}
          />
          <div className="note">
            {(() => {
              const s = parsePaste(paste.text);
              return s.length ? `${t("Hittade")} ${s.reduce((n, x) => n + x.cards.length, 0)} ${t("kort")} ${t("i")} ${s.length} ${t("delset")}.` : t("Nummerprefix (BM, GL …) blir egna delset. En rad som börjar med ### ger delsetet ett namn.");
            })()}
          </div>
          <div className="actions">
            <button className="btn primary" type="button" disabled={!user} onClick={createPasted}>{t("Skapa set")}</button>
            <button className="btn ghost" type="button" onClick={() => setPaste(null)}>{t("Avbryt")}</button>
          </div>
        </section>
      )}

      <section>
        {sets.length ? (
          <SetPicker sets={sets} counts={counts} openId={openId} favs={favs} sport={sport} setSport={setSport} onOpen={openSet} onToggleFav={toggleFav} onSuggest={suggest} suggested={suggested} />
        ) : (
          <div className="empty">{t("Läser biblioteket …")}</div>
        )}
      </section>

      {current && (
        <section className="set" id="set">
          <div className="set-head">
            <div>
              <div className="label">
                {t(sportLabel(current.sport))} · {current.verified ? t("Verifierad checklista") : current.source === "inklistrad" ? t("Inklistrad checklista") : `${t("Hämtad")} · ${t("Kan innehålla fel")}`}
              </div>
              <h2>{current.name}</h2>
              <button className="btn small" type="button" aria-pressed={favs.has(current.id)} onClick={() => toggleFav(current.id)}>
                {favs.has(current.id) ? t("★ Favorit") : t("☆ Lägg i favoriter")}
              </button>
              <div className="sub">{scoped.length} {t("delset")} · {total} {t("kort")}{selPar ? ` · ${parallelLabel(selPar)}` : ""}{current.notes ? ` · ${note(current.notes)}` : ""}</div>
            </div>
            <div className="tally">
              <div className="num mono">{have}<small> / {total}</small></div>
              <div className="label">{total - have} {t("saknas")} · {pct} %</div>
            </div>
          </div>
          <div className="bar big-bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="actions">
            <button className="btn" type="button" onClick={copyMissing}>{t("Kopiera saknade")}</button>
            <button className="btn" type="button" onClick={() => downloadCsv(true)}>{t("Ladda ner saknade (CSV)")}</button>
            <button className="btn" type="button" onClick={() => downloadCsv(false)}>{t("Ladda ner hela setlistan")}</button>
            <button className="btn" type="button" onClick={() => shareList("missing")}>{t("Dela saknade som länk")}</button>
            {dupCount > 0 && <button className="btn" type="button" onClick={() => shareList("dups")}>{t("Dela dubbletter som länk")}</button>}
            {user && <button className="btn ghost" type="button" onClick={unshareLists}>{t("Stäng av delning")}</button>}
            <button className="btn" type="button" onClick={() => setTradera(traderaScope())}>{t("Sålda på Tradera")}</button>
            <button className="btn" type="button" onClick={() => setEbay(traderaScope())}>{t("Auktioner på eBay")}</button>
            {mine && <button className="btn ghost danger" type="button" onClick={() => setConfirmDel(true)}>{t("Ta bort set")}</button>}
          </div>
          {!user && <div className="note">{t("Du är inte inloggad. Avprickningarna sparas i den här webbläsaren och flyttas till ditt konto när du loggar in.")}</div>}
          {confirmDel && (
            <div className="confirm">
              <span>{t("Ta bort")}{" "}<b>{current.name}</b>{" "}{t("ur biblioteket? Det tar också bort allas avprickningar för setet.")}</span>
              <button className="btn danger" type="button" onClick={deleteSet}>{t("Ta bort")}</button>
              <button className="btn ghost" type="button" onClick={() => setConfirmDel(false)}>{t("Behåll")}</button>
            </div>
          )}
          {copyText && (
            <div className="panel">
              <div className="note">{t("Kopiera texten nedan:")}</div>
              <textarea readOnly value={copyText} onFocus={(e) => e.target.select()} autoFocus />
            </div>
          )}

          <div className="sections" role="toolbar" aria-label={t("Delset")}>
            {scoped.map((s, i) => {
              const hs = s.cards.filter(has).length;
              return (
                <button key={s.id} className={`sec ${hs === s.cards.length && hs ? "done" : ""}`} type="button" aria-pressed={i === secIdx} onClick={() => setSecIdx(i)}>
                  <b>{s.name}</b>
                  <small>{s.code ? `${s.code} · ` : ""}{hs}/{s.cards.length}</small>
                </button>
              );
            })}
            <button className="sec" type="button" aria-pressed={showAll} onClick={() => setSecIdx(scoped.length)}>
              <b>{t("Alla delset")}</b>
              <small>{have}/{total}</small>
            </button>
          </div>

          <div className="controls">
            <div className="seg" role="group" aria-label={t("Visa")}>
              {(["all", "missing", "have", "dups", "sale", "incoming", "wish", "fav"] as Filter[]).map((k) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{{ all: t("Alla"), missing: t("Saknas"), have: t("Har"), fav: `★ ${t("Favoriter")}${favCards.size ? ` ${favCards.size}` : ""}`, dups: `${t("Dubbletter")}${dupCount ? ` ${dupCount}` : ""}`, sale: `${t("Till salu")}${saleCount ? ` ${saleCount}` : ""}`, incoming: `${t("På väg")}${incomingCount ? ` ${incomingCount}` : ""}`, wish: `♡ ${t("Önskas")}${wishes.size ? ` ${wishes.size}` : ""}` }[k]}</button>
              ))}
            </div>
            <input type="search" placeholder={t("Spelare, lag eller nummer")} value={find} onChange={(e) => setFind(e.target.value)} aria-label={t("Sök i setet")} />
            <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t("Lag")}>
              <option value="">{t("Alla lag")}</option>
              {teams.map((t) => <option key={t}>{t}</option>)}
            </select>
            {parallels.length > 0 && (
              <select
                value={parSel ?? ""}
                onChange={(e) => {
                  setParSel(e.target.value ? Number(e.target.value) : null);
                  setSecIdx(0);
                }}
                aria-label={t("Parallell")}
              >
                <option value="">{t("Bas")}</option>
                {parOptions.filter((p) => p.section_id === null).map(parOpt)}
                {sections
                  .filter((s) => parOptions.some((p) => p.section_id === s.id))
                  .map((s) => (
                    <optgroup key={s.id} label={s.name}>
                      {parOptions.filter((p) => p.section_id === s.id).map(parOpt)}
                    </optgroup>
                  ))}
              </select>
            )}
            <div className="seg" role="group" aria-label={t("Vy")}>
              <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>{t("Lista")}</button>
              <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>{t("Pärm")}</button>
            </div>
          </div>

          <div className="quick">
            <input type="text" placeholder={t("Snabbmarkera: 1-20, 45, BM 3, GL 1-5")} value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runQuick(true)} aria-label={t("Snabbmarkera kortnummer")} />
            <button className="btn" type="button" onClick={() => runQuick(true)}>{t("Markera som mina")}</button>
            <button className="btn ghost" type="button" onClick={() => runQuick(false)}>{t("Avmarkera")}</button>
            <span className="hint">{t("Siffror utan prefix gäller bas-setet. “s.3·5” på korten är pärmsida och fack med nio kort per sida.")}</span>
          </div>

          {loadingSet && !sections.length ? (
            <div className="empty">{t("Läser korten …")}</div>
          ) : !items.length ? (
            <div className="empty">{filter === "fav" ? t("Inga favoriter här än. Tryck på stjärnan vid en spelare som är extra värdefull.") : filter === "missing" ? t("Inga saknade kort här. Snyggt!") : filter === "have" ? t("Du har inte prickat av några kort här än. Klicka på ett kort för att markera det.") : t("Inga kort matchar sökningen.")}</div>
          ) : view === "grid" ? (
            <div className="grid">
              {items.map(({ sec, c, pos }) => (
                <div key={c.id} className={`cardwrap${favCards.has(c.id) ? " fav" : ""}`}>
                  <button className="card" type="button" aria-pressed={has(c)} onClick={() => applyOwned([c.id], !has(c))}>
                    <span className="no">{label(sec, c)}</span>
                    <span className="pos" title={t("Pärmsida · fack")}>{pos}</span>
                    <span className="name">{c.name}</span>
                    <span className="team">{c.team}</span>
                    <span className="tags">{tagEls(c)}{dupChip(c)}{serialOf(c) &&<span className="tag fs">{serialOf(c)}</span>}{parChips(c)}</span>
                    <span className="tick"><Tick /></span>
                  </button>
                  <button className="tbtn" type="button" title={t("Visa sålda på Tradera")} aria-label={`Sålda ${c.name} på Tradera`} onClick={() => setTradera(traderaScope(c, sec))}>T</button>
                  <button className={`star${favCards.has(c.id) ? " on" : ""}`} type="button" aria-pressed={favCards.has(c.id)} title={t("Favorit: extra värdefull")} aria-label={`${favCards.has(c.id) ? t("Ta bort") : t("Markera")} ${c.name} som favorit`} onClick={() => toggleFavCard(c.id)}>{favCards.has(c.id) ? "★" : "☆"}</button>
                  <button className={`star wish${wishes.has(c.id) ? " on" : ""}`} type="button" aria-pressed={wishes.has(c.id)} title={t("Önskelista: jag jagar det här kortet")} aria-label={`${wishes.has(c.id) ? t("Ta bort") : t("Lägg")} ${c.name} ${t("på önskelistan")}`} onClick={() => setWish(c.id, wishes.has(c.id) ? null : { priority: 2, max_price: null, note: null })}>{wishes.has(c.id) ? "♥" : "♡"}</button>
                  <button className={`star dup${baseQtyOf(c.id) > 1 ? " on" : ""}`} type="button" aria-pressed={baseQtyOf(c.id) > 1} title={t("Dubblett: jag har flera av det här kortet")} aria-label={`${c.name}: ${t("Dubblett")}`} onClick={() => setBaseQty(c.id, baseQtyOf(c.id) > 1 ? 1 : 2)}>⧉</button>
                  <button className={`pbtn${ownedParsOf(c).length || wishes.has(c.id) ? " on" : ""}`} type="button" title={t("Antal, paralleller och önskelista")} aria-label={`${t("Mer om")} ${c.name}`} onClick={() => setParCard({ card: c, sec })}>{cardPars(c).length ? t("Par.") : t("Mer")}{ownedParsOf(c).length ? ` ${ownedParsOf(c).length}` : ""}{wishes.has(c.id) ? " ♡" : ""}</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="list">
              {items.map(({ sec, c }) => (
                <div key={c.id} className="lwrap">
                  <button className="lrow" type="button" aria-pressed={has(c)} onClick={() => applyOwned([c.id], !has(c))}>
                    <span className="box">{has(c) && <Tick />}</span>
                    <span className="n">{label(sec, c)}</span>
                    <span className="nm">{c.name} {tagEls(c)}{dupChip(c)}{parChips(c)}</span>
                    <span className="tm">{c.team}</span>
                  </button>
                  {selPar && has(c) && (
                    <input
                      key={serialOf(c)}
                      className="serial"
                      defaultValue={serialOf(c)}
                      placeholder={selPar.print_run ? `nr/${selPar.print_run}` : "nr"}
                      maxLength={20}
                      aria-label={`Serienummer för ${c.name}`}
                      onBlur={(e) => saveSerial(c.id, e.target.value)}
                    />
                  )}
                  <button className={`pbtn${ownedParsOf(c).length || wishes.has(c.id) ? " on" : ""}`} type="button" title={t("Antal, paralleller och önskelista")} aria-label={`${t("Mer om")} ${c.name}`} onClick={() => setParCard({ card: c, sec })}>{cardPars(c).length ? t("Par.") : t("Mer")}{ownedParsOf(c).length ? ` ${ownedParsOf(c).length}` : ""}{wishes.has(c.id) ? " ♡" : ""}</button>
                  <button className={`star${favCards.has(c.id) ? " on" : ""}`} type="button" aria-pressed={favCards.has(c.id)} title={t("Favorit: extra värdefull")} aria-label={`${favCards.has(c.id) ? t("Ta bort") : t("Markera")} ${c.name} som favorit`} onClick={() => toggleFavCard(c.id)}>{favCards.has(c.id) ? "★" : "☆"}</button>
                  <button className={`star wish${wishes.has(c.id) ? " on" : ""}`} type="button" aria-pressed={wishes.has(c.id)} title={t("Önskelista: jag jagar det här kortet")} aria-label={`${wishes.has(c.id) ? t("Ta bort") : t("Lägg")} ${c.name} ${t("på önskelistan")}`} onClick={() => setWish(c.id, wishes.has(c.id) ? null : { priority: 2, max_price: null, note: null })}>{wishes.has(c.id) ? "♥" : "♡"}</button>
                  <button className={`star dup${baseQtyOf(c.id) > 1 ? " on" : ""}`} type="button" aria-pressed={baseQtyOf(c.id) > 1} title={t("Dubblett: jag har flera av det här kortet")} aria-label={`${c.name}: ${t("Dubblett")}`} onClick={() => setBaseQty(c.id, baseQtyOf(c.id) > 1 ? 1 : 2)}>⧉</button>
                  <button className="tbtn" type="button" title={t("Visa sålda på Tradera")} aria-label={`Sålda ${c.name} på Tradera`} onClick={() => setTradera(traderaScope(c, sec))}>T</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <footer>{t("Checklistorna kommer från öppna källor. Hämtade listor kan innehålla fel, så kontrollera mot kortets baksida eller tillverkarens lista när det är viktigt.")}</footer>
      <SiteFooter />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
