import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { logInfo, logError } from "@/lib/logging";
import { ThemePicker } from "@/components/admin/theme-picker";
import { CopyUrlButton } from "@/components/admin/copy-url-button";
import { ImageUpload } from "@/components/admin/image-upload";
import { SettingsTabs, type SettingsTabId } from "@/components/admin/settings-tabs";
import { LiveBrandingPreview } from "@/components/admin/live-branding-preview";
import Link from "next/link";

export const dynamic = "force-dynamic";

// ─── Server actions ─────────────────────────────────────────────────────────

async function updateGeneral(formData: FormData) {
  "use server";
  let errorMsg: string | null = null;
  try {
    const restaurant = await requireRestaurant();
    await requireAdminRole("OWNER");

    const name         = String(formData.get("name") || "").trim();
    const contactEmail = String(formData.get("contactEmail") || "").trim() || null;
    const contactPhone = String(formData.get("contactPhone") || "").trim() || null;
    const timezone     = String(formData.get("timezone") || "America/Los_Angeles");

    if (!name) throw new Error("Restaurant name is required");

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { name, contactEmail, contactPhone, timezone },
    });
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : "Something went wrong";
  }
  if (errorMsg) redirect(`/admin/settings?tab=general&error=${encodeURIComponent(errorMsg)}`);
  redirect("/admin/settings?tab=general&saved=1");
}

async function updateBranding(formData: FormData) {
  "use server";
  let errorMsg: string | null = null;
  try {
    const restaurant = await requireRestaurant();
    await requireAdminRole("OWNER");

    const logoUrl         = String(formData.get("logoUrl") || "").trim() || null;
    const heroImageUrl    = String(formData.get("heroImageUrl") || "").trim() || null;
    const primaryColor    = String(formData.get("primaryColor") || "#c41230").trim();
    const accentColor     = String(formData.get("accentColor") || "#f59e0b").trim();
    const darkColor       = String(formData.get("darkColor") || "#1c0505").trim();
    const heroTitleColor  = String(formData.get("heroTitleColor") || "#ffffff").trim();
    const heroAccentColor = String(formData.get("heroAccentColor") || "#fbbf24").trim();
    const bodyTextColor   = String(formData.get("bodyTextColor") || "#1c0505").trim();
    const displayFont     = String(formData.get("displayFont") || "Oswald").trim();
    const bodyFont        = String(formData.get("bodyFont") || "Inter").trim();

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        logoUrl, heroImageUrl,
        primaryColor, accentColor, darkColor,
        heroTitleColor, heroAccentColor, bodyTextColor,
        displayFont, bodyFont,
      },
    });
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : "Something went wrong";
  }
  if (errorMsg) redirect(`/admin/settings?tab=branding&error=${encodeURIComponent(errorMsg)}`);
  redirect("/admin/settings?tab=branding&saved=1");
}

async function updateKitchenSheetSettings(formData: FormData) {
  "use server";
  let errorMsg: string | null = null;
  try {
    const restaurant = await requireRestaurant();
    await requireAdminRole("OWNER");
    const raw = formData.get("kitchenSheetSendHour");
    const kitchenSheetSendHour = raw === "" || raw === null ? null : Number(raw);
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { kitchenSheetSendHour },
    });
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : "Something went wrong";
  }
  if (errorMsg) redirect(`/admin/settings?tab=notifications&error=${encodeURIComponent(errorMsg)}`);
  redirect("/admin/settings?tab=notifications&saved=1");
}

