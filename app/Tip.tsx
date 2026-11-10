"use client";

import { type ReactNode, useEffect, useState } from "react";
import "./panels.css";
import { useT } from "@/lib/i18n";

// A short hint shown the first time a view is opened. "Uppfattat" hides it for good (kept in this browser).
export default function Tip({ id, children }: { id: string; children: ReactNode }) {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!localStorage.getItem("tip:" + id));
    } catch {
      setShow(false);
    }
  }, [id]);
  if (!show) return null;
  const hide = () => {
    try {
      localStorage.setItem("tip:" + id, "1");
    } catch {}
    setShow(false);
  };
  return (
    <div className="tip" role="note">
      <span>{children}</span>
      <button className="btn small" type="button" onClick={hide}>{t("Uppfattat")}</button>
    </div>
  );
}
