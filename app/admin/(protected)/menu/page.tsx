import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/utils";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { MenuManager } from "@/components/admin/menu-manager";
import type { MenuManagerItem, SaveMenuItemResult } from "@/components/admin/menu-types";
import { sortCategoryNames } from "@/lib/menu-config";
import {
  dollarsToCents,
  parseChoicesText,
  parseSizesText,
  planOptionSync,
  sameIdSet,
  sameSizes,
  uniqueSlug,
} from "@/lib/menu-editor";

export const dynamic = "force-dynamic";

const UNCATEGORIZED = "Uncategorized";

const optionsPayloadSchema = z
  .array(
    z.object({
      id: z.string().optional(),
      name: z.string().max(120),
      optionType: z.enum(["ADD_ON", "REMOVAL"]),
      priceDeltaCents: z.number().int().min(0).max(1_000_000),
    })
  )
  .max(100);

/**
 * One save for everything about a menu item: basics, choices, sizes, extras
 * (add-ons / removals) and location availability. Creates the item when no
 * id is posted, otherwise updates it.
 *
 * It writes the SAME stored shapes the customer web order form and both iOS
 * apps already read (MenuItem.requiredChoices, MenuItemSize, MenuOption), and
 * only rows the operator actually changed are written -- saving an item with
 * no edits leaves options, sizes and location restrictions untouched.
 */
