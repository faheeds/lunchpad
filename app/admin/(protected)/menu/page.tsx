import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { menuItemSchema, menuOptionSchema } from "@/lib/validation/order";
import { slugify } from "@/lib/utils";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { EmptyState } from "@/components/admin/empty-state";
import { MenuAddTabs } from "@/components/admin/menu-add-tabs";
import { ImageUpload } from "@/components/admin/image-upload";
import { DietaryTagsPicker } from "@/components/admin/dietary-tags-picker";

export const dynamic = "force-dynamic";

async function createMenuItem(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  // Accept price in dollars (e.g. "12.99") and convert to cents
  const priceDollars = parseFloat(String(formData.get("price") || "0"));
  const basePriceCents = Math.round(priceDollars * 100);
  const parsed = menuItemSchema.parse({
    name: formData.get("name"),
    slug: slugify(String(formData.get("name") || "")),
    description: formData.get("description"),
    imageUrl: formData.get("imageUrl"),
    basePriceCents,
    isActive: formData.get("isActive") === "on",
    dietaryTags: formData.get("dietaryTags"),
    category: formData.get("category"),
    requiredChoices: formData.get("requiredChoices"),
  });
  await prisma.menuItem.create({ data: { ...parsed, restaurantId: restaurant.id } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

async function createMenuOption(formData: FormData) {
  "use server";
  await requireRestaurant();
  await requireAdminRole("MANAGER");
  const priceDollars = parseFloat(String(formData.get("priceDollars") || "0"));
  const priceDeltaCents = isNaN(priceDollars) ? 0 : Math.round(priceDollars * 100);
  const parsed = menuOptionSchema.parse({
    menuItemId: formData.get("menuItemId"),
    name: formData.get("name"),
    optionType: formData.get("optionType"),
    priceDeltaCents,
    isDefault: false,
    sortOrder: formData.get("sortOrder") ?? 0,
  });
  await prisma.menuOption.create({ data: parsed });
  revalidatePath("/admin/menu");
}

async function toggleItemActive(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  // Tenant-scoped: verify item belongs to this restaurant
  const current = await prisma.menuItem.findFirst({
    where: { id, restaurantId: restaurant.id },
    select: { isActive: true },
  });
  if (!current) throw new Error("Item not found");
  await prisma.menuItem.update({ where: { id }, data: { isActive: !current.isActive } });
  revalidatePath("/admin/menu");
}

async function updateItemPrice(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  const dollars = parseFloat(String(formData.get("price") || "0"));
  if (isNaN(dollars) || dollars < 0) throw new Error("Invalid price");
  const basePriceCents = Math.round(dollars * 100);
  // Tenant-scoped
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: restaurant.id },
    select: { id: true },
  });
  if (!item) throw new Error("Item not found");
  await prisma.menuItem.update({ where: { id }, data: { basePriceCents } });
  revalidatePath("/admin/menu");
}

async function deleteMenuOption(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("optionId"));
  // Verify option belongs to this restaurant
  const option = await prisma.menuOption.findFirst({
    where: { id, menuItem: { restaurantId: restaurant.id } },
  });
  if (!option) throw new Error("Option not found");
  await prisma.menuOption.delete({ where: { id } });
  revalidatePath("/admin/menu");
}

async function updateMenuOption(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("optionId"));
  const name = String(formData.get("name") || "").trim();
  const optionType = String(formData.get("optionType") || "ADD_ON") as "ADD_ON" | "REMOVAL";
  const priceDeltaCents = Math.round(parseFloat(String(formData.get("priceDollars") || "0")) * 100);

  if (!name) throw new Error("Option name is required");
  const option = await prisma.menuOption.findFirst({
    where: { id, menuItem: { restaurantId: restaurant.id } },
  });
  if (!option) throw new Error("Option not found");
  await prisma.menuOption.update({ where: { id }, data: { name, optionType, priceDeltaCents } });
  revalidatePath("/admin/menu");
}

async function updateItemDescription(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  const description = String(formData.get("description") || "").trim() || null;
  // Tenant-scoped
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: restaurant.id },
    select: { id: true },
  });
  if (!item) throw new Error("Item not found");
  await prisma.menuItem.update({ where: { id }, data: { description } });
  revalidatePath("/admin/menu");
}

