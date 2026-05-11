// Required top-level choices for menu items. Customers must pick exactly
// one of these when adding the item to their cart.
//
// As of May 2026 this is a per-tenant field stored on `MenuItem.requiredChoices`
// (see schema). Every call site passes the full menuItem object — the
// helper prefers `item.requiredChoices` when populated and falls back to
// the legacy hardcoded map below for items that pre-date the field
// (FS's Kitchen's original menu). The fallback can be deleted once those
// legacy items have been re-seeded with their explicit requiredChoices
// via the admin Menu page editor.

const LEGACY_REQUIRED_CHOICES_BY_SLUG: Record<string, string[]> = {
  "build-your-own-burger": [
    "Beef",
    "Crispy Chicken",
    "Grilled Chicken",
    "Beyond Vegan Meat"
  ],
  "gourmet-burgers": [
    "Bacon Cheddar",
    "Jalapeno Sriracha",
    "Hawaiian (Pineapple) Burger",
    "Western (no veggies)",
    "Shroom n Onions"
  ],
  "chicken-wings-4pc": ["BBQ", "Spicy BBQ", "Buffalo", "Lemon Pepper"]
};

type MenuItemLike =
  | string
  | { slug: string; requiredChoices?: string[] | null | undefined };

/**
 * Returns the list of required choices for a menu item.
 *
 * Accepts either:
 *   - a menu item object with `{ slug, requiredChoices }` — uses the
 *     per-tenant value if populated, falls back to the legacy slug map
 *     if the array is empty / missing.
 *   - a bare slug string — legacy callers that don't have the object
 *     handy; only the hardcoded map is consulted.
 */
export function getRequiredChoicesForMenuItem(item: MenuItemLike): string[] {
  if (typeof item === "string") {
    return LEGACY_REQUIRED_CHOICES_BY_SLUG[item] ?? [];
  }
  if (item.requiredChoices && item.requiredChoices.length > 0) {
    return item.requiredChoices;
  }
  return LEGACY_REQUIRED_CHOICES_BY_SLUG[item.slug] ?? [];
}

// Kept exported for any legacy reference; new code should use the function above.
export const REQUIRED_CHOICES_BY_SLUG = LEGACY_REQUIRED_CHOICES_BY_SLUG;
