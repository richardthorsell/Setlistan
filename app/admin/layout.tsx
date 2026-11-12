import type { Metadata, Viewport } from "next";

// Admin has its own name, icon and manifest, so it can be added to a phone's home screen as a separate app next to Setlistan.
export const metadata: Metadata = {
  title: "Setlistan Admin",
  description: "Administration av Setlistan.",
  manifest: "/admin/manifest.webmanifest",
  robots: { index: false, follow: false },
  icons: { icon: "/admin/pwa-icon?s=192", apple: "/admin/pwa-icon?s=180" },
  appleWebApp: { capable: true, title: "Setlistan Admin", statusBarStyle: "black-translucent" },
  openGraph: { title: "Setlistan Admin", siteName: "Setlistan Admin" },
};

export const viewport: Viewport = { themeColor: "#061230" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
