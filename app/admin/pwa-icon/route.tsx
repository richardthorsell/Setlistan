import { ADMIN_ICON_PNG } from "@/lib/appicons";

// The admin app icon: the Setlistan S with the word Admin, so it is easy to tell from the main app on a home screen.
export const dynamic = "force-static";

export function GET() {
  return new Response(new Uint8Array(Buffer.from(ADMIN_ICON_PNG, "base64")), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