async function resetSampleData() {
  "use server";
  const startTime = Date.now();
  logInfo("resetSampleData started", {
    action: "resetSampleData",
  });

  let errorMsg: string | null = null;
  try {
    const restaurant = await requireRestaurant();
    await requireAdminRole("OWNER");

    // Delete sample menu items
    await prisma.menuItem.deleteMany({
      where: {
        restaurantId: restaurant.id,
        name: { startsWith: "[Sample]" },
      },
    });

    // Delete sample delivery dates (via their schools)
    const sampleSchools = await prisma.school.findMany({
      where: {
        restaurantId: restaurant.id,
        name: { startsWith: "[Sample]" },
      },
      select: { id: true },
    });

    for (const school of sampleSchools) {
      await prisma.deliveryDate.deleteMany({
        where: { schoolId: school.id },
      });
    }

    // Delete sample schools
    await prisma.school.deleteMany({
      where: {
        restaurantId: restaurant.id,
        name: { startsWith: "[Sample]" },
      },
    });

    const durationMs = Date.now() - startTime;
    logInfo("resetSampleData completed", {
      action: "resetSampleData",
      restaurantId: restaurant.id,
      durationMs,
    });

    revalidatePath("/admin/dashboard");
  } catch (e: unknown) {
    const durationMs = Date.now() - startTime;
    logError(e, {
      action: "resetSampleData",
      durationMs,
    });
    errorMsg = e instanceof Error ? e.message : "Something went wrong";
  }
  if (errorMsg) redirect(`/admin/settings?tab=danger&error=${encodeURIComponent(errorMsg)}`);
  redirect("/admin/settings?tab=danger&reset_success=1");
}