async function saveMenuItem(formData: FormData): Promise<SaveMenuItemResult> {
  "use server";
  try {
    const restaurant = await requireRestaurant();
    await requireAdminRole("MANAGER");
    const id = String(formData.get("id") || "");

    const name = String(formData.get("name") || "").trim();
    if (name.length < 2) return { ok: false, error: "Give the item a name (at least 2 characters)." };
    if (name.length > 120) return { ok: false, error: "That name is too long." };
    const basePriceCents = dollarsToCents(String(formData.get("price") || "0"));
    if (basePriceCents === null) return { ok: false, error: "Enter a valid price." };

    const description = String(formData.get("description") || "").trim() || null;
    const imageUrl = String(formData.get("imageUrl") || "").trim() || null;
    const isActive = formData.get("isActive") === "on";
    const isUpsell = formData.get("isUpsell") === "on";
    const featuredOnLanding = formData.get("featuredOnLanding") === "on";
    const dietaryTags = String(formData.get("dietaryTags") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const category = String(formData.get("category") || "").trim() || null;
    const requiredChoices = parseChoicesText(String(formData.get("requiredChoices") || ""));
    const sizes = parseSizesText(String(formData.get("sizes") || ""));

    let submittedOptions: z.infer<typeof optionsPayloadSchema>;
    let originalOptionIds: string[];
    try {
      submittedOptions = optionsPayloadSchema.parse(JSON.parse(String(formData.get("options") || "[]")));
      originalOptionIds = z.array(z.string()).parse(JSON.parse(String(formData.get("originalOptionIds") || "[]")));
    } catch {
      return { ok: false, error: "Could not read the extras list. Reload the page and try again." };
    }

    const schools = await prisma.school.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      select: { id: true },
    });
    const checkedSchoolIds = schools.map((s) => s.id).filter((sid) => formData.get(`school_${sid}`) === "on");

    if (!id) {
      // ── Create ───────────────────────────────────────────────────────────
      const taken = new Set(
        (await prisma.menuItem.findMany({ where: { restaurantId: restaurant.id }, select: { slug: true } })).map(
          (m) => m.slug
        )
      );
      const slug = uniqueSlug(slugify(name), taken);
      const optionRows = submittedOptions
        .filter((o) => o.name.trim())
        .map((o) => ({ name: o.name.trim(), optionType: o.optionType, priceDeltaCents: o.priceDeltaCents }));
      const perType = { ADD_ON: 0, REMOVAL: 0 };
      const created = await prisma.menuItem.create({
        data: {
          restaurantId: restaurant.id,
          name,
          slug,
          description,
          imageUrl,
          basePriceCents,
          isActive,
          isUpsell,
          featuredOnLanding,
          dietaryTags,
          category,
          requiredChoices,
          options: {
            create: optionRows.map((o) => ({ ...o, sortOrder: perType[o.optionType]++ })),
          },
          sizes: {
            create: sizes.map((s, idx) => ({ name: s.name, priceCents: s.priceCents, sortOrder: idx, isDefault: idx === 0 })),
          },
          schoolRestrictions: {
            create: checkedSchoolIds.map((schoolId) => ({ schoolId })),
          },
        },
        select: { id: true },
      });

      // Operators who went through the onboarding questionnaire have no
      // hand-curated per-date menus, so a new active item goes onto their
      // upcoming dates automatically. Legacy tenants (e.g. Medina) keep
      // curating dates themselves, exactly as before.
      if (isActive) {
        const profile = await prisma.restaurant.findUnique({
          where: { id: restaurant.id },
          select: { questionnaireCompletedAt: true },
        });
        if (profile?.questionnaireCompletedAt) {
          const upcoming = await prisma.deliveryDate.findMany({
            where: { school: { restaurantId: restaurant.id }, deliveryDate: { gte: new Date() }, cancelledAt: null },
            select: { id: true, schoolId: true },
          });
          if (upcoming.length > 0) {
            await prisma.deliveryMenuItem.createMany({
              data: upcoming.map((d) => ({
                deliveryDateId: d.id,
                menuItemId: created.id,
                schoolId: d.schoolId,
                isAvailable: true,
              })),
              skipDuplicates: true,
            });
          }
        }
      }

      revalidatePath("/admin/menu");
      revalidatePath("/menu");
      revalidatePath("/order");
      return { ok: true, id: created.id };
    }

    // ── Update ─────────────────────────────────────────────────────────────
    const item = await prisma.menuItem.findFirst({
      where: { id, restaurantId: restaurant.id },
      include: {
        options: true,
        sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        schoolRestrictions: { select: { schoolId: true } },
      },
    });
    if (!item) return { ok: false, error: "That item no longer exists. Reload the page." };

    const optionPlan = planOptionSync(
      item.options.map((o) => ({
        id: o.id,
        name: o.name,
        optionType: o.optionType,
        priceDeltaCents: o.priceDeltaCents,
        isDefault: o.isDefault,
        sortOrder: o.sortOrder,
      })),
      submittedOptions,
      originalOptionIds
    );

    const sizesChanged = !sameSizes(
      item.sizes.map((s) => ({ name: s.name, priceCents: s.priceCents })),
      sizes
    );
    const schoolsChanged = !sameIdSet(
      item.schoolRestrictions.map((r) => r.schoolId),
      checkedSchoolIds
    );

    await prisma.$transaction([
      prisma.menuItem.update({
        where: { id },
        data: {
          name,
          basePriceCents,
          description,
          imageUrl,
          isActive,
          isUpsell,
          featuredOnLanding,
          dietaryTags,
          category,
          requiredChoices,
        },
      }),
      ...(sizesChanged
        ? [
            prisma.menuItemSize.deleteMany({ where: { menuItemId: id } }),
            ...(sizes.length > 0
              ? [
                  prisma.menuItemSize.createMany({
                    data: sizes.map((s, idx) => ({
                      menuItemId: id,
                      name: s.name,
                      priceCents: s.priceCents,
                      sortOrder: idx,
                      isDefault: idx === 0,
                    })),
                  }),
                ]
              : []),
          ]
        : []),
      ...(schoolsChanged
        ? [
            prisma.schoolMenuItem.deleteMany({ where: { menuItemId: id } }),
            ...(checkedSchoolIds.length > 0
              ? [
                  prisma.schoolMenuItem.createMany({
                    data: checkedSchoolIds.map((schoolId) => ({ schoolId, menuItemId: id })),
                  }),
                ]
              : []),
          ]
        : []),
      ...(optionPlan.deleteIds.length > 0
        ? [prisma.menuOption.deleteMany({ where: { id: { in: optionPlan.deleteIds }, menuItemId: id } })]
        : []),
      ...optionPlan.update.map((u) => prisma.menuOption.update({ where: { id: u.id }, data: u.data })),
      ...(optionPlan.create.length > 0
        ? [prisma.menuOption.createMany({ data: optionPlan.create.map((c) => ({ ...c, menuItemId: id })) })]
        : []),
    ]);

    revalidatePath("/admin/menu");
    revalidatePath("/menu");
    revalidatePath("/order");
    return { ok: true, id };
  } catch (err) {
    console.error("[saveMenuItem]", err);
    return { ok: false, error: "Could not save. Please try again." };
  }
}

