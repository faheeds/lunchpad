/**
 * Pure helpers behind the Admin > Menu item editor.
 *
 * The editor is a friendlier UI over the SAME stored shapes the customer
 * web order form and both iOS apps already read:
 *   - MenuItem.requiredChoices (String[])
 *   - MenuItemSize rows (name + priceCents)
 *   - MenuOption rows (ADD_ON / REMOVAL, priceDeltaCents, sortOrder)
 * Nothing here changes those shapes. The key property is that saving an
 * item the operator did not change is a no-op at the database level:
 * untouched rows keep their ids, sortOrder, isDefault and timestamps.
 */

export type OptionType = "ADD_ON" | "REMOVAL";

export interface SubmittedOption {
  /** Present for rows that already exist in the database. */
  id?: string;
  name: string;
  optionType: OptionType;
  priceDeltaCents: number;
}

export interface StoredOption {
  id: string;
  name: string;
  optionType: OptionType;
  priceDeltaCents: number;
  isDefault: boolean;
  sortOrder: number;
}

export interface OptionSyncPlan {
  create: { name: string; optionType: OptionType; priceDeltaCents: number; sortOrder: number }[];
  update: { id: string; data: Partial<Pick<StoredOption, "name" | "optionType" | "priceDeltaCents" | "sortOrder">> }[];
  deleteIds: string[];
}

/** One per line or comma-separated, trimmed, de-duplicated case-insensitively. */
export function parseChoicesText(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\n,]+/)) {
    const t = piece.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** "Name | price" per line. Same tolerant parsing the old textarea used. */
export function parseSizesText(raw: string): { name: string; priceCents: number }[] {
  const seen = new Set<string>();
  const out: { name: string; priceCents: number }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(.+?)[|:\-,\s]+\$?(\d+(?:\.\d{1,2})?)\s*$/);
    if (!match) continue;
    const name = match[1].trim();
    const priceCents = Math.round(parseFloat(match[2]) * 100);
    if (!name || !Number.isFinite(priceCents) || priceCents < 0) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, priceCents });
  }
  return out;
}

export function formatSizesText(sizes: { name: string; priceCents: number }[]): string {
  return sizes
    .map((s) => `${s.name} | ${(s.priceCents / 100).toFixed(s.priceCents % 100 === 0 ? 0 : 2)}`)
    .join("\n");
}

export function sameSizes(
  existing: { name: string; priceCents: number }[],
  submitted: { name: string; priceCents: number }[]
): boolean {
  if (existing.length !== submitted.length) return false;
  return existing.every((e, i) => e.name === submitted[i].name && e.priceCents === submitted[i].priceCents);
}

export function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** Dollars string ("12.5", "$12.50") to cents; null when not a valid non-negative number. */
export function dollarsToCents(raw: string): number | null {
  const n = parseFloat(String(raw).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Turns the editor's submitted option list into the minimal set of database
 * writes. `originalIds` are the option ids the editor loaded; only those can
 * be deleted, so an option another admin added in the meantime is never
 * removed by a stale form.
 */
export function planOptionSync(
  existing: StoredOption[],
  submitted: SubmittedOption[],
  originalIds: string[]
): OptionSyncPlan {
  const byId = new Map(existing.map((o) => [o.id, o]));
  const plan: OptionSyncPlan = { create: [], update: [], deleteIds: [] };

  const submittedIds = new Set(submitted.map((o) => o.id).filter((x): x is string => !!x));
  for (const id of originalIds) {
    if (byId.has(id) && !submittedIds.has(id)) plan.deleteIds.push(id);
  }

  for (const type of ["ADD_ON", "REMOVAL"] as const) {
    const rows = submitted.filter((o) => o.optionType === type && o.name.trim());
    // Rows the form kept whose stored type is also `type` keep their place.
    const keptExisting = rows.filter((r) => r.id && byId.get(r.id)?.optionType === type);
    const storedOrder = existing
      .filter((o) => o.optionType === type && keptExisting.some((k) => k.id === o.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => o.id);
    const submittedOrder = keptExisting.map((r) => r.id as string);
    // A new row placed above a kept row also counts as a reorder.
    const newAboveKept = rows.some(
      (r, i) => !r.id && rows.slice(i + 1).some((x) => x.id && byId.get(x.id)?.optionType === type)
    );
    const orderUnchanged =
      !newAboveKept &&
      storedOrder.length === submittedOrder.length &&
      storedOrder.every((id, i) => id === submittedOrder[i]);

    let nextSort =
      existing.filter((o) => o.optionType === type).reduce((m, o) => Math.max(m, o.sortOrder), -1) + 1;

    rows.forEach((r, index) => {
      const stored = r.id ? byId.get(r.id) : undefined;
      const name = r.name.trim();
      if (stored) {
        const data: OptionSyncPlan["update"][number]["data"] = {};
        if (stored.name !== name) data.name = name;
        if (stored.optionType !== r.optionType) data.optionType = r.optionType;
        if (stored.priceDeltaCents !== r.priceDeltaCents) data.priceDeltaCents = r.priceDeltaCents;
        if (!orderUnchanged && stored.optionType === r.optionType && stored.sortOrder !== index) {
          data.sortOrder = index;
        }
        if (stored.optionType !== r.optionType) data.sortOrder = orderUnchanged ? nextSort++ : index;
        if (Object.keys(data).length > 0) plan.update.push({ id: stored.id, data });
      } else {
        plan.create.push({
          name,
          optionType: r.optionType,
          priceDeltaCents: r.priceDeltaCents,
          sortOrder: orderUnchanged ? nextSort++ : index,
        });
      }
    });
  }
  return plan;
}

/** Collision-free slug within a restaurant: "burger", "burger-2", ... */
export function uniqueSlug(base: string, taken: Set<string>): string {
  const root = base || "item";
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}
