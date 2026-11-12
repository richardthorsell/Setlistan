import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Setlistan",
    short_name: "Setlistan",
    description: "Sök fram set för samlarkort, pricka av dem du har och se vilka som saknas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F2F3F7",
    theme_color: "#061230",
    icons: [
      { src: "/app-icon", sizes: "192x192", type: "image/png" },
    ],
  };
}
