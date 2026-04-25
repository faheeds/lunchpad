import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { menuItemSchema, menuOptionSchema } from "@/lib/validation/order";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function createMenuItem(formData: FormData) {
  "use server";
  const parsed = menuItemSchema.parse({
    name: formData.get("name"),
    slug: slugify(String(formData.get("name") || "")),
    description: formData.get("description"),
    basePriceCents: formData.get("basePriceCents"),
    isActive: formData.get("isActive") === "on"
  });
  await prisma.menuItem.create({ data: parsed });
  revalidatePath("/admin/menu");
}

async function createMenuOption(formData: FormData) {
  "use server";
  const parsed = menuOptionSchema.parse({
    menuItemId: formData.get("menuItemId"),
    name: formData.get("name"),
    optionType: formData.get("optionType"),
    priceDeltaCents: formData.get("priceDeltaCents"),
    isDefault: false,
    sortOrder: formData.get("sortOrder")
  });
  await prisma.menuOption.create({ data: parsed });
  revalidatePath("/admin/menu");
}

async function toggleItemActive(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const current = await prisma.menuItem.findUnique({ where: { id }, select: { isActive: true } });
  await prisma.menuItem.update({ where: { id }, data: { isActive: !current?.isActive } });
  revalidatePath("/admin/menu");
}

async function updateItemPrice(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const dollars = parseFloat(String(formData.get("price") || "0"));
  if (isNaN(dollars) || dollars < 0) throw new Error("Invalid price");
  const basePriceCents = Math.round(dollars * 100);
  await prisma.menuItem.update({ where: { id }, data: { basePriceCents } });
  revalidatePath("/admin/menu");
}

async function updateItemDescription(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const description = String(formData.get("description") || "").trim() || null;
  await prisma.menuItem.update({ where: { id }, data: { description } });
  revalidatePath("/admin/menu");
}

