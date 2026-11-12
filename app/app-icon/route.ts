import { MAIN_ICON_PNG } from "@/lib/appicons";

// The Setlistan app icon, used for the home screen icon on a phone and in the web app manifest.
export const dynamic = "force-static";

export function GET() {
  return new Response(new Uint8Array(Buffer.from(MAIN_ICON_PNG, "base64")), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