/** One-click show/hide from the list. */
async function setMenuItemActive(id: string, isActive: boolean): Promise<void> {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  await prisma.menuItem.updateMany({ where: { id, restaurantId: restaurant.id }, data: { isActive } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/order");
}

/**
 * Bulk-renames a category across every item that currently has it —
 * category is a plain string on MenuItem (not its own model, to keep bulk
 * Excel uploads simple), so "renaming" means updating every row that
 * shares the old name. If the new name matches an existing category,
 * this naturally merges them (the confirm dialog on the button warns
 * about this before submitting).
 */
async function renameCategory(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const oldName = String(formData.get("oldName") || "").trim();
  const newName = String(formData.get("newName") || "").trim();
  if (!oldName || !newName || oldName === newName) return;

  if (oldName === UNCATEGORIZED) {
    // "Uncategorized" isn't a real stored value — it's how we label items
    // with category = null. Renaming it means giving those items a real
    // category for the first time.
    await prisma.menuItem.updateMany({
      where: { restaurantId: restaurant.id, category: null },
      data: { category: newName },
    });
  } else {
    await prisma.menuItem.updateMany({
      where: { restaurantId: restaurant.id, category: oldName },
      data: { category: newName },
    });
  }

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

/**
 * Moves a category one position up or down in display order. Writes an
 * explicit CategoryOrder row for EVERY currently-displayed category
 * (not just the two being swapped) reflecting their current effective
 * order first -- this "materializes" a full explicit ordering the first
 * time anyone reorders anything, so subsequent moves operate on a
 * consistent baseline instead of a mix of explicit positions and
 * alphabetical fallback. "Uncategorized" is excluded -- it's a special
 * bucket for items with no real category, not something to persist an
 * order for, and always stays last.
 */
async function moveCategory(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const name = String(formData.get("name") || "").trim();
  const direction = String(formData.get("direction") || "");
  if (!name || (direction !== "up" && direction !== "down")) return;

  const items = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id },
    select: { category: true },
  });
  const realCategoryNames = Array.from(
    new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))
  );
  const existingOrder = await prisma.categoryOrder.findMany({
    where: { restaurantId: restaurant.id },
    select: { name: true, sortOrder: true },
  });
  const currentOrder = sortCategoryNames(realCategoryNames, existingOrder);

  const index = currentOrder.indexOf(name);
  if (index === -1) return;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= currentOrder.length) return; // already at the edge

  const reordered = [...currentOrder];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  await prisma.$transaction(
    reordered.map((catName, position) =>
      prisma.categoryOrder.upsert({
        where: { restaurantId_name: { restaurantId: restaurant.id, name: catName } },
        create: { restaurantId: restaurant.id, name: catName, sortOrder: position },
        update: { sortOrder: position },
      })
    )
  );

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

export const metadata: Metadata = {
  title: "Menu",
};

