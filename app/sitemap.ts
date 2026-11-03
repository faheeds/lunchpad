import type { MetadataRoute } from "next";
import { getSiteContext } from "@/lib/seo";
import { getCurrentRestaurant } from "@/lib/restaurant";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await getSiteContext();
  const paths =
    site.kind === "preview"
      ? null
      : site.kind === "platform"
        ? ["/", "/signup", "/contact", "/privacy", "/terms"]
        : (await getCurrentRestaurant().catch(() => null))
          ? ["/", "/menu", "/order", "/faq", "/contact"]
          : null;
  if (!paths) return [];
  return paths.map((p) => ({ url: `${site.origin}${p}` }));
}
