// Sends mail through Resend's REST API. Needs RESEND_API_KEY in the environment (set in Vercel).
// RESEND_FROM must be an address on a domain verified in Resend; without it Resend's test sender is used,
// which only delivers to the Resend account's own address.
export const emailEnabled = () => !!process.env.RESEND_API_KEY?.trim();

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://setlistan.vercel.app").replace(/\/$/, "");

export async function sendMail(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return false;
  const from = process.env.RESEND_FROM?.trim() || "Setlistan <onboarding@resend.dev>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error("resend: failed", r.status, (await r.text().catch(() => "")).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error("resend: error", e instanceof Error ? e.message : "unknown");
    return false;
  }
}
