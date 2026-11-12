import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Setlistan – The easiest way to complete your collection",
  description: "Sök fram set för samlarkort, pricka av dem du har och se vilka som saknas.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icon", sizes: "192x192", type: "image/png" },
    ],
    apple: "/app-icon",
  },
  openGraph: {
    title: "Setlistan – The easiest way to complete your collection",
    description: "Sök fram set för samlarkort, pricka av dem du har och se vilka som saknas.",
    siteName: "Setlistan",
    locale: "sv_SE",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap"
        />
      </head>
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}