export default async function AdminMenuPage() {
  const [restaurant] = await Promise.all([requireRestaurant(), requireAdminRole("MANAGER")]);
  const [items, schools, categoryOrder] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id },
      include: {
        options: { orderBy: [{ optionType: "asc" }, { sortOrder: "asc" }] },
        schoolRestrictions: { select: { schoolId: true } },
        sizes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
      orderBy: { name: "asc" },
    }),
    prisma.school.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      select: { id: true, name: true, locationType: true },
      orderBy: { name: "asc" },
    }),
    prisma.categoryOrder.findMany({
      where: { restaurantId: restaurant.id },
      select: { name: true, sortOrder: true },
    }),
  ]);

  // Group by the item's REAL category field — not a guessed/hardcoded one.
  // (This used to group by a hardcoded 4-category name-matching heuristic
  // that ignored the actual `category` field entirely, so an operator's
  // own category choices never showed up correctly in their own admin
  // view even though they were correctly reflected on the live /menu
  // page. Fixed to match the same real-field logic the customer-facing
  // page already used.)
  //
  // Ordering: real categories are sorted per the restaurant's own
  // configured order (sortCategoryNames, falling back to alphabetical
  // for anything without an explicit position) -- "Uncategorized" is
  // excluded from that mechanism entirely and always pinned last, since
  // it's not a real category to persist a position for.
  const realCategoryNames = Array.from(
    new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))
  );
  const hasUncategorized = items.some((i) => !i.category?.trim());
  const categoryNames = [
    ...sortCategoryNames(realCategoryNames, categoryOrder),
    ...(hasUncategorized ? [UNCATEGORIZED] : []),
  ];

  const grouped = categoryNames.reduce<Record<string, typeof items>>((acc, cat) => {
    acc[cat] = items.filter((i) => (i.category?.trim() || UNCATEGORIZED) === cat);
    return acc;
  }, {});

  const managerItems: MenuManagerItem[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    imageUrl: i.imageUrl,
    basePriceCents: i.basePriceCents,
    isActive: i.isActive,
    isUpsell: i.isUpsell,
    featuredOnLanding: i.featuredOnLanding,
    dietaryTags: i.dietaryTags ?? [],
    category: i.category?.trim() || null,
    requiredChoices: i.requiredChoices ?? [],
    sizes: i.sizes.map((s) => ({ name: s.name, priceCents: s.priceCents })),
    options: i.options.map((o) => ({
      id: o.id,
      name: o.name,
      optionType: o.optionType,
      priceDeltaCents: o.priceDeltaCents,
    })),
    schoolIds: i.schoolRestrictions.map((r) => r.schoolId),
  }));

  const realOrder = sortCategoryNames(realCategoryNames, categoryOrder);

  return (
    <div className="bg-editorial-paper min-h-screen space-y-5 pb-10">
      <MenuManager
        items={managerItems}
        schools={schools}
        categories={realOrder}
        hasUncategorized={hasUncategorized}
        saveMenuItem={saveMenuItem}
        setMenuItemActive={setMenuItemActive}
      />

      {/* Manage categories — bulk rename / reorder across every item that
          shares a category name. Collapsed by default. */}
      {categoryNames.length > 0 && (
        <details className="rounded-[16px] border border-editorial-line bg-white overflow-hidden">
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer list-none">
            <p className="text-[13px] font-semibold text-editorial-ink">Manage categories</p>
            <span className="text-[11px] text-editorial-ink-faint">{categoryNames.length}</span>
            <span className="ml-auto text-editorial-ink-faint text-[11px]">▼</span>
          </summary>
          <div className="border-t border-editorial-line px-4 py-3 space-y-2">
            <p className="text-[12px] text-editorial-ink-soft mb-2">
              Rename a category to update every item that has it. Renaming to match an existing
              category merges them together.
            </p>
            {categoryNames.map((cat) => {
              const isReal = cat !== UNCATEGORIZED;
              const realIndex = realOrder.indexOf(cat);
              const isFirst = realIndex <= 0;
              const isLast = realIndex === realOrder.length - 1;
              const count = grouped[cat]?.length ?? 0;
              return (
                <div key={cat} className="flex items-center gap-2">
                  {isReal ? (
                    <div className="flex flex-col flex-shrink-0">
                      <form action={moveCategory}>
                        <input type="hidden" name="name" value={cat} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          disabled={isFirst}
                          aria-label={`Move ${cat} up`}
                          className="w-6 h-5 flex items-center justify-center text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25 disabled:hover:text-editorial-ink-faint"
                        >
                          ▲
                        </button>
                      </form>
                      <form action={moveCategory}>
                        <input type="hidden" name="name" value={cat} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          disabled={isLast}
                          aria-label={`Move ${cat} down`}
                          className="w-6 h-5 flex items-center justify-center text-editorial-ink-faint hover:text-editorial-ink disabled:opacity-25 disabled:hover:text-editorial-ink-faint"
                        >
                          ▼
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="w-6 flex-shrink-0" />
                  )}
                  <form action={renameCategory} className="flex items-center gap-2 flex-1">
                    <input type="hidden" name="oldName" value={cat} />
                    <span className="text-[11px] text-editorial-ink-faint flex-shrink-0 w-[90px] text-right">
                      {count} item{count !== 1 ? "s" : ""}
                    </span>
                    <input
                      name="newName"
                      defaultValue={cat}
                      className="flex-1 rounded-lg border border-editorial-line text-editorial-ink text-[12px] px-3 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-full border border-editorial-line text-editorial-ink-soft text-[12px] font-semibold hover:bg-editorial-paper-2 hover:text-editorial-ink transition flex-shrink-0"
                    >
                      Rename
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