async function updateItemImageUrl(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  const imageUrl = String(formData.get("imageUrl") || "").trim() || null;
  // Tenant-scoped
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: restaurant.id },
    select: { id: true },
  });
  if (!item) throw new Error("Item not found");
  await prisma.menuItem.update({ where: { id }, data: { imageUrl } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

// Sizes editor — parses a textarea where each line is one size in the
// form "Name | Price". Whitespace tolerant; lines without a valid name
// or price are skipped. Whole-dollar amounts and decimals both work.
// Replaces all existing sizes for the item (admin sees a textarea of
// current sizes, edits inline, saves — easier than per-row add/remove).
async function updateItemSizes(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  const raw = String(formData.get("sizes") || "");

  // Parse each line as "Name | Price". Tolerant: also accept "Name: $4.50",
  // "Name - 4.50", or "Name 4.50" (last whitespace-separated token = price).
  const seenNames = new Set<string>();
  const sizes: { name: string; priceCents: number }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Find the LAST numeric token in the line — that's the price.
    const match = trimmed.match(/^(.+?)[|:\-,\s]+\$?(\d+(?:\.\d{1,2})?)\s*$/);
    if (!match) continue;
    const name = match[1].trim();
    const priceCents = Math.round(parseFloat(match[2]) * 100);
    if (!name || !Number.isFinite(priceCents) || priceCents < 0) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    sizes.push({ name, priceCents });
  }

  // Tenant-scoped
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: restaurant.id },
    select: { id: true },
  });
  if (!item) throw new Error("Item not found");

  // Replace strategy: nuke existing sizes, recreate from parsed list. We
  // chose this over diff-and-update because (a) the admin UI is a single
  // textarea so the operator's intent is the WHOLE new list, and
  // (b) OrderItem.sizeName is a snapshot, so historic orders keep their
  // size names even after we delete the MenuItemSize row.
  await prisma.$transaction([
    prisma.menuItemSize.deleteMany({ where: { menuItemId: id } }),
    ...(sizes.length > 0
      ? [
          prisma.menuItemSize.createMany({
            data: sizes.map((s, idx) => ({
              menuItemId: id,
              name: s.name,
              priceCents: s.priceCents,
              sortOrder: idx,
              // First size is the default-selected one in the customer
              // picker. Operators can re-order by editing the textarea
              // since input order is preserved.
              isDefault: idx === 0,
            })),
          }),
        ]
      : []),
  ]);

  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/order");
}

async function updateItemTagsAndCategory(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  const tagsRaw = String(formData.get("dietaryTags") || "");
  const dietaryTags = tagsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const category = String(formData.get("category") || "").trim() || null;
  // Tenant-scoped
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: restaurant.id },
    select: { id: true },
  });
  if (!item) throw new Error("Item not found");
  await prisma.menuItem.update({ where: { id }, data: { dietaryTags, category } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

// Required choices — top-level "pick one" options that gate the order
// (e.g. a "Build Your Own Burger" item where the customer must choose
// Beef / Crispy Chicken / Grilled Chicken / Vegan). Conceptually different
// from MenuOption (which is add-on / removal). Stored as a String[] on
// MenuItem.requiredChoices. Empty = no required choice — the helper in
// lib/menu-config.ts also falls back to a legacy hardcoded slug map for
// items that pre-date this field, so operators only need to populate it
// where they want a custom set.
async function updateItemRequiredChoices(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const id = String(formData.get("id"));
  const raw = String(formData.get("requiredChoices") || "");
  // Accept newline OR comma separation so operators can paste a list.
  // Trim each entry, drop blanks, and dedupe (case-insensitive) — choice
  // names are user-facing labels so duplicates would be confusing.
  const seen = new Set<string>();
  const requiredChoices: string[] = [];
  for (const piece of raw.split(/[\n,]+/)) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    requiredChoices.push(trimmed);
  }
  // Tenant-scoped
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId: restaurant.id },
    select: { id: true },
  });
  if (!item) throw new Error("Item not found");
  await prisma.menuItem.update({ where: { id }, data: { requiredChoices } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/order");
}

async function updateSchoolRestrictions(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("MANAGER");
  const menuItemId = String(formData.get("menuItemId"));

  // Verify item belongs to this restaurant
  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, restaurantId: restaurant.id },
    select: { id: true },
  });
  if (!item) throw new Error("Item not found");

  // Get all schools for this restaurant
  const schools = await prisma.school.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    select: { id: true },
  });

  // Collect checked school IDs from form
  const checkedSchoolIds = schools
    .map((s) => s.id)
    .filter((sid) => formData.get(`school_${sid}`) === "on");

  // Replace all restrictions: delete existing, create new ones
  await prisma.$transaction([
    prisma.schoolMenuItem.deleteMany({ where: { menuItemId } }),
    ...(checkedSchoolIds.length > 0
      ? [prisma.schoolMenuItem.createMany({
          data: checkedSchoolIds.map((schoolId) => ({ schoolId, menuItemId })),
        })]
      : []),
  ]);

  revalidatePath("/admin/menu");
}

