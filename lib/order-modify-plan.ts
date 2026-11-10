import { resolveLineItemPrice } from "@/lib/pricing";

/**
 * Pure planning for an admin order modification (add items, change quantity,
 * change add-ons/removals, remove items). No database or Stripe access here so
 * it can be unit tested; lib/order-modify.ts does the I/O.
 *
 * Quantity is modelled the way the rest of LunchPad models it: one OrderItem
 * row per unit. Raising a quantity creates rows, lowering it removes rows.
 */

export type MenuLite = {
  id: string;
  name: string;
  basePriceCents: number;
  sizes: { name: string; priceCents: number }[];
  /** Names of the required top-level choices (stored in `additions[0]`). */
  requiredChoices: string[];
  options: { name: string; optionType: "ADD_ON" | "REMOVAL"; priceDeltaCents: number }[];
};

export type ExistingLine = {
  id: string;
  menuItemId: string;
  itemNameSnapshot: string;
  basePriceCents: number;
  sizeName: string | null;
  additions: string[];
  removals: string[];
  lineTotalCents: number;
  refunded: boolean;
  menu: MenuLite;
};

export type ModifyRequest = {
  updates: { orderItemId: string; additions: string[]; removals: string[] }[];
  removeItemIds: string[];
  adds: {
    menuItemId: string;
    size?: string;
    choice?: string;
    additions: string[];
    removals: string[];
    quantity: number;
  }[];
};

export type PlannedCreate = {
  menuItemId: string;
  itemNameSnapshot: string;
  basePriceCents: number;
  sizeName: string | null;
  additions: string[];
  removals: string[];
  lineTotalCents: number;
};

export type ModifyPlan = {
  updates: { id: string; additions: string[]; removals: string[]; lineTotalCents: number }[];
  removeIds: string[];
  creates: PlannedCreate[];
  newSubtotalCents: number;
  newTotalCents: number;
  deltaCents: number;
  /** Human readable change list for the activity log / confirmation UI. */
  summary: string[];
};

export const MAX_QTY_PER_ADD = 50;

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

