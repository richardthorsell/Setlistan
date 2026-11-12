import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  metadataBase: new URL("https://setlistan.se"),
  // Search Console: set GOOGLE_SITE_VERIFICATION in the server settings to the token from the HTML tag method.
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  title: "Setlistan – The easiest way to complete your collection",
  description: "Sök fram set för samlarkort, pricka av dem du har och se vilka som saknas.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/app-icon", sizes: "192x192", type: "image/png" },
    ],
    apple: "/app-icon",
  },
  twitter: { card: "summary", title: "Setlistan – The easiest way to complete your collection", description: "Sök fram set för samlarkort, pricka av dem du har och se vilka som saknas." },
  openGraph: {
    title: "Setlistan – The easiest way to complete your collection",
    description: "Sök fram set för samlarkort, pricka av dem du har och se vilka som saknas.",
    siteName: "Setlistan",
    url: "https://setlistan.se",
    type: "website",
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
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: "Setlistan", url: "https://setlistan.se", inLanguage: "sv", description: "Sök fram set för samlarkort, pricka av dem du har och se vilka som saknas." }) }} />
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
