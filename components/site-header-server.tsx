import { getCurrentRestaurant } from "@/lib/restaurant";
import { SiteHeader } from "@/components/site-header";

/**
 * Server component wrapper — fetches restaurant and threads the name and
 * uploaded logo URL down to the client header. Use this instead of
 * <SiteHeader /> directly.
 */
export async function SiteHeaderServer() {
  const restaurant = await getCurrentRestaurant();
  return (
    <SiteHeader
      restaurantName={restaurant?.name ?? "LunchPad"}
      logoUrl={restaurant?.logoUrl ?? null}
    />
  );
}
