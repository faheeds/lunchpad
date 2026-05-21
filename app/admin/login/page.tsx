import Link from "next/link";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { LoginForm } from "./login-form";

export default async function AdminLoginPage() {
  const restaurant = await getCurrentRestaurant();

  return (
    <div className="min-h-screen bg-editorial-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div className="flex justify-center mb-3.5">
            <svg width="44" height="44" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="9" fill="#2C4031"/><g transform="translate(6.4 5.6) scale(0.8)" fill="none" stroke="#F6F1E6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M3 12a9 9 0 0 0 18 0"/><path d="M12 7v-2"/><path d="M9 5h6"/></g></svg>
          </div>
          <h1 className="font-editorial text-[25px] font-medium text-editorial-ink leading-tight">
            {restaurant?.name ?? "LunchPad"} Admin
          </h1>
          <p className="text-[12.5px] text-editorial-ink-soft mt-1.5">
            {restaurant ? "Sign in to manage your restaurant" : "Sign in from your restaurant URL"}
          </p>
        </div>

        <div className="rounded-[20px] border border-editorial-line bg-white p-7 shadow-[0_18px_44px_-22px_rgba(33,29,21,0.20)]">
          {restaurant ? (
            <LoginForm restaurantId={restaurant.id} />
          ) : (
            /* Apex / unknown host â€” admins sign in only from their tenant
               subdomain, where the auth provider has the restaurantId. */
            <div className="space-y-4">
              <div className="rounded-xl bg-[#F6EED9] border border-[#E5D6A8] px-3.5 py-3 text-[12.5px] text-[#6E5C2C]">
                Open your restaurant&apos;s admin URL â€” for example{" "}
                <code className="bg-editorial-paper rounded px-1">your-restaurant.lunchpad.us/admin/login</code>.
                The exact URL is in the welcome email we sent when you signed up.
              </div>
              <Link href="/signup"
                className="block w-full text-center py-3 rounded-full bg-editorial-green text-editorial-paper text-[13px] font-semibold no-underline hover:bg-editorial-green-deep transition-colors">
                Create a new restaurant
              </Link>
              <Link href="/"
                className="block text-center text-[12.5px] text-editorial-ink-soft hover:text-editorial-ink no-underline transition-colors">
                Back to lunchpad.us
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
