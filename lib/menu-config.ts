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