const CATEGORIES = [
  "Signature Burgers & Sandwiches",
  "Salads with Protein",
  "Comfort Favorites",
  "Sides & Snacks",
];

function getCategory(name: string, description: string | null) {
  const prefix = description?.split(".")[0]?.trim();
  if (prefix && CATEGORIES.includes(prefix)) return prefix;
  if (name.includes("Burger") || name.includes("Sandwich")) return "Signature Burgers & Sandwiches";
  if (name.includes("Salad")) return "Salads with Protein";
  if (name.includes("Mac") || name.includes("Quesadilla") || name.includes("Wings") || name.includes("Tender")) return "Comfort Favorites";
  return "Sides & Snacks";
}

const CAT_ICONS: Record<string, string> = {
  "Signature Burgers & Sandwiches": "🍔",
  "Salads with Protein": "🥗",
  "Comfort Favorites": "🍗",
  "Sides & Snacks": "🍟",
};


export const metadata: Metadata = {
  title: "Menu",
};
export default async function AdminMenuPage() {
  const [restaurant] = await Promise.all([requireRestaurant(), requireAdminRole("MANAGER")]);
  const [items, schools] = await Promise.all([
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
  ]);

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, typeof items>>((acc, cat) => {
    acc[cat] = items.filter((i) => getCategory(i.name, i.description) === cat);
    return acc;
  }, {});

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  return (
    <div className="bg-editorial-paper min-h-screen space-y-5 pb-10">
      <h1 className="text-[32px] font-editorial font-medium text-editorial-ink">Menu</h1>

      <MenuAddTabs items={items} createMenuItem={createMenuItem} createMenuOption={createMenuOption} />

      {items.length === 0 && (
        <EmptyState
          icon="shopping"
          title="No menu items yet."
          description="Add your first menu item above to get started."
        />
      )}

      {/* Menu items by category */}
      {CATEGORIES.map((cat) => {
        const catItems = grouped[cat];
        if (!catItems?.length) return null;
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">{CAT_ICONS[cat]}</span>
              <p className="text-[16px] font-editorial font-medium text-editorial-ink">{cat}</p>
              <span className="text-[12px] text-editorial-ink-faint">{catItems.length} items</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {catItems.map((item) => {
                const addons = item.options.filter((o) => o.optionType === "ADD_ON");
                const removals = item.options.filter((o) => o.optionType === "REMOVAL");
                return (
                  <details key={item.id} className="rounded-[16px] border border-editorial-line bg-white overflow-hidden shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
                    <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-editorial font-medium text-editorial-ink truncate">{item.name}</p>
                          {!item.isActive && (
                            <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-editorial-paper-2 text-editorial-ink-faint flex-shrink-0">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] font-semibold text-editorial-green mt-0.5">{fmt(item.basePriceCents)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] text-editorial-ink-faint">{item.options.length} options</span>
                        <span className="text-editorial-ink-faint text-[11px]">▼</span>
                      </div>
                    </summary>

                    <div className="border-t border-editorial-line px-4 py-3 space-y-3">
                      {/* Photo */}
                      <form action={updateItemImageUrl} className="space-y-2">
                        <input type="hidden" name="id" value={item.id} />
                        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 items-start">
                          <div className="max-w-[140px]">
                            <ImageUpload
                              name="imageUrl"
                              defaultValue={item.imageUrl}
                              label="Photo"
                              aspect="square"
                            />
                          </div>
                          <div className="flex flex-col gap-2 pt-5">
                            <p className="text-[12px] text-editorial-ink-soft leading-relaxed">
                              A clear, well-lit shot of the dish helps parents pick faster. Square crops, ~600&times;600 minimum.
                            </p>
                            <button type="submit"
                              className="self-start px-3 py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
                              Save photo
                            </button>
                          </div>
                        </div>
                      </form>

                      {/* Category + dietary tags */}
                      <form action={updateItemTagsAndCategory} className="space-y-2 border-t border-editorial-line pt-3">
                        <input type="hidden" name="id" value={item.id} />
                        <div>
                          <label className="text-[12px] text-editorial-ink-soft block mb-1">Category</label>
                          <input
                            name="category"
                            defaultValue={item.category ?? ""}
                            placeholder="e.g. Sandwiches, Salads, Pizza"
                            className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[12px] px-3 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] text-editorial-ink-soft block mb-1">Dietary tags</label>
                          <DietaryTagsPicker defaultValue={item.dietaryTags ?? []} />
                        </div>
                        <button type="submit"
                          className="px-3 py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
                          Save tags & category
                        </button>
                      </form>

                      {/* Required choices — top-level pick-one selector */}
                      <form action={updateItemRequiredChoices} className="space-y-2 border-t border-editorial-line pt-3">
                        <input type="hidden" name="id" value={item.id} />
                        <div>
                          <label className="text-[12px] text-editorial-ink-soft block mb-1">
                            Required choices
                            <span className="text-editorial-ink-faint font-normal ml-1">(pick one — leave blank if none)</span>
                          </label>
                          <textarea
                            name="requiredChoices"
                            defaultValue={(item.requiredChoices ?? []).join("\n")}
                            placeholder={"e.g.\nBeef\nCrispy Chicken\nGrilled Chicken\nBeyond Vegan"}
                            rows={Math.max(3, (item.requiredChoices?.length ?? 0) + 1)}
                            className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[12px] px-3 py-2 leading-snug resize-y font-mono focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                          />
                          <p className="text-[11px] text-editorial-ink-faint mt-1">
                            One per line. Customers must pick exactly one to add this item to their cart.
                            Different from add-ons / removals (those are configured in the Options panel).
                          </p>
                        </div>
                        <button type="submit"
                          className="px-3 py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
                          Save required choices
                        </button>
                      </form>

                      {/* Sizes — multi-price variants. Each line: "Name | Price"
                          (separators "|", ":", "-", "," or whitespace all work,
                          so an operator can paste real-world menu listings).
                          When set, the per-item basePriceCents becomes a
                          fallback the customer never sees — they always pick
                          a size first. */}
                      <form action={updateItemSizes} className="space-y-2 border-t border-editorial-line pt-3">
                        <input type="hidden" name="id" value={item.id} />
                        <div>
                          <label className="text-[12px] text-editorial-ink-soft block mb-1">
                            Sizes
                            <span className="text-editorial-ink-faint font-normal ml-1">
                              (one per line, e.g. <span className="font-mono">Small | 4.50</span> — leave blank for single-price)
                            </span>
                          </label>
                          <textarea
                            name="sizes"
                            defaultValue={(item.sizes ?? []).map((s) => `${s.name} | ${(s.priceCents / 100).toFixed(s.priceCents % 100 === 0 ? 0 : 2)}`).join("\n")}
                            placeholder={"e.g.\nSmall | 4.00\nMedium | 5.00\nLarge | 6.00"}
                            rows={Math.max(3, (item.sizes?.length ?? 0) + 1)}
                            className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[12px] px-3 py-2 leading-snug resize-y font-mono focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                          />
                          <p className="text-[11px] text-editorial-ink-faint mt-1">
                            Customers pick exactly one to add this item to their cart. The size's price replaces
                            the item's base price; add-ons still stack on top.
                          </p>
                        </div>
                        <button type="submit"
                          className="px-3 py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
                          Save sizes
                        </button>
                      </form>

                      {/* Toggle active */}
                      <div className="flex items-center justify-between">
                        <p className="text-[12px] text-editorial-ink-soft leading-relaxed max-w-[240px]">
                          {item.description || "No description"}
                        </p>
                        <form action={toggleItemActive}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit"
                            className={`px-3 py-1 rounded-full text-[12px] font-semibold border transition ${
                              item.isActive
                                ? "border-editorial-line text-editorial-ink-soft hover:bg-editorial-paper-2 hover:border-editorial-line hover:text-editorial-ink"
                                : "border-editorial-green text-editorial-green hover:bg-editorial-paper-2"
                            }`}>
                            {item.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      </div>

                      {/* Quick price edit */}
                      <form action={updateItemPrice} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="text-[12px] text-editorial-ink-soft flex-shrink-0">Price ($)</label>
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-editorial-ink-faint">$</span>
                          <input
                            name="price"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={(item.basePriceCents / 100).toFixed(2)}
                            className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[13px] pl-6 pr-3 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                          />
                        </div>
                        <button type="submit"
                          className="px-3 py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold flex-shrink-0 hover:bg-editorial-green-deep transition">
                          Save
                        </button>
                      </form>

                      {/* Quick description edit */}
                      <form action={updateItemDescription} className="flex items-start gap-2">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="text-[12px] text-editorial-ink-soft flex-shrink-0 mt-2">Description</label>
                        <textarea
                          name="description"
                          rows={2}
                          defaultValue={item.description ?? ""}
                          placeholder="Signature Burgers & Sandwiches. Description here…"
                          className="flex-1 rounded-lg border border-editorial-line text-editorial-ink text-[12px] px-3 py-1.5 resize-none focus:border-editorial-green focus:ring-1 focus:ring-editorial-green"
                        />
                        <button type="submit"
                          className="px-3 py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold flex-shrink-0 hover:bg-editorial-green-deep transition mt-0.5">
                          Save
                        </button>
                      </form>

                      {/* Location availability */}
                      {schools.length > 1 && (
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-editorial-ink-faint mb-2">
                            Location availability
                          </p>
                          {item.schoolRestrictions.length === 0 ? (
                            <p className="text-[12px] text-editorial-green bg-editorial-sage border border-editorial-line rounded-lg px-3 py-2 mb-2">
                              ✓ Available at all locations
                            </p>
                          ) : (
                            <p className="text-[12px] text-[#6E5C2C] bg-[#F6EED9] border border-[#E5D6A8] rounded-lg px-3 py-2 mb-2">
                              ⚠ Restricted to {item.schoolRestrictions.length} location{item.schoolRestrictions.length !== 1 ? "s" : ""}
                            </p>
                          )}
                          <form action={updateSchoolRestrictions} className="space-y-1.5">
                            <input type="hidden" name="menuItemId" value={item.id} />
                            <p className="text-[12px] text-editorial-ink-faint mb-1.5">
                              Check the locations that should see this item. Leave all unchecked = visible at every location.
                            </p>
                            {schools.map((school) => {
                              const isChecked = item.schoolRestrictions.some((r) => r.schoolId === school.id);
                              return (
                                <label key={school.id} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    name={`school_${school.id}`}
                                    defaultChecked={isChecked}
                                    className="rounded border-editorial-line text-editorial-green focus:ring-editorial-green"
                                  />
                                  <span className="text-[12px] text-editorial-ink">
                                    {school.name}
                                    <span className="text-[11px] uppercase tracking-wide ml-1.5 px-1.5 py-0.5 rounded-full"
                                      style={{
                                        background: school.locationType === "OFFICE" ? "#eff6ff" : "#fff1f3",
                                        color: school.locationType === "OFFICE" ? "#1e40af" : "#9f1239",
                                      }}>
                                      {school.locationType === "OFFICE" ? "Office" : "School"}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                            <button type="submit"
                              className="mt-2 px-3 py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
                              Save availability
                            </button>
                          </form>
                        </div>
                      )}

                      {/* Options (add-ons + removals) — editable */}
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-editorial-ink-faint mb-2">
                          Options ({item.options.length})
                        </p>

                        {item.options.length === 0 && (
                          <p className="text-[12px] text-editorial-ink-faint mb-2">No options yet — add one below.</p>
                        )}

                        {/* Existing options */}
                        {item.options.map((o) => (
                          <details key={o.id} className="rounded-[12px] border border-editorial-line bg-editorial-paper-2 mb-1.5 overflow-hidden">
                            <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer list-none">
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                color: o.optionType === "ADD_ON" ? "#0369a1" : "#b91c1c",
                                background: o.optionType === "ADD_ON" ? "#eff6ff" : "#fee2e2",
                                borderRadius: 100, padding: "2px 8px", flexShrink: 0,
                              }}>
                                {o.optionType === "ADD_ON" ? "Add-on" : "Removal"}
                              </span>
                              <p className="text-[12px] font-medium text-editorial-ink flex-1 truncate">{o.name}</p>
                              {o.priceDeltaCents !== 0 && (
                                <span className="text-[11px] text-editorial-ink-soft flex-shrink-0">
                                  +{fmt(o.priceDeltaCents)}
                                </span>
                              )}
                              <span className="text-[11px] text-editorial-ink-faint flex-shrink-0">Edit ▼</span>
                            </summary>

                            {/* Inline edit form */}
                            <div className="border-t border-editorial-line px-3 pb-3 pt-2 space-y-2">
                              <form action={updateMenuOption} className="space-y-2">
                                <input type="hidden" name="optionId" value={o.id} />
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">Name</label>
                                    <input type="text" name="name" required defaultValue={o.name}
                                      className="w-full rounded-lg border border-editorial-line bg-white text-editorial-ink text-[12px] px-2.5 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                                  </div>
                                  <div>
                                    <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">Type</label>
                                    <select name="optionType" defaultValue={o.optionType}
                                      className="w-full rounded-lg border border-editorial-line bg-white text-editorial-ink text-[12px] px-2.5 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                                      <option value="ADD_ON">Add-on</option>
                                      <option value="REMOVAL">Removal</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">
                                    Extra price ($ — enter 0 for free)
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-editorial-ink-faint">$</span>
                                    <input type="number" name="priceDollars" step="0.01" min="0"
                                      defaultValue={(o.priceDeltaCents / 100).toFixed(2)}
                                      className="w-full rounded-lg border border-editorial-line bg-white text-editorial-ink text-[12px] pl-6 pr-3 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                                  </div>
                                </div>
                                <button type="submit"
                                  className="w-full py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
                                  Save changes
                                </button>
                              </form>

                              {/* Delete */}
                              <form action={deleteMenuOption}>
                                <input type="hidden" name="optionId" value={o.id} />
                                <ConfirmButton
                                  message={`Delete "${o.name}"?`}
                                  className="w-full py-1.5 rounded-full border border-editorial-clay text-editorial-clay text-[12px] font-semibold hover:bg-editorial-paper-2 transition">
                                  Delete option
                                </ConfirmButton>
                              </form>
                            </div>
                          </details>
                        ))}

                        {/* Add option inline */}
                        <details className="rounded-[12px] border border-dashed border-editorial-line bg-white overflow-hidden mt-2">
                          <summary className="flex items-center gap-1.5 px-3 py-2 cursor-pointer list-none text-[12px] text-editorial-ink-soft font-medium">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>
                            Add option
                          </summary>
                          <form action={createMenuOption} className="border-t border-editorial-line px-3 pb-3 pt-2 space-y-2">
                            <input type="hidden" name="menuItemId" value={item.id} />
                            <input type="hidden" name="sortOrder" value={item.options.length} />
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">Name</label>
                                <input type="text" name="name" required placeholder="e.g. Extra cheese"
                                  className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[12px] px-2.5 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                              </div>
                              <div>
                                <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">Type</label>
                                <select name="optionType"
                                  className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[12px] px-2.5 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green">
                                  <option value="ADD_ON">Add-on</option>
                                  <option value="REMOVAL">Removal</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="text-[11px] text-editorial-ink-soft font-medium block mb-1">
                                Extra price ($ — enter 0 for free)
                              </label>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-editorial-ink-faint">$</span>
                                <input type="number" name="priceDollars" step="0.01" min="0" defaultValue="0"
                                  className="w-full rounded-lg border border-editorial-line text-editorial-ink text-[12px] pl-6 pr-3 py-1.5 focus:border-editorial-green focus:ring-1 focus:ring-editorial-green" />
                              </div>
                            </div>
                            <button type="submit"
                              className="w-full py-1.5 rounded-full bg-editorial-green text-editorial-paper text-[12px] font-semibold hover:bg-editorial-green-deep transition">
                              Add option
                            </button>
                          </form>
                        </details>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
