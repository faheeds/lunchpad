import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

async function updateSettings(formData: FormData) {
  "use server";
  const restaurant = await requireRestaurant();
  await requireAdminRole("OWNER");

  const name = String(formData.get("name") || "").trim();
  const logoUrl = String(formData.get("logoUrl") || "").trim() || null;
  const primaryColor = String(formData.get("primaryColor") || "#000000").trim();
  const contactEmail = String(formData.get("contactEmail") || "").trim() || null;
  const contactPhone = String(formData.get("contactPhone") || "").trim() || null;
  const timezone = String(formData.get("timezone") || "America/Los_Angeles");

  if (!name) throw new Error("Name is required");

  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { name, logoUrl, primaryColor, contactEmail, contactPhone, timezone }
  });

  revalidatePath("/admin/settings");
  revalidatePath("/");
}

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)" },
  { value: "America/Chicago",     label: "Central (CT)" },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage",   label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (HT)" },
];

export default async function AdminSettingsPage() {
  const [restaurant] = await Promise.all([requireRestaurant(), requireAdminRole("OWNER")]);

  return (
    <div className="space-y-4 pb-10 max-w-lg">
      <h1 className="text-[17px] font-semibold text-ink">Settings</h1>

      <form action={updateSettings} className="rounded-[14px] border border-slate-100 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-50">
          <p className="text-[13px] font-semibold text-ink">Restaurant profile</p>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Restaurant name</label>
            <input
              type="text" name="name" required
              defaultValue={restaurant.name}
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
            />
          </div>

          {/* Logo URL */}
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Logo URL <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="url" name="logoUrl"
              defaultValue={restaurant.logoUrl ?? ""}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
            />
            {restaurant.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={restaurant.logoUrl} alt="Logo preview" className="mt-2 h-10 object-contain rounded" />
            )}
          </div>

          {/* Primary color */}
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Brand color</label>
            <div className="flex items-center gap-2">
              <input
                type="color" name="primaryColor"
                defaultValue={restaurant.primaryColor ?? "#c41230"}
                className="h-9 w-12 rounded border border-slate-200 cursor-pointer p-0.5"
              />
              <span className="text-[12px] text-slate-500">Used for buttons and accents</span>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Timezone</label>
            <select
              name="timezone"
              defaultValue={restaurant.timezone}
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>

          {/* Contact email */}
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Contact email <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="email" name="contactEmail"
              defaultValue={restaurant.contactEmail ?? ""}
              placeholder="hello@yourrestaurant.com"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
            />
          </div>

          {/* Contact phone */}
          <div>
            <label className="text-[11px] text-slate-500 font-medium block mb-1">Contact phone <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="tel" name="contactPhone"
              defaultValue={restaurant.contactPhone ?? ""}
              placeholder="+1 (555) 000-0000"
              className="w-full rounded-lg border border-slate-200 text-[13px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
            />
          </div>
        </div>

        <div className="px-4 pb-4">
          <button type="submit"
            className="w-full py-2 rounded-lg bg-brand-700 text-white text-[13px] font-semibold">
            Save changes
          </button>
        </div>
      </form>

      {/* Read-only info */}
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
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wide">
              {restaurant.plan}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
