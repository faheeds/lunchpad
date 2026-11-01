/**
 * Landing page v2: content shape + the resolver that turns whatever an
 * operator has (or hasn't) filled in into a complete, consistent page.
 *
 * Rule: every restaurant gets the SAME sections in the SAME order. A section
 * is either filled from real data, filled from a sensible fallback, or
 * hidden entirely. It is never rendered as an empty box or a placeholder.
 */

import { z } from "zod";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const url = z
  .string()
  .trim()
  .max(500)
  .optional()
  // Absolute http(s) URL, or a site-relative path ("/tenants/x/photo.jpg").
  .transform((v) => (v && /^(https?:\/\/|\/(?!\/))/i.test(v) ? v : undefined));

export const landingContentSchema = z.object({
  /** Small uppercase line above the headline, e.g. "Medina Academy · Bellevue & Redmond". */
  eyebrow: text(80),
  /** Hero headline. */
  tagline: text(90),
  /** One or two sentences under the headline. */
  subtitle: text(240),
  storyHeadline: text(120),
  storyBody: text(1200),
  storyImageUrl: url,
  address: text(200),
  /** Free text, one line per row, e.g. "Mon–Fri 11am–8pm". */
  hours: text(300),
  instagramUrl: url,
  facebookUrl: url,
});

export type LandingContent = z.infer<typeof landingContentSchema>;

