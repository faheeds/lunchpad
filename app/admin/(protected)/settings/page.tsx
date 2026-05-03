import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { ThemePicker } from "@/components/admin/theme-picker";
import { CopyUrlButton } from "@/components/admin/copy-url-button";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function updateSettings(formData: FormData) {
  "use server";
  let errorMsg: string | null = null;
  try {
    const restaurant = await requireRestaurant();
    await requireAdminRole("OWNER");

    const name            = String(formData.get("name")            || "").trim();
    const logoUrl         = String(formData.get("logoUrl")         || "").trim() || null;
    const heroImageUrl    = String(formData.get("heroImageUrl")    || "").trim() || null;
    const primaryColor    = String(formData.get("primaryColor")    || "#c41230").trim();
    const accentColor     = String(formData.get("accentColor")     || "#f59e0b").trim();
    const darkColor       = String(formData.get("darkColor")       || "#1c0505").trim();
    const heroTitleColor  = String(formData.get("heroTitleColor")  || "#ffffff").trim();
    const heroAccentColor = String(formData.get("heroAccentColor") || "#fbbf24").trim();
    const bodyTextColor   = String(formData.get("bodyTextColor")   || "#1c0505").trim();
    const displayFont     = String(formData.get("displayFont")     || "Oswald").trim();
    const bodyFont        = String(formData.get("bodyFont")        || "Inter").trim();
    const contactEmail    = String(formData.get("contactEmail")    || "").trim() || null;
    const contactPhone    = String(formData.get("contactPhone")    || "").trim() || null;
    const timezone        = String(formData.get("timezone")        || "America/Los_Angeles");

    if (!name) throw new Error("Restaurant name is required");

    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        name, logoUrl, heroImageUrl,
        primaryColor, accentColor, darkColor,
        heroTitleColor, heroAccentColor, bodyTextColor,
        displayFont, bodyFont,
        contactEmail, contactPhone, timezone,
      }
    });
  } catch (e: unknown) {
    errorMsg = e instanceof Error ? e.message : "Something went wrong";
  }

  if (errorMsg) {
    redirect(`/admin/settings?error=${encodeURIComponent(errorMsg)}`);
  } else {
    redirect("/admin/settings?saved=1");
  }
}

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)"  },
];

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [params, restaurant] = await Promise.all([
    searchParams,
    requireRestaurant(),
    requireAdminRole("OWNER"),
  ]);
  const saved = params.saved === "1";
  const error = params.error ?? null;

  return (
    <div className="space-y-4 pb-10 max-w-lg">
      <h1 className="text-[17px] font-semibold text-ink">Settings</h1>

      {/* ── Feedback banner ─────────────────────────────────────── */}
      {saved && (
        <div className="rounded-[12px] bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <p className="text-[13px] font-medium text-green-800">Settings saved successfully.</p>
        </div>
      )}
      {error && (
        <div className="rounded-[12px] bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="text-[13px] font-medium text-red-800">{error}</p>
        </div>
      )}

      <form action={updateSettings} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">

        {/* ── Profile ─────────────────────────────────────────────── */}
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Restaurant profile</p>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Restaurant name</label>
            <input type="text" name="name" required defaultValue={restaurant.name}
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">
              Logo URL <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input type="url" name="logoUrl" defaultValue={restaurant.logoUrl ?? ""}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">
              Hero image URL <span className="text-slate-400 font-normal">(optional — replaces default food photo)</span>
            </label>
            <input type="url" name="heroImageUrl" defaultValue={restaurant.heroImageUrl ?? ""}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Contact email</label>
              <input type="email" name="contactEmail" defaultValue={restaurant.contactEmail ?? ""}
                placeholder="hello@..."
                className="w-full rounded-lg border border-slate-200 text-[11px] px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium block mb-1">Contact phone</label>
              <input type="tel" name="contactPhone" defaultValue={restaurant.contactPhone ?? ""}
                placeholder="+1 (555)..."
                className="w-full rounded-lg border border-slate-200 text-[11px] px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
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
          </div>
        </div>

        {/* ── Theme ───────────────────────────────────────────────── */}
        <div className="border-t border-slate-50">
          <div className="px-4 py-3 border-b border-slate-50">
            <p className="text-[13px] font-semibold text-ink">Theme</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Click a preset or customize each color</p>
          </div>
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

        <div className="px-4 pb-4">
          <button type="submit"
            className="w-full py-2.5 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Save changes
          </button>
        </div>
      </form>

      {/* ── Account info ────────────────────────────────────────── */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Account info</p>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-slate-500">Subdomain</span>
            <span className="text-[12px] font-mono text-ink">{restaurant.slug}.lunchpad.us</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-slate-500">Plan</span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide">
                {restaurant.plan}
              </span>
              <Link href="/admin/subscription" className="text-[11px] text-brand-700 font-medium no-underline">
                Manage →
              </Link>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-slate-500">Status</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
              restaurant.subscriptionStatus === "ACTIVE" || restaurant.subscriptionStatus === "TRIAL"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}>
              {restaurant.subscriptionStatus}
            </span>
          </div>
        </div>
      </div>

      {/* ── Public ordering URL ─────────────────────────────────── */}
      <div className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Ordering page URL</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Share this link with parents so they can place orders</p>
        </div>
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
            <p className="text-[12px] font-mono text-slate-600 flex-1 truncate">
              https://{restaurant.slug}.lunchpad.us
            </p>
            <CopyUrlButton url={`https://${restaurant.slug}.lunchpad.us`} />
          </div>
          <div className="flex gap-2 mt-2">
            <a href={`https://${restaurant.slug}.lunchpad.us`} target="_blank" rel="noopener noreferrer"
              className="text-[12px] text-brand-700 font-medium no-underline hover:underline">
              Preview ordering page →
            </a>
          </div>
        </div>
      </div>

      {/* ── Danger zone ─────────────────────────────────────────── */}
      <div className="rounded-[14px] border border-red-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-red-50 bg-red-50/50">
          <p className="text-[13px] font-semibold text-red-700">Danger zone</p>
          <p className="text-[11px] text-red-400 mt-0.5">These actions are permanent and cannot be undone</p>
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
        </div>
      </div>
    </div>
  );
}
