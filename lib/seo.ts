import { headers } from "next/headers";
import { PRICING } from "@/lib/platform-content";

export const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "lunchpad.us";

export const PLATFORM_TITLE = "LunchPad | Lunch Ordering Software for Schools & Offices";
export const PLATFORM_OG_TITLE = "LunchPad: Lunch Ordering Software for Schools & Offices";
export const PLATFORM_DESCRIPTION =
  "Lunch ordering software for schools and offices: menus, ordering cutoffs, Stripe payments and label printing. 14-day free trial, no per-order fees.";

export type SiteKind = "platform" | "tenant" | "preview";
export type SiteContext = { host: string; origin: string; kind: SiteKind };

function stripPort(host: string): string {
  return host.replace(/:\d+$/, "");
}

/** Pure host classification; no request access so it is unit-testable. */
export function classifyHost(
  hostHeader: string,
  rootDomain: string = ROOT_DOMAIN,
  restaurantSlugEnv: string | undefined = process.env.RESTAURANT_SLUG,
): SiteContext {
  const raw = (hostHeader ?? "").trim().toLowerCase();
  const platform: SiteContext = {
    host: rootDomain,
    origin: `https://${rootDomain}`,
    kind: "platform",
  };
  if (!raw) return platform;

  const hostname = stripPort(raw);
  if (!hostname) return platform;

  if (hostname === rootDomain || hostname === `www.${rootDomain}`) return platform;

  if (hostname.endsWith(".vercel.app")) {
    return { host: raw, origin: `https://${raw}`, kind: "preview" };
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  ) {
    return {
      host: raw,
      origin: `http://${raw}`,
      kind: restaurantSlugEnv ? "tenant" : "platform",
    };
  }

  return { host: raw, origin: `https://${raw}`, kind: "tenant" };
}

export async function getSiteContext(): Promise<SiteContext> {
  const host = (await headers()).get("host") ?? "";
  return classifyHost(host);
}

export function platformJsonLd(origin: string) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "LunchPad",
      url: origin,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "LunchPad",
      url: origin,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "LunchPad",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: PLATFORM_DESCRIPTION,
      url: origin,
      offers: PRICING.map((plan) => ({
        "@type": "Offer",
        name: `${plan.name} plan`,
        price: plan.price,
        priceCurrency: "USD",
        description: plan.desc,
        url: `${origin}/signup`,
      })),
    },
  ];
}
