import { env } from "@/lib/env";
import { getCurrentRestaurant } from "@/lib/restaurant";
import { getLabelsForOperator } from "@/lib/location-labels";
import { ParentSignInButtons } from "./sign-in-buttons";
import { NativeAppRedirect } from "./native-app-redirect";
import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";

export default async function ParentSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ "different-tenant"?: string }>;
}) {
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const appleEnabled = Boolean(env.AUTH_APPLE_ID && env.AUTH_APPLE_SECRET);
  const params = await searchParams;
  const differentTenant = params["different-tenant"] === "1";

  const restaurant = await getCurrentRestaurant();
  const labels = getLabelsForOperator(restaurant?.operatorType);

  return (
    <>
      <NativeAppRedirect />
      <SiteHeaderServer />
      <main className="app-content flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <p className="text-[14px] font-semibold uppercase tracking-[0.16em] text-brand-700 mb-1">{labels.orderer} account</p>
            <h1 className="text-[20px] font-semibold text-ink mb-1">Sign in</h1>
            <p className="text-[14px] text-slate-500 leading-relaxed">
              Save {labels.unitPlural.toLowerCase()}, view order history, and plan weekly lunches in one place.
            </p>
          </div>
          {differentTenant && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-[14px] text-amber-900">
              You were signed in to a different restaurant. Each restaurant on LunchPad has its own account — sign in here to use this one.
            </div>
          )}
          <ParentSignInButtons googleEnabled={googleEnabled} appleEnabled={appleEnabled} />
        </div>
      </main>
      <AppNav />
    </>
  );
}
