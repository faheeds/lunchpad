import { NextRequest, NextResponse } from "next/server";
import { assertAdminApiRequest } from "@/lib/admin-auth";
import { requireRestaurant } from "@/lib/restaurant";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";

interface MenuOptionInput {
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
  isDefault: boolean;
}

interface MenuSizeInput {
  name: string;
  priceCents: number;
}

interface MenuItemInput {
  name: string;
  description: string;
  basePriceCents: number;
  category: string;
  isActive: boolean;
  /** Optional image URL — when set, it'll be saved to MenuItem.imageUrl
   *  and the customer-facing menu card will render it. The URL-import
   *  flow populates this from images found near the item on the source
   *  page; manual bulk uploads typically leave it empty. */
  imageUrl?: string;
  /** Pick-one choices the customer must select before adding to cart. */
  requiredChoices?: string[];
  /** Size variants — when non-empty, the customer-side flow forces
   *  size selection and the size's priceCents drives the line price. */
  sizes?: MenuSizeInput[];
  options: MenuOptionInput[];
}

export async function POST(req: NextRequest) {
  try {
    await assertAdminApiRequest();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let items: MenuItemInput[];
  try {
    const body = await req.json();
    items = body.items;
    if (!Array.isArray(items) || items.length === 0) throw new Error("No items");
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const restaurant = await requireRestaurant();
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  // Fetch existing slugs to avoid duplicates
  const existingSlugs = new Set(
    (await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id },
      select: { slug: true },
    })).map((m) => m.slug)
  );

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    const name = String(item.name ?? "").trim();
    if (!name) { skipped++; continue; }

    const slug = slugify(name);
    // If slug already exists, make it unique by appending a counter
    if (existingSlugs.has(slug)) {
      skipped++;
      continue; // skip duplicates — user can resolve in menu tab
    }
    existingSlugs.add(slug);

    const basePriceCents = Math.max(0, Math.round(Number(item.basePriceCents) || 0));

    try {
      // Dedupe required choices case-insensitively, drop blanks. The
      // shape coming in is already an array (the client parser handles
      // the textarea→array transform) but we defensively re-normalize.
      const requiredChoices: string[] = [];
      if (Array.isArray(item.requiredChoices)) {
        const seen = new Set<string>();
        for (const c of item.requiredChoices) {
          const trimmed = String(c ?? "").trim();
          if (!trimmed) continue;
          const k = trimmed.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          requiredChoices.push(trimmed);
        }
      }

      // Sizes — dedupe by lowercase name; drop blank/zero-priced entries.
      // Operator-set order is preserved so the customer picker shows
      // Small → Large in the expected progression.
      const seenSize = new Set<string>();
      const sizes: { name: string; priceCents: number; sortOrder: number; isDefault: boolean }[] = [];
      if (Array.isArray(item.sizes)) {
        item.sizes.forEach((s, idx) => {
          const sname = String(s?.name ?? "").trim();
          const price = Math.max(0, Math.round(Number(s?.priceCents) || 0));
          if (!sname || price <= 0) return;
          const key = sname.toLowerCase();
          if (seenSize.has(key)) return;
          seenSize.add(key);
          sizes.push({
            name: sname,
            priceCents: price,
            sortOrder: idx,
            isDefault: idx === 0, // first size = default-selected in the picker
          });
        });
      }

      // Image URL — only accept absolute http(s) URLs. We rely on the
      // extract endpoint to already have sanitized these, but the bulk-
      // create route also accepts hand-edited payloads via the bulk
      // Excel uploader, so we validate again here.
      const rawImage = String(item.imageUrl ?? "").trim();
      const imageUrl = /^https?:\/\/[^\s]+$/i.test(rawImage) ? rawImage : null;

      await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          name,
          slug,
          description: String(item.description ?? "").trim() || null,
          category: String(item.category ?? "").trim() || null,
          imageUrl,
          basePriceCents,
          isActive: item.isActive !== false,
          requiredChoices,
          options: {
            create: Array.isArray(item.options)
              ? item.options
                  .filter((opt) => String(opt.name ?? "").trim().length > 0)
                  .map((opt, idx) => ({
                    name: String(opt.name).trim(),
                    optionType: opt.optionType === "REMOVAL" ? "REMOVAL" : "ADD_ON",
                    priceDeltaCents: Math.max(0, Math.round(Number(opt.priceDeltaCents) || 0)),
                    isDefault: opt.isDefault === true,
                    sortOrder: idx,
                  }))
              : [],
          },
          sizes: sizes.length > 0 ? { create: sizes } : undefined,
        },
      });
      created++;
    } catch (err) {
      errors.push(`"${name}": ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
