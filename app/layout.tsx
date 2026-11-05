import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Setlistan",
  description: "Sök fram checklistor för samlarkort, pricka av dem du har och se vilka som saknas.",
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
