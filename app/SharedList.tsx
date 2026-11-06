"use client";

import LegalPage from "./LegalPage";
import { useT } from "@/lib/i18n";

type Row = { delset: string; kod: string; nr: number; namn: string; lag: string; parallell?: string | null; extra?: number };
export type Shared = { set: string; typ: "missing" | "dups"; skapad: string; rader: Row[] };

export default function SharedList({ data }: { data: Shared | null }) {
  const t = useT();
  if (!data) {
    return (
      <LegalPage title={t("Listan finns inte")} intro={t("Länken är fel eller så har ägaren stängt av delningen.")}>
        <p><a href="/">Setlistan</a></p>
      </LegalPage>
    );
  }
  const missing = data.typ === "missing";
  const groups = new Map<string, Row[]>();
  for (const r of data.rader) (groups.get(r.delset) || groups.set(r.delset, []).get(r.delset)!).push(r);
  const label = (r: Row) => `${r.kod ? r.kod + " " : ""}${r.nr}`;
  return (
    <LegalPage
      title={`${missing ? t("Saknade kort") : t("Dubbletter")} · ${data.set}`}
      intro={missing ? t("De här korten saknas i samlingen. Listan uppdateras när samlaren prickar av fler.") : t("De här korten finns i fler än ett exemplar. Listan uppdateras när samlingen ändras.")}
    >
      <p className="note">{data.rader.length} {t("kort")}</p>
      {!data.rader.length && <p>{missing ? t("Inget saknas. Samlingen är komplett!") : t("Inga dubbletter just nu.")}</p>}
      {[...groups.entries()].map(([name, rows]) => (
        <div key={name}>
          <h2>{name}</h2>
          <ul>
            {rows.map((r, i) => (
              <li key={i}>
                <b>{label(r)}</b> {r.namn}
                {r.lag ? ` · ${r.lag}` : ""}
                {r.parallell ? ` · ${r.parallell}` : ""}
                {!missing && r.extra ? ` · ${r.extra} ${t("extra")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </LegalPage>
  );
}
