import type { MetadataRoute } from "next";

const SITE = "https://setlistan.se";

// The public pages. Update `changed` when the text of a page is changed in a way that matters.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, lastModified: new Date("2026-11-12"), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/integritet`, lastModified: new Date("2026-11-01"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/villkor`, lastModified: new Date("2026-11-01"), changeFrequency: "yearly", priority: 0.3 },
  ];
}
