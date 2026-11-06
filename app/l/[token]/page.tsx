import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import SharedList, { type Shared } from "../../SharedList";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delad lista · Setlistan", robots: { index: false, follow: false } };

// A list someone chose to share: missing cards or duplicates for one set. Computed live, no name or e-mail.
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = /^[a-z0-9]{10,40}$/i.test(token) ? token : "";
  let data: Shared | null = null;
  if (clean) {
    const supabase = await createClient();
    const r = await supabase.rpc("shared_list", { p_token: clean });
    data = (r.data as Shared | null) ?? null;
  }
  return <SharedList data={data} />;
}