export function planOrderModification(args: {
  lines: ExistingLine[];
  /** Menu items available on this order's delivery date, keyed by id. */
  available: Map<string, MenuLite>;
  request: ModifyRequest;
  currentSubtotalCents: number;
  currentTotalCents: number;
  discountCents: number;
}): ModifyPlan {
  const { lines, available, request } = args;
  const byId = new Map(lines.map((l) => [l.id, l]));
  const removeSet = new Set(request.removeItemIds);
  const summary: string[] = [];

  for (const id of removeSet) {
    const l = byId.get(id);
    if (!l) throw new Error("A line you tried to remove is not on this order.");
    if (l.refunded) throw new Error(`${l.itemNameSnapshot} has already been refunded.`);
  }

  const updates: ModifyPlan["updates"] = [];
  const seen = new Set<string>();
  for (const u of request.updates) {
    if (seen.has(u.orderItemId)) throw new Error("Duplicate line update.");
    seen.add(u.orderItemId);
    if (removeSet.has(u.orderItemId)) continue;
    const l = byId.get(u.orderItemId);
    if (!l) throw new Error("A line you tried to edit is not on this order.");
    if (l.refunded) throw new Error(`${l.itemNameSnapshot} has already been refunded.`);

    const addOnNames = new Set(l.menu.options.filter((o) => o.optionType === "ADD_ON").map((o) => o.name));
    const removalNames = new Set(l.menu.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name));
    if (!u.additions.every((a) => addOnNames.has(a))) throw new Error(`Invalid add-on for ${l.itemNameSnapshot}.`);
    if (!u.removals.every((r) => removalNames.has(r))) throw new Error(`Invalid removal for ${l.itemNameSnapshot}.`);

    // Keep the stored required choice (it lives in additions[]).
    const keptChoice = l.additions.filter((a) => !addOnNames.has(a) && l.menu.requiredChoices.includes(a));
    const additions = [...keptChoice, ...u.additions];
    const lineTotalCents = resolveLineItemPrice({
      basePriceCents: l.basePriceCents,
      additions: l.menu.options.filter((o) => o.optionType === "ADD_ON" && u.additions.includes(o.name)),
    });

    const unchanged = sameSet(additions, l.additions) && sameSet(u.removals, l.removals);
    if (unchanged) continue;
    updates.push({ id: l.id, additions, removals: u.removals, lineTotalCents });
    summary.push(`Changed ${l.itemNameSnapshot}${l.sizeName ? ` (${l.sizeName})` : ""} options`);
  }

  for (const id of removeSet) {
    const l = byId.get(id)!;
    summary.push(`Removed ${l.itemNameSnapshot}${l.sizeName ? ` (${l.sizeName})` : ""}`);
  }

  const creates: PlannedCreate[] = [];
  for (const a of request.adds) {
    const qty = Math.floor(a.quantity);
    if (!(qty >= 1 && qty <= MAX_QTY_PER_ADD)) throw new Error(`Quantity must be between 1 and ${MAX_QTY_PER_ADD}.`);
    const m = available.get(a.menuItemId);
    if (!m) throw new Error("That item isn't available on this order's delivery date.");

    const addOnNames = new Set(m.options.filter((o) => o.optionType === "ADD_ON").map((o) => o.name));
    const removalNames = new Set(m.options.filter((o) => o.optionType === "REMOVAL").map((o) => o.name));
    if (!a.additions.every((v) => addOnNames.has(v))) throw new Error(`Invalid add-on for ${m.name}.`);
    if (!a.removals.every((v) => removalNames.has(v))) throw new Error(`Invalid removal for ${m.name}.`);
    if (m.requiredChoices.length && (!a.choice || !m.requiredChoices.includes(a.choice))) {
      throw new Error(`Choose a required option for ${m.name}.`);
    }

    let basePriceCents = m.basePriceCents;
    let sizeName: string | null = null;
    if (m.sizes.length > 0) {
      const size = m.sizes.find((s) => s.name === a.size);
      if (!size) throw new Error(`Choose a valid size for ${m.name}.`);
      basePriceCents = size.priceCents;
      sizeName = size.name;
    }
    const lineTotalCents = resolveLineItemPrice({
      basePriceCents,
      additions: m.options.filter((o) => o.optionType === "ADD_ON" && a.additions.includes(o.name)),
    });
    const additions = a.choice ? [a.choice, ...a.additions] : a.additions;
    for (let i = 0; i < qty; i++) {
      creates.push({ menuItemId: m.id, itemNameSnapshot: m.name, basePriceCents, sizeName, additions, removals: a.removals, lineTotalCents });
    }
    summary.push(`Added ${qty} × ${m.name}${sizeName ? ` (${sizeName})` : ""}`);
  }

  const remaining = lines.filter((l) => !removeSet.has(l.id)).length + creates.length;
  if (remaining < 1) throw new Error("An order needs at least one item. Cancel the order instead.");

  const updatedById = new Map(updates.map((u) => [u.id, u.lineTotalCents]));
  let newSubtotalCents = 0;
  for (const l of lines) {
    if (removeSet.has(l.id)) continue;
    newSubtotalCents += updatedById.get(l.id) ?? l.lineTotalCents;
  }
  for (const c of creates) newSubtotalCents += c.lineTotalCents;

  if (updates.length === 0 && removeSet.size === 0 && creates.length === 0) {
    throw new Error("No changes to save.");
  }

  // The order-level discount stays a fixed amount (same rule as item swap).
  const newTotalCents = Math.max(0, newSubtotalCents - args.discountCents);
  return {
    updates,
    removeIds: [...removeSet],
    creates,
    newSubtotalCents,
    newTotalCents,
    deltaCents: newTotalCents - args.currentTotalCents,
    summary,
  };
}