async function updateItemImageUrl(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const imageUrl = String(formData.get("imageUrl") || "").trim() || null;
  await prisma.menuItem.update({ where: { id }, data: { imageUrl } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
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

export default async function AdminMenuPage() {
  const items = await prisma.menuItem.findMany({
    include: { options: { orderBy: [{ optionType: "asc" }, { sortOrder: "asc" }] } },
    orderBy: { name: "asc" }
  });

  // Group by category
  const grouped = CATEGORIES.reduce<Record<string, typeof items>>((acc, cat) => {
    acc[cat] = items.filter((i) => getCategory(i.name, i.description) === cat);
    return acc;
  }, {});

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  return (
    <div className="space-y-5 pb-10">
      <h1 className="text-[17px] font-semibold text-ink">Menu</h1>

      {/* Add item */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="text-[13px] font-semibold text-ink">+ Add menu item</span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>
        <form action={createMenuItem} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Item name</label>
              <input name="name" placeholder="e.g. Crispy Chicken Sandwich" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Base price (cents)</label>
              <input name="basePriceCents" placeholder="e.g. 1299 = $12.99" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Description (start with category name)</label>
            <input name="description" placeholder="Signature Burgers & Sandwiches. Description here..."
              className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-600 cursor-pointer">
            <input type="checkbox" name="isActive" defaultChecked className="rounded" />
            Active (visible to customers)
          </label>
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Create item
          </button>
        </form>
      </details>

      {/* Add option */}
      <details className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none">
          <span className="text-[13px] font-semibold text-ink">+ Add option to existing item</span>
          <span className="text-[11px] text-slate-400">tap to expand</span>
        </summary>
        <form action={createMenuOption} className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-2">
          <div>
            <label className="text-[11px] text-slate-500 mb-1 block">Menu item</label>
            <select name="menuItemId" className="w-full rounded-lg border-slate-200 text-[13px] py-2">
              {items.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Option name</label>
              <input name="name" placeholder="e.g. Extra cheese" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Type</label>
              <select name="optionType" className="w-full rounded-lg border-slate-200 text-[13px] py-2">
                <option value="ADD_ON">Add-on</option>
                <option value="REMOVAL">Removal</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Price delta (cents, 0 = free)</label>
              <input name="priceDeltaCents" defaultValue="0" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 mb-1 block">Sort order</label>
              <input name="sortOrder" defaultValue="0" required
                className="w-full rounded-lg border-slate-200 text-[13px] px-3 py-2" />
            </div>
          </div>
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Add option
          </button>
        </form>
      </details>

      {/* Menu items by category */}
      {CATEGORIES.map((cat) => {
        const catItems = grouped[cat];
        if (!catItems?.length) return null;
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{CAT_ICONS[cat]}</span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{cat}</p>
              <span className="text-[10px] text-slate-300">{catItems.length} items</span>
            </div>
            <div className="space-y-2">
              {catItems.map((item) => {
                const addons = item.options.filter((o) => o.optionType === "ADD_ON");
                const removals = item.options.filter((o) => o.optionType === "REMOVAL");
                return (
                  <details key={item.id} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
                    <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13px] font-semibold text-ink truncate">{item.name}</p>
                          {!item.isActive && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 flex-shrink-0">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] font-semibold text-brand-700 mt-0.5">{fmt(item.basePriceCents)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-slate-400">{item.options.length} options</span>
                        <span className="text-slate-300 text-[11px]">▼</span>
                      </div>
                    </summary>

                    <div className="border-t border-slate-50 px-4 py-3 space-y-3">
                      {/* Photo URL */}
                      <form action={updateItemImageUrl} className="space-y-1.5">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="text-[11px] text-slate-500 block">Photo URL</label>
                        <div className="flex gap-2 items-start">
                          {item.imageUrl && (
                            <img src={item.imageUrl} alt={item.name}
                              className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-slate-200" />
                          )}
                          <div className="flex-1 flex gap-2">
                            <input
                              name="imageUrl"
                              type="url"
                              defaultValue={item.imageUrl ?? ""}
                              placeholder="Paste image URL from your restaurant site…"
                              className="flex-1 rounded-lg border border-slate-200 text-[12px] px-3 py-1.5 min-w-0"
                            />
                            <button type="submit"
                              className="px-3 py-1.5 rounded-lg bg-brand-700 text-white text-[11px] font-semibold flex-shrink-0 hover:bg-brand-800 transition">
                              Save
                            </button>
                          </div>
                        </div>
                      </form>

                      {/* Toggle active */}
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-500 leading-relaxed max-w-[240px]">
                          {item.description || "No description"}
                        </p>
                        <form action={toggleItemActive}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit"
                            className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition ${
                              item.isActive
                                ? "border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                                : "border-brand-200 text-brand-700 hover:bg-brand-50"
                            }`}>
                            {item.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      </div>

                      {/* Quick price edit */}
                      <form action={updateItemPrice} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="text-[11px] text-slate-500 flex-shrink-0">Price ($)</label>
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-slate-400">$</span>
                          <input
                            name="price"
                            type="number"
                            step="0.01"
                            min="0"
                            defaultValue={(item.basePriceCents / 100).toFixed(2)}
                            className="w-full rounded-lg border border-slate-200 text-[13px] pl-6 pr-3 py-1.5"
                          />
                        </div>
                        <button type="submit"
                          className="px-3 py-1.5 rounded-lg bg-brand-700 text-white text-[11px] font-semibold flex-shrink-0 hover:bg-brand-800 transition">
                          Save
                        </button>
                      </form>

                      {/* Quick description edit */}
                      <form action={updateItemDescription} className="flex items-start gap-2">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="text-[11px] text-slate-500 flex-shrink-0 mt-2">Description</label>
                        <textarea
                          name="description"
                          rows={2}
                          defaultValue={item.description ?? ""}
                          placeholder="Signature Burgers & Sandwiches. Description here…"
                          className="flex-1 rounded-lg border border-slate-200 text-[12px] px-3 py-1.5 resize-none"
                        />
                        <button type="submit"
                          className="px-3 py-1.5 rounded-lg bg-brand-700 text-white text-[11px] font-semibold flex-shrink-0 hover:bg-brand-800 transition mt-0.5">
                          Save
                        </button>
                      </form>

                      {/* Add-ons */}
                      {addons.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Add-ons</p>
                          <div className="flex flex-wrap gap-1.5">
                            {addons.map((o) => (
                              <span key={o.id}
                                className="px-2.5 py-1 rounded-full text-[11px] bg-brand-50 text-brand-800 border border-brand-100">
                                + {o.name}{o.priceDeltaCents ? ` +${fmt(o.priceDeltaCents)}` : " (free)"}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Removals */}
                      {removals.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Removals</p>
                          <div className="flex flex-wrap gap-1.5">
                            {removals.map((o) => (
                              <span key={o.id}
                                className="px-2.5 py-1 rounded-full text-[11px] bg-red-50 text-red-700 border border-red-100">
                                No {o.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.options.length === 0 && (
                        <p className="text-[12px] text-slate-400">No options configured.</p>
                      )}
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
