import { getCurrentRestaurant } from "@/lib/restaurant";
import { SiteHeader } from "@/components/site-header";

/**
 * Server component wrapper — fetches restaurant and passes name to SiteHeader.
 * Use this instead of <SiteHeader /> directly.
 */
export async function SiteHeaderServer() {
  const restaurant = await getCurrentRestaurant();
  return <SiteHeader restaurantName={restaurant?.name ?? "Hot Lunch"} />;
}