async function updateCustomDomain(formData: FormData) {
  "use server";
  let errorMsg: string | null = null;
  try {
    const restaurant = await requireRestaurant();
    await requireAdminRole("OWNER");
    const raw = String(formData.get("customDomain") || "").trim().toLowerCase();
    const customDomain = raw.replace(/^https?:\/\//i, "").split("/")[0] || null;
    if (customDomain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(customDomain)) {
      throw new Error("Invalid domain format. Use something like lunch.yourdomain.com");
    }

    // Read the previous value so we can deregister the old domain if changed.
    const prev = await prisma.restaurant.findUnique({
      where: { id: restaurant.id },
      select: { customDomain: true },
    });
    const previousDomain = prev?.customDomain ?? null;

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { customDomain },
    });

    // Auto-register / deregister the domain in Vercel if the API token is set.
    // Silently skip if the operator hasn't set up the token (still works in dev,
    // they'd just need to add the domain manually as before).
    if (process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID) {
      const { addDomainToProject, removeDomainFromProject } = await import("@/lib/vercel-domains");
      if (previousDomain && previousDomain !== customDomain) {
        await removeDomainFromProject(previousDomain);
      }
      if (customDomain && customDomain !== previousDomain) {
        const result = await addDomainToProject(customDomain);
        if (!result.ok) {
          throw new Error(`Couldn't register domain in Vercel: ${result.error}`);
        }
      }
    }

    revalidatePath("/admin/settings");
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : "Something went wrong";
  }
  if (errorMsg) redirect(`/admin/settings?tab=domain&error=${encodeURIComponent(errorMsg)}`);
  redirect("/admin/settings?tab=domain&saved=1");
}

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)"  },
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    error?: string;
    connect_success?: string;
    connect_error?: string;
    reset_success?: string;
  }>;
}) {
  const [params, restaurant] = await Promise.all([
    searchParams,
    requireRestaurant(),
  ]);
  await requireAdminRole("OWNER");

  // Plan details now live exclusively on /admin/subscription. Redirect any
  // legacy ?tab=plan visit there so old bookmarks don't dead-end.
  if (params.tab === "plan") {
    redirect("/admin/subscription");
  }

  const tab = (params.tab as SettingsTabId | undefined) ?? "general";
  const saved = params.saved === "1";
  const connectSuccess = params.connect_success === "1";
  const connectError = params.connect_error ?? null;
  const error = params.error ?? null;
  const resetSuccess = params.reset_success === "1";

  // Check if sample data exists
  const hasSampleData = await Promise.all([
    prisma.school.count({
      where: { restaurantId: restaurant.id, name: { startsWith: "[Sample]" } },
    }),
    prisma.menuItem.count({
      where: { restaurantId: restaurant.id, name: { startsWith: "[Sample]" } },
    }),
  ]).then(([schools, items]) => schools > 0 || items > 0);

  return (
    <div className="space-y-5 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[17px] font-semibold text-ink">Settings</h1>
      </div>

      <SettingsTabs />

      {/* Banners */}
      {saved && (
        <div className="rounded-[12px] bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <p className="text-[13px] font-medium text-green-800">Saved.</p>
        </div>
      )}

      {resetSuccess && (
        <div className="rounded-[12px] bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <p className="text-[13px] font-medium text-green-800">Sample data reset.</p>
        </div>
      )}
      {error && (
        <div className="rounded-[12px] bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2">
          <p className="text-[13px] font-medium text-red-800">{error}</p>
        </div>
      )}
      {connectSuccess && (
        <div className="rounded-[12px] bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2">
          <p className="text-[13px] font-medium text-green-800">Stripe account connected — parents can now check out.</p>
        </div>
      )}
      {connectError && (
        <div className="rounded-[12px] bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2">
          <p className="text-[13px] font-medium text-red-800">Stripe Connect failed: {connectError}</p>
        </div>
      )}

      {/* ── GENERAL ─────────────────────────────────────────────────── */}
      {tab === "general" && (
        <form action={updateGeneral} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden max-w-2xl">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[13px] font-semibold text-ink">Restaurant profile</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Basics that show up on your ordering page and in customer emails.</p>
          </div>
          <div className="px-4 py-4 space-y-4">
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Restaurant name</label>
              <input type="text" name="name" required defaultValue={restaurant.name}
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">Contact email</label>
                <input type="email" name="contactEmail" defaultValue={restaurant.contactEmail ?? ""}
                  placeholder="hello@..."
                  className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 font-medium block mb-1">Contact phone</label>
                <input type="tel" name="contactPhone" defaultValue={restaurant.contactPhone ?? ""}
                  placeholder="+1 (555)..."
                  className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
              </div>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Timezone</label>
              <select name="timezone" defaultValue={restaurant.timezone}
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">Used as the default for new locations and for cutoff time displays.</p>
            </div>
          </div>
          <div className="px-4 pb-4">
            <button type="submit"
              className="px-4 py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
              Save
            </button>
          </div>
        </form>
      )}

      {/* ── BRANDING ────────────────────────────────────────────────── */}
      {tab === "branding" && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <form id="branding-form" action={updateBranding} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-50">
              <p className="text-[13px] font-semibold text-ink">Branding</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Logo, hero photo, colors, and fonts. Live preview on the right.</p>
            </div>
            <div className="px-4 py-4 space-y-4">
              <input type="hidden" name="name" value={restaurant.name} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="max-w-[180px]">
                  <ImageUpload
                    name="logoUrl"
                    defaultValue={restaurant.logoUrl}
                    label="Logo"
                    aspect="square"
                    hint="Square works best — shown in your site header."
                  />
                </div>
                <div>
                  <ImageUpload
                    name="heroImageUrl"
                    defaultValue={restaurant.heroImageUrl}
                    label="Hero image"
                    aspect="wide"
                    hint="Wide, appetizing — sets the tone of the ordering page."
                  />
                </div>
              </div>

              <div className="border-t border-slate-50 pt-4">
                <p className="text-[12px] font-semibold text-ink mb-1">Theme</p>
                <p className="text-[11px] text-slate-400 mb-3">Click a preset or pick each color. Watch the preview update.</p>
                <ThemePicker
                  currentPrimary={restaurant.primaryColor     ?? "#c41230"}
                  currentAccent={restaurant.accentColor       ?? "#f59e0b"}
                  currentDark={restaurant.darkColor           ?? "#1c0505"}
                  currentHeroTitle={restaurant.heroTitleColor  ?? "#ffffff"}
                  currentHeroAccent={restaurant.heroAccentColor ?? "#fbbf24"}
                  currentBodyText={restaurant.bodyTextColor    ?? "#1c0505"}
                  currentDisplayFont={restaurant.displayFont   ?? "Oswald"}
                  currentBodyFont={restaurant.bodyFont         ?? "Inter"}
                />
              </div>
            </div>
            <div className="px-4 pb-4">
              <button type="submit"
                className="px-4 py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
                Save branding
              </button>
            </div>
          </form>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Live preview</p>
            <LiveBrandingPreview
              formId="branding-form"
              initial={{
                name: restaurant.name,
                logoUrl: restaurant.logoUrl ?? "",
                heroImageUrl: restaurant.heroImageUrl ?? "",
                primaryColor: restaurant.primaryColor ?? "#c41230",
                accentColor: restaurant.accentColor ?? "#f59e0b",
                darkColor: restaurant.darkColor ?? "#1c0505",
                heroTitleColor: restaurant.heroTitleColor ?? "#ffffff",
                heroAccentColor: restaurant.heroAccentColor ?? "#fbbf24",
                bodyTextColor: restaurant.bodyTextColor ?? "#1c0505",
                displayFont: restaurant.displayFont ?? "Oswald",
                bodyFont: restaurant.bodyFont ?? "Inter",
              }}
            />
          </div>
        </div>
      )}

      {/* ── DOMAIN ──────────────────────────────────────────────────── */}
      {tab === "domain" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
          <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-50">
              <p className="text-[13px] font-semibold text-ink">Ordering page URL</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Share this with parents or staff so they can place orders.</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[12px] font-mono text-slate-600 flex-1 truncate">
                  https://{restaurant.slug}.lunchpad.us
                </p>
                <CopyUrlButton url={`https://${restaurant.slug}.lunchpad.us`} />
              </div>
              <a href={`https://${restaurant.slug}.lunchpad.us`} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-brand-700 font-medium no-underline hover:underline">
                Preview ordering page →
              </a>
            </div>
          </div>

          <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-50">
              <p className="text-[13px] font-semibold text-ink">Custom domain</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Use your own domain instead of <span className="font-mono">{restaurant.slug}.lunchpad.us</span>
              </p>
            </div>
            <div className="px-4 py-4 space-y-4">
              {restaurant.customDomain ? (
                <div className="flex items-center gap-2 bg-green-50 rounded-lg border border-green-200 px-3 py-2.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  <p className="text-[12px] font-mono text-green-800 flex-1">{restaurant.customDomain}</p>
                  <span className="text-[10px] font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Active</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
                  <p className="text-[12px] text-slate-400">No custom domain configured</p>
                </div>
              )}

              <form action={updateCustomDomain} className="space-y-2">
                <label className="text-[11px] text-slate-500 font-medium block">
                  {restaurant.customDomain ? "Change domain" : "Add custom domain"}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    name="customDomain"
                    defaultValue={restaurant.customDomain ?? ""}
                    placeholder="lunch.yourdomain.com"
                    className="flex-1 rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
                  />
                  <button type="submit"
                    className="px-3 py-2 rounded-lg bg-slate-800 text-white text-[12px] font-semibold whitespace-nowrap">
                    Save
                  </button>
                </div>
                {restaurant.customDomain && (
                  <button type="submit" name="customDomain" value=""
                    className="text-[11px] text-slate-400 hover:text-red-500 transition">
                    Remove custom domain
                  </button>
                )}
              </form>

              <details className="rounded-lg border border-slate-100 overflow-hidden">
                <summary className="px-3 py-2.5 text-[12px] font-semibold text-slate-600 cursor-pointer list-none flex items-center justify-between">
                  <span>How to set up DNS</span>
                  <span className="text-[10px] text-slate-400">tap to expand</span>
                </summary>
                <div className="px-3 pb-3 border-t border-slate-50 pt-3 space-y-3">
                  <p className="text-[12px] text-slate-600">
                    Add a <strong>CNAME record</strong> at your domain registrar:
                  </p>
                  <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                    <div className="grid grid-cols-3 border-b border-slate-200 px-3 py-1.5">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Name</span>
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Value</span>
                    </div>
                    <div className="grid grid-cols-3 px-3 py-2 gap-1">
                      <span className="text-[12px] font-mono font-semibold text-slate-700">CNAME</span>
                      <span className="text-[12px] font-mono text-slate-600">lunch</span>
                      <span className="text-[11px] font-mono text-slate-600 break-all">cname.vercel-dns.com</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    The <strong>Name</strong> is the subdomain part (e.g. for <span className="font-mono">lunch.yourdomain.com</span>, name is <span className="font-mono">lunch</span>).
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <p className="text-[11px] text-amber-800 font-medium">
                      After adding DNS — also add your custom domain in the{" "}
                      <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline">Vercel dashboard</a>{" "}
                      under Settings → Domains. Changes can take up to 24 hours.
                    </p>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENTS ────────────────────────────────────────────────── */}
      {tab === "payments" && (
        <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden max-w-2xl">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[13px] font-semibold text-ink">Payouts — Stripe Connect</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Connect your Stripe account so customer payments go directly to you.
            </p>
          </div>
          <div className="px-4 py-4 space-y-4">
            {restaurant.stripeOnboardingComplete && restaurant.stripeAccountId ? (
              <div className="flex items-center gap-3 bg-green-50 rounded-lg border border-green-200 px-3 py-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-green-800">Stripe account connected</p>
                  <p className="text-[11px] text-green-600 font-mono truncate">{restaurant.stripeAccountId}</p>
                </div>
                <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap">Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-amber-50 rounded-lg border border-amber-200 px-3 py-2.5">
                <p className="text-[12px] text-amber-800 flex-1">
                  No Stripe account connected — customers can&apos;t check out yet.
                </p>
              </div>
            )}

            <div className="bg-slate-50 rounded-lg border border-slate-100 px-3 py-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-600">How payouts work</p>
              {[
                "Customers pay at checkout — money goes directly to your Stripe account",
                `LunchPad retains a ${env.PLATFORM_FEE_PERCENT}% platform fee automatically`,
                "Stripe deposits funds to your bank on a rolling 2-day schedule",
              ].map((line) => (
                <div key={line} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                  <p className="text-[11px] text-slate-500">{line}</p>
                </div>
              ))}
            </div>

            <a
              href="/api/stripe/connect/authorize"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[13px] font-semibold text-white no-underline transition"
              style={{ background: "linear-gradient(135deg, #635bff, #4f46e5)" }}
            >
              {restaurant.stripeOnboardingComplete ? "Reconnect Stripe account" : "Connect Stripe account"}
            </a>
            {restaurant.stripeAccountId && (
              <a href={`https://dashboard.stripe.com/${restaurant.stripeAccountId}/dashboard`} target="_blank" rel="noopener noreferrer"
                className="block text-center text-[11px] text-brand-700 font-medium no-underline hover:underline">
                Open Stripe dashboard ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS ───────────────────────────────────────────── */}
      {tab === "notifications" && (
        <form action={updateKitchenSheetSettings} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden max-w-2xl">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[13px] font-semibold text-ink">Kitchen sheet automation</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Email the kitchen prep sheet automatically on each delivery day.
            </p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">
                Auto-send time <span className="text-slate-400 font-normal">(in your restaurant&apos;s timezone)</span>
              </label>
              <select name="kitchenSheetSendHour"
                defaultValue={restaurant.kitchenSheetSendHour ?? ""}
                className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
                <option value="">Disabled — send manually</option>
                {Array.from({ length: 24 }, (_, h) => {
                  const label = h === 0 ? "12:00 AM (midnight)" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM (noon)" : `${h - 12}:00 PM`;
                  return <option key={h} value={h}>{label}</option>;
                })}
              </select>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Sent to your contact email once per delivery day. Set a contact email under General first.
              </p>
            </div>
            <button type="submit"
              className="px-4 py-2 rounded-lg bg-slate-800 text-white text-[13px] font-semibold">
              Save
            </button>
          </div>
        </form>
      )}

      {/* ── DANGER ──────────────────────────────────────────────────── */}
      {tab === "danger" && (
        <div className="rounded-[14px] border border-red-100 bg-white overflow-hidden max-w-2xl">
          <div className="px-4 py-3 border-b border-red-50 bg-red-50/50">
            <p className="text-[13px] font-semibold text-red-700">Danger zone</p>
            <p className="text-[11px] text-red-400 mt-0.5">These actions are permanent and cannot be undone.</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-ink">Change password</p>
                <p className="text-[11px] text-slate-400">Update your admin account password</p>
              </div>
              <Link href="/admin/team"
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 no-underline hover:bg-slate-50 transition">
                Go to Team →
              </Link>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-ink">Cancel subscription</p>
                <p className="text-[11px] text-slate-400">Downgrade or cancel your LunchPad plan</p>
              </div>
              <Link href="/admin/subscription"
                className="px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-semibold text-red-600 no-underline hover:bg-red-50 transition">
                Manage plan →
              </Link>
            </div>
            {hasSampleData && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-medium text-ink">Reset sample data</p>
                  <p className="text-[11px] text-slate-400">Delete all sample restaurants, menus, and delivery dates</p>
                </div>
                <form action={resetSampleData}>
                  <button type="submit" className="px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-semibold text-red-600 no-underline hover:bg-red-50 transition">
                    Reset →
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
