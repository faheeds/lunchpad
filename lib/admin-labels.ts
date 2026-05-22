/**
 * Single source of truth for admin page labels.
 * Used by breadcrumbs, page titles, and navigation.
 */

export type BreadcrumbItem = {
  href: string;
  label: string;
};

/**
 * Map of pathname segments to their display labels.
 * For dynamic routes like /admin/orders/[orderId], use the parent path key.
 */
const PAGE_LABELS: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/orders": "Orders",
  "/admin/kitchen": "Kitchen",
  "/admin/reports": "Reports",
  "/admin/menu": "Menu",
  "/admin/delivery-dates": "Schedule",
  "/admin/discounts": "Discounts",
  "/admin/locations": "Locations",
  "/admin/activity": "Activity",
  "/admin/settings": "Settings",
  "/admin/team": "Team",
  "/admin/subscription": "Subscription",
  "/admin/schools": "Schools",
  "/admin/setup": "Setup",
  "/admin/onboarding": "Onboarding",
};

/**
 * Gets the display label for a given path.
 * For dynamic routes, strips parameters and returns parent label.
 */
export function getPageLabel(pathname: string): string | null {
  if (PAGE_LABELS[pathname]) {
    return PAGE_LABELS[pathname];
  }

  // Try matching parent paths for dynamic routes (e.g., /admin/orders/[orderId])
  const segments = pathname.split("/").slice(0, 3).join("/"); // /admin/orders
  if (PAGE_LABELS[segments]) {
    return PAGE_LABELS[segments];
  }

  return null;
}

/**
 * Generates breadcrumb items for a given pathname.
 * Always includes Admin (root) and ends with current page.
 */
export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [
    { href: "/admin/dashboard", label: "Dashboard" },
  ];

  const label = getPageLabel(pathname);
  if (label && pathname !== "/admin/dashboard") {
    // Get the base path (e.g., /admin/orders for /admin/orders/[id])
    const basePath = pathname.split("/").slice(0, 3).join("/");
    breadcrumbs.push({ href: basePath, label });
  }

  return breadcrumbs;
}

