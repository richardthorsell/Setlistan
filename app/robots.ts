import type { MetadataRoute } from "next";

const SITE = "https://setlistan.se";

// What search engines may read. The service itself sits behind a login, so only the public pages are listed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/auth/"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
