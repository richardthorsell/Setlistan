"use client";

import type { Update } from "./Onboarding";
import { useT } from "@/lib/i18n";

// A short box under the top bar when there is news the user has not seen: the titles of the newest items and a way to read them.
// It goes away when the user opens the news or closes the box, and does not come back for the same news.
export default function NewsBanner({ updates, onOpen, onClose }: { updates: Update[]; onOpen: () => void; onClose: () => void }) {
  const t = useT();
  if (!updates.length) return null;
  const shown = updates.slice(0, 3);
  return (
    <section role="status" aria-label={t("Nytt sedan sist")} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderLeft: "4px solid var(--accent)", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 240px" }}>
        <b>{t("Nytt sedan sist")}</b>
        <div className="note">
          {shown.map((u) => u.title).join(" · ")}
          {updates.length > shown.length ? ` · +${updates.length - shown.length}` : ""}
        </div>
      </div>
      <button className="btn small primary" type="button" onClick={onOpen}>{t("Läs")}</button>
      <button className="btn small ghost" type="button" onClick={onClose}>{t("Stäng")}</button>
    </section>
  );
}
