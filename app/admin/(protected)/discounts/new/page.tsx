/**
 * Template gallery — the front door for creating a discount.
 *
 * Design choice: every discount type the platform supports is in the
 * gallery even if its builder isn't shipped yet. Operators see what's
 * coming (sets the expectation that the surface keeps growing) and
 * have a single mental map of "where do I go to set up X?"
 *
 * Unavailable templates get the same card treatment but are dimmed,
 * tagged "Coming soon", and route to a non-destructive interstitial
 * (we keep them clickable so an operator can confirm "yep, that's
 * the thing I want, but it's not ready yet" rather than wondering
 * if their click did nothing).
 */

import Link from "next/link";
import { requireRestaurant } from "@/lib/restaurant";
import { requireAdminRole } from "@/lib/admin-auth";
import { TEMPLATES } from "@/lib/discount-templates";

export const dynamic = "force-dynamic";

export default async function DiscountTemplateGalleryPage() {
  await requireRestaurant();
  await requireAdminRole("MANAGER");

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="mb-6">
        <Link
          href="/admin/discounts"
          className="text-[12px] text-slate-500 no-underline inline-flex items-center gap-1 hover:text-ink"
        >
          ← Discounts
        </Link>
        <h1 className="text-[20px] font-bold text-ink mt-2">What kind of discount?</h1>
        <p className="text-[13px] text-slate-500 mt-1">
          Pick a template to start with — you can change anything once inside.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TEMPLATES.map((t) => (
          <Link
            key={t.slug}
            href={`/admin/discounts/new/${t.slug}`}
            className={`relative block rounded-2xl border p-4 no-underline transition ${
              t.available
                ? "border-slate-100 bg-white hover:border-brand-200 hover:shadow-sm"
                : "border-slate-100 bg-slate-50 opacity-75 hover:opacity-100"
            }`}
          >
            {!t.available && (
              <span className="absolute top-2.5 right-2.5 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                COMING SOON
              </span>
            )}
            <div className="text-[28px] leading-none mb-2">{t.icon}</div>
            <h2 className="text-[14px] font-bold text-ink leading-tight">{t.title}</h2>
            <p className="text-[12px] text-slate-500 leading-snug mt-1 min-h-[34px]">
              {t.description}
            </p>
            <p className="text-[11px] text-brand-700 font-medium mt-2">{t.example}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
