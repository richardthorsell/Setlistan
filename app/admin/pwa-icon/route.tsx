import { ImageResponse } from "next/og";

export const runtime = "nodejs";

// The admin app icon, drawn on request (no image files): the Setlistan S with an ADMIN label, so it is easy to tell from the main app.
export function GET(req: Request) {
  const s = Number(new URL(req.url).searchParams.get("s"));
  const size = [180, 192, 512].includes(s) ? s : 512;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#061230", color: "#ffffff", fontWeight: 800 }}>
        <div style={{ display: "flex", fontSize: size * 0.56, lineHeight: 1 }}>S</div>
        <div style={{ display: "flex", marginTop: size * 0.02, padding: `${size * 0.02}px ${size * 0.07}px`, borderRadius: size * 0.05, background: "#4A2BD3", fontSize: size * 0.13, letterSpacing: size * 0.01 }}>ADMIN</div>
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
