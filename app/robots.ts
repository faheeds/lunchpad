import type { MetadataRoute } from "next";
import { getSiteContext } from "@/lib/seo";

const PRIVATE = ["/admin", "/account", "/api", "/history", "/weekly", "/mobile-login", "/checkout"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await getSiteContext();

  if (site.kind === "preview") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  const disallow =
    site.kind === "platform" ? [...PRIVATE, "/menu", "/order", "/faq"] : PRIVATE;

  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${site.origin}/sitemap.xml`,
  };
}
