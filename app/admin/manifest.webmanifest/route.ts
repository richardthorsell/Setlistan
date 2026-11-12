// The manifest for the admin app: its own id, name, start page and scope, so a phone treats it as a separate app.
export const dynamic = "force-static";

export function GET() {
  const manifest = {
    id: "/admin",
    name: "Setlistan Admin",
    short_name: "Admin",
    description: "Administration av Setlistan.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    background_color: "#061230",
    theme_color: "#061230",
    icons: [
      { src: "/admin/pwa-icon?s=192", sizes: "192x192", type: "image/png" },
      { src: "/admin/pwa-icon?s=512", sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } });
}