export function parseLandingContent(raw: unknown): LandingContent {
  const parsed = landingContentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

// ── Resolver ────────────────────────────────────────────────────────────

export type ResolverMenuItem = {
  name: string;
  slug: string;
  imageUrl: string | null;
  category: string | null;
  basePriceCents: number;
  sizePricesCents: number[];
  featuredOnLanding: boolean;
  sortOrder: number;
};

export type ResolverLocation = {
  name: string;
  /** ISO dates (yyyy-mm-dd) of upcoming open delivery dates, ascending. */
  dates: string[];
  /** e.g. "7 am" — when ordering closes, if known. */
  cutoffLabel: string | null;
};

export type ResolverInput = {
  restaurantName: string;
  /** Singular noun for the places served, lower-case ("school", "office"), or null. */
  placeNoun: string | null;
  heroImageUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  weeklyPlanningEnabled: boolean;
  acceptsCard: boolean;
  acceptsCash: boolean;
  acceptsZelle: boolean;
  content: LandingContent;
  menuItems: ResolverMenuItem[];
  locations: ResolverLocation[];
};

export type LandingFeatured = {
  name: string;
  slug: string;
  imageUrl: string;
  priceLabel: string;
};

export type LandingMenuCategory = {
  name: string;
  items: { name: string; priceLabel: string }[];
};

export type LandingView = {
  hero: {
    eyebrow: string;
    headline: string;
    subtitle: string;
    imageUrl: string | null;
  };
  status: { nextDate: string; cutoffLabel: string | null } | null;
  steps: { title: string; body: string }[];
  featured: LandingFeatured[];
  menuBoard: LandingMenuCategory[];
  pickups: ResolverLocation[];
  showWeekly: boolean;
  story: { headline: string; body: string; imageUrl: string | null } | null;
  footer: {
    address: string | null;
    hours: string[];
    phone: string | null;
    email: string | null;
    instagramUrl: string | null;
    facebookUrl: string | null;
  };
};

export function priceLabel(item: Pick<ResolverMenuItem, "basePriceCents" | "sizePricesCents">): string {
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  if (item.sizePricesCents.length > 1) {
    return `from ${fmt(Math.min(...item.sizePricesCents))}`;
  }
  if (item.sizePricesCents.length === 1) return fmt(item.sizePricesCents[0]);
  return fmt(item.basePriceCents);
}

const KEYWORD_ORDER = [
  ["burger", "smash", "double"],
  ["pizza", "biryani", "rice"],
  ["chicken", "crispy", "sandwich"],
  ["salad", "wrap", "bowl"],
];

function pickFeatured(items: ResolverMenuItem[]): ResolverMenuItem[] {
  const withPhotos = items.filter((i) => i.imageUrl);
  const flagged = withPhotos.filter((i) => i.featuredOnLanding);
  const byOrder = (a: ResolverMenuItem, b: ResolverMenuItem) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  if (flagged.length > 0) return [...flagged].sort(byOrder).slice(0, 4);

  // Fallback: one photo per keyword family so the mosaic is varied, then
  // whatever else has a photo.
  const chosen: ResolverMenuItem[] = [];
  for (const family of KEYWORD_ORDER) {
    const hit = withPhotos.find(
      (i) => !chosen.includes(i) && family.some((k) => i.name.toLowerCase().includes(k)),
    );
    if (hit) chosen.push(hit);
  }
  for (const i of [...withPhotos].sort(byOrder)) {
    if (chosen.length >= 4) break;
    if (!chosen.includes(i)) chosen.push(i);
  }
  return chosen.slice(0, 4);
}

function buildMenuBoard(items: ResolverMenuItem[]): LandingMenuCategory[] {
  const groups = new Map<string, ResolverMenuItem[]>();
  for (const i of items) {
    const key = i.category?.trim() || "Menu";
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups.entries()]
    .map(([name, list]) => ({
      name,
      items: [...list]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .slice(0, 8)
        .map((i) => ({ name: i.name, priceLabel: priceLabel(i) })),
    }))
    .slice(0, 4);
}

function buildSteps(input: ResolverInput): { title: string; body: string }[] {
  const place = input.placeNoun ?? "pickup spot";
  const pay: string[] = [];
  if (input.acceptsCard) pay.push("card");
  if (input.acceptsCash) pay.push("cash");
  if (input.acceptsZelle) pay.push("Zelle");
  const payBody =
    pay.length > 0
      ? `Pay by ${pay.length > 1 ? pay.slice(0, -1).join(", ") + " or " + pay[pay.length - 1] : pay[0]}.`
      : "Quick, simple checkout.";
  const steps = [
    { title: `Pick your ${place}`, body: "Choose where you'd like your order delivered or picked up." },
    {
      title: "Choose your day",
      body: input.weeklyPlanningEnabled
        ? "Order one day, or plan the whole week at once."
        : "Pick an open day. Order ahead so it's made fresh.",
    },
    { title: "Pick your food", body: "Browse the menu and add anything you like." },
    { title: "Pay & enjoy", body: payBody },
  ];
  return steps;
}

export function resolveLanding(input: ResolverInput): LandingView {
  const c = input.content;
  const featured = pickFeatured(input.menuItems)
    .map((i) => ({
      name: i.name,
      slug: i.slug,
      imageUrl: i.imageUrl as string,
      priceLabel: priceLabel(i),
    }));

  const heroImage = input.heroImageUrl ?? featured[0]?.imageUrl ?? null;

  const headline =
    c.tagline ??
    (input.placeNoun
      ? `Fresh food, delivered to your ${input.placeNoun}.`
      : "Fresh food, made to order.");

  const subtitle =
    c.subtitle ??
    (input.weeklyPlanningEnabled
      ? "Order for a single day or plan the whole week — one checkout covers it all."
      : "Order ahead and pick up something fresh, made just for you.");

  const locations = input.locations.filter((l) => l.dates.length > 0);
  const allDates = locations.flatMap((l) => l.dates).sort();
  const status = allDates.length
    ? {
        nextDate: allDates[0],
        cutoffLabel: locations.find((l) => l.dates.includes(allDates[0]))?.cutoffLabel ?? null,
      }
    : null;

  const story =
    c.storyBody || c.storyHeadline
      ? {
          headline: c.storyHeadline ?? `About ${input.restaurantName}`,
          body: c.storyBody ?? "",
          imageUrl: c.storyImageUrl ?? null,
        }
      : null;

  return {
    hero: {
      eyebrow: c.eyebrow ?? input.restaurantName,
      headline,
      subtitle,
      imageUrl: heroImage,
    },
    status,
    steps: buildSteps(input),
    featured,
    menuBoard: buildMenuBoard(input.menuItems),
    pickups: locations.slice(0, 4),
    showWeekly: input.weeklyPlanningEnabled,
    story,
    footer: {
      address: c.address ?? null,
      hours: c.hours ? c.hours.split(/\r?\n/).map((h) => h.trim()).filter(Boolean) : [],
      phone: input.contactPhone,
      email: input.contactEmail,
      instagramUrl: c.instagramUrl ?? null,
      facebookUrl: c.facebookUrl ?? null,
    },
  };
}
