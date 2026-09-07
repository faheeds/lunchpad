// Required top-level choices for menu items. Customers must pick exactly
// one of these when adding the item to their cart.
//
// This is a per-tenant field stored on `MenuItem.requiredChoices` (see
// schema), editable in Admin > Menu. Previously this fell back to a
// hardcoded map of legacy slugs (from FS's Kitchen's original single-
// tenant menu) whenever the real field was empty -- which meant an
// operator who deliberately configured NO required choice for an item
// (an empty array, a real and intentional value) would silently have
// that choice overridden by leftover legacy assumptions instead. Found
// via a real order rejection: medina's "Build-Your-Own Burger" has an
// intentionally empty requiredChoices, but checkout rejected it anyway
// because its slug happened to match the legacy map. Removed the
// fallback entirely -- confirmed via a direct database check that no
// other menu item on the platform matches any of the three legacy
// slugs, so nothing was actually relying on it.

type MenuItemLike = { requiredChoices?: string[] | null | undefined };

/** Returns the list of required choices for a menu item -- always just
 *  the real, per-tenant value, with no legacy override. */
export function getRequiredChoicesForMenuItem(item: MenuItemLike): string[] {
  return item.requiredChoices ?? [];
}

// Sorts a set of category names for display, per-restaurant. Categories
// with an explicit CategoryOrder row (set via the admin Menu page's
// "Manage categories" panel) come first, in that order; anything without
// one falls back to alphabetical, appended after. This is what backs
// "Burgers first, Rice second, Comfort next, Salads after" as a real,
// per-tenant preference instead of hardcoded app logic -- every mobile
// and web surface that groups items by category should sort through
// this function so the order stays consistent everywhere.
export function sortCategoryNames(names: string[], explicitOrder: { name: string; sortOrder: number }[]): string[] {
  const orderByName = new Map(explicitOrder.map((o) => [o.name, o.sortOrder]));
  return [...names].sort((a, b) => {
    const orderA = orderByName.get(a);
    const orderB = orderByName.get(b);
    if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
    if (orderA !== undefined) return -1; // explicitly-ordered categories always come before unordered ones
    if (orderB !== undefined) return 1;
    return a.localeCompare(b); // both unordered -- alphabetical, same as before this existed
  });
}
